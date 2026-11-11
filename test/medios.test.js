// Biblioteca de sonidos e imágenes propios (subida, listado, descarga y protección).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Medios } = require('../lib/medios.js');
const { crearServidor } = require('../server.js');

test('solo acepta imagen, vídeo y audio, con nombre seguro', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtv-medios-'));
  try {
    const m = new Medios(dir);
    const r = m.guardar('Mi Sonido ¡Épico!.MP3', Buffer.from('ID3...'));
    assert.match(r.url, /^\/medios\/[0-9a-f]{8}-Mi_Sonido_Epico_?\.mp3$/);
    assert.equal(r.tipo, 'audio');
    assert.equal(m.lista().length, 1);
    for (const malo of ['x.svg', 'x.html', 'x.exe', 'x.js', 'sin-extension']) assert.throws(() => m.guardar(malo, Buffer.from('a')), /no admitido/);
    assert.throws(() => m.guardar('x.png', Buffer.alloc(0)), /vacío/);
    // No se puede salir de la carpeta ni pedir tipos no admitidos.
    assert.equal(m.ruta('../config.json'), null);
    assert.equal(m.ruta('..\config.json'), null);
    assert.equal(m.borrar(r.url.slice(8)), true);
    assert.equal(m.lista().length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('servidor: subir, servir y proteger los archivos', async () => {
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'mtv-'));
  const app = crearServidor({ datos });
  const puerto = await app.escuchar(0);
  const base = `http://localhost:${puerto}`;
  try {
    const gif = Buffer.from('GIF89a-prueba');
    const sinCabecera = await fetch(`${base}/api/medios`, { method: 'POST', headers: { 'X-Nombre': 'a.gif' }, body: gif });
    assert.equal(sinCabecera.status, 403);
    const r = await fetch(`${base}/api/medios`, { method: 'POST', headers: { 'X-MultiChat': '1', 'X-Nombre': encodeURIComponent('animación.gif') }, body: gif });
    const info = await r.json();
    assert.equal(r.status, 200);
    assert.equal(info.tipo, 'imagen');
    const descarga = await fetch(base + info.url);
    assert.equal(descarga.headers.get('content-type'), 'image/gif');
    assert.equal(Buffer.from(await descarga.arrayBuffer()).toString(), 'GIF89a-prueba');
    assert.equal((await (await fetch(`${base}/api/medios`)).json()).length, 1);
    assert.equal((await fetch(`${base}/medios/..%2Fconfig.json`)).status, 404);
    const malo = await fetch(`${base}/api/medios`, { method: 'POST', headers: { 'X-MultiChat': '1', 'X-Nombre': 'x.html' }, body: '<script>' });
    assert.equal(malo.status, 400);
    // Sonidos de serie servidos desde la app.
    const sonido = await fetch(`${base}/sonidos/fanfarria-8bits.ogg`);
    assert.equal(sonido.status, 200);
    assert.equal(sonido.headers.get('content-type'), 'audio/ogg');
  } finally {
    app.cerrar();
    fs.rmSync(datos, { recursive: true, force: true });
  }
});
