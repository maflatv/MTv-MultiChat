// Cuenta de Twitch (opcional). El chat funciona sin iniciar sesión; con sesión se añaden:
//  - follows y canjes de puntos del canal (EventSub por WebSocket), que no pasan por el chat;
//  - avatares e insignias oficiales (Helix).
// Inicio de sesión por código de dispositivo (Device Code Flow) con una aplicación de Twitch de tipo "Public":
// no hace falta servidor ni clave secreta. La app muestra un código y el usuario lo confirma en twitch.tv/activate.
const { crear } = require('../mensaje.js');

// Client ID de la aplicación "MTv MultiChat" registrada en dev.twitch.tv como cliente público. Se puede cambiar en el dock.
const CLIENT_ID_POR_DEFECTO = '';
const ID = 'https://id.twitch.tv/oauth2';
const HELIX = 'https://api.twitch.tv/helix';
const EVENTSUB = 'wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30';
const ALCANCES = ['moderator:read:followers', 'channel:read:redemptions'];

async function pedir(url, opciones = {}) {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), 15_000);
  try {
    const r = await fetch(url, { ...opciones, signal: control.signal });
    const texto = await r.text();
    let cuerpo = null;
    try { cuerpo = texto ? JSON.parse(texto) : null; } catch { cuerpo = { texto }; }
    return { ok: r.ok, estado: r.status, cuerpo };
  } finally { clearTimeout(t); }
}
const formulario = campos => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(campos) });

// ---------- Inicio de sesión (Device Code Flow) ----------

async function pedirCodigo(clientId) {
  const r = await pedir(`${ID}/device`, formulario({ client_id: clientId, scopes: ALCANCES.join(' ') }));
  if (!r.ok || !r.cuerpo?.device_code) throw new Error(r.cuerpo?.message || `Twitch no dio un código (${r.estado})`);
  return r.cuerpo; // { device_code, user_code, verification_uri, expires_in, interval }
}

// Espera a que el usuario confirme el código. Devuelve la sesión o lanza error si caduca o se cancela.
async function esperarConfirmacion(clientId, codigo, { cancelado = () => false, dormir = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const fin = Date.now() + Number(codigo.expires_in || 1800) * 1000;
  const intervalo = Math.max(Number(codigo.interval || 5), 1) * 1000;
  while (Date.now() < fin) {
    await dormir(intervalo);
    if (cancelado()) throw new Error('Cancelado');
    const r = await pedir(`${ID}/token`, formulario({ client_id: clientId, scopes: ALCANCES.join(' '), device_code: codigo.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }));
    if (r.ok && r.cuerpo?.access_token) return sesionDe(r.cuerpo);
    if (r.cuerpo?.message !== 'authorization_pending') throw new Error(r.cuerpo?.message || `Twitch rechazó el inicio de sesión (${r.estado})`);
  }
  throw new Error('El código ha caducado');
}

const sesionDe = c => ({ access_token: c.access_token, refresh_token: c.refresh_token, expira: Date.now() + Number(c.expires_in || 14400) * 1000 });

// Los refresh tokens de un cliente público son de un solo uso: hay que guardar siempre el nuevo.
async function renovar(clientId, sesion) {
  const r = await pedir(`${ID}/token`, formulario({ grant_type: 'refresh_token', refresh_token: sesion.refresh_token, client_id: clientId }));
  if (r.ok && r.cuerpo?.access_token) return { ...sesion, ...sesionDe(r.cuerpo) };
  if (r.estado === 400 || r.estado === 401) return null;
  throw new Error(`Twitch no responde (${r.estado})`);
}

// ---------- Helix ----------

class Helix {
  constructor(clientId, token) { this.clientId = clientId; this.token = token; }
  cab() { return { 'Client-Id': this.clientId(), Authorization: `Bearer ${this.token()}` }; }
  get(ruta) { return pedir(`${HELIX}${ruta}`, { headers: this.cab() }); }
  post(ruta, cuerpo) { return pedir(`${HELIX}${ruta}`, { method: 'POST', headers: { ...this.cab(), 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }); }
}

// Avatares por lotes de hasta 100 usuarios, con caché. Cada petición espera como mucho ~150 ms a juntar el lote.
class Avatares {
  constructor(helix) { this.helix = helix; this.cache = new Map(); this.cola = new Map(); this.temporizador = null; }
  obtener(id) {
    if (!id) return Promise.resolve(null);
    if (this.cache.has(id)) return Promise.resolve(this.cache.get(id));
    if (!this.cola.has(id)) { let ok; const p = new Promise(r => { ok = r; }); this.cola.set(id, { p, ok }); }
    if (!this.temporizador) this.temporizador = setTimeout(() => this.lote(), 150);
    return this.cola.get(id).p;
  }
  async lote() {
    this.temporizador = null;
    const ids = [...this.cola.keys()].slice(0, 100);
    const pendientes = ids.map(id => [id, this.cola.get(id)]);
    ids.forEach(id => this.cola.delete(id));
    if (this.cola.size) this.temporizador = setTimeout(() => this.lote(), 150);
    let datos = [];
    try { datos = (await this.helix.get(`/users?${ids.map(i => `id=${encodeURIComponent(i)}`).join('&')}`)).cuerpo?.data || []; } catch { /* sin avatares */ }
    const porId = new Map(datos.map(u => [u.id, u.profile_image_url || null]));
    if (this.cache.size > 5000) this.cache.clear();
    for (const [id, { ok }] of pendientes) { const url = porId.get(id) ?? null; this.cache.set(id, url); ok(url); }
  }
}

const ROL_DE_SET = { broadcaster: 'emisor', moderator: 'mod', lead_moderator: 'mod', vip: 'vip', subscriber: 'sub', founder: 'fundador', partner: 'verificado' };

// Insignias: "moderator/1,subscriber/12" → [{ img, titulo }], con las globales y las propias del canal.
class Insignias {
  constructor(helix) { this.helix = helix; this.mapa = new Map(); }
  async cargar(idCanal) {
    const mapa = new Map();
    for (const ruta of ['/chat/badges/global', `/chat/badges?broadcaster_id=${idCanal}`]) {
      try {
        for (const set of (await this.helix.get(ruta)).cuerpo?.data || []) {
          for (const v of set.versions || []) mapa.set(`${set.set_id}/${v.id}`, { img: v.image_url_2x || v.image_url_1x, titulo: v.title || set.set_id, tipo: ROL_DE_SET[set.set_id] || null });
        }
      } catch { /* sin insignias */ }
    }
    if (mapa.size) this.mapa = mapa;
  }
  de(etiqueta) {
    return String(etiqueta || '').split(',').filter(Boolean).map(b => this.mapa.get(b)).filter(b => b && /^https:\/\//.test(b.img));
  }
}

// ---------- EventSub (follows y canjes) ----------

function interpretarEventSub(tipo, e, idMensaje) {
  if (tipo === 'channel.follow') {
    return crear({ id: `twitch:follow:${idMensaje}`, plataforma: 'twitch', canal: e.broadcaster_user_login, tipo: 'follow', fecha: Date.parse(e.followed_at) || Date.now(), autor: { id: e.user_id, nombre: e.user_name || e.user_login }, titulo: `${e.user_name || e.user_login} te sigue` });
  }
  if (tipo === 'channel.channel_points_custom_reward_redemption.add') {
    return crear({ id: `twitch:canje:${e.id || idMensaje}`, plataforma: 'twitch', canal: e.broadcaster_user_login, tipo: 'aviso', fecha: Date.parse(e.redeemed_at) || Date.now(), autor: { id: e.user_id, nombre: e.user_name || e.user_login }, texto: e.user_input || '', titulo: `${e.user_name || e.user_login} canjea «${e.reward?.title}» (${e.reward?.cost} puntos)` });
  }
  return null;
}

// Conexión EventSub. Avisa con onMensaje(m); si Twitch pide reconectar, se mueve a la URL nueva.
class EventSub {
  constructor({ helix, idCanal, idUsuario, onMensaje, onEstado }) {
    Object.assign(this, { helix, idCanal, idUsuario, onMensaje, onEstado });
    this.ws = null;
    this.vigilante = null;
    this.cerrado = false;
    this.reintento = 2000;
  }

  abrir(url = EVENTSUB) {
    if (this.cerrado) return;
    const ws = new WebSocket(url);
    const anterior = this.ws;
    this.ws = ws;
    let limite = 40_000;
    const latido = () => { clearTimeout(this.vigilante); this.vigilante = setTimeout(() => { if (this.ws === ws) { ws.close(); } }, limite); };
    ws.onmessage = async e => {
      latido();
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      const tipo = m.metadata?.message_type;
      if (tipo === 'session_welcome') {
        limite = (Number(m.payload.session.keepalive_timeout_seconds) || 30) * 1000 + 10_000;
        latido();
        // En una reconexión pedida por Twitch, las suscripciones se conservan.
        if (anterior) { try { anterior.close(); } catch { /* ya cerrada */ } return; }
        this.reintento = 2000;
        await this.suscribir(m.payload.session.id);
      } else if (tipo === 'session_reconnect') {
        this.abrir(m.payload.session.reconnect_url);
      } else if (tipo === 'notification') {
        const msg = interpretarEventSub(m.metadata.subscription_type, m.payload.event, m.metadata.message_id);
        if (msg) this.onMensaje(msg);
      } else if (tipo === 'revocation') {
        this.onEstado(`Twitch retiró el permiso de ${m.payload?.subscription?.type}`);
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws || this.cerrado) return;
      clearTimeout(this.vigilante);
      this.ws = null;
      setTimeout(() => this.abrir(), this.reintento);
      this.reintento = Math.min(this.reintento * 2, 60_000);
    };
    ws.onerror = () => {};
  }

  async suscribir(sesionId) {
    const transporte = { method: 'websocket', session_id: sesionId };
    const pedidos = [
      { type: 'channel.follow', version: '2', condition: { broadcaster_user_id: this.idCanal, moderator_user_id: this.idUsuario } },
      { type: 'channel.channel_points_custom_reward_redemption.add', version: '1', condition: { broadcaster_user_id: this.idCanal } },
    ];
    const fallos = [];
    for (const p of pedidos) {
      const r = await this.helix.post('/eventsub/subscriptions', { ...p, transport: transporte });
      if (!r.ok) fallos.push(p.type === 'channel.follow' ? 'follows' : 'canjes');
    }
    // Sin ser el dueño del canal (o moderador, para los follows), Twitch no da estos eventos.
    this.onEstado(fallos.length ? `Sin ${fallos.join(' ni ')}: solo con tu propio canal (o siendo moderador)` : '');
  }

  cerrar() {
    this.cerrado = true;
    clearTimeout(this.vigilante);
    try { this.ws?.close(); } catch { /* ya cerrada */ }
    this.ws = null;
  }
}

module.exports = { CLIENT_ID_POR_DEFECTO, ALCANCES, pedirCodigo, esperarConfirmacion, renovar, Helix, Avatares, Insignias, EventSub, interpretarEventSub, pedir };
