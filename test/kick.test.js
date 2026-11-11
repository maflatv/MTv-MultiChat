// Pruebas de Kick: eventos de la API oficial (formato de docs.kick.com), eventos de la web (Pusher),
// inicio de sesión, renovación del token y el servidor puente (firma de webhooks y redirecciones).
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const path = require('path');
const { pathToFileURL } = require('url');
const kick = require('../lib/conectores/kick.js');
const { Bus } = require('../lib/bus.js');

const usuario = (id, nombre, extra = {}) => ({ is_anonymous: false, user_id: id, username: nombre, is_verified: false, profile_picture: `https://files.kick.com/images/${id}.webp`, channel_slug: nombre.toLowerCase(), identity: null, ...extra });
const emisor = usuario(1, 'Mafla');

test('oficial: mensaje con emotes, color e insignias', () => {
  const { mensaje: m } = kick.interpretarOficial({ id: 'EV1', tipo: 'chat.message.sent', datos: {
    message_id: 'MSG1', broadcaster: emisor, created_at: '2026-11-11T20:00:00Z',
    sender: usuario(7, 'Luna', { identity: { username_color: '#FF00FF', badges: [{ text: 'Moderator', type: 'moderator' }, { text: 'Subscriber', type: 'subscriber', count: 4 }] } }),
    content: 'hola [emote:37226:KEKW] qué tal',
  } });
  assert.equal(m.id, 'kick:MSG1');
  assert.equal(m.canal, 'mafla');
  assert.equal(m.autor.nombre, 'Luna');
  assert.equal(m.autor.color, '#FF00FF');
  assert.equal(m.autor.roles.mod, true);
  assert.equal(m.autor.roles.sub, true);
  assert.equal(m.autor.meses, 4);
  const otros = kick.interpretarOficial({ id: 'E2', tipo: 'chat.message.sent', datos: { message_id: 'M2', broadcaster: emisor, sender: usuario(8, 'Vieja', { identity: { badges: [{ type: 'og' }, { type: 'founder' }, { type: 'verified' }, { type: 'sub_gifter', count: 5 }] } }), content: 'x' } }).mensaje.autor.roles;
  assert.deepEqual([otros.og, otros.fundador, otros.verificado, otros.regalador, otros.vip], [true, true, true, true, false]);
  assert.equal(m.fecha, Date.parse('2026-11-11T20:00:00Z'));
  assert.deepEqual(m.partes, [{ t: 'texto', v: 'hola ' }, { t: 'emote', v: 'KEKW', img: 'https://files.kick.com/emotes/37226/fullsize' }, { t: 'texto', v: ' qué tal' }]);
});

test('oficial: follow, subs, regalos, KICKs, canjes, baneos y directo', () => {
  const i = (tipo, datos) => kick.interpretarOficial({ id: 'E', tipo, datos: { broadcaster: emisor, ...datos } });
  assert.equal(i('channel.followed', { follower: usuario(2, 'Nuevo') }).mensaje.tipo, 'follow');
  const nueva = i('channel.subscription.new', { subscriber: usuario(3, 'Sub'), duration: 1 }).mensaje;
  assert.deepEqual([nueva.tipo, nueva.titulo], ['suscripcion', 'Sub se ha suscrito']);
  assert.equal(i('channel.subscription.renewal', { subscriber: usuario(3, 'Sub'), duration: 5 }).mensaje.titulo, 'Sub renueva: 5 meses');
  const regalo = i('channel.subscription.gifts', { gifter: usuario(4, 'Generoso'), giftees: [usuario(5, 'a'), usuario(6, 'b')] }).mensaje;
  assert.deepEqual([regalo.tipo, regalo.cantidad, regalo.titulo], ['regalo_subs', 2, 'Generoso regala 2 suscripciones']);
  const anonimo = i('channel.subscription.gifts', { gifter: { is_anonymous: true, user_id: null, username: null }, giftees: [usuario(5, 'a')] }).mensaje;
  assert.equal(anonimo.titulo, 'Alguien anónimo regala 1 suscripción');
  const kicks = i('kicks.gifted', { sender: usuario(8, 'Rico'), gift: { amount: 500, name: 'Rage Quit', type: 'LEVEL_UP', tier: 'MID', message: 'toma', pinned_time_seconds: 60 }, created_at: '2026-11-11T20:00:00Z' }).mensaje;
  assert.equal(kicks.tipo, 'donacion');
  assert.deepEqual(kicks.importe, { valor: 500, moneda: 'KICKS', usd: 5 });
  assert.equal(kicks.titulo, '500 KICKs · Rage Quit');
  assert.equal(kicks.texto, 'toma');
  const canje = i('channel.reward.redemption.updated', { id: 'R1', status: 'pending', user_input: 'di hola', reward: { title: 'Saludo' }, redeemer: { user_id: 9, username: 'Pepe' } }).mensaje;
  assert.equal(canje.titulo, 'Pepe canjea «Saludo»');
  assert.equal(i('channel.reward.redemption.updated', { id: 'R1', status: 'accepted', reward: {}, redeemer: {} }), null);
  assert.deepEqual(i('moderation.banned', { moderator: usuario(1, 'Mafla'), banned_user: usuario(66, 'Troll'), metadata: {} }), { borrar: { plataforma: 'kick', autorId: '66' } });
  assert.deepEqual(i('livestream.status.updated', { is_live: true, title: 'Isaac', started_at: 'x', ended_at: null }), { directo: { activo: true, titulo: 'Isaac' } });
  assert.equal(i('evento.desconocido', {}), null);
});

test('ventana: mensajes de la conexión de chat de la web de Kick', () => {
  const { mensaje: m } = kick.interpretarPusher('App\\Events\\ChatMessageEvent', {
    id: 'abc-123', chatroom_id: 668, content: 'buenas [emote:1:wave]', type: 'message', created_at: '2026-11-11T20:00:00+00:00',
    sender: { id: 77, username: 'Luna', slug: 'luna', identity: { color: '#00FF00', badges: [{ type: 'vip', text: 'VIP' }] } },
  }, 'mafla');
  assert.equal(m.id, 'kick:abc-123');
  assert.equal(m.autor.id, '77');
  assert.equal(m.autor.roles.vip, true);
  assert.equal(m.partes[1].t, 'emote');
  assert.deepEqual(kick.interpretarPusher('App\\Events\\MessageDeletedEvent', { id: 'x', message: { id: 'abc-123' } }), { borrar: { ids: ['kick:abc-123'] } });
  assert.deepEqual(kick.interpretarPusher('App\\Events\\UserBannedEvent', { user: { id: 66, username: 'Troll' } }), { borrar: { plataforma: 'kick', autorId: '66' } });
  assert.equal(kick.interpretarPusher('App\\Events\\SubscriptionEvent', { chatroom_id: 1, username: 'Fiel', months: 3 }).mensaje.titulo, 'Fiel renueva: 3 meses');
  assert.equal(kick.interpretarPusher('App\\Events\\GiftedSubscriptionsEvent', { gifted_usernames: ['a', 'b', 'c'], gifter_username: 'Generoso' }).mensaje.cantidad, 3);
  const raid = kick.interpretarPusher('App\\Events\\StreamHostEvent', { host_username: 'Amigo', number_viewers: 40 }).mensaje;
  assert.deepEqual([raid.tipo, raid.cantidad], ['raid', 40]);
  assert.equal(kick.interpretarPusher('pusher:pong', {}), null);
  assert.equal(kick.interpretarPusher('App\\Events\\ChatMessageEvent', null), null);
});

test('PKCE y URL de inicio de sesión', () => {
  const { verificador, reto } = kick.nuevoPkce();
  assert.equal(reto, crypto.createHash('sha256').update(verificador).digest('base64url'));
  assert.ok(verificador.length >= 43);
  const u = new URL(kick.urlAutorizar({ clientId: 'CID', redirectUri: 'https://p.example/callback', reto, estado: 'abc.7390' }));
  assert.equal(u.origin + u.pathname, 'https://id.kick.com/oauth/authorize');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('state'), 'abc.7390');
  assert.match(u.searchParams.get('scope'), /events:subscribe/);
});

test('conector oficial: renueva el token caducado y se suscribe solo a lo que falta', async () => {
  const llamadas = [];
  const fetchOriginal = global.fetch;
  global.fetch = async (url, op = {}) => {
    llamadas.push([op.method || 'GET', String(url), op.body ? JSON.parse(op.body) : null, op.headers?.Authorization]);
    const r = cuerpo => ({ ok: true, status: 200, text: async () => JSON.stringify(cuerpo) });
    if (String(url).endsWith('/refresh')) return r({ access_token: 'NUEVO', refresh_token: 'R2', expires_in: 3600 });
    if (String(url).endsWith('/events/subscriptions') && !op.method) return r({ data: [{ event: 'chat.message.sent' }, { event: 'channel.followed' }] });
    return r({ data: [] });
  };
  try {
    let sesion = { access_token: 'VIEJO', refresh_token: 'R1', expira: Date.now() - 1000 };
    const c = new kick.KickOficial(new Bus(), { puente: 'https://p.example' }, { sesion: () => sesion, guardarSesion: s => { sesion = s; } });
    const token = await c.token('https://p.example');
    assert.equal(token, 'NUEVO');
    assert.equal(sesion.refresh_token, 'R2');
    assert.ok(sesion.expira > Date.now());
    await c.suscribir(token);
    const post = llamadas.find(l => l[0] === 'POST' && l[1].endsWith('/events/subscriptions'));
    assert.equal(post[3], 'Bearer NUEVO');
    const pedidos = post[2].events.map(e => e.name);
    assert.ok(!pedidos.includes('chat.message.sent') && !pedidos.includes('channel.followed'));
    assert.ok(pedidos.includes('kicks.gifted'));
    assert.equal(post[2].method, 'webhook');
  } finally { global.fetch = fetchOriginal; }
});

// ---------- Servidor puente ----------

const cargarPuente = () => import(pathToFileURL(path.join(__dirname, '..', 'puente-kick', 'src', 'index.js')).href);

test('puente: firma de webhooks (RSA PKCS#1 v1.5 + SHA-256)', async () => {
  const { firmaValida } = await cargarPuente();
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const der = Uint8Array.from(Buffer.from(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64'));
  const clave = await crypto.webcrypto.subtle.importKey('spki', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const id = '01HXYZ';
  const fecha = '2026-11-11T20:00:00Z';
  const cuerpo = '{"message_id":"1"}';
  const firma = crypto.sign('sha256', Buffer.from(`${id}.${fecha}.${cuerpo}`), privateKey).toString('base64');
  assert.equal(await firmaValida(clave, { id, fecha, cuerpo, firma }), true);
  assert.equal(await firmaValida(clave, { id, fecha, cuerpo: cuerpo + ' ', firma }), false);
  assert.equal(await firmaValida(clave, { id: 'otro', fecha, cuerpo, firma }), false);
  assert.equal(await firmaValida(clave, { id, fecha, cuerpo, firma: '' }), false);
});

test('puente: configuración y vuelta del inicio de sesión solo hacia localhost', async () => {
  const { default: worker } = await cargarPuente();
  const env = { KICK_CLIENT_ID: 'CID', KICK_CLIENT_SECRET: 'SECRETO' };
  const cfg = await (await worker.fetch(new Request('https://puente.example/config'), env)).json();
  assert.deepEqual(cfg, { client_id: 'CID', redirect_uri: 'https://puente.example/callback' });
  assert.ok(!JSON.stringify(cfg).includes('SECRETO'));
  const r = await worker.fetch(new Request('https://puente.example/callback?code=C1&state=abc.7390'), env);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('Location'), 'http://localhost:7390/kick/callback?code=C1&state=abc.7390');
  assert.equal((await worker.fetch(new Request('https://puente.example/callback?code=C1&state=abc.80'), env)).status, 400);
  assert.equal((await worker.fetch(new Request('https://puente.example/callback?code=C1&state=abc'), env)).status, 400);
  // Webhook sin firma: rechazado (con fecha vieja ni siquiera consulta la clave de Kick).
  const w = await worker.fetch(new Request('https://puente.example/webhook', { method: 'POST', body: '{}', headers: { 'Kick-Event-Message-Timestamp': '2020-01-01T00:00:00Z' } }), env);
  assert.equal(w.status, 401);
});
