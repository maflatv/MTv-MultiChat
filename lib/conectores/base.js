// Comportamiento común de los conectores: estado visible en el dock, reconexión automática con espera
// creciente y vigilancia de conexiones que se quedan colgadas sin cerrarse.
class Conector {
  constructor(bus, plataforma, opciones = {}) {
    this.bus = bus;
    this.plataforma = plataforma;
    this.opciones = opciones;
    this.estado = { plataforma, estado: 'parado', detalle: '' };
    this.activo = false;
    this.espera = 1000;
    this.reintento = null;
    this.vigilante = null;
    this.ultimo = 0;
  }

  iniciar() {
    this.activo = true;
    this.espera = 1000;
    this.conectar();
  }

  detener() {
    this.activo = false;
    clearTimeout(this.reintento);
    clearInterval(this.vigilante);
    this.cerrar();
    this.cambiar('parado');
  }

  cambiar(estado, detalle = '') {
    if (estado === 'conectado') this.espera = 1000;
    if (estado === this.estado.estado && detalle === this.estado.detalle) return;
    this.estado = { plataforma: this.plataforma, estado, detalle };
    this.bus.emit('conexion', this.estado);
  }

  vivo() { this.ultimo = Date.now(); }

  // Si no llega nada en `ms`, se da la conexión por muerta.
  vigilar(ms) {
    this.vivo();
    clearInterval(this.vigilante);
    this.vigilante = setInterval(() => { if (Date.now() - this.ultimo > ms) this.caida('Sin respuesta'); }, 10_000);
  }

  // Corte recuperable: se reintenta solo.
  caida(motivo) {
    clearInterval(this.vigilante);
    this.cerrar();
    if (!this.activo) return;
    const s = Math.round(this.espera / 1000);
    this.cambiar('reconectando', `${motivo}. Reintento en ${s} s`);
    clearTimeout(this.reintento);
    this.reintento = setTimeout(() => { if (this.activo) this.conectar(); }, this.espera);
    this.espera = Math.min(this.espera * 2, 30_000);
  }

  // Error que no se arregla reintentando (canal mal escrito, canal suspendido...).
  fallo(motivo) {
    this.activo = false;
    clearInterval(this.vigilante);
    this.cerrar();
    this.cambiar('error', motivo);
  }

  conectar() { throw new Error('conectar() sin implementar'); }
  cerrar() {}
}

module.exports = { Conector };
