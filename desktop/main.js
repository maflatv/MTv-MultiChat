// MTv MultiChat como app de escritorio: arranca el servidor local dentro de Electron, abre el dock en su propia
// ventana y habilita lo que necesita un navegador real (Kick en modo ventana, TikTok) y las actualizaciones.
// Los overlays de OBS siguen en http://localhost:7390/overlay y /alertas.
const path = require('path');
const { app, BrowserWindow, dialog, shell } = require('electron');
const { ES_INSTALADA, RAIZ, VERSION, carpetaDatos } = require('../lib/runtime.js');
const { crearServidor } = require('../server.js');
const { KickVentana } = require('../lib/conectores/kick-ventana.js');
const { TikTokVentana, abrirInicioSesion } = require('../lib/conectores/tiktok-ventana.js');

const DATOS = carpetaDatos();
const ICONO = path.join(RAIZ, 'build', 'icon.ico');
// Los datos de Chromium (sesiones de TikTok y Kick) van con los demás ajustes.
app.setPath('userData', path.join(DATOS, 'chromium'));
app.setAppUserModelId('io.github.maflatv.mtvmultichat');

if (!app.requestSingleInstanceLock()) app.quit();

let dock = null;
let servidor = null;

// ---------- Actualizaciones (solo la versión instalada) ----------
// Busca al arrancar y cada 6 horas. Nunca descarga sin que el usuario lo pida en el dock; lo descargado se instala al
// reiniciar desde el aviso o, si no, al cerrar la app. Descarga solo lo que cambia (blockmap).
const actualizacion = {
  datos: { estado: 'inactiva', version: null, porcentaje: 0, error: null, manual: false },
  alCambiar: () => {},
  estado() { return { ...this.datos, instalada: ES_INSTALADA, actual: VERSION }; },
  cambiar(c) { Object.assign(this.datos, c); this.alCambiar(this.estado()); },
};
let updater = null;

function prepararActualizaciones() {
  if (!ES_INSTALADA) return;
  try { ({ autoUpdater: updater } = require('electron-updater')); } catch { return; }
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;
  updater.on('update-available', i => actualizacion.cambiar({ estado: 'disponible', version: i.version, error: null }));
  updater.on('update-not-available', () => actualizacion.cambiar({ estado: 'al-dia', error: null }));
  updater.on('download-progress', p => actualizacion.cambiar({ estado: 'descargando', porcentaje: Math.floor(p.percent) }));
  updater.on('update-downloaded', i => actualizacion.cambiar({ estado: 'lista', version: i.version, porcentaje: 100 }));
  // Sin conexión, por ejemplo: una búsqueda automática que falla no molesta; solo se informa si la pidió el usuario.
  updater.on('error', e => {
    const visible = actualizacion.datos.manual || actualizacion.datos.estado === 'descargando';
    actualizacion.cambiar({ estado: visible ? 'error' : 'inactiva', error: String(e?.message || e).split(/\r?\n/)[0] });
  });
  buscar(false);
  setInterval(() => { if (['inactiva', 'al-dia', 'error'].includes(actualizacion.datos.estado)) buscar(false); }, 6 * 3600_000).unref();
}

function buscar(manual) {
  actualizacion.cambiar({ estado: 'buscando', manual, error: null });
  updater.checkForUpdates().catch(() => { /* lo informa el evento error */ });
}

// Lo que pide el dock: buscar, descargar o instalar.
actualizacion.accion = function accion(a) {
  if (!updater) return this.estado();
  const e = this.datos.estado;
  if (a === 'buscar' && !['buscando', 'descargando', 'lista'].includes(e)) buscar(true);
  else if (a === 'descargar' && e === 'disponible') {
    this.cambiar({ estado: 'descargando', porcentaje: 0 });
    updater.downloadUpdate().catch(() => { /* lo informa el evento error */ });
  } else if (a === 'instalar' && e === 'lista') {
    // En silencio (sin el asistente del instalador) y volviendo a abrir la app al terminar.
    setImmediate(() => updater.quitAndInstall(true, true));
  }
  return this.estado();
};

// ---------- Ventana del dock ----------
function abrirDock(puerto) {
  dock = new BrowserWindow({
    width: 1400, height: 860, minWidth: 900, minHeight: 520, title: `MTv MultiChat ${VERSION}`, icon: ICONO,
    backgroundColor: '#0E0B16', autoHideMenuBar: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  dock.on('page-title-updated', e => e.preventDefault());
  const origen = `http://localhost:${puerto}`;
  // Iniciar sesión con Kick, las redes, Ko-fi y demás enlaces externos se abren en el navegador del usuario.
  dock.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(origen + '/kick/login') || /^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  dock.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(origen + '/')) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  // Las ventanas ocultas de Kick y TikTok no cuentan: la app se cierra al cerrar el dock.
  dock.on('closed', () => { dock = null; servidor?.cerrar(); app.quit(); });
  dock.loadURL(`${origen}/dock`);
}

app.on('second-instance', () => { if (dock) { if (dock.isMinimized()) dock.restore(); dock.focus(); } });

app.whenReady().then(async () => {
  // Transparencia de la ventana del dock y "siempre encima", para ver el chat sobre el juego.
  const ajustarVentana = op => {
    if (!dock) return;
    dock.setOpacity(Math.min(Math.max(Number(op.opacidad) || 1, 0.3), 1));
    dock.setAlwaysOnTop(!!op.encima, 'floating');
  };
  servidor = crearServidor({ datos: DATOS, extras: { KickVentana, TikTokVentana, abrirLoginTikTok: abrirInicioSesion, ajustarVentana, actualizacion, idiomaSistema: app.getLocale() } });
  let puerto;
  try {
    puerto = await servidor.escuchar();
  } catch (e) {
    const I18N = require('../app/i18n.js');
    const msg = e.code === 'EADDRINUSE' ? 'El puerto 7390 está ocupado. ¿MTv MultiChat ya está abierto (quizá con iniciar.bat)?' : e.message;
    dialog.showErrorBox('MTv MultiChat', I18N.traducir(msg, I18N.resolver('auto', app.getLocale())));
    app.quit();
    return;
  }
  abrirDock(puerto);
  ajustarVentana(servidor.config.datos.dock);
  prepararActualizaciones();
});

app.on('window-all-closed', () => { servidor?.cerrar(); app.quit(); });
