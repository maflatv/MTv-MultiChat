// Emotes de 7TV, BTTV y FFZ (globales y del canal). Sus APIs son públicas y no necesitan clave.
// Qué hay en cada plataforma (comprobado el 11/11/2026):
//   Twitch:  7TV, BTTV y FFZ (globales y del canal)
//   YouTube: BTTV (globales y del canal) y 7TV (globales; su API ya no admite canales de YouTube)
//   Kick:    7TV (globales y del canal)
//   TikTok:  ninguno de los tres tiene emotes para TikTok
// Se cargan al conocer el ID del canal, se renuevan cada 15 minutos y se aplican a las partes de texto.
const RENOVAR = 15 * 60_000;

async function json(url) {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), 10_000);
  try {
    const r = await fetch(url, { signal: control.signal });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

const https = u => (u && u.startsWith('//') ? 'https:' + u : u);

// Cada lector devuelve [[código, { img, encima }], ...]. Si una API falla, simplemente no aporta emotes.
// Los "modificadores" de BTTV (h!, c!...) no son imágenes: se ignoran.
const bttv = lista => (lista || []).filter(e => !e.modifier).map(e => [e.code, { img: `https://cdn.betterttv.net/emote/${e.id}/2x` }]);
const ffz = lista => (lista || []).map(e => [e.code, { img: e.images?.['2x'] || e.images?.['1x'] }]);
// 7TV marca los emotes que se ponen encima del anterior (un sombrero, lluvia...): bit 1 del emote en el set
// o bit 256 de sus datos.
const stv = lista => (lista || []).map(e => {
  const host = e.data?.host;
  const archivo = host?.files?.find(f => f.name === '2x.webp') || host?.files?.find(f => /\.webp$/.test(f.name)) || host?.files?.[0];
  return [e.name, { img: host?.url && archivo ? `${https(host.url)}/${archivo.name}` : null, encima: !!((e.flags & 1) || (e.data?.flags & 256)) }];
});

const GLOBALES = {
  bttv: () => json('https://api.betterttv.net/3/cached/emotes/global').then(bttv),
  ffz: () => json('https://api.betterttv.net/3/cached/frankerfacez/emotes/global').then(ffz),
  stv: () => json('https://7tv.io/v3/emote-sets/global').then(j => stv(j?.emotes)),
};
const bttvCanal = j => bttv([...(j?.channelEmotes || []), ...(j?.sharedEmotes || [])]);

// Fuentes por plataforma, de menor a mayor prioridad: si dos usan el mismo código, gana la última
// (el canal gana a lo global, y 7TV a BTTV y FFZ).
const FUENTES = {
  twitch: id => [
    GLOBALES.ffz(), GLOBALES.bttv(), GLOBALES.stv(),
    json(`https://api.betterttv.net/3/cached/frankerfacez/users/twitch/${id}`).then(ffz),
    json(`https://api.betterttv.net/3/cached/users/twitch/${id}`).then(bttvCanal),
    json(`https://7tv.io/v3/users/twitch/${id}`).then(j => stv(j?.emote_set?.emotes)),
  ],
  youtube: id => [
    GLOBALES.bttv(), GLOBALES.stv(),
    json(`https://api.betterttv.net/3/cached/users/youtube/${id}`).then(bttvCanal),
  ],
  kick: id => [
    GLOBALES.stv(),
    json(`https://7tv.io/v3/users/kick/${id}`).then(j => stv(j?.emote_set?.emotes)),
  ],
};

async function cargar(plataforma, id) {
  const fuentes = FUENTES[plataforma];
  if (!fuentes) return new Map();
  const listas = await Promise.all(fuentes(encodeURIComponent(id)));
  const mapa = new Map();
  for (const lista of listas) for (const [codigo, e] of lista || []) if (codigo && /^https:\/\//.test(e?.img || '')) mapa.set(codigo, e);
  return mapa;
}

// Sustituye las palabras que coinciden exactamente con un emote. Solo toca las partes de texto.
// Un emote "encima" justo detrás de otro emote se apila sobre él (se quita el espacio entre ambos).
function aplicar(partes, mapa) {
  if (!mapa?.size) return partes;
  const salida = [];
  for (const p of partes) {
    if (p.t !== 'texto') { salida.push(p); continue; }
    let acumulado = '';
    for (const trozo of p.v.split(/(\s+)/)) {
      const valor = trozo && !/^\s+$/.test(trozo) ? mapa.get(trozo) : null;
      const e = typeof valor === 'string' ? { img: valor } : valor;
      if (!e) { acumulado += trozo; continue; }
      const anterior = salida[salida.length - 1];
      if (e.encima && anterior?.t === 'emote' && !acumulado.trim()) {
        acumulado = '';
        salida.push({ t: 'emote', v: trozo, img: e.img, encima: true });
        continue;
      }
      if (acumulado) { salida.push({ t: 'texto', v: acumulado }); acumulado = ''; }
      salida.push({ t: 'emote', v: trozo, img: e.img });
    }
    if (acumulado) salida.push({ t: 'texto', v: acumulado });
  }
  return salida;
}

class EmotesCanal {
  // cargador(id) → Map. Por defecto, el de la plataforma.
  constructor(plataforma = 'twitch', cargador = null) {
    this.plataforma = plataforma;
    this.cargar = cargador || (id => cargar(plataforma, id));
    this.mapa = new Map();
    this.id = null;
    this.fecha = 0;
  }

  // Se llama al conocer el ID del canal; no repite la descarga si es reciente.
  async preparar(id) {
    if (!id || (id === this.id && Date.now() - this.fecha < RENOVAR)) return;
    this.id = id;
    this.fecha = Date.now();
    const mapa = await this.cargar(id);
    if (this.id === id && mapa.size) this.mapa = mapa;
  }

  aplicar(partes) { return aplicar(partes, this.mapa); }
}

module.exports = { EmotesCanal, aplicar, cargar };
