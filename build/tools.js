// Herramientas de compilación: se instalan en .build/, fuera del repositorio. El código de MTv MultiChat no tiene
// dependencias; solo la versión instalada lleva electron-updater dentro, para actualizarse sola.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const WORK = path.join(ROOT, '.build');
// Versiones fijas, las mismas que MultiTracker: una compilación debe dar siempre el mismo resultado.
const ELECTRON = '44.9.3';
const ELECTRON_BUILDER = '26.18.0';
const ELECTRON_UPDATER = '6.8.12';
// electron-updater y sus dependencias, aparte de las herramientas: esta carpeta node_modules va dentro del programa.
const RUNTIME = path.join(WORK, 'runtime');

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', cwd: WORK, ...opts });

function instalado(nombre, version, base = WORK) {
  try { return JSON.parse(fs.readFileSync(path.join(base, 'node_modules', nombre, 'package.json'), 'utf8')).version === version; } catch { return false; }
}

// Electron (para abrir la app desde el código) y electron-builder (para compilar).
function instalarHerramientas({ builder = false } = {}) {
  fs.mkdirSync(WORK, { recursive: true });
  const faltan = [];
  if (!instalado('electron', ELECTRON)) faltan.push(`electron@${ELECTRON}`);
  if (builder && !instalado('electron-builder', ELECTRON_BUILDER)) faltan.push(`electron-builder@${ELECTRON_BUILDER}`);
  if (faltan.length) {
    // Un package.json propio evita que npm busque uno en carpetas superiores.
    fs.writeFileSync(path.join(WORK, 'package.json'), JSON.stringify({ name: 'mtv-multichat-build', private: true }, null, 2));
    run('npm', ['install', '--no-save', '--no-audit', '--no-fund', `electron@${ELECTRON}`, ...(builder ? [`electron-builder@${ELECTRON_BUILDER}`] : [])], { shell: true });
  }
  // npm no siempre ejecuta el script que descarga Electron: se lanza aquí si falta el programa.
  if (!fs.existsSync(path.join(WORK, 'node_modules', 'electron', 'dist', 'electron.exe'))) {
    run(process.execPath, [path.join(WORK, 'node_modules', 'electron', 'install.js')]);
  }
}

function instalarRuntime() {
  if (instalado('electron-updater', ELECTRON_UPDATER, RUNTIME)) return RUNTIME;
  fs.rmSync(RUNTIME, { recursive: true, force: true });
  fs.mkdirSync(RUNTIME, { recursive: true });
  fs.writeFileSync(path.join(RUNTIME, 'package.json'), JSON.stringify({ name: 'mtv-multichat-runtime', private: true }, null, 2));
  run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--save-exact', `electron-updater@${ELECTRON_UPDATER}`], { shell: true, cwd: RUNTIME });
  return RUNTIME;
}

// Alias con el nombre antiguo (run-desktop.js).
const installTools = () => instalarHerramientas();

module.exports = { ROOT, WORK, ELECTRON, ELECTRON_BUILDER, ELECTRON_UPDATER, instalarHerramientas, instalarRuntime, installTools, run };
