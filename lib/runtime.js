// Lo que cambia entre ejecutar el código fuente, el .exe portable y la versión instalada.
const path = require('path');

const ES_ESCRITORIO = !!process.versions.electron;
// El .exe portable se descomprime en una carpeta temporal: PORTABLE_EXECUTABLE_DIR indica dónde está de verdad.
const ES_PORTABLE = !!process.env.PORTABLE_EXECUTABLE_DIR;
// Instalada con el instalador: es la única que se actualiza sola.
const ES_INSTALADA = ES_ESCRITORIO && !ES_PORTABLE && require('electron').app.isPackaged;
const RAIZ = path.join(__dirname, '..');
const VERSION = require('../package.json').version;

// Dónde van los ajustes del usuario (config.json, sonidos e imágenes propios, sesión de Chromium):
// - Portable: junto al .exe, para llevarlo todo en una carpeta.
// - Instalada: en %APPDATA%\MTv MultiChat. La carpeta del programa la reemplazan las actualizaciones y la borra el
//   desinstalador; los ajustes no deben ir ahí.
// - Código fuente: userdata/ en la carpeta del proyecto.
function carpetaDatos() {
  if (ES_PORTABLE) return path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'userdata');
  if (ES_INSTALADA) return path.join(require('electron').app.getPath('appData'), 'MTv MultiChat');
  return path.join(RAIZ, 'userdata');
}

module.exports = { ES_ESCRITORIO, ES_PORTABLE, ES_INSTALADA, RAIZ, VERSION, carpetaDatos };
