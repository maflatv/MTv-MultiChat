// Perfiles de chat: varios chats y alertas, cada uno con su apariencia y con lo que muestra de cada plataforma.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { Config } = require('../lib/config.js');
const { crearServidor } = require('../server.js');

const carpeta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtv-perfiles-'));

test('config: crear (copia), renombrar, filtrar, borrar y el Principal protegido', () => {
  const archivo = path.join(carpeta(), 'config.json');
  const c = new Config(archivo);
  assert.deepEqual(c.perfiles().map(p => p.id), ['principal']);
  // Por defecto todo sale.
  assert.equal(c.datos.filtro.tiktok.donacion, true);

  c.cambiar({ overlay: { tamano: 30 } });
  const id = c.crearPerfil({ nombre: 'Escena Vertical', desde: 'principal' });
  assert.equal(id, 'escena-vertical');
  const p = c.perfiles().find(x => x.id === id);
  assert.equal(p.overlay.tamano, 30, 'empieza como copia del perfil de origen');

  // Cambiar el perfil nuevo no toca el Principal, y al revés.
  c.cambiarPerfil(id, { overlay: { tamano: 40 }, filtro: { twitch: { follow: false, donacion: false } }, nombre: 'Vertical' });
  assert.equal(c.datos.overlay.tamano, 30);
  const p2 = c.perfiles().find(x => x.id === id);
  assert.deepEqual([p2.nombre, p2.overlay.tamano, p2.filtro.twitch.follow, p2.filtro.twitch.mensaje], ['Vertical', 40, false, true]);
  c.cambiarPerfil('principal', { filtro: { kick: { mensaje: false } } });
  assert.equal(c.datos.filtro.kick.mensaje, false);
  assert.equal(c.perfiles().find(x => x.id === id).filtro.kick.mensaje, true);

  // Se guarda y se vuelve a leer igual.
  const leida = new Config(archivo);
  assert.equal(leida.perfiles().find(x => x.id === id).filtro.twitch.follow, false);

  assert.notEqual(c.crearPerfil({ nombre: 'Escena Vertical' }), id, 'no repite ids');
  assert.throws(() => c.borrarPerfil('principal'));
  assert.throws(() => c.cambiarPerfil('no-existe', { nombre: 'x' }));
  c.borrarPerfil(id);
  assert.equal(c.perfiles().some(x => x.id === id), false);
});

test('config: perfiles guardados por una versión anterior o dañados se completan o se descartan', () => {
  const archivo = path.join(carpeta(), 'config.json');
  fs.writeFileSync(archivo, JSON.stringify({ perfiles: [{ id: 'tiktok', nombre: 'TikTok', overlay: { tamano: 18 } }, { id: 'principal' }, { id: 'tiktok' }, null, 'basura'] }));
  const c = new Config(archivo);
  assert.deepEqual(c.perfiles().map(p => p.id), ['principal', 'tiktok']);
  const t = c.perfiles()[1];
  assert.equal(t.overlay.tamano, 18);
  assert.equal(t.overlay.tema, 'tarjetas', 'lo que falta sale de los valores por defecto');
  assert.equal(t.filtro.youtube.mensaje, true);
});

function escuchar(puerto, recibidos) {
  return new Promise(ok => {
    const req = http.get({ host: '127.0.0.1', port: puerto, path: '/api/eventos', headers: { host: 'localhost' } }, res => {
      let buf = '';
      res.on('data', c => {
        buf += c;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const d = buf.slice(0, i).split('\n').find(l => l.startsWith('data: '));
          buf = buf.slice(i + 2);
          if (d) recibidos.push(JSON.parse(d.slice(6)));
        }
      });
      ok(req);
    });
  });
}
const post = (puerto, accion, cuerpo) => fetch(`http://localhost:${puerto}/api/${accion}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-multichat': '1' }, body: JSON.stringify(cuerpo) }).then(r => r.json());
const esperar = ms => new Promise(r => setTimeout(r, ms));

test('servidor: las páginas reciben los perfiles al conectar y con cada cambio', async () => {
  const datos = carpeta();
  const app = crearServidor({ datos });
  const puerto = await app.escuchar(0);
  const recibidos = [];
  const req = await escuchar(puerto, recibidos);
  try {
    await esperar(100);
    assert.deepEqual(recibidos[0].perfiles.map(p => p.id), ['principal']);

    const { id } = await post(puerto, 'perfil-crear', { nombre: 'TikTok' });
    await post(puerto, 'perfil', { id, filtro: { twitch: { donacion: false } } });
    await esperar(100);
    const ultimo = recibidos.filter(e => e.ev === 'perfiles').at(-1);
    const p = ultimo.perfiles.find(x => x.id === id);
    assert.equal(p.nombre, 'TikTok');
    assert.equal(p.filtro.twitch.donacion, false);

    // Un error (borrar el Principal) llega como respuesta, no rompe nada.
    assert.ok((await post(puerto, 'perfil-borrar', { id: 'principal' })).error);
    await post(puerto, 'perfil-borrar', { id });
    await esperar(100);
    assert.deepEqual(recibidos.filter(e => e.ev === 'perfiles').at(-1).perfiles.map(x => x.id), ['principal']);
  } finally {
    req.destroy();
    app.cerrar();
    fs.rmSync(datos, { recursive: true, force: true });
  }
});
