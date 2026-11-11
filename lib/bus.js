// Centro de mensajes: recibe de los conectores, descarta repetidos, guarda un historial corto
// y avisa a quien escuche (el servidor, que lo reparte al dock y a los overlays).
const { EventEmitter } = require('events');

const HISTORIAL = 300;

class Bus extends EventEmitter {
  constructor() {
    super();
    this.historial = [];
    this.vistos = new Set();
    this.destacado = null;
    this.ocultos = new Set();
  }

  mensaje(m) {
    if (this.vistos.has(m.id)) return;
    this.vistos.add(m.id);
    this.historial.push(m);
    if (this.historial.length > HISTORIAL) {
      const fuera = this.historial.shift();
      this.vistos.delete(fuera.id);
      this.ocultos.delete(fuera.id);
    }
    this.emit('evento', { ev: 'mensaje', m });
  }

  // Borrados que llegan de la plataforma (un moderador borró un mensaje o expulsó a alguien)
  // o del dock (el streamer oculta un mensaje del overlay).
  borrar({ ids = [], plataforma = null, autorId = null, todo = false, canal = null }) {
    const afectados = this.historial.filter(m =>
      ids.includes(m.id) ||
      (autorId && m.plataforma === plataforma && m.autor.id === autorId) ||
      (todo && m.plataforma === plataforma && (!canal || m.canal === canal)));
    if (!afectados.length) return;
    for (const m of afectados) this.ocultos.add(m.id);
    if (this.destacado && afectados.some(m => m.id === this.destacado.id)) this.destacar(null);
    this.emit('evento', { ev: 'borrar', ids: afectados.map(m => m.id) });
  }

  destacar(id) {
    this.destacado = id ? this.historial.find(m => m.id === id) || null : null;
    this.emit('evento', { ev: 'destacar', m: this.destacado });
  }

  // Lo que necesita una página que se acaba de conectar.
  estado(cuantos = 100) {
    return {
      historial: this.historial.slice(-cuantos),
      ocultos: [...this.ocultos],
      destacado: this.destacado,
    };
  }
}

module.exports = { Bus };
