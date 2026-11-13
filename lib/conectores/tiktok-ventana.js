// TikTok (solo en la app de escritorio, necesita Electron).
// Abre el directo en una ventana oculta de Chromium, un navegador real, y lee los mensajes que la
// propia página recibe (por WebSocket y por /webcast/im/fetch), a través del protocolo de depuración
// de Chromium. No lee el HTML. El vídeo se bloquea para no gastar CPU ni red.
// Si no estás en directo, espera y vuelve a mirar cada minuto.
const { BrowserWindow } = require('electron');
const { Conector } = require('./base.js');
const tiktok = require('./tiktok.js');

const PARTICION = 'persist:tiktok';
const SIN_DIRECTO = 45_000;
const REVISAR = 60_000;

const usuarioDe = entrada => String(entrada || '').trim().replace(/^https?:\/\/(www\.)?tiktok\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '').toLowerCase();

class TikTokVentana extends Conector {
  constructor(bus, opciones) {
    super(bus, 'tiktok', opciones);
    this.ventana = null;
    this.temporizador = null;
    this.recibido = false;
  }

  conectar() {
    const usuario = usuarioDe(this.opciones.canal);
    if (!/^[a-z0-9._]{2,24}$/.test(usuario)) return this.fallo('Nombre de usuario de TikTok no válido');
    this.usuario = usuario;
    this.recibido = false;
    if (this.estado.estado !== 'esperando') this.cambiar('conectando');

    const win = new BrowserWindow({
      show: false, width: 500, height: 800,
      webPreferences: { partition: PARTICION, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    this.ventana = win;
    win.webContents.setAudioMuted(true);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    // Sin vídeo: solo hace falta el chat.
    win.webContents.session.webRequest.onBeforeRequest((det, responder) => {
      responder({ cancel: det.resourceType === 'media' || /\.flv(\?|$)|\.m3u8(\?|$)|\/\/pull-[^/]*\.tiktokcdn/.test(det.url) });
    });

    const dbg = win.webContents.debugger;
    try { dbg.attach('1.3'); } catch (e) { return this.caida(`No se pudo observar la ventana de TikTok (${e.message})`); }
    const pendientes = new Set();
    dbg.on('message', (_e, metodo, p) => {
      if (metodo === 'Network.webSocketFrameReceived' && p.response?.opcode === 2) {
        this.procesar(() => tiktok.mensajesDeTrama(Buffer.from(p.response.payloadData, 'base64')));
      } else if (metodo === 'Network.responseReceived' && /\/webcast\/im\/fetch/.test(p.response?.url || '')) {
        pendientes.add(p.requestId);
      } else if (metodo === 'Network.loadingFinished' && pendientes.delete(p.requestId)) {
        dbg.sendCommand('Network.getResponseBody', { requestId: p.requestId }).then(r => {
          const buf = Buffer.from(r.body, r.base64Encoded ? 'base64' : 'binary');
          this.procesar(() => tiktok.mensajesDeRespuesta(tiktok.descomprimir(buf)));
        }).catch(() => {});
      }
    });
    dbg.sendCommand('Network.enable').catch(() => {});

    win.webContents.on('did-fail-load', (_e, codigo, desc, _url, principal) => { if (principal && this.ventana === win) this.caida(`No carga tiktok.com (${desc || codigo})`); });
    win.webContents.on('render-process-gone', () => { if (this.ventana === win) this.caida('La ventana de TikTok se cerró'); });

    // Si no llega ningún mensaje del directo, no está en directo (o TikTok pide iniciar sesión): se vuelve a mirar.
    // Pero si llegan datos que no se entienden, sí hay directo y TikTok ha cambiado algo: se avisa.
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => {
      if (this.ventana !== win || this.recibido) return;
      if (this.raras) this.avisarFormato();
      else this.esperar();
    }, SIN_DIRECTO);
    win.loadURL(`https://www.tiktok.com/@${encodeURIComponent(usuario)}/live`).catch(() => {});
  }

  procesar(obtener) {
    let mensajes;
    try { mensajes = obtener(); } catch { return this.formato(false); }
    // Tramas sin mensajes (latidos, confirmaciones): ni se entienden ni dejan de entenderse.
    if (!mensajes.length) return;
    // Si TikTok cambia su formato, los tipos dejan de tener la forma de siempre (WebcastAlgoMessage).
    if (!mensajes.some(m => /^Webcast\w+Message$/.test(m.tipo))) return this.formato(false);
    this.formato(true);
    this.vivo();
    if (!this.recibido) {
      this.recibido = true;
      clearTimeout(this.temporizador);
      this.cambiar('conectado', `@${this.usuario}`);
      // Cuando el directo termina dejan de llegar mensajes: tras 5 minutos de silencio se vuelve a mirar.
      this.vigilar(5 * 60_000);
    }
    for (const { tipo, datos } of mensajes) {
      let r;
      try { r = tiktok.interpretar(tipo, datos, this.usuario); } catch { continue; }
      if (r?.mensaje) this.bus.mensaje(r.mensaje);
      else if (r?.espectadores) this.cambiar('conectado', `@${this.usuario} · ${r.espectadores} espectadores`);
    }
  }

  esperar() {
    this.cerrarVentana();
    this.cambiar('esperando', 'Sin directo ahora (o TikTok pide iniciar sesión). Se conectará solo al empezar');
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => { if (this.activo) this.conectar(); }, REVISAR);
  }

  cerrarVentana() {
    const win = this.ventana;
    this.ventana = null;
    try { win?.webContents.debugger.detach(); } catch { /* ya desconectado */ }
    try { win?.destroy(); } catch { /* ya cerrada */ }
  }

  cerrar() {
    clearTimeout(this.temporizador);
    this.cerrarVentana();
  }
}

// Ventana visible para iniciar sesión en TikTok (para directos que lo exigen). Comparte sesión con la oculta.
function abrirInicioSesion() {
  const win = new BrowserWindow({ width: 480, height: 760, title: 'Iniciar sesión en TikTok', autoHideMenuBar: true, webPreferences: { partition: PARTICION, sandbox: true, contextIsolation: true } });
  win.loadURL('https://www.tiktok.com/login');
  return win;
}

module.exports = { TikTokVentana, abrirInicioSesion, usuarioDe };
