// Pruebas del conector de Twitch con líneas IRC con el mismo formato que envía Twitch.
const test = require('node:test');
const assert = require('node:assert');
const { leerLinea, interpretar, partesConEmotes } = require('../lib/conectores/twitch.js');

const i = linea => interpretar(leerLinea(linea));

test('mensaje normal con emotes, color e insignias', () => {
  const { mensaje: m } = i('@badge-info=subscriber/14;badges=moderator/1,subscriber/12;color=#0000FF;display-name=Ana_Gamer;emotes=25:0-4,11-15;id=abc-1;mod=1;subscriber=1;tmi-sent-ts=1700000000000;user-id=111 :ana_gamer!ana_gamer@ana_gamer.tmi.twitch.tv PRIVMSG #canal :Kappa hola Kappa');
  assert.equal(m.id, 'twitch:abc-1');
  assert.equal(m.tipo, 'mensaje');
  assert.equal(m.canal, 'canal');
  assert.equal(m.autor.nombre, 'Ana_Gamer');
  assert.equal(m.autor.id, '111');
  assert.equal(m.autor.meses, 14);
  assert.deepEqual(m.autor.roles, { emisor: false, mod: true, vip: false, sub: true, miembro: false, fundador: false, verificado: false });
  // Fundador (también cuenta como suscriptor) y partner verificado.
  const f = i('@badges=founder/0,partner/1;display-name=F;id=f1 :f!f@f.tmi.twitch.tv PRIVMSG #c :hola').mensaje.autor.roles;
  assert.deepEqual([f.fundador, f.sub, f.verificado], [true, true, true]);
  assert.equal(m.texto, 'Kappa hola Kappa');
  assert.deepEqual(m.partes.map(p => p.t), ['emote', 'texto', 'emote']);
  assert.equal(m.partes[1].v, ' hola ');
  assert.match(m.partes[0].img, /emoticons\/v2\/25\//);
  assert.equal(m.fecha, 1700000000000);
});

test('emotes después de emojis: las posiciones cuentan caracteres, no UTF-16', () => {
  const p = partesConEmotes('😀 Kappa', '25:2-6');
  assert.deepEqual(p.map(x => x.v), ['😀 ', 'Kappa']);
});

test('valores con escapes IRCv3', () => {
  const l = leerLinea('@system-msg=Ana\\ssubscribed\\sfor\\s3\\smonths\\:\\sbien :tmi.twitch.tv USERNOTICE #c');
  assert.equal(l.tags['system-msg'], 'Ana subscribed for 3 months; bien');
});

test('bits = donación con importe numérico', () => {
  const { mensaje: m } = i('@badges=;bits=500;display-name=Rico;id=b1;user-id=5 :rico!rico@rico.tmi.twitch.tv PRIVMSG #c :Cheer500 toma');
  assert.equal(m.tipo, 'donacion');
  assert.deepEqual(m.importe, { valor: 500, moneda: 'BITS', usd: 5 });
});

test('/me', () => {
  const { mensaje: m } = i('@display-name=Yo;id=me1 :yo!yo@yo.tmi.twitch.tv PRIVMSG #c :\u0001ACTION saluda\u0001');
  assert.equal(m.texto, 'saluda');
});

test('resub con mensaje', () => {
  const { mensaje: m } = i('@badges=subscriber/6;display-name=Fiel;id=s1;login=fiel;msg-id=resub;msg-param-cumulative-months=6;msg-param-sub-plan=1000;system-msg=Fiel\\ssubscribed\\sat\\sTier\\s1.;user-id=9 :tmi.twitch.tv USERNOTICE #c :medio año!');
  assert.equal(m.tipo, 'suscripcion');
  assert.equal(m.cantidad, 6);
  assert.equal(m.importe.moneda, 'Nivel 1');
  assert.equal(m.texto, 'medio año!');
  assert.equal(m.titulo, 'Fiel subscribed at Tier 1.');
  assert.equal(m.autor.nombre, 'Fiel');
});

test('tanda de regalos: se muestra la tanda y no cada regalo suelto', () => {
  const tanda = i('@display-name=Generoso;id=g0;login=generoso;msg-id=submysterygift;msg-param-mass-gift-count=5;msg-param-sub-plan=1000;system-msg=Generoso\\sis\\sgifting\\s5 :tmi.twitch.tv USERNOTICE #c');
  assert.equal(tanda.mensaje.tipo, 'regalo_subs');
  assert.equal(tanda.mensaje.cantidad, 5);
  const suelto = i('@display-name=Generoso;id=g1;login=generoso;msg-id=subgift;msg-param-community-gift-id=123;msg-param-recipient-display-name=X :tmi.twitch.tv USERNOTICE #c');
  assert.equal(suelto, null);
  const directo = i('@display-name=Generoso;id=g2;login=generoso;msg-id=subgift;msg-param-recipient-display-name=X;system-msg=regalo :tmi.twitch.tv USERNOTICE #c');
  assert.equal(directo.mensaje.tipo, 'regalo_subs');
});

test('raid', () => {
  const { mensaje: m } = i('@display-name=Amigo;id=r1;login=amigo;msg-id=raid;msg-param-viewerCount=42;system-msg=42\\sraiders :tmi.twitch.tv USERNOTICE #c');
  assert.equal(m.tipo, 'raid');
  assert.equal(m.cantidad, 42);
});

test('borrados de moderación', () => {
  assert.deepEqual(i('@login=x;target-msg-id=abc :tmi.twitch.tv CLEARMSG #c :texto'), { borrar: { ids: ['twitch:abc'] } });
  assert.deepEqual(i('@ban-duration=600;target-user-id=77 :tmi.twitch.tv CLEARCHAT #c :troll'), { borrar: { plataforma: 'twitch', autorId: '77' } });
  assert.deepEqual(i(':tmi.twitch.tv CLEARCHAT #c'), { borrar: { plataforma: 'twitch', todo: true, canal: 'c' } });
});

test('lo que no es chat se ignora', () => {
  assert.equal(i(':tmi.twitch.tv 001 justinfan1 :Welcome, GLHF!'), null);
  assert.equal(i('@emote-only=0;room-id=1 :tmi.twitch.tv ROOMSTATE #c'), null);
});
