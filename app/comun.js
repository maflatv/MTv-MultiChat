// Código compartido por el dock y el overlay.
/* global window, document, EventSource, fetch */

// Idioma de la interfaz (lo decide el servidor) y traducción de textos sueltos.
let idioma = 'es';
let observador = null;
const t = texto => window.I18N.traducir(texto, idioma);
function aplicarIdioma(nuevo) {
  if (nuevo === idioma && (observador || nuevo === 'es')) return;
  idioma = nuevo;
  document.documentElement.lang = nuevo;
  window.MC.idioma = nuevo;
  observador?.disconnect();
  observador = window.I18N.observar(document.body, nuevo);
}

// Conexión en tiempo real con el servidor. EventSource se reconecta solo si el servidor se reinicia.
// lector: esta página puede leer en voz alta (el dock). El servidor elige una sola para que no se oiga dos veces.
function conectar(manejadores, { lector = false } = {}) {
  const es = new EventSource(lector ? '/api/eventos?lector=1' : '/api/eventos');
  es.onmessage = e => {
    const evento = JSON.parse(e.data);
    // El idioma va primero, para que todo lo que se dibuje después salga ya traducido.
    if (evento.ev === 'inicio' && evento.idioma) aplicarIdioma(evento.idioma);
    if (evento.ev === 'idioma') { window.location.reload(); return; }
    manejadores[evento.ev]?.(evento);
  };
  es.onerror = () => manejadores.caida?.();
  es.onopen = () => manejadores.abierta?.();
  return es;
}

async function orden(accion, cuerpo = {}) {
  const r = await fetch(`/api/${accion}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-MultiChat': '1' }, body: JSON.stringify(cuerpo) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
}

function el(etiqueta, clase, texto) {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
}

// Logotipos de las plataformas: Simple Icons (CC0, https://simpleicons.org). Copias en app/iconos/.
const PLATAFORMAS = {
  twitch: { nombre: 'Twitch', color: '#9146FF', logo: 'M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z' },
  youtube: { nombre: 'YouTube', color: '#FF0033', logo: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z' },
  tiktok: { nombre: 'TikTok', color: '#FE2C55', logo: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z' },
  kick: { nombre: 'Kick', color: '#53FC18', logo: 'M1.333 0h8v5.333H12V2.667h2.667V0h8v8H20v2.667h-2.667v2.666H20V16h2.667v8h-8v-2.667H12v-2.666H9.333V24h-8Z' },
  prueba: { nombre: 'Prueba', color: '#888888', logo: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z' },
};

const SVG = 'http://www.w3.org/2000/svg';
function svg(caja, ...trazos) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', caja);
  s.setAttribute('aria-hidden', 'true');
  for (const t of trazos) {
    const p = document.createElementNS(SVG, t.texto ? 'text' : 'path');
    if (t.texto) {
      Object.entries({ x: 12, y: 16.2, 'text-anchor': 'middle', 'font-size': t.tam || 10, 'font-weight': 900, 'font-family': 'system-ui, sans-serif' }).forEach(([k, v]) => p.setAttribute(k, v));
      p.textContent = t.texto;
    } else p.setAttribute('d', t.d);
    p.setAttribute('fill', t.color || 'currentColor');
    s.append(p);
  }
  return s;
}

// estilo: 'color' (logo con su color), 'insignia' (logo blanco sobre su color) o 'blanco'.
function iconoPlataforma(plataforma, estilo = 'color') {
  const p = PLATAFORMAS[plataforma] || PLATAFORMAS.prueba;
  const i = el('span', `plat plat-${estilo} plat-${plataforma}`);
  i.title = p.nombre;
  i.style.setProperty('--marca', p.color);
  i.append(svg('0 0 24 24', { d: p.logo }));
  return i;
}

// ---------- Insignias ----------
// Cuando la plataforma no da la imagen de la insignia, se dibuja una propia con el código de color de cada
// plataforma: espada de moderador en Twitch y Kick, llave azul en YouTube, diamante VIP rosa en Twitch, etc.
const GLIFOS = {
  camara: 'M3 7.5A1.5 1.5 0 0 1 4.5 6h9A1.5 1.5 0 0 1 15 7.5v2.2l4.4-2.6a.4.4 0 0 1 .6.35v9.1a.4.4 0 0 1-.6.35L15 14.3v2.2a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 16.5z',
  espada: 'M19.5 3.2 21 4.7l-9.6 9.6-1.5-1.5zM7.4 12.6l4 4-1.3 1.3-1.2-1.2-2.6 2.6a1 1 0 0 1-1.4-1.4l2.6-2.6-1.2-1.2z',
  llave: 'M20.6 7.3a5 5 0 0 1-6.5 5.4l-6.8 6.8a1.9 1.9 0 0 1-2.7-2.7l6.8-6.8a5 5 0 0 1 5.4-6.5l-2.9 2.9.4 2.5 2.5.4z',
  diamante: 'M7 4h10l4 5-9 11L3 9zm-1 5 6 7.3L18 9z',
  estrella: 'M12 2.8l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.7l-5.6 3.1 1.3-6.2L3 9.3l6.3-.7z',
  check: 'M9.2 15.6 5.4 11.8 4 13.2l5.2 5.2L20 7.6l-1.4-1.4z',
  escudo: 'M12 2.5 19.5 5v6c0 4.7-3.2 8.8-7.5 10.3C7.7 19.8 4.5 15.7 4.5 11V5z',
  corona: 'M3.5 8l4.5 3.8L12 5.5l4 6.3 4.5-3.8-1.8 10.5H5.3z',
  regalo: 'M4 9h16v3H4zm1 4h6v7H5zm8 0h6v7h-6zM11 9h2v11h-2zm1-1.2C10.2 5 7.2 4.3 7.2 6.3 7.2 7.6 9.4 8 12 8zm0 0c1.8-2.8 4.8-3.5 4.8-1.5 0 1.3-2.2 1.7-4.8 1.7z',
};
// [glifo o texto, fondo, color del glifo, título]
const INSIGNIAS = {
  twitch: { emisor: ['camara', '#E91916', '#fff', 'Streamer'], mod: ['espada', '#00AD03', '#fff', 'Moderador'], vip: ['diamante', '#E005B9', '#fff', 'VIP'], fundador: [{ texto: '1', tam: 13 }, '#FF6D9A', '#fff', 'Fundador'], sub: ['estrella', '#9146FF', '#fff', 'Suscriptor'], verificado: ['check', '#9146FF', '#fff', 'Verificado'] },
  youtube: { emisor: ['camara', '#FFD600', '#1b1b1b', 'Propietario'], mod: ['llave', '#5E84F1', '#fff', 'Moderador'], miembro: ['estrella', '#2BA640', '#fff', 'Miembro'], verificado: ['check', '#909090', '#fff', 'Verificado'] },
  kick: { emisor: ['camara', '#53FC18', '#0b0e0f', 'Streamer'], mod: ['espada', '#00C7FF', '#0b0e0f', 'Moderador'], vip: ['diamante', '#FFC300', '#0b0e0f', 'VIP'], og: [{ texto: 'OG', tam: 9.5 }, '#00E1B0', '#0b0e0f', 'OG'], fundador: ['corona', '#FF8A00', '#0b0e0f', 'Fundador'], sub: ['estrella', '#53FC18', '#0b0e0f', 'Suscriptor'], verificado: ['check', '#1475E1', '#fff', 'Verificado'], regalador: ['regalo', '#B964FF', '#fff', 'Regala subs'] },
  tiktok: { emisor: ['camara', '#FE2C55', '#fff', 'Anfitrión'], mod: ['escudo', '#FE2C55', '#fff', 'Moderador'], sub: ['estrella', '#25F4EE', '#0b0e0f', 'Suscriptor'] },
};
// Orden en que se muestran (como las plataformas: primero el rango, luego la suscripción).
const ORDEN_ROLES = ['emisor', 'mod', 'vip', 'og', 'fundador', 'sub', 'miembro', 'regalador', 'verificado'];

function insigniaPropia(plataforma, rol) {
  // Cada plataforma solo muestra sus propias insignias (YouTube no tiene VIP, TikTok no tiene OG...).
  const def = INSIGNIAS[plataforma]?.[rol] || (plataforma === 'prueba' ? INSIGNIAS.twitch[rol] : null);
  if (!def) return null;
  const [glifo, fondo, tinta, titulo] = def;
  const s = svg('0 0 24 24', { d: 'M5 1h14a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H5a4 4 0 0 1-4-4V5a4 4 0 0 1 4-4z', color: fondo }, typeof glifo === 'string' ? { d: GLIFOS[glifo], color: tinta } : { ...glifo, color: tinta });
  s.setAttribute('class', `insignia insignia-${rol}`);
  const t = document.createElementNS(SVG, 'title');
  t.textContent = titulo;
  s.prepend(t);
  return s;
}

// Imágenes que da la plataforma (Twitch con sesión, miembro de YouTube, TikTok) y, para los roles que no
// tengan imagen, las insignias propias.
function insignias(m) {
  const lista = [];
  const cubiertos = new Set();
  for (const b of m.autor.insignias || []) {
    if (!/^https:\/\//.test(b.img || '')) continue;
    const img = el('img', 'insignia');
    img.src = b.img;
    img.alt = b.titulo || '';
    img.title = b.titulo || '';
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => img.remove();
    lista.push(img);
    if (b.tipo) cubiertos.add(b.tipo);
  }
  const r = m.autor.roles || {};
  for (const rol of ORDEN_ROLES) {
    if (!r[rol] || cubiertos.has(rol)) continue;
    // El fundador ya es suscriptor: no se repite la estrella.
    if (rol === 'sub' && (r.fundador || cubiertos.has('fundador'))) continue;
    const s = insigniaPropia(m.plataforma, rol);
    if (s) lista.push(s);
  }
  return lista;
}

// Coloca una caja (el chat) dentro de la página: ancho y alto en px (0 = todo), anclaje "vertical-horizontal" y margen.
function colocar(caja, { ancho = 0, alto = 0, anclaje = 'abajo-izquierda', margen = 0 } = {}) {
  const [v, h] = String(anclaje).split('-');
  const m = `${Math.max(Number(margen) || 0, 0)}px`;
  const s = caja.style;
  for (const p of ['top', 'bottom', 'left', 'right', 'width', 'height', 'transform', 'inset']) s[p] = '';
  const transform = [];
  if (ancho > 0) {
    s.width = `${ancho}px`;
    s.maxWidth = '100%';
    if (h === 'derecha') s.right = m; else if (h === 'centro') { s.left = '50%'; transform.push('translateX(-50%)'); } else s.left = m;
  } else { s.left = '0'; s.right = '0'; }
  if (alto > 0) {
    s.height = `${alto}px`;
    s.maxHeight = '100%';
    if (v === 'arriba') s.top = m; else if (v === 'centro') { s.top = '50%'; transform.push('translateY(-50%)'); } else s.bottom = m;
  } else { s.top = '0'; s.bottom = '0'; }
  s.transform = transform.join(' ');
}

// Fuentes de Google: se cargan solo si se eligen (OBS tiene conexión a Internet).
const FUENTES_GOOGLE = ['Poppins', 'Montserrat', 'Nunito', 'Roboto', 'Rubik', 'Comfortaa', 'Bangers', 'Press Start 2P', 'Pixelify Sans'];
function cargarFuente(nombre) {
  if (!FUENTES_GOOGLE.includes(nombre) || document.querySelector(`link[data-fuente="${nombre}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.dataset.fuente = nombre;
  l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(nombre).replace(/%20/g, '+')}:wght@400;500;700;800&display=swap`;
  document.head.append(l);
}

// "#rrggbb" → "r, g, b" para usarlo con transparencia en rgba().
const rgb = hex => (/^#[0-9a-f]{6}$/i.test(hex || '') ? [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ') : null);

// Longitud de un mensaje para los límites del overlay: cada emote cuenta como un carácter.
const largoMensaje = m => (m.partes || []).reduce((n, p) => n + (p.t === 'emote' ? 1 : Array.from(p.v || '').length), 0);

// Temas de color para los nombres. Todos se leen sobre fondo oscuro; sobre fondo claro se oscurecen solos.
// 17 temas de 15–16 colores, elegidos para que los de un mismo tema se distingan bien entre sí (generados y
// validados con un script: ningún par demasiado parecido, todos legibles sobre fondo oscuro). "Twitch clásico" son
// los colores por defecto del chat de Twitch; los oscuros se aclaran solos para leerse.
const TEMAS_NOMBRES = {
  vivos: { nombre: 'Vivos', colores: ['#FF6B6B', '#FF8787', '#FF8E53', '#FFA94D', '#FFD43B', '#C0EB75', '#69DB7C', '#38D9A9', '#3BC9DB', '#74C0FC', '#4DABF7', '#748FFC', '#9775FA', '#B197FC', '#DA77F2', '#F783AC'] },
  pastel: { nombre: 'Pastel', colores: ['#FF9999', '#FFC7C7', '#FFD699', '#FFFFB3', '#DBFF99', '#C6F4BE', '#99FF99', '#99FFC7', '#CFF7E7', '#A8F0F0', '#99C7FF', '#9999FF', '#C6BEF4', '#DB99FF', '#FFB3FF', '#FF99D6'] },
  neon: { nombre: 'Neón', colores: ['#FF3131', '#FF5F1F', '#FFAA00', '#FFF01F', '#CCFF00', '#39FF14', '#00FF9F', '#00FFC6', '#7DF9FF', '#00F0FF', '#4D7CFF', '#C04BFF', '#FF00FF', '#FF8AF1', '#FF2BD6', '#FF6EC7'] },
  calidos: { nombre: 'Cálidos', colores: ['#F9401F', '#FB806A', '#E26136', '#DDB388', '#F9A21F', '#FBC86A', '#CB9F4D', '#FCE292', '#EFEBC8', '#FAE842', '#FB6AB3', '#E6A8C7', '#FA4295', '#CB4D80', '#DD889D', '#FA425E'] },
  frios: { nombre: 'Fríos', colores: ['#4DCBA1', '#1FF9B1', '#92FCD9', '#42FAEB', '#69CCD3', '#1FCAF9', '#B9D7FD', '#6992D3', '#427FFA', '#92B0FC', '#8355E7', '#A388DD', '#C36AFB', '#C336E2', '#E8C8EF', '#E992FC'] },
  retro: { nombre: 'Retro', colores: ['#F95738', '#E27D60', '#E8A87C', '#EE964B', '#F4D35E', '#EDE7B1', '#D3F8E2', '#85DCB0', '#41B3A3', '#7FB7BE', '#A9DEF9', '#8EC5FC', '#E4C1F9', '#D8BFD8', '#F694C1', '#C38D9E'] },
  arcoiris: { nombre: 'Arcoíris', colores: ['#FB5656', '#FB9456', '#FBD156', '#E6FB56', '#A8FB56', '#6BFB56', '#56FB7F', '#56FBBD', '#56FBFB', '#56BDFB', '#567FFB', '#6B56FB', '#A856FB', '#E656FB', '#FB56D1', '#FB5694'] },
  oceano: { nombre: 'Océano', colores: ['#4DCBA1', '#9DF1D5', '#6AFBCB', '#1FF9B1', '#1FF9E7', '#6AF9FB', '#B9FCFD', '#42E5FA', '#1FBFF9', '#4DA3CB', '#88C2DD', '#1F89F9', '#6A93FB', '#7069D3', '#9992FC', '#BEB9FD'] },
  bosque: { nombre: 'Bosque', colores: ['#C0987C', '#D78042', '#DBC8B3', '#E4BE81', '#F2F3C4', '#C5D742', '#C5E481', '#8FB464', '#8AD742', '#56D742', '#84E481', '#A2EBA4', '#64B475', '#42D787', '#C4F3DA', '#7CC09C'] },
  atardecer: { nombre: 'Atardecer', colores: ['#FC9292', '#CB534D', '#FDC0B9', '#F9401F', '#FA8C42', '#E2B736', '#D3C369', '#F9E31F', '#FCF292', '#F91FC3', '#FB6AD7', '#FDB9EC', '#D369B3', '#E23695', '#D3697E', '#FA425E'] },
  vaporwave: { nombre: 'Vaporwave', colores: ['#FF8C42', '#FFFB96', '#05FFA1', '#A6FFF2', '#75F0FF', '#01CDFE', '#94D0FF', '#8795E8', '#AD8CFF', '#B967FF', '#E0AAFF', '#C774E8', '#FDCFFF', '#FF9CEE', '#FFB8E9', '#FF71CE'] },
  cyberpunk: { nombre: 'Cyberpunk', colores: ['#F78C6C', '#FF6B35', '#FFB300', '#FCEE0A', '#F9F871', '#C3E88D', '#7CFFCB', '#00FFC6', '#00F0FF', '#05D9E8', '#D1F7FF', '#82AAFF', '#B967FF', '#FF71B5', '#FF2A6D', '#FF5370'] },
  sakura: { nombre: 'Sakura', colores: ['#FA4242', '#FB6A6A', '#DD8888', '#9E69D3', '#C79DF1', '#BA42FA', '#E56AFB', '#F91FF9', '#D369C9', '#E236C0', '#EFC8E5', '#FC92DC', '#FA428C', '#FB6AA4', '#CB4D79', '#E6A8AB'] },
  otono: { nombre: 'Otoño', colores: ['#EE452B', '#D76442', '#F49671', '#F7B797', '#EE892B', '#C08B59', '#DDBB5F', '#F4D771', '#EECD2B', '#F7E797', '#EBE6CB', '#D5909C', '#F47187', '#C0596A', '#F04C5F', '#FABDC4'] },
  galaxia: { nombre: 'Galaxia', colores: ['#B9F2FD', '#1FD5F9', '#79C2EC', '#1F89F9', '#4D8ACB', '#6A84FB', '#7B69D3', '#BCA8E6', '#9F6AFB', '#E86AFB', '#F8B9FD', '#F21FF9', '#C74DCB', '#FA42C0', '#E23692', '#FC92CA'] },
  caramelo: { nombre: 'Caramelo', colores: ['#FFB5A7', '#FF9671', '#FFC75F', '#FEE440', '#FCF6BD', '#F9F871', '#9EF01A', '#D0F4DE', '#00F5D4', '#00BBF9', '#A9DEF9', '#B388EB', '#E4C1F9', '#F15BB5', '#FF99C8', '#FF6F91'] },
  twitch: { nombre: 'Twitch clásico', colores: ['#FF0000', '#B22222', '#FF7F50', '#FF4500', '#D2691E', '#DAA520', '#9ACD32', '#008000', '#2E8B57', '#00FF7F', '#5F9EA0', '#1E90FF', '#0000FF', '#8A2BE2', '#FF69B4'] },
};

// Color estable: la misma persona (plataforma + ID, o nombre si no hay ID) recibe siempre el mismo color del tema,
// en el dock y en el overlay, entre mensajes y entre sesiones. No se guarda nada: se calcula (hash FNV-1a).
function colorDeTema(m, tema = 'vivos') {
  const colores = (TEMAS_NOMBRES[tema] || TEMAS_NOMBRES.vivos).colores;
  const clave = `${m.plataforma}:${m.autor?.id || String(m.autor?.nombre || '').toLowerCase()}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < clave.length; i++) { h ^= clave.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return colores[h % colores.length];
}

// Colores de nombre ilegibles sobre fondo oscuro (azul marino, negro...) se aclaran.
// Sobre fondo claro es al revés: los colores demasiado claros se oscurecen.
const luminancia = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
function colorLegible(hex, fondoClaro = false) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return null;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const objetivo = fondoClaro ? 0.45 : 0.5;
  const ok = l => (fondoClaro ? l <= objetivo : l >= objetivo);
  if (ok(luminancia(hex))) return hex;
  // Se mezcla con blanco (o con negro sobre fondo claro) lo justo para que se lea, conservando el tono.
  const hacia = fondoClaro ? 0 : 255;
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = '#' + [r, g, b].map(v => Math.round(v + (hacia - v) * t).toString(16).padStart(2, '0')).join('');
    if (ok(luminancia(c))) return c;
  }
  return fondoClaro ? '#000000' : '#ffffff';
}

const ETIQUETA_TIPO = { donacion: 'Donación', suscripcion: 'Suscripción', regalo_subs: 'Subs regalados', raid: 'Raid', follow: 'Follow', aviso: 'Aviso' };

// Dibuja un mensaje. Todo el contenido de la plataforma se pone como texto: nunca como HTML.
function dibujarMensaje(m, op = {}) {
  const caja = el('div', `msg tipo-${m.tipo}`);
  caja.dataset.id = m.id;
  caja.dataset.plataforma = m.plataforma;

  if (m.tipo !== 'mensaje') {
    const cab = el('div', 'evento');
    cab.append(el('span', 'evento-tipo', ETIQUETA_TIPO[m.tipo] || m.tipo));
    if (m.titulo) cab.append(el('span', 'evento-titulo', m.titulo));
    caja.append(cab);
  }

  const linea = el('div', 'linea');
  if (op.plataforma !== false) linea.append(iconoPlataforma(m.plataforma, op.iconoEstilo || 'color'));
  if (op.avatar !== false && m.autor.avatar) {
    const img = el('img', 'avatar');
    img.src = m.autor.avatar;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => img.remove();
    linea.append(img);
  }
  if (op.roles !== false) linea.append(...insignias(m));
  if (m.autor.nombre) {
    const nombre = el('span', 'nombre', m.autor.nombre);
    // Color del nombre: el del usuario (aclarado si no se lee), el de la plataforma o uno fijo.
    // 'usuario': el suyo y, si no tiene (YouTube, TikTok...), el de su tema. 'tema': siempre el del tema.
    const c = op.colorNombre === 'fijo' ? op.nombreFijo
      : op.colorNombre === 'plataforma' ? (m.plataforma === 'tiktok' ? '#25F4EE' : PLATAFORMAS[m.plataforma]?.color)
        : colorLegible(op.colorNombre === 'tema' ? colorDeTema(m, op.temaNombres) : (m.autor.color || colorDeTema(m, op.temaNombres)), op.fondoClaro);
    if (c) nombre.style.color = c;
    linea.append(nombre);
  }
  if (m.partes.length) {
    const texto = el('span', 'texto');
    for (const p of m.partes) {
      if (p.t === 'emote' && /^https:\/\//.test(p.img || '')) {
        const img = el('img', 'emote');
        img.src = p.img;
        img.alt = p.v;
        img.title = p.v;
        // Emote superpuesto (7TV): va encima del anterior, en la misma pila.
        const ultimo = texto.hijosEmote?.at(-1);
        if (p.encima && ultimo) {
          if (!ultimo.pila) {
            const pila = el('span', 'apilado');
            ultimo.replaceWith?.(pila);
            pila.append(ultimo);
            ultimo.pila = pila;
          }
          img.className = 'emote encima';
          ultimo.pila.append(img);
          continue;
        }
        texto.hijosEmote = [...(texto.hijosEmote || []), img];
        texto.append(img);
      } else texto.append(document.createTextNode(p.v));
    }
    linea.append(texto);
  }
  caja.append(linea);
  // Super Stickers y regalos.
  if (/^https:\/\//.test(m.imagen || '')) {
    const img = el('img', 'sticker');
    img.src = m.imagen;
    img.alt = m.titulo || '';
    img.onerror = () => img.remove();
    caja.append(img);
  }
  return caja;
}

window.MC = { colocar, idioma: 'es', t, aplicarIdioma, TEMAS_NOMBRES, colorDeTema, largoMensaje, luminancia, PLATAFORMAS, FUENTES_GOOGLE, conectar, orden, el, iconoPlataforma, insigniaPropia, dibujarMensaje, cargarFuente, rgb, ETIQUETA_TIPO };
