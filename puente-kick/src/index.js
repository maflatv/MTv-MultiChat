// Servidor puente de MTv MultiChat para Kick (Cloudflare Worker + Durable Objects).
//
// Kick solo entrega los eventos de su API oficial por webhook a una dirección pública. Este puente:
//  1. Recibe los webhooks, comprueba la firma de Kick y reenvía cada evento a las apps conectadas de ese streamer.
//  2. Completa el inicio de sesión (OAuth): es el único sitio que conoce el client_secret de la aplicación de Kick.
// No guarda mensajes ni tokens: solo reparte en el momento.
//
// Rutas:
//   GET  /config     client_id, redirect_uri y alcances para que la app abra el inicio de sesión
//   GET  /callback   Kick vuelve aquí tras iniciar sesión; se redirige al PC del usuario (localhost)
//   POST /token      { code, code_verifier }  → tokens
//   POST /refresh    { refresh_token }        → tokens nuevos
//   POST /webhook    Kick envía aquí los eventos
//   GET  /ws?token=  WebSocket de la app; el token demuestra de qué canal es

const KICK_ID = 'https://id.kick.com';
const KICK_API = 'https://api.kick.com/public/v1';
const MAX_ANTIGUEDAD = 10 * 60_000;

const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

// ---------- Firma de los webhooks (RSA PKCS#1 v1.5 + SHA-256 sobre "id.timestamp.cuerpo") ----------

let clave = null;
let claveFecha = 0;

async function importarClave(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey('spki', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

async function claveKick(renovar = false) {
  if (clave && !renovar && Date.now() - claveFecha < 3_600_000) return clave;
  const r = await fetch(`${KICK_API}/public-key`);
  const j = await r.json();
  clave = await importarClave(j.data.public_key);
  claveFecha = Date.now();
  return clave;
}

export async function firmaValida(claveRsa, { id, fecha, cuerpo, firma }) {
  if (!id || !fecha || !firma) return false;
  let bytes;
  try { bytes = Uint8Array.from(atob(firma), c => c.charCodeAt(0)); } catch { return false; }
  const datos = new TextEncoder().encode(`${id}.${fecha}.${cuerpo}`);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', claveRsa, bytes, datos);
}

async function comprobarFirma(req, cuerpo) {
  const datos = {
    id: req.headers.get('Kick-Event-Message-Id'),
    fecha: req.headers.get('Kick-Event-Message-Timestamp'),
    firma: req.headers.get('Kick-Event-Signature'),
    cuerpo,
  };
  if (Math.abs(Date.now() - Date.parse(datos.fecha)) > MAX_ANTIGUEDAD) return false;
  if (await firmaValida(await claveKick(), datos)) return true;
  // Kick puede cambiar la clave en cualquier momento: se reintenta una vez con la clave actual.
  return firmaValida(await claveKick(true), datos);
}

// ---------- OAuth ----------

async function pedirToken(env, campos) {
  const r = await fetch(`${KICK_ID}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.KICK_CLIENT_ID, client_secret: env.KICK_CLIENT_SECRET, ...campos }),
  });
  const texto = await r.text();
  return new Response(texto, { status: r.status, headers: { 'Content-Type': 'application/json' } });
}

async function usuarioDelToken(token) {
  const r = await fetch(`${KICK_API}/users`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const j = await r.json();
  return j.data?.[0]?.user_id ?? null;
}

// ---------- Worker ----------

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const redirectUri = `${url.origin}/callback`;

    if (url.pathname === '/config') {
      return json({ client_id: env.KICK_CLIENT_ID, redirect_uri: redirectUri });
    }

    if (url.pathname === '/callback') {
      // El estado lleva el puerto de la app local ("aleatorio.7390"): solo se redirige a localhost.
      const puerto = Number((url.searchParams.get('state') || '').split('.')[1]);
      if (!Number.isInteger(puerto) || puerto < 1024 || puerto > 65535) return new Response('Estado no válido', { status: 400 });
      const destino = new URL(`http://localhost:${puerto}/kick/callback`);
      for (const k of ['code', 'state', 'error', 'error_description']) {
        const v = url.searchParams.get(k);
        if (v) destino.searchParams.set(k, v);
      }
      return Response.redirect(destino.toString(), 302);
    }

    if (url.pathname === '/token' && req.method === 'POST') {
      const { code, code_verifier } = await req.json().catch(() => ({}));
      if (!code || !code_verifier) return json({ error: 'Faltan code o code_verifier' }, 400);
      return pedirToken(env, { grant_type: 'authorization_code', code, code_verifier, redirect_uri: redirectUri });
    }

    if (url.pathname === '/refresh' && req.method === 'POST') {
      const { refresh_token } = await req.json().catch(() => ({}));
      if (!refresh_token) return json({ error: 'Falta refresh_token' }, 400);
      return pedirToken(env, { grant_type: 'refresh_token', refresh_token });
    }

    if (url.pathname === '/webhook' && req.method === 'POST') {
      const cuerpo = await req.text();
      if (!(await comprobarFirma(req, cuerpo))) return new Response('Firma no válida', { status: 401 });
      let datos;
      try { datos = JSON.parse(cuerpo); } catch { return new Response('JSON no válido', { status: 400 }); }
      const canal = datos.broadcaster?.user_id;
      if (canal == null) return new Response('ok');
      const evento = { id: req.headers.get('Kick-Event-Message-Id'), tipo: req.headers.get('Kick-Event-Type'), version: req.headers.get('Kick-Event-Version'), datos };
      const sala = env.SALAS.get(env.SALAS.idFromName(String(canal)));
      await sala.fetch('https://sala/evento', { method: 'POST', body: JSON.stringify(evento) });
      return new Response('ok');
    }

    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Se esperaba WebSocket', { status: 426 });
      const canal = await usuarioDelToken(url.searchParams.get('token') || '');
      if (canal == null) return new Response('Token no válido', { status: 401 });
      const sala = env.SALAS.get(env.SALAS.idFromName(String(canal)));
      return sala.fetch(new Request('https://sala/ws', req));
    }

    return new Response('MTv MultiChat · puente de Kick', { status: url.pathname === '/' ? 200 : 404 });
  },
};

// Una sala por streamer: guarda las conexiones de sus apps (puede tener la app abierta en más de un PC).
// Usa la API de hibernación: la sala no consume mientras espera.
export class Sala {
  constructor(ctx) {
    this.ctx = ctx;
    this.vistos = [];
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      const par = new WebSocketPair();
      this.ctx.acceptWebSocket(par[1]);
      return new Response(null, { status: 101, webSocket: par[0] });
    }
    if (url.pathname === '/evento') {
      const texto = await req.text();
      const { id } = JSON.parse(texto);
      // Kick puede entregar el mismo evento más de una vez.
      if (id && this.vistos.includes(id)) return new Response('repetido');
      if (id) { this.vistos.push(id); if (this.vistos.length > 500) this.vistos.shift(); }
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.send(texto); } catch { /* conexión cerrada */ }
      }
      return new Response('ok');
    }
    return new Response('No encontrado', { status: 404 });
  }

  webSocketMessage() {}
  webSocketClose(ws, codigo) { try { ws.close(codigo); } catch { /* ya cerrada */ } }
}
