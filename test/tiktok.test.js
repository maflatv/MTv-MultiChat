// Pruebas del decodificador de TikTok. Las tramas se construyen con un codificador protobuf mínimo,
// siguiendo los números de campo del esquema (comprobar con un directo real en la app de escritorio).
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('zlib');
const tiktok = require('../lib/conectores/tiktok.js');

// ---------- Codificador mínimo ----------
const varint = n => { let v = BigInt(n); const o = []; do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; o.push(b); } while (v); return Buffer.from(o); };
const campo = (n, valor) => {
  if (typeof valor === 'number' || typeof valor === 'bigint') return Buffer.concat([varint((n << 3) | 0), varint(valor)]);
  const b = Buffer.isBuffer(valor) ? valor : Buffer.from(String(valor), 'utf8');
  return Buffer.concat([varint((n << 3) | 2), varint(b.length), b]);
};
const msg = (...campos) => Buffer.concat(campos);

const eventoBase = (id, fecha, tipoVisual = '') => campo(1, msg(campo(2, BigInt(id)), campo(4, fecha), tipoVisual ? campo(8, msg(campo(1, tipoVisual))) : Buffer.alloc(0)));
const usuarioPb = (id, nick, unico, escenas = []) => msg(
  campo(1, BigInt(id)), campo(3, nick), campo(9, msg(campo(1, 'https://p16.tiktokcdn.com/avatar.webp'))), campo(38, unico),
  ...escenas.map(e => campo(64, msg(campo(3, e), campo(20, msg(campo(1, 1), campo(2, msg(campo(1, 'https://p16.tiktokcdn.com/fan.png')))))))),
);
const envoltorio = (tipo, datos) => msg(campo(1, tipo), campo(2, datos));
const respuesta = (...mensajes) => msg(...mensajes.map(m => campo(1, m)), campo(2, 'cursor'));
const trama = (resp, gzip = true) => msg(campo(2, 123n), campo(7, 'msg'), campo(8, gzip ? zlib.gzipSync(resp) : resp));

test('trama del WebSocket comprimida con gzip → mensaje de chat con emote', () => {
  const chat = msg(
    eventoBase('7300000000000000001', 1794407000000),
    campo(2, usuarioPb('6800000000000000001', 'Luna 🌙', 'luna_x', [1, 4])),
    campo(3, 'hola  qué tal'),
    campo(13, msg(campo(1, 5), campo(2, msg(campo(1, 'e1'), campo(2, msg(campo(1, 'https://p16.tiktokcdn.com/emote.png'))))))),
  );
  const lista = tiktok.mensajesDeTrama(trama(respuesta(envoltorio('WebcastChatMessage', chat))));
  assert.equal(lista.length, 1);
  assert.equal(lista[0].tipo, 'WebcastChatMessage');
  const { mensaje: m } = tiktok.interpretar(lista[0].tipo, lista[0].datos, 'luna');
  assert.equal(m.id, 'tiktok:7300000000000000001');
  assert.equal(m.plataforma, 'tiktok');
  assert.equal(m.fecha, 1794407000000);
  assert.equal(m.autor.id, '6800000000000000001');
  assert.equal(m.autor.nombre, 'Luna 🌙');
  assert.equal(m.autor.avatar, 'https://p16.tiktokcdn.com/avatar.webp');
  assert.equal(m.autor.roles.mod, true);
  assert.equal(m.autor.roles.sub, true);
  assert.deepEqual(m.autor.insignias, [{ img: 'https://p16.tiktokcdn.com/fan.png', tipo: null, titulo: '' }]);
  assert.deepEqual(m.partes.map(p => p.t), ['texto', 'emote', 'texto']);
  assert.equal(m.partes[0].v, 'hola ');
  assert.equal(m.texto, 'hola  qué tal');
});

test('tramas sin comprimir y tramas que no son mensajes', () => {
  const chat = msg(eventoBase(1, 1), campo(2, usuarioPb(2, 'A', 'a')), campo(3, 'x'));
  assert.equal(tiktok.mensajesDeTrama(trama(respuesta(envoltorio('WebcastChatMessage', chat)), false)).length, 1);
  assert.deepEqual(tiktok.mensajesDeTrama(msg(campo(2, 1n), campo(7, 'hb'))), []);
  assert.throws(() => tiktok.leer(Buffer.from([0x0a, 0x05, 0x01])));
});

test('regalos: los de racha solo cuentan al terminar, con monedas e imagen', () => {
  const regalo = (fin, tipoRegalo, repeticiones) => msg(
    eventoBase(fin ? 11 : 10, 1), campo(2, 5655), campo(5, repeticiones), campo(7, usuarioPb(3, 'Rico', 'rico')), campo(9, fin ? 1 : 0),
    campo(15, msg(campo(1, msg(campo(1, 'https://p16.tiktokcdn.com/rosa.png'))), campo(11, tipoRegalo), campo(12, 1), campo(16, 'Rose'))),
  );
  assert.equal(tiktok.interpretar('WebcastGiftMessage', regalo(false, 1, 3)), null);
  const { mensaje: m } = tiktok.interpretar('WebcastGiftMessage', regalo(true, 1, 10));
  assert.equal(m.tipo, 'donacion');
  assert.equal(m.titulo, 'Rose ×10');
  assert.deepEqual(m.importe, { valor: 10, moneda: 'MONEDAS', usd: 0.13 });
  assert.equal(m.imagen, 'https://p16.tiktokcdn.com/rosa.png');
  // Un regalo que no es de racha cuenta aunque no lleve fin.
  assert.equal(tiktok.interpretar('WebcastGiftMessage', regalo(false, 2, 1)).mensaje.titulo, 'Rose');
});

test('follow (y compartir se ignora), suscripción y espectadores', () => {
  const social = tv => msg(eventoBase(20, 1, tv), campo(2, usuarioPb(4, 'Fan', 'fan')));
  const f = tiktok.interpretar('WebcastSocialMessage', social('pm_main_follow_message_viewer_2')).mensaje;
  assert.deepEqual([f.tipo, f.titulo], ['follow', 'Fan te sigue']);
  assert.equal(tiktok.interpretar('WebcastSocialMessage', social('pm_mt_guidance_share')), null);
  const s = tiktok.interpretar('WebcastSubNotifyMessage', msg(eventoBase(21, 1), campo(2, usuarioPb(5, 'Fiel', 'fiel')), campo(4, 3))).mensaje;
  assert.deepEqual([s.tipo, s.cantidad, s.titulo], ['suscripcion', 3, 'Fiel renueva: 3 meses']);
  assert.deepEqual(tiktok.interpretar('WebcastRoomUserSeqMessage', msg(campo(3, 1234))), { espectadores: 1234 });
  assert.equal(tiktok.interpretar('WebcastMemberMessage', msg(eventoBase(22, 1))), null);
  assert.equal(tiktok.interpretar('WebcastLikeMessage', msg(eventoBase(23, 1))), null);
});
