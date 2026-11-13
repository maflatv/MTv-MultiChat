// Genera en dist/ las formas de MTv MultiChat para Windows:
// - MTv-MultiChat-Setup-<versión>.exe: instalador. La versión instalada se actualiza sola desde las releases de GitHub
//   y descarga solo lo que cambia gracias al .blockmap; latest.yml le dice cuál es la última versión.
// - MTv-MultiChat.exe: portable, un solo archivo sin instalar nada. También va en el .zip, con las licencias a la vista.
// Uso: node build/build-exe.js 1.1.0. Los cinco archivos de dist/ van en la release v1.0.0 de GitHub.
// Solo incluye lo que Git publicaría: lo ignorado (userdata/, .build/...) nunca llega al programa.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ROOT, WORK, ELECTRON, ELECTRON_UPDATER, instalarHerramientas, instalarRuntime, run } = require('./tools.js');

const VERSION = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(VERSION || '')) throw new Error('Indica la versión: node build/build-exe.js 1.1.0');
const REPO = { owner: 'maflatv', repo: 'MTv-MultiChat' };

const DIST = path.join(ROOT, 'dist');
const STAGE = path.join(WORK, 'stage');
const OUT = path.join(WORK, 'out');
// Lo que necesita la aplicación en marcha. El resto (README, pruebas, puente de Kick, scripts .bat...) no va dentro.
const APP_FILES = ['app', 'lib', 'desktop', 'server.js', 'build/icon.ico', 'LICENSE'];
const SETUP = `MTv-MultiChat-Setup-${VERSION}.exe`;
const PORTABLE = 'MTv-MultiChat.exe';
const ZIP = `MTv-MultiChat-${VERSION}-windows-x64.zip`;

function preparar() {
  fs.rmSync(STAGE, { recursive: true, force: true });
  const archivos = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', ...APP_FILES], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(rel => rel && fs.existsSync(path.join(ROOT, rel)));
  if (!archivos.includes('server.js')) throw new Error('git no ve server.js: ¿está inicializado el repositorio?');
  for (const rel of archivos) {
    const a = path.join(STAGE, rel);
    fs.mkdirSync(path.dirname(a), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), a);
  }
  // electron-updater, para que la versión instalada se actualice. El portable lo lleva también, pero no lo usa.
  fs.cpSync(path.join(instalarRuntime(), 'node_modules'), path.join(STAGE, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(STAGE, 'package.json'), JSON.stringify({
    name: 'mtv-multichat', productName: 'MTv MultiChat', version: VERSION,
    description: 'Unified Twitch, YouTube, TikTok and Kick chat for live streams, with OBS overlays and alerts',
    author: 'Mafla', license: 'MIT', main: 'desktop/main.js',
    dependencies: { 'electron-updater': ELECTRON_UPDATER },
  }, null, 2));
  return archivos.length;
}

function configuracion() {
  return {
    appId: 'io.github.maflatv.mtvmultichat',
    productName: 'MTv MultiChat',
    copyright: 'Copyright (c) 2026 Mafla',
    electronVersion: ELECTRON,
    // Por defecto electron-builder excluye la carpeta build/ del paquete, y ahí está el icono de las ventanas.
    directories: { app: STAGE, output: OUT, buildResources: path.join(WORK, 'resources') },
    files: ['**/*'],
    asar: true,
    npmRebuild: false,
    win: { target: [{ target: 'nsis', arch: ['x64'] }, { target: 'portable', arch: ['x64'] }], icon: path.join(STAGE, 'build', 'icon.ico') },
    // Instalador para el usuario, sin permisos de administrador. Se puede elegir la carpeta. Desinstalar no borra los
    // ajustes (%APPDATA%\MTv MultiChat). En español o inglés, según Windows.
    nsis: {
      oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true, createStartMenuShortcut: true, shortcutName: 'MTv MultiChat',
      deleteAppDataOnUninstall: false, artifactName: SETUP,
      installerIcon: path.join(STAGE, 'build', 'icon.ico'), uninstallerIcon: path.join(STAGE, 'build', 'icon.ico'),
      multiLanguageInstaller: true, installerLanguages: ['es_ES', 'en_US'],
    },
    portable: { artifactName: PORTABLE },
    // De aquí lee la versión instalada dónde buscar actualizaciones (app-update.yml). Esto no publica nada.
    publish: [{ provider: 'github', owner: REPO.owner, repo: REPO.repo }],
  };
}

async function main() {
  fs.mkdirSync(DIST, { recursive: true });
  for (const f of fs.readdirSync(DIST)) if (f !== 'userdata') fs.rmSync(path.join(DIST, f), { recursive: true, force: true });
  fs.rmSync(OUT, { recursive: true, force: true });
  instalarHerramientas({ builder: true });
  console.log(`${preparar()} archivos incluidos`);

  const archivoConfig = path.join(WORK, 'electron-builder.json');
  fs.writeFileSync(archivoConfig, JSON.stringify(configuracion(), null, 2));
  run(process.execPath, [path.join(WORK, 'node_modules', 'electron-builder', 'cli.js'), '--win', '--projectDir', STAGE, '--config', archivoConfig, '--publish', 'never']);

  for (const f of [PORTABLE, SETUP, `${SETUP}.blockmap`, 'latest.yml']) fs.copyFileSync(path.join(OUT, f), path.join(DIST, f));

  // El .exe ya lleva dentro las licencias de Electron y Chromium; el .zip las incluye también a la vista.
  const pack = path.join(WORK, 'pack');
  fs.rmSync(pack, { recursive: true, force: true });
  fs.mkdirSync(pack);
  fs.copyFileSync(path.join(DIST, PORTABLE), path.join(pack, PORTABLE));
  fs.copyFileSync(path.join(__dirname, 'LEEME.txt'), path.join(pack, 'LEEME.txt'));
  fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(pack, 'LICENSE.txt'));
  const desempaquetado = path.join(OUT, 'win-unpacked');
  fs.copyFileSync(path.join(desempaquetado, 'LICENSE.electron.txt'), path.join(pack, 'LICENSE-Electron.txt'));
  fs.copyFileSync(path.join(desempaquetado, 'LICENSES.chromium.html'), path.join(pack, 'LICENSES-Chromium.html'));
  const zip = path.join(DIST, ZIP);
  execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Compress-Archive -Path (Join-Path $env:PACK "*") -DestinationPath $env:ZIP -Force'], { stdio: 'inherit', env: { ...process.env, PACK: pack, ZIP: zip } });

  console.log(`Listo en ${DIST}:`);
  for (const f of fs.readdirSync(DIST).filter(f => fs.statSync(path.join(DIST, f)).isFile())) console.log(`  ${f}`);
  console.log(`Estos cinco archivos van en la release v${VERSION} (latest.yml es imprescindible).`);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
