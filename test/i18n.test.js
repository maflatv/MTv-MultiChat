// Interfaz en inglés: diccionario, patrones con datos y cobertura de las opciones del editor.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const I18N = require('../app/i18n.js');
const en = t => I18N.traducir(t, 'en');

test('textos y patrones con datos', () => {
  assert.equal(en('Conectar'), 'Connect');
  assert.equal(en('  Copiar  '), '  Copy  ');
  assert.equal(en('LunaPixel te sigue'), 'LunaPixel followed you');
  assert.equal(en('Pepe regala 1 suscripción'), 'Pepe gifted 1 sub');
  assert.equal(en('Raid de Ana con 42 espectadores'), 'Raid from Ana with 42 viewers');
  assert.equal(en('Nombre de canal no válido. Reintento en 8 s'), 'Invalid channel name. Retrying in 8 s');
  assert.equal(en('Hay una versión nueva: 1.2.0.'), 'A new version is available: 1.2.0.');
  // En español no cambia nada, y lo desconocido (lo que escribe un espectador) tampoco.
  assert.equal(I18N.traducir('Conectar', 'es'), 'Conectar');
  assert.equal(en('hola, ¿qué tal?'), 'hola, ¿qué tal?');
});

test('idioma automático: el del sistema; español solo si el sistema está en español', () => {
  assert.equal(I18N.resolver('auto', 'es-CO'), 'es');
  assert.equal(I18N.resolver('auto', 'es'), 'es');
  assert.equal(I18N.resolver('auto', 'en-US'), 'en');
  assert.equal(I18N.resolver('auto', 'fr-FR'), 'en');
  assert.equal(I18N.resolver('es', 'en-US'), 'es');
  assert.equal(I18N.resolver('en', 'es-ES'), 'en');
});

test('cada opción del editor y de las cuentas tiene traducción', () => {
  const dock = fs.readFileSync(path.join(__dirname, '..', 'app', 'dock.js'), 'utf8');
  const textos = new Set();
  for (const m of dock.matchAll(/\bt: '([^']+)'/g)) textos.add(m[1]);
  for (const m of dock.matchAll(/titulo: '([^']+)'/g)) textos.add(m[1]);
  for (const m of dock.matchAll(/\['[\w-]+', '([^']+)'\]/g)) textos.add(m[1]);
  for (const m of dock.matchAll(/ayuda: '([^']+)'/g)) textos.add(m[1]);
  // Nombres propios que no se traducen.
  const iguales = new Set(['Twitch', 'YouTube', 'TikTok', 'Kick', 'GitHub', 'Instagram', 'Ko-fi', 'Chat', 'Raid', 'Raids', 'Follow', 'Follows', 'Normal', 'Minimal', 'Zoom', 'Pizzicato 1', 'Pizzicato 2', 'Pep', 'Gong', 'Español', 'English', 'Streamer']);
  // Los identificadores internos (en minúsculas y con guiones) no son texto visible.
  const faltan = [...textos].filter(t => !iguales.has(t) && !/^[a-z]+(-[a-z]+)*$/.test(t) && en(t) === t);
  assert.deepEqual(faltan, []);
});
