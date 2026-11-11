// YouTube: lee el chat con la misma petición de datos que usa el chat emergente de YouTube
// (youtubei/v1/live_chat/get_live_chat). No hace falta clave de API ni hay cupo diario.
// No es una API oficial: si YouTube la cambia, solo hay que tocar este archivo.
//
// El usuario escribe su canal (@nombre, URL o ID). Si no está en directo, se espera y se vuelve a mirar
// cada minuto: al empezar el directo se conecta solo, y al terminar vuelve a esperar.
const { crear } = require('../mensaje.js');
const { leerImporte } = require('../moneda.js');
const { Conector } = require('./base.js');
const { EmotesCanal } = require('../emotes.js');

const WEB = 'https://www.youtube.com';
const CABECERAS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  // Evita la página de consentimiento de cookies de la UE.
  Cookie: 'SOCS=CAI',
};
const REVISAR_DIRECTO = 60_000;
const COLOR_ROL = { emisor: '#ffd600', mod: '#5e84f1', miembro: '#2ba640' };

// ---------- Qué ha escrito el usuario ----------

// Devuelve { video } o { url } de la página /live del canal.
function objetivo(entrada) {
  const t = String(entrada || '').trim();
  if (!t) return null;
  const video = t.match(/(?:v=|youtu\.be\/|\/live\/|\/shorts\/)([\w-]{11})/)?.[1] || (/^[\w-]{11}$/.test(t) && !t.startsWith('@') ? t : null);
  if (video) return { video };
  const id = t.match(/(UC[\w-]{22})/)?.[1];
  if (id) return { url: `${WEB}/channel/${id}/live` };
  const handle = t.match(/@([\w.\-·]{3,30})/)?.[1] || (/^[\w.\-]{3,30}$/.test(t) ? t : null);
  if (handle) return { url: `${WEB}/@${handle}/live` };
  return null;
}

// ---------- Traducción de las acciones del chat ----------

const texto = obj => (obj?.simpleText ?? (obj?.runs || []).map(r => r.text ?? r.emoji?.emojiId ?? '').join('')) || '';
const https = u => (u && u.startsWith('//') ? 'https:' + u : u) || null;
const ultima = lista => https((lista || []).at(-1)?.url);
const sinArroba = n => String(n || '').trim().replace(/^@/, '');

function partes(mensaje) {
  return (mensaje?.runs || []).map(r => {
    if (r.emoji?.isCustomEmoji) return { t: 'emote', v: r.emoji.shortcuts?.[0] || r.emoji.emojiId, img: ultima(r.emoji.image?.thumbnails) };
    return { t: 'texto', v: r.text ?? r.emoji?.emojiId ?? '' };
  }).filter(p => p.v);
}

function autor(r) {
  const roles = { emisor: false, mod: false, vip: false, sub: false, miembro: false, verificado: false };
  const insignias = [];
  let meses = 0;
  for (const b of r.authorBadges || []) {
    const ins = b.liveChatAuthorBadgeRenderer || {};
    const icono = ins.icon?.iconType;
    if (icono === 'OWNER') roles.emisor = true;
    else if (icono === 'MODERATOR') roles.mod = true;
    else if (icono === 'VERIFIED' || icono === 'VERIFIED_ARTIST') roles.verificado = true;
    else if (ins.customThumbnail) {
      roles.miembro = true;
      const img = ultima(ins.customThumbnail.thumbnails);
      if (img) insignias.push({ img, tipo: 'miembro', titulo: ins.tooltip || 'Miembro' });
      meses = Number(ins.tooltip?.match(/(\d+)\s*(month|year)/i)?.[1] || 0) * (/year/i.test(ins.tooltip || '') ? 12 : 1);
    }
  }
  const color = roles.emisor ? COLOR_ROL.emisor : roles.mod ? COLOR_ROL.mod : roles.miembro ? COLOR_ROL.miembro : null;
  return { id: r.authorExternalChannelId || '', nombre: sinArroba(texto(r.authorName)), avatar: ultima(r.authorPhoto?.thumbnails), roles, color, meses, insignias };
}

function interpretar(accion, canal = '') {
  const item = accion.addChatItemAction?.item || accion.replaceChatItemAction?.replacementItem;
  if (item) {
    const [tipo, r] = Object.entries(item)[0] || [];
    const base = { id: `youtube:${r?.id}`, plataforma: 'youtube', canal, fecha: r?.timestampUsec ? Math.floor(Number(r.timestampUsec) / 1000) : Date.now() };
    switch (tipo) {
      case 'liveChatTextMessageRenderer':
        return { mensaje: crear({ ...base, tipo: 'mensaje', autor: autor(r), partes: partes(r.message) }) };
      case 'liveChatPaidMessageRenderer': {
        const importe = leerImporte(texto(r.purchaseAmountText));
        return { mensaje: crear({ ...base, tipo: 'donacion', autor: autor(r), partes: partes(r.message), titulo: `Super Chat ${importe?.texto || ''}`.trim(), importe }) };
      }
      case 'liveChatPaidStickerRenderer': {
        const importe = leerImporte(texto(r.purchaseAmountText));
        return { mensaje: crear({ ...base, tipo: 'donacion', autor: autor(r), partes: [], titulo: `Super Sticker ${importe?.texto || ''}`.trim(), importe, imagen: ultima(r.sticker?.thumbnails) }) };
      }
      case 'liveChatMembershipItemRenderer': {
        // Hito ("Member for 6 months") en headerPrimaryText; alta nueva ("Welcome to ...") solo en headerSubtext.
        const hito = texto(r.headerPrimaryText);
        const n = Number(hito.match(/(\d+)/)?.[1] || 0);
        const meses = /year/i.test(hito) ? n * 12 : n;
        const nombre = sinArroba(texto(r.authorName));
        const titulo = meses ? `${nombre} es miembro desde hace ${meses} ${meses === 1 ? 'mes' : 'meses'}` : `${nombre} se ha hecho miembro`;
        return { mensaje: crear({ ...base, tipo: 'suscripcion', autor: autor(r), partes: partes(r.message), titulo, cantidad: meses || 1 }) };
      }
      case 'liveChatSponsorshipsGiftPurchaseAnnouncementRenderer': {
        const h = r.header?.liveChatSponsorshipsHeaderRenderer || {};
        const cantidad = Number(texto(h.primaryText).match(/(\d+)/)?.[1] || 1);
        const a = autor({ ...h, authorExternalChannelId: r.authorExternalChannelId });
        return { mensaje: crear({ ...base, tipo: 'regalo_subs', autor: a, titulo: `${a.nombre} regala ${cantidad} ${cantidad === 1 ? 'membresía' : 'membresías'}`, cantidad }) };
      }
      case 'giftMessageViewModel': {
        // Regalos de YouTube (Jewels). YouTube no dice cuánto vale cada regalo.
        const nombre = sinArroba(r.authorName?.content);
        const regalo = (r.text?.content || '').replace(/^sent\s+/i, '').trim();
        return { mensaje: crear({ ...base, tipo: 'donacion', autor: { nombre, avatar: ultima(r.authorAvatar?.avatarViewModel?.image?.sources) }, titulo: `Regalo: ${regalo}`, imagen: ultima(r.giftImage?.sources) }) };
      }
      default:
        // Avisos del sistema, marcadores de posición, regalos recibidos de membresías...
        return null;
    }
  }
  const borrado = accion.removeChatItemAction || accion.markChatItemAsDeletedAction;
  if (borrado?.targetItemId) return { borrar: { ids: [`youtube:${borrado.targetItemId}`] } };
  const porAutor = accion.removeChatItemByAuthorAction || accion.markChatItemsByAuthorAsDeletedAction;
  if (porAutor?.externalChannelId) return { borrar: { plataforma: 'youtube', autorId: porAutor.externalChannelId } };
  return null;
}

// ---------- Páginas de YouTube ----------

function datosIniciales(html) {
  const m = html.match(/(?:window\["ytInitialData"\]|var ytInitialData)\s*=\s*(\{.+?\});\s*<\/script>/s);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// Del chat emergente: versión del cliente y la continuación del "Chat en vivo" (todos los mensajes),
// no la de "Top chat", que oculta parte de los mensajes.
function leerChat(html) {
  const datos = datosIniciales(html);
  const chat = datos?.contents?.liveChatRenderer;
  if (!chat) return null;
  const menu = chat.header?.liveChatHeaderRenderer?.viewSelector?.sortFilterSubMenuRenderer?.subMenuItems || [];
  const todos = menu.length > 1 ? menu[menu.length - 1].continuation?.reloadContinuationData?.continuation : null;
  const primera = chat.continuations?.[0] && Object.values(chat.continuations[0])[0]?.continuation;
  const version = html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/)?.[1] || '2.20261106.00.00';
  return { continuacion: todos || primera, version };
}

// ---------- Conexión ----------

class YouTube extends Conector {
  constructor(bus, opciones) {
    super(bus, 'youtube', opciones);
    this.generacion = 0;
    this.temporizador = null;
    this.abortar = null;
    this.emotes = new EmotesCanal('youtube');
  }

  async pedir(url, opciones = {}) {
    this.abortar = new AbortController();
    const tiempo = setTimeout(() => this.abortar.abort(), 15_000);
    try {
      return await fetch(url, { ...opciones, headers: { ...CABECERAS, ...(opciones.headers || {}) }, signal: this.abortar.signal });
    } finally { clearTimeout(tiempo); }
  }

  conectar() {
    const gen = ++this.generacion;
    this.empezar(gen).catch(e => { if (gen === this.generacion) this.caida(e.name === 'AbortError' ? 'YouTube no responde' : `Error de red (${e.message})`); });
  }

  async empezar(gen) {
    const obj = objetivo(this.opciones.canal);
    if (!obj) return this.fallo('Escribe tu canal (@nombre), su URL o el enlace del directo');
    // Al volver a mirar si hay directo, el dock sigue mostrando "Esperando directo".
    if (this.estado.estado !== 'esperando') this.cambiar('conectando');

    let video = obj.video;
    let titulo = '';
    let idCanal = obj.url?.match(/\/channel\/(UC[\w-]{22})/)?.[1] || null;
    if (!video) {
      const r = await this.pedir(obj.url);
      if (gen !== this.generacion) return;
      if (r.status === 404) return this.fallo('No existe ese canal');
      const html = await r.text();
      if (gen !== this.generacion) return;
      video = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/)?.[1];
      idCanal = html.match(/"externalId":"(UC[\w-]{22})"/)?.[1] || html.match(/"channelId":"(UC[\w-]{22})"/)?.[1] || null;
      titulo = (html.match(/<meta name="title" content="([^"]*)"/)?.[1] || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      if (!video) return this.esperar(gen);
    }

    const r = await this.pedir(`${WEB}/live_chat?is_popout=1&v=${video}`);
    if (gen !== this.generacion) return;
    const htmlChat = await r.text();
    const chat = leerChat(htmlChat);
    if (gen !== this.generacion) return;
    idCanal = idCanal || htmlChat.match(/"channelId":"(UC[\w-]{22})"/)?.[1] || null;
    // Emotes de BTTV y 7TV (globales y, si los tiene, los del canal en BTTV).
    this.emotes.preparar(idCanal || 'global').catch(() => {});
    if (!chat?.continuacion) {
      if (obj.video) return this.fallo('Ese vídeo no tiene chat en directo (o ya terminó)');
      return this.esperar(gen);
    }
    this.video = video;
    this.version = chat.version;
    this.desde = Date.now() - 10_000;
    this.cambiar('conectado', titulo || video);
    this.sondear(gen, chat.continuacion, true);
  }

  // Sin directo ahora: se vuelve a mirar cada minuto.
  esperar(gen) {
    this.cambiar('esperando', 'Sin directo ahora. Se conectará solo al empezar');
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => { if (gen === this.generacion && this.activo) this.conectar(); }, REVISAR_DIRECTO);
  }

  async sondear(gen, continuacion, primera = false) {
    let siguiente;
    let espera = 2000;
    try {
      const r = await this.pedir(`${WEB}/youtubei/v1/live_chat/get_live_chat?prettyPrint=false`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: this.version, hl: 'en', gl: 'US' } }, continuation: continuacion }),
      });
      if (gen !== this.generacion) return;
      if (!r.ok && r.status >= 500) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (gen !== this.generacion) return;
      const lcc = j.continuationContents?.liveChatContinuation;
      const cont = lcc?.continuations?.[0] && Object.values(lcc.continuations[0])[0];
      if (!cont?.continuation) {
        // El directo terminó.
        if (objetivo(this.opciones.canal)?.video) return this.fallo('El directo ha terminado');
        return this.esperar(gen);
      }
      this.vivo();
      for (const a of lcc.actions || []) {
        const res = interpretar(a, this.video);
        // En la primera respuesta YouTube manda mensajes antiguos: solo se aceptan los recientes,
        // para no llenar el overlay ni disparar alertas viejas al conectar.
        if (res?.mensaje && !(primera && res.mensaje.fecha < this.desde)) {
          res.mensaje.partes = this.emotes.aplicar(res.mensaje.partes);
          this.bus.mensaje(res.mensaje);
        }
        else if (res?.borrar) this.bus.borrar(res.borrar);
      }
      siguiente = cont.continuation;
      // YouTube sugiere cuánto esperar; se acota para que el chat no se retrase demasiado.
      espera = Math.min(Math.max(Number(cont.timeoutMs) || 2000, 1000), 4000);
    } catch (e) {
      if (gen !== this.generacion) return;
      return this.caida(e.name === 'AbortError' ? 'YouTube no responde' : `Error de red (${e.message})`);
    }
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => { if (gen === this.generacion) this.sondear(gen, siguiente); }, espera);
  }

  cerrar() {
    this.generacion++;
    clearTimeout(this.temporizador);
    try { this.abortar?.abort(); } catch { /* nada que cancelar */ }
  }
}

module.exports = { YouTube, interpretar, objetivo, leerChat };
