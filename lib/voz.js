// Lectura en voz alta (TTS): decide qué mensajes se leen y prepara la frase. La voz la pone el dock, con las voces
// de Windows (speechSynthesis), y sale por los altavoces del PC; OBS la recoge con el audio del escritorio.
// Aquí solo se filtra y se limpia el texto, sin depender del navegador, para poder probarlo.
const I18N = require('../app/i18n.js');

const EVENTOS = ['donacion', 'suscripcion', 'regalo_subs', 'raid', 'follow', 'aviso'];

// Lista "a, b, c" → Set en minúsculas.
const lista = texto => new Set(String(texto || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));

// Quien cuenta como suscriptor o moderador para el filtro "quién se lee".
function pasaRol(roles = {}, quienes) {
  if (quienes === 'mods') return !!(roles.mod || roles.emisor);
  if (quienes === 'subs') return !!(roles.sub || roles.miembro || roles.fundador || roles.vip || roles.mod || roles.emisor);
  return true;
}

// Texto del mensaje preparado para leer: sin emotes, sin enlaces (o "enlace"), sin letras repetidas sin fin
// ("jajajajajaja" → "jajaja") y cortado en una palabra si es muy largo.
function limpiar(m, voz, idioma) {
  const partes = Array.isArray(m.partes) && m.partes.length ? m.partes.filter(p => p.t === 'texto').map(p => p.v).join(' ') : (m.texto || '');
  let t = partes.replace(/https?:\/\/\S+|www\.\S+/gi, voz.enlaces === 'quitar' ? ' ' : ` ${idioma === 'en' ? 'link' : 'enlace'} `);
  t = t.replace(/(\S)\1{3,}/gu, '$1$1$1');          // aaaaaa → aaa
  t = t.replace(/(\S{2,4})\1{3,}/gu, '$1$1$1');        // jajajajaja → jajaja
  t = t.replace(/\s+/g, ' ').trim();
  const max = Number(voz.maxLetras) || 0;
  if (max && t.length > max) {
    const corte = t.slice(0, max);
    const espacio = corte.lastIndexOf(' ');
    t = (espacio > max * 0.6 ? corte.slice(0, espacio) : corte).trim();
  }
  return t;
}

// Nombre legible: sin guiones bajos ni la decoración típica (xX_nombre_Xx).
const nombreLegible = n => String(n || '').replace(/^x+X*_+|_+X*x+$/g, '').replace(/[_]+/g, ' ').trim();

// Mensaje del formato común + ajustes → frase a leer, o null si no se lee.
// overlay: para compartir la lista de bots con el overlay de chat.
function fraseParaLeer(m, voz, { idioma = 'es', overlay = {} } = {}) {
  if (!voz?.activa || !m) return null;
  const en = idioma === 'en';
  const autor = m.autor || {};
  const nombreMin = String(autor.nombre || '').toLowerCase();
  if (lista(voz.ignorar).has(nombreMin) || lista(overlay.bots).has(nombreMin)) return null;
  const nombre = nombreLegible(autor.nombre);

  if (m.tipo === 'mensaje') {
    if (!voz.mensajes || autor.roles?.emisor) return null;
    if (!pasaRol(autor.roles, voz.quienes)) return null;
    if (voz.saltarComandos && /^\s*!/.test(m.texto || '')) return null;
    const texto = limpiar(m, voz, idioma);
    // Solo emotes o solo símbolos: nada que leer.
    if (!/[\p{L}\p{N}]/u.test(texto)) return null;
    if (!voz.leerNombre || !nombre) return texto;
    return en ? `${nombre} says: ${texto}` : `${nombre} dice: ${texto}`;
  }

  if (!EVENTOS.includes(m.tipo) || !voz.eventos?.[m.tipo]) return null;
  if (m.tipo === 'donacion' && Number(voz.minimoUsd) > 0 && !(Number(m.importe?.usd) >= Number(voz.minimoUsd))) return null;
  const titulo = I18N.traducir(m.titulo || '', idioma).replace(/\s*·\s*/g, ', ');
  const texto = voz.leerMensajeEventos ? limpiar(m, voz, idioma) : '';
  let frase = m.tipo === 'donacion' && nombre ? (en ? `${nombre} donated ${titulo}` : `${nombre} dona ${titulo}`) : titulo;
  if (texto && /[\p{L}\p{N}]/u.test(texto)) frase += `. ${texto}`;
  return frase.trim() || null;
}

module.exports = { fraseParaLeer, limpiar, nombreLegible, EVENTOS };
