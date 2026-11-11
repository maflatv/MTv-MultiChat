// Twitch: chat por IRC sobre WebSocket, en modo anónimo (solo lectura, sin iniciar sesión).
// Trae mensajes, bits, suscripciones, regalos de subs, raids y los borrados de los moderadores.
// Los follows no pasan por el chat: necesitan EventSub con la cuenta del streamer (fase posterior).
const { crear } = require('../mensaje.js');
const { Conector } = require('./base.js');
const { EmotesCanal } = require('../emotes.js');
const cuenta = require('./twitch-cuenta.js');

const URL_IRC = 'wss://irc-ws.chat.twitch.tv:443';
const EMOTE = id => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`;
// Twitch paga 1 céntimo de dólar por bit al streamer.
const USD_POR_BIT = 0.01;
const PLAN = { Prime: 'Prime', 1000: 'Nivel 1', 2000: 'Nivel 2', 3000: 'Nivel 3' };

// --- Lectura de líneas IRC (con etiquetas IRCv3) ---

const ESCAPES = { ':': ';', s: ' ', '\\': '\\', r: '\r', n: '\n' };
const desescapar = v => v.replace(/\\(.?)/g, (_, c) => (c in ESCAPES ? ESCAPES[c] : c));

function leerLinea(linea) {
  let resto = linea;
  const tags = {};
  if (resto.startsWith('@')) {
    const fin = resto.indexOf(' ');
    for (const par of resto.slice(1, fin).split(';')) {
      const i = par.indexOf('=');
      tags[i < 0 ? par : par.slice(0, i)] = i < 0 ? '' : desescapar(par.slice(i + 1));
    }
    resto = resto.slice(fin + 1);
  }
  let prefijo = '';
  if (resto.startsWith(':')) {
    const fin = resto.indexOf(' ');
    prefijo = resto.slice(1, fin);
    resto = resto.slice(fin + 1);
  }
  let final = null;
  const i = resto.indexOf(' :');
  if (i >= 0) { final = resto.slice(i + 2); resto = resto.slice(0, i); }
  const [comando, ...params] = resto.split(' ').filter(Boolean);
  return { tags, prefijo, comando, params, final };
}

// "25:0-4,12-16/1902:6-10" → trozos de texto y emotes. Las posiciones cuentan caracteres Unicode, no UTF-16.
function partesConEmotes(texto, emotes) {
  const chars = Array.from(texto);
  const rangos = [];
  for (const grupo of (emotes || '').split('/').filter(Boolean)) {
    const [id, pos] = grupo.split(':');
    for (const r of (pos || '').split(',')) {
      const [a, b] = r.split('-').map(Number);
      if (Number.isInteger(a) && Number.isInteger(b)) rangos.push({ id, a, b });
    }
  }
  rangos.sort((x, y) => x.a - y.a);
  const partes = [];
  let cursor = 0;
  for (const { id, a, b } of rangos) {
    if (a < cursor) continue;
    if (a > cursor) partes.push({ t: 'texto', v: chars.slice(cursor, a).join('') });
    partes.push({ t: 'emote', v: chars.slice(a, b + 1).join(''), img: EMOTE(id) });
    cursor = b + 1;
  }
  if (cursor < chars.length) partes.push({ t: 'texto', v: chars.slice(cursor).join('') });
  return partes;
}

function insignias(tags) {
  const s = new Set((tags.badges || '').split(',').map(b => b.split('/')[0]).filter(Boolean));
  return {
    emisor: s.has('broadcaster'), mod: s.has('moderator') || tags.mod === '1', vip: s.has('vip'),
    sub: s.has('subscriber') || s.has('founder') || tags.subscriber === '1', fundador: s.has('founder'), verificado: s.has('partner'),
  };
}

function autor(tags, prefijo) {
  const login = tags.login || prefijo.split('!')[0];
  const meses = Number((tags['badge-info'] || '').match(/subscriber\/(\d+)/)?.[1] || 0);
  return { id: tags['user-id'] || login, nombre: tags['display-name'] || login, color: tags.color || null, roles: insignias(tags), meses };
}

// Convierte una línea IRC en una acción para el bus: { mensaje } o { borrar }, o null si no interesa.
function interpretar(l) {
  const canal = (l.params[0] || '').replace(/^#/, '');
  const t = l.tags;
  if (l.comando === 'PRIVMSG') {
    let texto = l.final || '';
    // /me se envía como CTCP ACTION.
    const accion = texto.match(/^\u0001ACTION (.*)\u0001$/);
    if (accion) texto = accion[1];
    const bits = Number(t.bits || 0);
    return {
      mensaje: crear({
        id: `twitch:${t.id}`, plataforma: 'twitch', canal, fecha: Number(t['tmi-sent-ts']) || Date.now(),
        tipo: bits ? 'donacion' : 'mensaje', autor: autor(t, l.prefijo),
        partes: partesConEmotes(texto, t.emotes), texto,
        titulo: bits ? `${bits} bits` : '',
        importe: bits ? { valor: bits, moneda: 'BITS', usd: +(bits * USD_POR_BIT).toFixed(2) } : null,
      }),
    };
  }
  if (l.comando === 'USERNOTICE') {
    const tipoTw = t['msg-id'];
    const base = { id: `twitch:${t.id}`, plataforma: 'twitch', canal, fecha: Number(t['tmi-sent-ts']) || Date.now(), autor: autor(t, l.prefijo), titulo: t['system-msg'] || '', texto: l.final || '' };
    if (base.texto) base.partes = partesConEmotes(base.texto, t.emotes);
    const plan = PLAN[t['msg-param-sub-plan']] || '';
    if (tipoTw === 'sub' || tipoTw === 'resub') {
      return { mensaje: crear({ ...base, tipo: 'suscripcion', cantidad: Number(t['msg-param-cumulative-months'] || 1), importe: plan ? { valor: 1, moneda: plan, usd: null } : null }) };
    }
    if (tipoTw === 'subgift' || tipoTw === 'anonsubgift') {
      // Los regalos de una tanda (submysterygift) llegan además uno a uno: solo se muestra el anuncio de la tanda.
      if (t['msg-param-community-gift-id']) return null;
      return { mensaje: crear({ ...base, tipo: 'regalo_subs', cantidad: 1 }) };
    }
    if (tipoTw === 'submysterygift' || tipoTw === 'anonsubmysterygift') {
      return { mensaje: crear({ ...base, tipo: 'regalo_subs', cantidad: Number(t['msg-param-mass-gift-count'] || 1) }) };
    }
    if (tipoTw === 'raid') {
      return { mensaje: crear({ ...base, tipo: 'raid', cantidad: Number(t['msg-param-viewerCount'] || 0) }) };
    }
    // Anuncios, hitos de espectadores, etc.: avisos sin importe.
    return { mensaje: crear({ ...base, tipo: 'aviso' }) };
  }
  if (l.comando === 'CLEARMSG') return { borrar: { ids: [`twitch:${t['target-msg-id']}`] } };
  if (l.comando === 'CLEARCHAT') {
    if (t['target-user-id']) return { borrar: { plataforma: 'twitch', autorId: t['target-user-id'] } };
    return { borrar: { plataforma: 'twitch', todo: true, canal } };
  }
  return null;
}

// --- Conexión ---

class Twitch extends Conector {
  // ctx (opcional): { sesion(), guardarSesion(s), clientId() } para la cuenta de Twitch.
  constructor(bus, opciones, ctx = null) {
    super(bus, 'twitch', opciones);
    this.ctx = ctx;
    this.ws = null;
    this.ping = null;
    this.emotes = new EmotesCanal();
    this.cola = Promise.resolve();
    this.extra = null; // { helix, avatares, insignias, eventsub } con sesión iniciada
    this.aviso = '';
  }

  conectar() {
    const canal = String(this.opciones.canal || '').trim().toLowerCase().replace(/^#/, '');
    if (!/^[a-z0-9_]{3,25}$/.test(canal)) return this.fallo('Nombre de canal no válido');
    this.canal = canal;
    this.cambiar('conectando');
    const ws = new WebSocket(URL_IRC);
    this.ws = ws;
    ws.onopen = () => {
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      ws.send('PASS SCHMOOPIIE');
      ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 80000)}`);
      ws.send(`JOIN #${canal}`);
    };
    ws.onmessage = e => {
      this.vivo();
      for (const linea of String(e.data).split('\r\n').filter(Boolean)) this.linea(linea);
    };
    ws.onerror = () => {};
    ws.onclose = () => { if (this.ws === ws) this.caida('Conexión cerrada'); };
    // Twitch manda PING cada ~5 min; además se manda uno propio para notar antes una conexión muerta.
    clearInterval(this.ping);
    this.ping = setInterval(() => { if (ws.readyState === 1) ws.send('PING :mtv'); }, 60_000);
    this.vigilar(150_000);
  }

  linea(texto) {
    const l = leerLinea(texto);
    if (l.comando === 'PING') return this.ws.send(`PONG :${l.final || 'tmi.twitch.tv'}`);
    if (l.comando === 'RECONNECT') return this.caida('Twitch pidió reconectar');
    if (l.comando === 'ROOMSTATE') {
      // ROOMSTATE trae el ID del canal: con él se cargan emotes de 7TV/BTTV/FFZ y, con sesión, lo demás.
      const id = l.tags['room-id'];
      if (id && id !== this.idCanal) { this.idCanal = id; this.preparar(id); }
      return this.cambiar('conectado', this.detalle());
    }
    if (l.comando === 'NOTICE' && /msg_channel_suspended|msg_banned/.test(l.tags['msg-id'] || '')) return this.fallo(l.final);
    const accion = interpretar(l);
    if (accion?.mensaje) {
      // En cola para no desordenar los mensajes mientras se busca un avatar.
      this.cola = this.cola.then(() => this.entregar(accion.mensaje, l.tags.badges)).catch(() => {});
    } else if (accion?.borrar) this.bus.borrar(accion.borrar);
  }

  detalle() { return `#${this.canal}${this.aviso ? ` · ${this.aviso}` : ''}`; }

  async entregar(m, insignias) {
    m.partes = this.emotes.aplicar(m.partes);
    if (this.extra) {
      m.autor.insignias = this.extra.insignias.de(insignias);
      if (!m.autor.avatar && m.autor.id) {
        // Como mucho medio segundo de espera por el avatar: el chat no debe retrasarse.
        m.autor.avatar = await Promise.race([this.extra.avatares.obtener(m.autor.id), new Promise(r => setTimeout(() => r(null), 500))]);
      }
    }
    this.bus.mensaje(m);
  }

  async preparar(idCanal) {
    this.emotes.preparar(idCanal).catch(() => {});
    if (!this.ctx?.sesion()?.access_token || !this.ctx.clientId()) return;
    try {
      const token = await this.token();
      if (!token) { this.aviso = 'la sesión de Twitch caducó: vuelve a iniciarla'; return this.cambiar('conectado', this.detalle()); }
      const helix = new cuenta.Helix(() => this.ctx.clientId(), () => this.ctx.sesion().access_token);
      const insignias = new cuenta.Insignias(helix);
      await insignias.cargar(idCanal);
      const eventsub = new cuenta.EventSub({
        helix, idCanal, idUsuario: this.ctx.sesion().user_id,
        onMensaje: m => this.bus.mensaje(m),
        onEstado: texto => { this.aviso = texto; if (this.estado.estado === 'conectado') this.cambiar('conectado', this.detalle()); },
      });
      this.extra?.eventsub.cerrar();
      this.extra = { helix, avatares: new cuenta.Avatares(helix), insignias, eventsub };
      eventsub.abrir();
    } catch (e) {
      this.aviso = `sin datos de la cuenta (${e.message})`;
      this.cambiar('conectado', this.detalle());
    }
  }

  // Token válido; se renueva si caduca en menos de 10 minutos. null si la sesión ya no sirve.
  async token() {
    const s = this.ctx.sesion();
    if (s.expira - Date.now() > 10 * 60_000) return s.access_token;
    const nueva = await cuenta.renovar(this.ctx.clientId(), s);
    if (!nueva) return null;
    this.ctx.guardarSesion(nueva);
    // Los tokens duran 4 horas: se renueva antes de que caduque mientras la conexión siga abierta.
    clearTimeout(this.renovacion);
    this.renovacion = setTimeout(() => this.token().catch(() => {}), Math.max(nueva.expira - Date.now() - 15 * 60_000, 60_000));
    return nueva.access_token;
  }

  cerrar() {
    clearInterval(this.ping);
    clearTimeout(this.renovacion);
    this.extra?.eventsub.cerrar();
    this.extra = null;
    this.idCanal = null;
    const ws = this.ws;
    this.ws = null;
    try { ws?.close(); } catch { /* ya estaba cerrada */ }
  }
}

module.exports = { Twitch, leerLinea, interpretar, partesConEmotes };
