// Dibujado de mensajes (app/comun.js) con un DOM mínimo: colores de nombre, insignias por plataforma y logotipos.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

class Nodo {
  constructor(tag) { this.tag = tag; this.hijos = []; this.attrs = {}; this.className = ''; this.dataset = {}; this.textContent = ''; this.style = { setProperty: (k, v) => { this.style[k] = v; } }; }
  append(...n) { for (const h of n) { if (h && typeof h === 'object') h.padre = this; } this.hijos.push(...n); }
  prepend(...n) { for (const h of n) { if (h && typeof h === 'object') h.padre = this; } this.hijos.unshift(...n); }
  replaceWith(n) { const i = this.padre.hijos.indexOf(this); this.padre.hijos[i] = n; n.padre = this.padre; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  remove() {}
  buscar(f) { return [f(this) ? [this] : [], ...this.hijos.map(h => (h.buscar ? h.buscar(f) : []))].flat(); }
}
global.window = {};
global.document = { createElement: t => new Nodo(t), createElementNS: (_ns, t) => new Nodo(t), createTextNode: t => ({ texto: t }), querySelector: () => null, head: new Nodo('head') };
global.EventSource = class {};
require(path.join(__dirname, '..', 'app', 'comun.js'));
const MC = global.window.MC;

const mensaje = (plataforma, autor) => ({ id: 'x', plataforma, tipo: 'mensaje', autor: { nombre: 'Ana', roles: {}, insignias: [], ...autor }, partes: [{ t: 'texto', v: 'hola' }] });
const colorNombre = (m, op) => MC.dibujarMensaje(m, op).buscar(n => n.className === 'nombre')[0].style.color;

test('color de los nombres: del usuario, de la plataforma o fijo', () => {
  const m = mensaje('twitch', { color: '#FF69B4' });
  assert.equal(colorNombre(m, {}), '#FF69B4');
  assert.equal(colorNombre(m, { colorNombre: 'plataforma' }), '#9146FF');
  assert.equal(colorNombre(m, { colorNombre: 'fijo', nombreFijo: '#00ff00' }), '#00ff00');
});

test('nombres legibles: se aclaran sobre fondo oscuro y se oscurecen sobre fondo claro', () => {
  const oscuro = mensaje('twitch', { color: '#000080' });
  const claroSobreOscuro = colorNombre(oscuro, {});
  assert.notEqual(claroSobreOscuro, '#000080');
  assert.ok(MC.luminancia(claroSobreOscuro) >= 0.4);
  assert.equal(colorNombre(oscuro, { fondoClaro: true }), '#000080');
  const amarillo = mensaje('twitch', { color: '#FFFF66' });
  assert.ok(MC.luminancia(colorNombre(amarillo, { fondoClaro: true })) <= 0.5);
});

test('cada plataforma muestra solo sus insignias, y la imagen sustituye a la propia', () => {
  const contar = m => MC.dibujarMensaje(m, {}).buscar(n => /\binsignia\b/.test(n.attrs.class || n.className)).length;
  assert.equal(contar(mensaje('youtube', { roles: { mod: true, vip: true, og: true } })), 1);
  assert.equal(contar(mensaje('kick', { roles: { mod: true, vip: true, og: true } })), 3);
  assert.equal(contar(mensaje('youtube', { roles: { miembro: true }, insignias: [{ img: 'https://y/m.png', tipo: 'miembro' }] })), 1);
  // Fundador ya implica suscriptor: no se repite la estrella.
  assert.equal(contar(mensaje('twitch', { roles: { fundador: true, sub: true } })), 1);
});

test('logotipo de la plataforma en sus tres estilos', () => {
  for (const estilo of ['color', 'insignia', 'blanco']) {
    const plat = MC.dibujarMensaje(mensaje('kick', {}), { iconoEstilo: estilo }).buscar(n => /\bplat\b/.test(n.className))[0];
    assert.match(plat.className, new RegExp(`plat-${estilo}`));
    assert.ok(plat.buscar(n => n.tag === 'path' && (n.attrs.d || '').length > 50).length === 1);
  }
});

test('rgb() para fondos con transparencia', () => {
  assert.equal(MC.rgb('#100e18'), '16, 14, 24');
  assert.equal(MC.rgb('rojo'), null);
});

test('longitud de un mensaje para los límites: emojis como una letra y cada emote como un carácter', () => {
  assert.equal(MC.largoMensaje({ partes: [{ t: 'texto', v: 'hola 😀' }] }), 6);
  assert.equal(MC.largoMensaje({ partes: [{ t: 'texto', v: 'jaja ' }, { t: 'emote', v: 'catJAM', img: 'https://x' }, { t: 'emote', v: 'KEKW', img: 'https://y' }] }), 7);
  assert.equal(MC.largoMensaje({ partes: [] }), 0);
});

test('temas de color: cada usuario recibe siempre el mismo color, y se reparten', () => {
  const m = id => ({ plataforma: 'youtube', autor: { id } });
  assert.equal(MC.colorDeTema(m('UC1'), 'vivos'), MC.colorDeTema(m('UC1'), 'vivos'));
  const usados = new Set(Array.from({ length: 40 }, (_, i) => MC.colorDeTema(m(`UC${i}`), 'vivos')));
  assert.ok(usados.size >= 6);
  for (const c of usados) assert.ok(MC.TEMAS_NOMBRES.vivos.colores.includes(c));
  // Sin ID, por nombre (sin distinguir mayúsculas).
  assert.equal(MC.colorDeTema({ plataforma: 'tiktok', autor: { nombre: 'Ana' } }), MC.colorDeTema({ plataforma: 'tiktok', autor: { nombre: 'ana' } }));
});

test('modo tema: todos con el tema; modo usuario: el suyo y, si no tiene, el del tema', () => {
  const conColor = mensaje('twitch', { id: '7', color: '#FF69B4' });
  const sinColor = mensaje('youtube', { id: 'UC9' });
  assert.equal(colorNombre(conColor, { colorNombre: 'tema', temaNombres: 'neon' }), MC.colorDeTema(conColor, 'neon'));
  assert.equal(colorNombre(conColor, { colorNombre: 'usuario', temaNombres: 'neon' }), '#FF69B4');
  assert.equal(colorNombre(sinColor, { colorNombre: 'usuario', temaNombres: 'pastel' }), MC.colorDeTema(sinColor, 'pastel'));
});

test('emotes superpuestos: se dibujan en una pila sobre el anterior', () => {
  const m = { ...mensaje('twitch', {}), partes: [{ t: 'emote', v: 'KEKW', img: 'https://a' }, { t: 'emote', v: 'RainTime', img: 'https://b', encima: true }, { t: 'texto', v: ' jaja' }] };
  const pilas = MC.dibujarMensaje(m, {}).buscar(n => n.className === 'apilado');
  assert.equal(pilas.length, 1);
  assert.deepEqual(pilas[0].hijos.map(h => h.className), ['emote', 'emote encima']);
});

test('temas de nombres: muchos colores, sin repetidos ni demasiado parecidos', () => {
  const dist = (a, b) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const [x, y] = [p(a), p(b)]; return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
  const temas = Object.entries(MC.TEMAS_NOMBRES);
  assert.ok(temas.length >= 17);
  for (const [id, t] of temas) {
    assert.ok(t.colores.length >= 15, id);
    assert.equal(new Set(t.colores).size, t.colores.length, id);
    for (let i = 0; i < t.colores.length; i++) for (let j = i + 1; j < t.colores.length; j++) {
      assert.ok(dist(t.colores[i], t.colores[j]) >= 25, `${id}: ${t.colores[i]} y ${t.colores[j]} se parecen demasiado`);
    }
  }
});

test('colocar el chat dentro de la fuente: tamaño, anclaje y margen', () => {
  const caja = { style: {} };
  MC.colocar(caja, { ancho: 400, alto: 900, anclaje: 'abajo-izquierda', margen: 30 });
  assert.deepEqual([caja.style.width, caja.style.height, caja.style.left, caja.style.bottom, caja.style.top, caja.style.transform], ['400px', '900px', '30px', '30px', '', '']);
  MC.colocar(caja, { ancho: 1100, alto: 260, anclaje: 'abajo-centro', margen: 20 });
  assert.deepEqual([caja.style.left, caja.style.transform, caja.style.bottom], ['50%', 'translateX(-50%)', '20px']);
  MC.colocar(caja, { ancho: 480, alto: 520, anclaje: 'arriba-derecha', margen: 10 });
  assert.deepEqual([caja.style.right, caja.style.top, caja.style.left, caja.style.bottom], ['10px', '10px', '', '']);
  // 0 = toda la fuente (sin margen en ese eje).
  MC.colocar(caja, { ancho: 0, alto: 0, anclaje: 'centro-centro', margen: 50 });
  assert.deepEqual([caja.style.left, caja.style.right, caja.style.top, caja.style.bottom, caja.style.width, caja.style.transform], ['0', '0', '0', '0', '', '']);
});
