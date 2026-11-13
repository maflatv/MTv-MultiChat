// Lectura en voz alta: qué se lee, cómo se limpia el texto y a qué página se manda.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { crear } = require('../lib/mensaje.js');
const { fraseParaLeer, limpiar, nombreLegible } = require('../lib/voz.js');
const { POR_DEFECTO } = require('../lib/config.js');
const { crearServidor } = require('../server.js');

const voz = cambios => ({ ...POR_DEFECTO.voz, activa: true, ...cambios });
const chat = (texto, extra = {}) => crear({ id: `t:${Math.random()}`, plataforma: 'twitch', tipo: 'mensaje', autor: { id: '1', nombre: 'Luna_Pixel', roles: extra.roles || {} }, partes: extra.partes, texto: extra.partes ? undefined : texto });

test('chat: con nombre, sin nombre, en inglés, y desactivado', () => {
  assert.equal(fraseParaLeer(chat('hola a todos'), voz()), 'Luna Pixel dice: hola a todos');
  assert.equal(fraseParaLeer(chat('hola'), voz({ leerNombre: false })), 'hola');
  assert.equal(fraseParaLeer(chat('hi'), voz(), { idioma: 'en' }), 'Luna Pixel says: hi');
  assert.equal(fraseParaLeer(chat('hola'), voz({ activa: false })), null);
  assert.equal(fraseParaLeer(chat('hola'), voz({ mensajes: false })), null);
});

test('chat: filtros de comandos, bots, ignorados, emisor y roles', () => {
  assert.equal(fraseParaLeer(chat('!discord'), voz()), null);
  assert.equal(fraseParaLeer(chat('!discord'), voz({ saltarComandos: false, leerNombre: false })), '!discord');
  const bot = crear({ id: 'b', plataforma: 'twitch', tipo: 'mensaje', autor: { nombre: 'Nightbot' }, texto: 'Sígueme' });
  assert.equal(fraseParaLeer(bot, voz(), { overlay: { bots: 'nightbot, moobot' } }), null);
  assert.equal(fraseParaLeer(chat('hola'), voz({ ignorar: 'otro, luna_pixel' })), null);
  assert.equal(fraseParaLeer(chat('hola', { roles: { emisor: true } }), voz()), null);
  assert.equal(fraseParaLeer(chat('hola'), voz({ quienes: 'subs' })), null);
  assert.ok(fraseParaLeer(chat('hola', { roles: { sub: true } }), voz({ quienes: 'subs' })));
  assert.equal(fraseParaLeer(chat('hola', { roles: { sub: true } }), voz({ quienes: 'mods' })), null);
  assert.ok(fraseParaLeer(chat('hola', { roles: { mod: true } }), voz({ quienes: 'mods' })));
});

test('limpieza: emotes fuera, enlaces, repeticiones y corte en una palabra', () => {
  const v = voz();
  const conEmotes = chat(null, { partes: [{ t: 'texto', v: 'qué risa ' }, { t: 'emote', v: 'KEKW', img: 'x' }, { t: 'texto', v: ' de verdad' }] });
  assert.equal(limpiar(conEmotes, v, 'es'), 'qué risa de verdad');
  // Solo emotes: no se lee nada.
  assert.equal(fraseParaLeer(chat(null, { partes: [{ t: 'emote', v: 'KEKW', img: 'x' }] }), v), null);
  assert.equal(limpiar(chat('mira https://ejemplo.com/x ya'), v, 'es'), 'mira enlace ya');
  assert.equal(limpiar(chat('look www.ejemplo.com now'), v, 'en'), 'look link now');
  assert.equal(limpiar(chat('mira https://ejemplo.com ya'), voz({ enlaces: 'quitar' }), 'es'), 'mira ya');
  assert.equal(limpiar(chat('jajajajajajaja nooooooo'), v, 'es'), 'jajaja nooo');
  const largo = limpiar(chat('palabra '.repeat(40)), voz({ maxLetras: 50 }), 'es');
  assert.ok(largo.length <= 50 && largo.endsWith('palabra'));
  assert.equal(nombreLegible('xX_Nebula_Xx'), 'Nebula');
});

test('eventos: por tipo, mínimo de donación y mensaje que acompaña', () => {
  const don = usd => crear({ id: `d${usd}`, plataforma: 'youtube', tipo: 'donacion', autor: { nombre: 'Pepe' }, titulo: `${usd} USD`, texto: '¡Sigue así!', importe: { valor: usd, moneda: 'USD', usd } });
  assert.equal(fraseParaLeer(don(5), voz()), 'Pepe dona 5 USD. ¡Sigue así!');
  assert.equal(fraseParaLeer(don(5), voz({ leerMensajeEventos: false })), 'Pepe dona 5 USD');
  assert.equal(fraseParaLeer(don(5), voz(), { idioma: 'en' }), 'Pepe donated 5 USD. ¡Sigue así!');
  assert.equal(fraseParaLeer(don(2), voz({ minimoUsd: 3 })), null);
  assert.ok(fraseParaLeer(don(3), voz({ minimoUsd: 3 })));
  const follow = crear({ id: 'f', plataforma: 'twitch', tipo: 'follow', autor: { nombre: 'Ana' }, titulo: 'Ana te sigue' });
  assert.equal(fraseParaLeer(follow, voz()), null); // los follows vienen desactivados
  assert.equal(fraseParaLeer(follow, voz({ eventos: { ...POR_DEFECTO.voz.eventos, follow: true } })), 'Ana te sigue');
  assert.equal(fraseParaLeer(follow, voz({ eventos: { ...POR_DEFECTO.voz.eventos, follow: true } }), { idioma: 'en' }), 'Ana followed you');
  const regalo = crear({ id: 'g', plataforma: 'tiktok', tipo: 'donacion', autor: { nombre: 'Kiwi' }, titulo: 'Rosa · 5 monedas', importe: { valor: 5, moneda: 'COINS', usd: 0.07 } });
  assert.equal(fraseParaLeer(regalo, voz({ leerMensajeEventos: false })), 'Kiwi dona Rosa, 5 monedas');
});

// Escucha /api/eventos y devuelve los eventos recibidos.
function escuchar(puerto, ruta, agente) {
  const recibidos = [];
  return new Promise(ok => {
    const req = http.get({ host: '127.0.0.1', port: puerto, path: ruta, headers: { host: 'localhost', 'user-agent': agente } }, res => {
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
      ok({ req, recibidos });
    });
  });
}
const esperar = ms => new Promise(r => setTimeout(r, ms));

test('servidor: la frase va a una sola página lectora, y antes a la app de escritorio', async () => {
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'mtv-voz-'));
  const app = crearServidor({ datos });
  const puerto = await app.escuchar(0);
  const overlay = await escuchar(puerto, '/api/eventos', 'OBS');
  const navegador = await escuchar(puerto, '/api/eventos?lector=1', 'Mozilla/5.0 Chrome/130');
  const escritorio = await escuchar(puerto, '/api/eventos?lector=1', 'Mozilla/5.0 Chrome/130 Electron/33.0.0');
  try {
    await esperar(100);
    assert.equal(overlay.recibidos[0].voz.activa, false);
    app.config.cambiar({ voz: { activa: true } });
    app.bus.mensaje(chat('hola'));
    await esperar(100);
    const decir = l => l.recibidos.filter(e => e.ev === 'decir');
    assert.equal(decir(escritorio).length, 1);
    assert.equal(decir(escritorio)[0].texto, 'Luna Pixel dice: hola');
    assert.equal(decir(navegador).length, 0);
    assert.equal(decir(overlay).length, 0);
    // Sin la app de escritorio, lee el dock del navegador.
    escritorio.req.destroy();
    await esperar(100);
    app.bus.mensaje(chat('otra vez'));
    await esperar(100);
    assert.equal(decir(navegador).length, 1);
  } finally {
    overlay.req.destroy();
    navegador.req.destroy();
    app.cerrar();
    fs.rmSync(datos, { recursive: true, force: true });
  }
});
