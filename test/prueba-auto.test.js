// Envío automático de mensajes de prueba, con reloj simulado.
const test = require('node:test');
const assert = require('node:assert');
const { PruebaAuto, EVENTOS } = require('../lib/prueba.js');

test('mensajes cada X s y eventos por turnos cada Y s; se detiene al desactivarlo', t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const enviados = [];
  const auto = new PruebaAuto(tipo => enviados.push(tipo));
  auto.configurar({ activo: true, mensajes: 2, eventos: 5 });
  assert.deepEqual(enviados, ['mensaje']);
  t.mock.timers.tick(10_000);
  assert.equal(enviados.filter(x => x === 'mensaje').length, 6);
  assert.deepEqual(enviados.filter(x => x !== 'mensaje'), EVENTOS.slice(0, 2));
  auto.configurar({ activo: false });
  const antes = enviados.length;
  t.mock.timers.tick(60_000);
  assert.equal(enviados.length, antes);
});

test('eventos a 0 = solo mensajes; intervalos fuera de rango se acotan', t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const enviados = [];
  const auto = new PruebaAuto(tipo => enviados.push(tipo));
  auto.configurar({ activo: true, mensajes: 0.01, eventos: 0 });
  assert.equal(auto.estado.mensajes, 0.5);
  assert.equal(auto.estado.eventos, 0);
  t.mock.timers.tick(5_000);
  assert.ok(enviados.every(x => x === 'mensaje'));
  assert.equal(enviados.length, 11);
  auto.configurar({ activo: false });
});
