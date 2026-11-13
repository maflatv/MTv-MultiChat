// Comportamiento común de los conectores: estado visible en el dock, reconexión automática con espera
// creciente, vigilancia de conexiones que se quedan colgadas sin cerrarse, aviso de los huecos que deja
// un corte y aviso cuando la plataforma manda datos que no se entienden (cambió su web o su formato).
const NOMBRES = { twitch: 'Twitch', youtube: 'YouTube', tiktok: 'TikTok', kick: 'Kick' };
// Tramas seguidas sin entender ninguna antes de avisar. Las que no llevan mensajes (latidos, etc.) no cuentan.
const UMBRAL_RARAS = 25;

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
    this.caidaDesde = null;    // cuándo se cortó una conexión que estaba funcionando
    this.raras = 0;            // tramas seguidas que no se entienden
    this.formatoRaro = false;
    this.detalleNormal = '';
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
    this.olvidarFormato();
    this.cambiar('parado');
  }

  cambiar(estado, detalle = '') {
    if (estado === 'conectado') {
      this.espera = 1000;
      // Vuelve tras un corte: el dock marca el hueco, porque lo que se escribió mientras tanto no llega.
      if (this.caidaDesde) {
        const desde = this.caidaDesde;
        this.caidaDesde = null;
        this.bus.emit('evento', { ev: 'hueco', plataforma: this.plataforma, desde, hasta: Date.now() });
      }
      // Mientras no se entiendan los datos, el aviso se queda a la vista; el detalle normal se guarda para después.
      if (this.formatoRaro) { this.detalleNormal = detalle; estado = 'revisar'; detalle = this.textoFormato(); }
    } else if (['parado', 'esperando', 'error'].includes(estado)) {
      // Sin directo o desactivado: no hay nada que se esté perdiendo.
      this.caidaDesde = null;
    }
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
    if (['conectado', 'revisar'].includes(this.estado.estado) && !this.caidaDesde) this.caidaDesde = Date.now();
    this.olvidarFormato();
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
    this.olvidarFormato();
    clearInterval(this.vigilante);
    this.cerrar();
    this.cambiar('error', motivo);
  }

  // Cada trama que llega de la plataforma con contenido: entendida o no. Si llegan muchas seguidas sin entender
  // ninguna, la conexión parece buena pero el chat se queda vacío: se avisa en vez de callar.
  formato(entendida) {
    if (entendida) {
      this.raras = 0;
      if (this.formatoRaro) { this.formatoRaro = false; this.cambiar('conectado', this.detalleNormal); }
      return;
    }
    if (++this.raras >= UMBRAL_RARAS) this.avisarFormato();
  }

  avisarFormato() {
    if (this.formatoRaro) return;
    this.formatoRaro = true;
    this.detalleNormal = this.estado.detalle;
    this.cambiar('revisar', this.textoFormato());
  }

  olvidarFormato() { this.raras = 0; this.formatoRaro = false; }

  textoFormato() {
    return `${NOMBRES[this.plataforma] || this.plataforma} envía datos que MTv MultiChat no entiende. Puede que haya cambiado: busca una actualización.`;
  }

  conectar() { throw new Error('conectar() sin implementar'); }
  cerrar() {}
}

module.exports = { Conector };
