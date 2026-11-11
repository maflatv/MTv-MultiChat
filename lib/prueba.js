// Mensajes de prueba para ver el dock y el overlay sin estar en directo.
const { crear } = require('./mensaje.js');

const NOMBRES = ['LunaPixel', 'ElGranTaco', 'xX_Nebula_Xx', 'MarioGamer88', 'Sakura_Chan', 'DonPepe', 'Kiwi', 'ElMagoDelChat'];
const TEXTOS = ['¡Hola a todos!', 'jajaja qué buena jugada', '¿Desde dónde transmites?', 'GG', 'Esto se va a descontrolar 🔥', 'Primera vez por aquí, me encanta el stream', '¿Qué juego viene después?', 'vamos vamos vamos',
  // Largos, para probar el corte, el máximo de líneas y el filtro de mensajes largos.
  'Llevo viendo tus directos desde hace un montón de tiempo y nunca había escrito, pero hoy tenía que decirlo: esta partida está siendo de las mejores que te he visto, sigue así que vas genial',
  'COPYPASTA COPYPASTA COPYPASTA COPYPASTA COPYPASTA COPYPASTA COPYPASTA COPYPASTA COPYPASTA COPYPASTA COPYPASTA COPYPASTA COPYPASTA COPYPASTA COPYPASTA COPYPASTA COPYPASTA COPYPASTA COPYPASTA COPYPASTA'];
const PLATAFORMAS = ['twitch', 'youtube', 'tiktok', 'kick'];
const COLORES = ['#FF7F50', '#9ACD32', '#1E90FF', '#FF69B4', '#DAA520', '#00CED1', '#B07CFF'];
const azar = a => a[Math.floor(Math.random() * a.length)];

// Roles que existen en cada plataforma, para que la vista previa muestre sus insignias reales.
const ROLES = {
  twitch: ['mod', 'vip', 'sub', 'fundador', 'verificado'],
  youtube: ['mod', 'miembro', 'verificado'],
  kick: ['mod', 'vip', 'og', 'sub', 'regalador'],
  tiktok: ['mod', 'sub'],
};
const PROB = { mod: 0.15, vip: 0.12, og: 0.12, sub: 0.45, miembro: 0.45, fundador: 0.08, verificado: 0.06, regalador: 0.12 };
function rolesDe(plataforma) {
  const r = {};
  for (const rol of ROLES[plataforma] || []) r[rol] = Math.random() < PROB[rol];
  if (r.fundador) r.sub = true;
  return r;
}

let n = 0;
function mensajePrueba(tipo = 'mensaje') {
  n++;
  const plataforma = azar(PLATAFORMAS);
  const nombre = azar(NOMBRES);
  const base = {
    id: `prueba:${Date.now()}:${n}`, plataforma, canal: 'prueba',
    autor: { id: nombre, nombre, color: plataforma === 'youtube' ? null : azar(COLORES), roles: rolesDe(plataforma) },
  };
  switch (tipo) {
    case 'donacion': {
      const usd = azar([1, 2, 5, 10, 20, 50]);
      return crear({ ...base, tipo: 'donacion', texto: '¡Sigue así!', titulo: `${usd} USD`, importe: { valor: usd, moneda: 'USD', usd } });
    }
    case 'suscripcion': return crear({ ...base, tipo: 'suscripcion', titulo: `${nombre} se ha suscrito 6 meses`, cantidad: 6, texto: 'Medio año ya 💜' });
    case 'regalo_subs': return crear({ ...base, tipo: 'regalo_subs', titulo: `${nombre} regala 5 suscripciones`, cantidad: 5 });
    case 'raid': return crear({ ...base, tipo: 'raid', titulo: `Raid de ${nombre} con 42 espectadores`, cantidad: 42 });
    case 'follow': return crear({ ...base, tipo: 'follow', titulo: `${nombre} te sigue` });
    default: return crear({ ...base, tipo: 'mensaje', texto: azar(TEXTOS) });
  }
}

// Envío automático de pruebas: mensajes de chat cada `mensajes` segundos y, alternando, un evento cada
// `eventos` segundos (rotando entre los tipos para verlos todos). Intervalos acotados para no saturar.
const EVENTOS = ['follow', 'suscripcion', 'donacion', 'regalo_subs', 'raid'];
const acotar = (v, min, max, def) => (Number.isFinite(v) ? Math.min(Math.max(v, min), max) : def);

class PruebaAuto {
  constructor(enviar) {
    this.enviar = enviar;
    this.estado = { activo: false, mensajes: 3, eventos: 15 };
    this.t1 = null;
    this.t2 = null;
    this.turno = 0;
  }

  configurar({ activo, mensajes, eventos }) {
    clearInterval(this.t1);
    clearInterval(this.t2);
    this.estado = {
      activo: !!activo,
      mensajes: acotar(mensajes, 0.5, 120, this.estado.mensajes),
      eventos: eventos === 0 ? 0 : acotar(eventos, 2, 600, this.estado.eventos),
    };
    if (!this.estado.activo) return;
    this.enviar('mensaje');
    this.t1 = setInterval(() => this.enviar('mensaje'), this.estado.mensajes * 1000);
    if (this.estado.eventos) this.t2 = setInterval(() => this.enviar(EVENTOS[this.turno++ % EVENTOS.length]), this.estado.eventos * 1000);
  }
}

module.exports = { mensajePrueba, PruebaAuto, EVENTOS };
