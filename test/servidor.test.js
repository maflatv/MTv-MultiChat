// Prueba de extremo a extremo del servidor: un mensaje de prueba llega por SSE, se destaca y se oculta.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { crearServidor } = require('../server.js');

function escuchar(puerto, recibidos) {
  return new Promise(ok => {
    const req = http.get({ host: '127.0.0.1', port: puerto, path: '/api/eventos', headers: { host: 'localhost' } }, res => {
      let buf = '';
      res.on('data', c => {
        buf += c;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const bloque = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const d = bloque.split('\n').find(l => l.startsWith('data: '));
          if (d) recibidos.push(JSON.parse(d.slice(6)));
        }
      });
      ok(req);
    });
  });
}

const post = (puerto, accion, cuerpo, cabeceras = { 'x-multichat': '1' }) => fetch(`http://localhost:${puerto}/api/${accion}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cabeceras }, body: JSON.stringify(cuerpo) });
const esperar = ms => new Promise(r => setTimeout(r, ms));

test('servidor: prueba, destacar, ocultar y protección', async () => {
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'mtv-'));
  const app = crearServidor({ datos });
  const puerto = await app.escuchar(0);
  const recibidos = [];
  const req = await escuchar(puerto, recibidos);
  try {
    await esperar(100);
    assert.equal(recibidos[0].ev, 'inicio');
    assert.equal(recibidos[0].overlay.tema, 'tarjetas');

    assert.equal((await post(puerto, 'prueba', { tipo: 'donacion' })).status, 200);
    await esperar(100);
    const m = recibidos.find(e => e.ev === 'mensaje').m;
    assert.equal(m.tipo, 'donacion');
    assert.equal(typeof m.importe.valor, 'number');

    await post(puerto, 'destacar', { id: m.id });
    await post(puerto, 'ocultar', { id: m.id });
    await esperar(100);
    assert.equal(recibidos.find(e => e.ev === 'destacar').m.id, m.id);
    assert.deepEqual(recibidos.find(e => e.ev === 'borrar').ids, [m.id]);
    // Al ocultar el destacado, deja de estar destacado.
    assert.equal(recibidos.filter(e => e.ev === 'destacar').at(-1).m, null);

    // Sin la cabecera propia (lo que haría otra web desde el navegador) se rechaza.
    assert.equal((await post(puerto, 'prueba', {}, {})).status, 403);
    // Peticiones con otro Host (DNS rebinding) se rechazan.
    const otroHost = await new Promise(ok => http.get({ host: '127.0.0.1', port: puerto, path: '/dock', headers: { host: 'malo.example' } }, r => ok(r.statusCode)));
    assert.equal(otroHost, 403);
    // No se puede salir de la carpeta app/.
    const fuera = await new Promise(ok => http.get({ host: '127.0.0.1', port: puerto, path: '/..%2fserver.js', headers: { host: 'localhost' } }, r => ok(r.statusCode)));
    assert.notEqual(fuera, 200);

    // Los tokens de Kick nunca salen hacia las páginas, y una página no puede escribirlos.
    app.config.cambiar({ cuentas: { kick: { sesion: { access_token: 'SECRETO', refresh_token: 'R' }, usuario: 'yo' } } });
    const publica = await (await fetch(`http://localhost:${puerto}/api/config`)).text();
    assert.ok(!publica.includes('SECRETO'));
    assert.equal(JSON.parse(publica).cuentas.kick.conSesion, true);
    await post(puerto, 'config', { cuentas: { kick: { sesion: { access_token: 'FALSO' } } } });
    assert.equal(app.config.datos.cuentas.kick.sesion.access_token, 'SECRETO');
    await post(puerto, 'kick-salir', {});
    assert.equal(app.config.datos.cuentas.kick.sesion, null);
    // Sin puente configurado, el inicio de sesión lo explica en vez de fallar.
    assert.equal((await fetch(`http://localhost:${puerto}/kick/login`, { redirect: 'manual' })).status, 400);
    // Modo ventana fuera de la app de escritorio: error claro.
    await post(puerto, 'config', { cuentas: { kick: { modo: 'ventana', canal: 'mafla', activa: true } } });
    await esperar(50);
    const conexiones = recibidos.filter(e => e.ev === 'conexiones').at(-1).lista;
    assert.deepEqual(conexiones.find(c => c.plataforma === 'kick'), { plataforma: 'kick', estado: 'error', detalle: 'Este modo solo funciona en la app de escritorio' });

    // Alertas: página propia, configuración en el inicio y aviso a las páginas al cambiarla.
    assert.equal((await fetch(`http://localhost:${puerto}/alertas`)).status, 200);
    assert.equal(recibidos[0].alertas.tipos.follow, true);
    await post(puerto, 'config', { alertas: { tipos: { follow: false }, plantillas: { follow: '¡{nombre}!' } } });
    await esperar(50);
    const alertas = recibidos.filter(e => e.ev === 'alertas').at(-1).alertas;
    assert.equal(alertas.tipos.follow, false);
    assert.equal(alertas.tipos.raid, true);
    assert.equal(alertas.plantillas.follow, '¡{nombre}!');

    // La configuración del overlay se guarda en disco.
    await post(puerto, 'config', { overlay: { tamano: 30 } });
    assert.equal(JSON.parse(fs.readFileSync(path.join(datos, 'config.json'), 'utf8')).overlay.tamano, 30);
  } finally {
    req.destroy();
    app.cerrar();
    fs.rmSync(datos, { recursive: true, force: true });
  }
});
