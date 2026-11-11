// Kick en modo ventana (solo en la app de escritorio, necesita Electron).
// Abre el chat emergente de Kick en una ventana oculta de Chromium, un navegador real, y escucha
// los mensajes que llegan por la conexión de chat de la propia página, a través del protocolo de
// depuración de Chromium. No lee el HTML, así que un cambio de diseño de Kick no lo rompe, y la
// ventana no se pausa al estar oculta. No hace falta iniciar sesión ni servidor puente.
const { BrowserWindow } = require('electron');
const { Conector } = require('./base.js');
const { interpretarPusher } = require('./kick.js');
const { EmotesCanal } = require('../emotes.js');

const LIMITE_CARGA = 45_000;

class KickVentana extends Conector {
  constructor(bus, opciones) {
    super(bus, 'kick', opciones);
    this.ventana = null;
    this.espera = null;
    this.emotes = new EmotesCanal('kick');
  }

  conectar() {
    const canal = String(this.opciones.canal || '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?kick\.com\//, '').replace(/[/?#].*$/, '');
    if (!/^[a-z0-9_-]{2,25}$/.test(canal)) return this.fallo('Nombre de canal no válido');
    this.canal = canal;
    this.cambiar('conectando');

    const win = new BrowserWindow({
      show: false, width: 420, height: 720,
      // Sesión propia, aparte de las demás ventanas de la app.
      webPreferences: { partition: 'persist:kick', sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    this.ventana = win;
    win.webContents.setAudioMuted(true);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    const dbg = win.webContents.debugger;
    try {
      dbg.attach('1.3');
    } catch (e) {
      return this.caida(`No se pudo observar la ventana de Kick (${e.message})`);
    }
    const pendientes = new Set();
    dbg.on('message', (_e, metodo, p) => {
      if (metodo === 'Network.webSocketFrameReceived') this.trama(p.response?.payloadData);
      // La página pide los datos del canal; de ahí sale el ID para los emotes de 7TV.
      else if (metodo === 'Network.responseReceived' && /\/api\/v2\/channels\/[^/?]+(\?|$)/.test(p.response?.url || '')) pendientes.add(p.requestId);
      else if (metodo === 'Network.loadingFinished' && pendientes.delete(p.requestId)) {
        dbg.sendCommand('Network.getResponseBody', { requestId: p.requestId }).then(r => {
          const j = JSON.parse(r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body);
          if (j?.user_id) this.emotes.preparar(String(j.user_id)).catch(() => {});
        }).catch(() => {});
      }
      else if (metodo === 'Network.webSocketClosed' && this.estado.estado === 'conectado') this.caida('Kick cerró la conexión de chat');
    });
    dbg.sendCommand('Network.enable').catch(() => {});

    win.webContents.on('did-fail-load', (_e, codigo, desc, _url, principal) => { if (principal && this.ventana === win) this.caida(`No carga kick.com (${desc || codigo})`); });
    win.webContents.on('render-process-gone', () => { if (this.ventana === win) this.caida('La ventana de Kick se cerró'); });

    // Si en un tiempo razonable no se suscribe a ningún chat, el canal no existe o Kick no carga.
    clearTimeout(this.espera);
    this.espera = setTimeout(() => { if (this.ventana === win && this.estado.estado !== 'conectado') this.caida('Kick no abre el chat. ¿Está bien escrito el canal?'); }, LIMITE_CARGA);

    win.loadURL(`https://kick.com/popout/${encodeURIComponent(canal)}/chat`).catch(() => {});
    // Pusher manda un ping cada pocos minutos: si no llega nada en 6 minutos, se reconecta.
    this.vigilar(6 * 60_000);
  }

  trama(texto) {
    if (typeof texto !== 'string' || !texto.startsWith('{')) return;
    this.vivo();
    let t;
    try { t = JSON.parse(texto); } catch { return; }
    if (t.event === 'pusher_internal:subscription_succeeded' && /^chatrooms?\.\d+/.test(t.channel || '')) {
      clearTimeout(this.espera);
      if (!this.emotes.id) this.emotes.preparar('global').catch(() => {});
      return this.cambiar('conectado', `kick.com/${this.canal}`);
    }
    let datos = t.data;
    if (typeof datos === 'string') { try { datos = JSON.parse(datos); } catch { return; } }
    const r = interpretarPusher(t.event, datos, this.canal);
    if (r?.mensaje) { r.mensaje.partes = this.emotes.aplicar(r.mensaje.partes); this.bus.mensaje(r.mensaje); }
    else if (r?.borrar) this.bus.borrar(r.borrar);
  }

  cerrar() {
    clearTimeout(this.espera);
    const win = this.ventana;
    this.ventana = null;
    try { win?.webContents.debugger.detach(); } catch { /* ya desconectado */ }
    try { win?.destroy(); } catch { /* ya cerrada */ }
  }
}

module.exports = { KickVentana };
