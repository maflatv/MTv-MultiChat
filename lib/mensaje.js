// Formato común de MTv MultiChat. Cada conector traduce lo que recibe de su plataforma a este formato,
// y el dock y los overlays solo conocen este formato.
//
// {
//   id:         'twitch:<id de la plataforma>'  único; sirve para no repetir y para borrar
//   plataforma: 'twitch' | 'youtube' | 'tiktok' | 'kick' | 'prueba'
//   canal:      canal del que llega
//   tipo:       'mensaje' | 'donacion' | 'suscripcion' | 'regalo_subs' | 'raid' | 'follow' | 'aviso'
//   fecha:      milisegundos
//   autor:      { id, nombre, color, avatar, roles: { emisor, mod, vip, sub, miembro }, meses, insignias: [{ img, titulo }] }
//   partes:     [{ t: 'texto', v }, { t: 'emote', v: nombre, img: url }]   nunca HTML
//   texto:      el mensaje en texto plano (para buscar, filtrar o leer en voz alta)
//   titulo:     texto del sistema para eventos ("Se ha suscrito 12 meses", "Raid de 50 espectadores")
//   importe:    { valor: número, moneda: 'USD' | 'BITS' | 'COINS' | ..., usd: número aproximado o null }
//   cantidad:   número de subs regalados, espectadores de un raid, meses de suscripción, etc.
//   imagen:     URL de un sticker o regalo (Super Sticker, regalo de YouTube o TikTok), o null
// }
const TIPOS = new Set(['mensaje', 'donacion', 'suscripcion', 'regalo_subs', 'raid', 'follow', 'aviso']);

function crear(datos) {
  const m = {
    id: String(datos.id),
    plataforma: datos.plataforma,
    canal: datos.canal || '',
    tipo: TIPOS.has(datos.tipo) ? datos.tipo : 'mensaje',
    fecha: datos.fecha || Date.now(),
    autor: {
      id: datos.autor?.id ? String(datos.autor.id) : '',
      nombre: datos.autor?.nombre || '',
      color: datos.autor?.color || null,
      avatar: datos.autor?.avatar || null,
      roles: { emisor: false, mod: false, vip: false, sub: false, miembro: false, ...(datos.autor?.roles || {}) },
      meses: datos.autor?.meses || 0,
      insignias: Array.isArray(datos.autor?.insignias) ? datos.autor.insignias : [],
    },
    partes: Array.isArray(datos.partes) ? datos.partes : (datos.texto ? [{ t: 'texto', v: datos.texto }] : []),
    texto: '',
    titulo: datos.titulo || '',
    importe: datos.importe || null,
    cantidad: datos.cantidad || 0,
    imagen: datos.imagen || null,
  };
  m.texto = datos.texto ?? m.partes.map(p => p.v).join('');
  return m;
}

module.exports = { crear, TIPOS };
