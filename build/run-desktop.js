// Abre la app de escritorio desde el código fuente. Uso: node build/run-desktop.js  (o escritorio.bat)
const path = require('path');
const { ROOT, WORK, instalarHerramientas, run } = require('./tools.js');

instalarHerramientas();
const electron = path.join(WORK, 'node_modules', 'electron', 'dist', 'electron.exe');
// Desde la terminal de VS Code, ELECTRON_RUN_AS_NODE haría que Electron arrancase como Node, sin ventanas.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
run(electron, [path.join(ROOT, 'desktop', 'main.js')], { cwd: ROOT, env });
