// TikTok no tiene API para leer el chat de un directo. MTv MultiChat abre el directo en una ventana oculta
// de la app de escritorio (tiktok-ventana.js) y decodifica los mensajes que recibe la propia página.
// Este archivo decodifica esos mensajes (protobuf, a veces comprimidos con gzip) y los traduce al
// formato común. No depende de Electron, así que se puede probar con Node.
//
// Números de campo según el esquema publicado por el proyecto TikTok-Live-Connector (src/proto/tiktokSchema.proto).
const zlib = require('zlib');
const { crear } = require('../mensaje.js');

// ---------- Lector mínimo de protobuf ----------

// Devuelve Map<número de campo, valores[]>. Los valores son BigInt (varint), Buffer (bytes / submensajes) o
// Buffer de 4/8 bytes (fixed). Un mensaje mal formado lanza error.
function leer(buf) {
  const campos = new Map();
  let i = 0;
  const varint = () => {
    let r = 0n;
    let desplaza = 0n;
    for (;;) {
      if (i >= buf.length) throw new Error('protobuf truncado');
      const b = buf[i++];
      r |= BigInt(b & 0x7f) << desplaza;
      if (!(b & 0x80)) return r;
      desplaza += 7n;
      if (desplaza > 70n) throw new Error('varint demasiado largo');
    }
  };
  while (i < buf.length) {
    const clave = Number(varint());
    const campo = clave >>> 3;
    const tipo = clave & 7;
    let valor;
    if (tipo === 0) valor = varint();
    else if (tipo === 2) {
      const largo = Number(varint());
      if (i + largo > buf.length) throw new Error('protobuf truncado');
      valor = buf.subarray(i, i + largo);
      i += largo;
    } else if (tipo === 1) { valor = buf.subarray(i, i + 8); i += 8; }
    else if (tipo === 5) { valor = buf.subarray(i, i + 4); i += 4; }
    else throw new Error(`tipo de campo protobuf no admitido: ${tipo}`);
    if (!campos.has(campo)) campos.set(campo, []);
    campos.get(campo).push(valor);
  }
  return campos;
}

const uno = (m, n) => m?.get(n)?.[0];
const todos = (m, n) => m?.get(n) || [];
const texto = (m, n) => { const v = uno(m, n); return Buffer.isBuffer(v) ? v.toString('utf8') : ''; };
const numero = (m, n) => { const v = uno(m, n); return typeof v === 'bigint' ? Number(v) : 0; };
const grande = (m, n) => { const v = uno(m, n); return typeof v === 'bigint' ? v.toString() : ''; };
const sub = (m, n) => { const v = uno(m, n); try { return Buffer.isBuffer(v) ? leer(v) : null; } catch { return null; } };

const descomprimir = buf => (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf);

// ---------- Contenedores ----------

// Trama del WebSocket (WebcastWebsocketMessage): tipo = 7, datos = 8. Solo las de tipo "msg" llevan mensajes.
function mensajesDeTrama(buf) {
  const trama = leer(buf);
  if (texto(trama, 7) !== 'msg') return [];
  return mensajesDeRespuesta(descomprimir(uno(trama, 8) || Buffer.alloc(0)));
}

// WebcastResponse (también la respuesta HTTP de /webcast/im/fetch): mensajes = 1, cada uno { tipo = 1, datos = 2 }.
function mensajesDeRespuesta(buf) {
  const r = leer(buf);
  return todos(r, 1).map(b => { const m = leer(b); return { tipo: texto(m, 1), datos: uno(m, 2) || Buffer.alloc(0) }; });
}

// ---------- Tipos ----------

// WebcastMessageEvent (campo 1 de casi todos los mensajes): msgId = 2, createTime = 4, eventDetails = 8 { displayType = 1, label = 2 }
function evento(m) {
  const e = sub(m, 1);
  const detalles = sub(e, 8);
  return { id: grande(e, 2), fecha: numero(e, 4), tipoVisual: texto(detalles, 1), etiqueta: texto(detalles, 2) };
}

// User: userId = 1, nickname = 3, profilePicture = 9 { urls = 1 }, uniqueId = 38, badges = 64 { badgeSceneType = 3 }
function usuario(u) {
  if (!u) return { nombre: '' };
  const fotos = todos(sub(u, 9), 1).map(b => b.toString('utf8'));
  const grupos = todos(u, 64).map(b => { try { return leer(b); } catch { return null; } }).filter(Boolean);
  const escenas = grupos.map(g => numero(g, 3));
  const insignias = [];
  for (const g of grupos) {
    for (const ib of todos(g, 20)) {
      let url = '';
      try { url = texto(sub(leer(ib), 2), 1); } catch { /* insignia sin imagen */ }
      if (/^https:\/\//.test(url) && insignias.length < 4 && !insignias.some(x => x.img === url)) insignias.push({ img: url, tipo: null, titulo: '' });
    }
  }
  return {
    id: grande(u, 1),
    nombre: texto(u, 3) || texto(u, 38),
    usuario: texto(u, 38),
    avatar: fotos.find(f => /^https:\/\//.test(f)) || null,
    // Escena de insignia: 1 = moderador; 4 y 7 = suscriptor (criterio de TikTok-Live-Connector).
    roles: { emisor: false, mod: escenas.includes(1), vip: false, sub: escenas.includes(4) || escenas.includes(7), miembro: false },
    insignias,
  };
}

// Emotes de suscriptor dentro del comentario: emotes = 13 { placeInComment = 1, emote = 2 { emoteId = 1, image = 2 { imageUrl = 1 } } }
function partesChat(comentario, emotes) {
  const lista = emotes.map(b => {
    const e = leer(b);
    const det = sub(e, 2);
    return { pos: numero(e, 1), id: texto(det, 1), img: texto(sub(det, 2), 1) };
  }).filter(e => /^https:\/\//.test(e.img)).sort((a, b) => a.pos - b.pos);
  if (!lista.length) return comentario ? [{ t: 'texto', v: comentario }] : [];
  const chars = Array.from(comentario);
  const partes = [];
  let cursor = 0;
  for (const e of lista) {
    const pos = Math.min(e.pos, chars.length);
    if (pos > cursor) partes.push({ t: 'texto', v: chars.slice(cursor, pos).join('') });
    partes.push({ t: 'emote', v: `[${e.id || 'emote'}]`, img: e.img });
    cursor = pos;
  }
  if (cursor < chars.length) partes.push({ t: 'texto', v: chars.slice(cursor).join('') });
  return partes;
}

// Las monedas que el espectador gasta: unos 0,013 USD cada una (precio de compra aproximado).
const USD_POR_MONEDA = 0.013;
let contador = 0;

function interpretar(tipo, datos, canal = '') {
  let m;
  try { m = leer(datos); } catch { return null; }
  const ev = evento(m);
  const id = s => `tiktok:${ev.id || `${s}:${Date.now()}:${++contador}`}`;
  const base = { plataforma: 'tiktok', canal, fecha: ev.fecha || Date.now() };
  switch (tipo) {
    case 'WebcastChatMessage': {
      // user = 2, comment = 3, emotes = 13
      const comentario = texto(m, 3);
      return { mensaje: crear({ ...base, id: id('chat'), tipo: 'mensaje', autor: usuario(sub(m, 2)), partes: partesChat(comentario, todos(m, 13)), texto: comentario }) };
    }
    case 'WebcastEmoteChatMessage': {
      // user = 2, emote = 3 { emoteId = 1, image = 2 { imageUrl = 1 } }
      const det = sub(m, 3);
      const img = texto(sub(det, 2), 1);
      if (!/^https:\/\//.test(img)) return null;
      return { mensaje: crear({ ...base, id: id('emote'), tipo: 'mensaje', autor: usuario(sub(m, 2)), partes: [{ t: 'emote', v: `[${texto(det, 1) || 'emote'}]`, img }] }) };
    }
    case 'WebcastGiftMessage': {
      // giftId = 2, repeatCount = 5, user = 7, repeatEnd = 9, giftDetails = 15 { giftImage = 1 { url = 1 }, giftType = 11, diamondCount = 12, giftName = 16 }
      const det = sub(m, 15);
      const tipoRegalo = numero(det, 11);
      const repeticiones = Math.max(numero(m, 5), 1);
      // Los regalos en racha (tipo 1) se envían varias veces mientras dura la racha: solo cuenta el final.
      if (tipoRegalo === 1 && numero(m, 9) !== 1) return null;
      const nombreRegalo = texto(det, 16) || 'Regalo';
      const monedas = numero(det, 12) * repeticiones;
      const imagen = texto(sub(det, 1), 1);
      return { mensaje: crear({
        ...base, id: id('regalo'), tipo: 'donacion', autor: usuario(sub(m, 7)),
        titulo: repeticiones > 1 ? `${nombreRegalo} ×${repeticiones}` : nombreRegalo,
        importe: monedas ? { valor: monedas, moneda: 'MONEDAS', usd: Math.round(monedas * USD_POR_MONEDA * 100) / 100 } : null,
        cantidad: repeticiones, imagen: /^https:\/\//.test(imagen) ? imagen : null,
      }) };
    }
    case 'WebcastSocialMessage': {
      // user = 2. Follow y compartir llegan con el mismo tipo; se distinguen por el texto del evento.
      const a = usuario(sub(m, 2));
      if (/follow/i.test(ev.tipoVisual)) return { mensaje: crear({ ...base, id: id('follow'), tipo: 'follow', autor: a, titulo: `${a.nombre} te sigue` }) };
      return null;
    }
    case 'WebcastSubNotifyMessage': {
      // user = 2, subMonth = 4
      const a = usuario(sub(m, 2));
      const meses = Math.max(numero(m, 4), 1);
      return { mensaje: crear({ ...base, id: id('sub'), tipo: 'suscripcion', autor: a, cantidad: meses, titulo: meses > 1 ? `${a.nombre} renueva: ${meses} meses` : `${a.nombre} se ha suscrito` }) };
    }
    case 'WebcastRoomUserSeqMessage':
      // viewerCount = 3
      return { espectadores: numero(m, 3) };
    default:
      // Entradas a la sala, "me gusta", etc.: demasiados para el chat.
      return null;
  }
}

module.exports = { leer, mensajesDeTrama, mensajesDeRespuesta, interpretar, descomprimir };
