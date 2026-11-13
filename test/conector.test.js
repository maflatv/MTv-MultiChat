// Comportamiento común de los conectores: marca de hueco tras un corte y aviso de datos que no se entienden.
const test = require('node:test');
const assert = require('node:assert');
const { Bus } = require('../lib/bus.js');
const { Conector } = require('../lib/conectores/base.js');

// Conector de mentira: conectar() no hace nada, la prueba decide qué pasa.
class Falso extends Conector {
  constructor(bus) { super(bus, 'tiktok'); }
  conectar() {}
}

function preparar() {
  const bus = new Bus();
  const huecos = [];
  const estados = [];
  bus.on('evento', e => { if (e.ev === 'hueco') huecos.push(e); });
  bus.on('conexion', e => estados.push({ ...e }));
  const c = new Falso(bus);
  c.iniciar();
  return { c, huecos, estados };
}

test('un corte de una conexión que funcionaba deja una marca de hueco al volver', () => {
  const { c, huecos } = preparar();
  try {
    c.cambiar('conectado', '@luna');
    c.caida('Conexión cerrada');
    c.cambiar('conectando'); // un reintento pasa por "conectando": el hueco sigue abierto
    assert.equal(huecos.length, 0);
    c.cambiar('conectado', '@luna');
    assert.equal(huecos.length, 1);
    assert.equal(huecos[0].plataforma, 'tiktok');
    assert.ok(huecos[0].hasta >= huecos[0].desde);
    // Solo una vez por corte.
    c.cambiar('conectado', '@luna · 50 espectadores');
    assert.equal(huecos.length, 1);
  } finally { c.detener(); }
});

test('sin hueco si no estaba conectado, si el directo terminó o si se desactiva', () => {
  const { c, huecos } = preparar();
  try {
    // Falla antes de conectar nunca: no se perdió nada.
    c.caida('No carga');
    c.cambiar('conectado');
    // Corte y luego "esperando directo" (el directo terminó): tampoco.
    c.caida('Sin respuesta');
    c.cambiar('esperando', 'Sin directo');
    c.cambiar('conectado');
    assert.equal(huecos.length, 0);
  } finally { c.detener(); }
});

test('muchas tramas seguidas sin entender → estado "revisar"; una entendida lo quita', () => {
  const { c, estados } = preparar();
  try {
    c.cambiar('conectado', '@luna');
    for (let i = 0; i < 24; i++) c.formato(false);
    assert.equal(c.estado.estado, 'conectado');
    c.formato(true); // una buena reinicia la cuenta
    for (let i = 0; i < 24; i++) c.formato(false);
    assert.equal(c.estado.estado, 'conectado');
    c.formato(false);
    assert.equal(c.estado.estado, 'revisar');
    assert.match(c.estado.detalle, /^TikTok envía datos que MTv MultiChat no entiende/);
    // El conector sigue actualizando su detalle normal: el aviso no se pierde, pero el detalle se guarda.
    c.cambiar('conectado', '@luna · 80 espectadores');
    assert.equal(c.estado.estado, 'revisar');
    c.formato(true);
    assert.deepEqual([c.estado.estado, c.estado.detalle], ['conectado', '@luna · 80 espectadores']);
    assert.ok(estados.some(e => e.estado === 'revisar'));
  } finally { c.detener(); }
});

test('un corte durante "revisar" también deja hueco y olvida el aviso', () => {
  const { c, huecos } = preparar();
  try {
    c.cambiar('conectado', '@luna');
    c.avisarFormato();
    c.caida('Sin respuesta');
    assert.equal(c.estado.estado, 'reconectando');
    c.cambiar('conectado', '@luna');
    assert.equal(c.estado.estado, 'conectado');
    assert.equal(huecos.length, 1);
  } finally { c.detener(); }
});
