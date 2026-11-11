// Kick tiene dos caminos:
//  - 'oficial': API pública de Kick. El usuario inicia sesión y la app se suscribe a sus eventos. Kick los envía
//    por webhook al servidor puente (puente-kick/), que los reenvía a esta app por WebSocket. Trae chat, follows,
//    subs, regalos de subs, KICKs, canjes y baneos. No se rompe cuando Kick cambia su web.
//  - 'ventana': solo en la app de escritorio (kick-ventana.js). Abre el chat de Kick en una ventana oculta de
//    Chromium y escucha la conexión de chat de la propia página. No hace falta iniciar sesión ni servidor puente.
// Este archivo tiene el conector oficial y la traducción de eventos de los dos caminos.
const crypto = require('crypto');
const { crear } = require('../mensaje.js');
const { Conector } = require('./base.js');
const { EmotesCanal } = require('../emotes.js');

// Dirección del servidor puente publicado (puente-kick/LEEME.md). Se puede cambiar en el dock.
const PUENTE_POR_DEFECTO = '';
const API = 'https://api.kick.com/public/v1';
const AUTORIZAR = 'https://id.kick.com/oauth/authorize';
const ALCANCES = ['user:read', 'channel:read', 'events:subscribe', 'channel:rewards:read', 'kicks:read'];
const EVENTOS = ['chat.message.sent', 'channel.followed', 'channel.subscription.new', 'channel.subscription.renewal', 'channel.subscription.gifts', 'kicks.gifted', 'moderation.banned', 'channel.reward.redemption.updated', 'livestream.status.updated'];
// Precio aproximado de un KICK para el espectador.
const USD_POR_KICK = 0.01;
const EMOTE = id => `https://files.kick.com/emotes/${id}/fullsize`;

// ---------- Traducción común ----------

// "hola [emote:37226:KEKW] qué tal" → partes
function partesKick(contenido) {
  const partes = [];
  const re = /\[emote:(\d+):([^\]]*)\]/g;
  let cursor = 0;
  let m;
  const texto = String(contenido || '');
  while ((m = re.exec(texto))) {
    if (m.index > cursor) partes.push({ t: 'texto', v: texto.slice(cursor, m.index) });
    partes.push({ t: 'emote', v: m[2] || 'emote', img: EMOTE(m[1]) });
    cursor = m.index + m[0].length;
  }
  if (cursor < texto.length) partes.push({ t: 'texto', v: texto.slice(cursor) });
  return partes;
}

function rolesKick(insignias = []) {
  const tipos = new Set(insignias.map(b => b.type));
  const sub = insignias.find(b => b.type === 'subscriber' || b.type === 'founder');
  return {
    roles: {
      emisor: tipos.has('broadcaster'), mod: tipos.has('moderator'), vip: tipos.has('vip'), og: tipos.has('og'), sub: !!sub, miembro: false,
      fundador: tipos.has('founder'), verificado: tipos.has('verified'), regalador: tipos.has('sub_gifter'),
    },
    meses: Number(sub?.count || 0),
  };
}

const usuario = u => {
  const { roles, meses } = rolesKick(u?.identity?.badges);
  return { id: u?.user_id != null ? String(u.user_id) : '', nombre: u?.username || '', color: u?.identity?.username_color || u?.identity?.color || null, avatar: u?.profile_picture || null, roles, meses };
};
const anonimo = u => !u || u.is_anonymous || !u.username;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Evento del puente: { id: Kick-Event-Message-Id, tipo: Kick-Event-Type, datos: cuerpo del webhook }
function interpretarOficial({ id, tipo, datos: d }) {
  const base = { id: `kick:${id}`, plataforma: 'kick', canal: d?.broadcaster?.channel_slug || '' };
  switch (tipo) {
    case 'chat.message.sent':
      return { mensaje: crear({ ...base, id: `kick:${d.message_id || id}`, tipo: 'mensaje', fecha: Date.parse(d.created_at) || Date.now(), autor: usuario(d.sender), partes: partesKick(d.content) }) };
    case 'channel.followed':
      return { mensaje: crear({ ...base, tipo: 'follow', autor: usuario(d.follower), titulo: `${d.follower?.username} te sigue` }) };
    case 'channel.subscription.new':
      return { mensaje: crear({ ...base, tipo: 'suscripcion', autor: usuario(d.subscriber), cantidad: d.duration || 1, titulo: `${d.subscriber?.username} se ha suscrito` }) };
    case 'channel.subscription.renewal':
      return { mensaje: crear({ ...base, tipo: 'suscripcion', autor: usuario(d.subscriber), cantidad: d.duration || 1, titulo: `${d.subscriber?.username} renueva: ${plural(d.duration || 1, 'mes', 'meses')}` }) };
    case 'channel.subscription.gifts': {
      const n = (d.giftees || []).length || 1;
      const quien = anonimo(d.gifter) ? 'Alguien anónimo' : d.gifter.username;
      return { mensaje: crear({ ...base, tipo: 'regalo_subs', autor: anonimo(d.gifter) ? { nombre: quien } : usuario(d.gifter), cantidad: n, titulo: `${quien} regala ${plural(n, 'suscripción', 'suscripciones')}` }) };
    }
    case 'kicks.gifted': {
      const g = d.gift || {};
      const n = Number(g.amount || 0);
      return { mensaje: crear({ ...base, tipo: 'donacion', fecha: Date.parse(d.created_at) || Date.now(), autor: usuario(d.sender), texto: g.message || '', titulo: `${n} KICKs${g.name ? ` · ${g.name}` : ''}`, importe: { valor: n, moneda: 'KICKS', usd: Math.round(n * USD_POR_KICK * 100) / 100 } }) };
    }
    case 'channel.reward.redemption.updated':
      // Se avisa solo al canjear, no cuando el streamer acepta o rechaza.
      if (d.status && d.status !== 'pending') return null;
      return { mensaje: crear({ ...base, id: `kick:canje:${d.id || id}`, tipo: 'aviso', autor: { id: String(d.redeemer?.user_id || ''), nombre: d.redeemer?.username || '' }, texto: d.user_input || '', titulo: `${d.redeemer?.username} canjea «${d.reward?.title}»` }) };
    case 'moderation.banned':
      return d.banned_user?.user_id != null ? { borrar: { plataforma: 'kick', autorId: String(d.banned_user.user_id) } } : null;
    case 'livestream.status.updated':
      return { directo: { activo: !!d.is_live, titulo: d.title || '' } };
    default:
      return null;
  }
}

let contador = 0;
const idLocal = nombre => `kick:${nombre}:${Date.now()}:${++contador}`;

// Mensaje de la conexión de chat que usa la web de Kick (Pusher), para el camino 'ventana'.
function interpretarPusher(evento, d, canal = '') {
  if (!d || typeof d !== 'object') return null;
  const base = { plataforma: 'kick', canal };
  const nombre = String(evento || '').replace(/^App\\Events\\/, '');
  switch (nombre) {
    case 'ChatMessageEvent': {
      const s = d.sender || {};
      const { roles, meses } = rolesKick(s.identity?.badges);
      return { mensaje: crear({ ...base, id: `kick:${d.id}`, tipo: 'mensaje', fecha: Date.parse(d.created_at) || Date.now(), autor: { id: String(s.id ?? ''), nombre: s.username || '', color: s.identity?.color || null, roles, meses }, partes: partesKick(d.content) }) };
    }
    case 'MessageDeletedEvent':
      return d.message?.id ? { borrar: { ids: [`kick:${d.message.id}`] } } : null;
    case 'UserBannedEvent':
      return d.user?.id != null ? { borrar: { plataforma: 'kick', autorId: String(d.user.id) } } : null;
    case 'ChatroomClearEvent':
      return { borrar: { plataforma: 'kick', todo: true } };
    case 'SubscriptionEvent': {
      const meses = Number(d.months || 1);
      return { mensaje: crear({ ...base, id: idLocal('sub'), tipo: 'suscripcion', autor: { nombre: d.username || '' }, cantidad: meses, titulo: meses > 1 ? `${d.username} renueva: ${plural(meses, 'mes', 'meses')}` : `${d.username} se ha suscrito` }) };
    }
    case 'GiftedSubscriptionsEvent': {
      const n = (d.gifted_usernames || []).length || 1;
      const quien = d.gifter_username || 'Alguien anónimo';
      return { mensaje: crear({ ...base, id: idLocal('regalo'), tipo: 'regalo_subs', autor: { nombre: quien }, cantidad: n, titulo: `${quien} regala ${plural(n, 'suscripción', 'suscripciones')}` }) };
    }
    case 'StreamHostEvent': {
      const n = Number(d.number_viewers || 0);
      return { mensaje: crear({ ...base, id: idLocal('raid'), tipo: 'raid', autor: { nombre: d.host_username || '' }, cantidad: n, titulo: `Raid de ${d.host_username} con ${plural(n, 'espectador', 'espectadores')}` }) };
    }
    case 'KicksGifted': {
      const g = d.gift || {};
      const n = Number(g.amount || 0);
      const quien = d.sender?.username || d.username || '';
      return { mensaje: crear({ ...base, id: idLocal('kicks'), tipo: 'donacion', autor: { id: String(d.sender?.id ?? ''), nombre: quien }, texto: d.message || '', titulo: `${n} KICKs${g.name ? ` · ${g.name}` : ''}`, importe: { valor: n, moneda: 'KICKS', usd: Math.round(n * USD_POR_KICK * 100) / 100 } }) };
    }
    default:
      return null;
  }
}

// ---------- Inicio de sesión (OAuth 2.1 con PKCE) ----------

const base64url = buf => Buffer.from(buf).toString('base64url');

function nuevoPkce() {
  const verificador = base64url(crypto.randomBytes(32));
  const reto = base64url(crypto.createHash('sha256').update(verificador).digest());
  return { verificador, reto };
}

function urlAutorizar({ clientId, redirectUri, reto, estado }) {
  const q = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri, state: estado, scope: ALCANCES.join(' '), code_challenge: reto, code_challenge_method: 'S256' });
  return `${AUTORIZAR}?${q}`;
}

const limpiarPuente = url => String(url || '').trim().replace(/\/+$/, '');

async function pedirJson(url, opciones = {}) {
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

// ---------- Conector oficial ----------

class KickOficial extends Conector {
  // ctx: { sesion(): sesión guardada, guardarSesion(s) }
  constructor(bus, opciones, ctx) {
    super(bus, 'kick', opciones);
    this.ctx = ctx;
    this.generacion = 0;
    this.ws = null;
    this.ping = null;
    this.emotes = new EmotesCanal('kick');
  }

  conectar() {
    const gen = ++this.generacion;
    this.empezar(gen).catch(e => { if (gen === this.generacion) this.caida(e.name === 'AbortError' ? 'Kick no responde' : e.message); });
  }

  async empezar(gen) {
    const puente = limpiarPuente(this.opciones.puente);
    if (!puente) return this.fallo('Falta la dirección del servidor puente');
    if (!this.ctx.sesion()?.access_token) return this.fallo('Inicia sesión con Kick');
    this.cambiar('conectando');
    const token = await this.token(puente);
    if (gen !== this.generacion) return;
    if (!token) return this.fallo('La sesión de Kick ha caducado: vuelve a iniciar sesión');
    await this.suscribir(token);
    if (gen !== this.generacion) return;
    // Emotes de 7TV del canal (el de la cuenta con la que se inició sesión).
    this.emotes.preparar(String(this.ctx.sesion()?.user_id || 'global')).catch(() => {});

    const ws = new WebSocket(`${puente.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`);
    this.ws = ws;
    ws.onopen = () => {
      if (gen !== this.generacion) return;
      this.cambiar('conectado', this.opciones.usuario ? `@${this.opciones.usuario}` : '');
      this.vigilar(90_000);
    };
    ws.onmessage = e => {
      this.vivo();
      if (e.data === 'pong') return;
      let ev;
      try { ev = JSON.parse(e.data); } catch { return; }
      const r = interpretarOficial(ev);
      if (r?.mensaje) { r.mensaje.partes = this.emotes.aplicar(r.mensaje.partes); this.bus.mensaje(r.mensaje); }
      else if (r?.borrar) this.bus.borrar(r.borrar);
      else if (r?.directo) this.cambiar('conectado', r.directo.activo ? `En directo: ${r.directo.titulo}` : `@${this.opciones.usuario}`);
    };
    ws.onerror = () => {};
    ws.onclose = () => { if (this.ws === ws) this.caida('Conexión con el puente cerrada'); };
    clearInterval(this.ping);
    this.ping = setInterval(() => { if (ws.readyState === 1) ws.send('ping'); }, 30_000);
  }

  // Token de acceso válido, renovándolo a través del puente si caduca en menos de 5 minutos.
  async token(puente) {
    const s = this.ctx.sesion();
    if (s.expira && s.expira - Date.now() > 5 * 60_000) return s.access_token;
    if (!s.refresh_token) return null;
    const r = await pedirJson(`${puente}/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
    if (!r.ok || !r.cuerpo?.access_token) {
      if (r.estado >= 500) throw new Error('El puente no responde');
      return null;
    }
    const nueva = { ...s, access_token: r.cuerpo.access_token, refresh_token: r.cuerpo.refresh_token || s.refresh_token, expira: Date.now() + Number(r.cuerpo.expires_in || 3600) * 1000 };
    this.ctx.guardarSesion(nueva);
    return nueva.access_token;
  }

  // Se suscribe a los eventos que aún no tenga (Kick quita la suscripción si el webhook falla más de un día).
  async suscribir(token) {
    const cab = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const lista = await pedirJson(`${API}/events/subscriptions`, { headers: cab });
    if (lista.estado === 401) throw new Error('Kick rechazó la sesión');
    const tiene = new Set((lista.cuerpo?.data || []).map(s => s.event));
    const faltan = EVENTOS.filter(e => !tiene.has(e));
    if (!faltan.length) return;
    const r = await pedirJson(`${API}/events/subscriptions`, { method: 'POST', headers: cab, body: JSON.stringify({ method: 'webhook', events: faltan.map(name => ({ name, version: 1 })) }) });
    if (!r.ok) throw new Error(`Kick no aceptó la suscripción a eventos (${r.estado})`);
  }

  cerrar() {
    this.generacion++;
    clearInterval(this.ping);
    const ws = this.ws;
    this.ws = null;
    try { ws?.close(); } catch { /* ya cerrada */ }
  }
}

module.exports = { KickOficial, interpretarOficial, interpretarPusher, partesKick, nuevoPkce, urlAutorizar, limpiarPuente, pedirJson, PUENTE_POR_DEFECTO, API };
