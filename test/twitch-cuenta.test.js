// Emotes de 7TV/BTTV/FFZ y cuenta de Twitch (inicio de sesión por código, avatares, insignias, EventSub).
const test = require('node:test');
const assert = require('node:assert');
const { aplicar, EmotesCanal, cargar } = require('../lib/emotes.js');
const cuenta = require('../lib/conectores/twitch-cuenta.js');

const conFetch = async (respuestas, fn) => {
  const original = global.fetch;
  const llamadas = [];
  global.fetch = async (url, op = {}) => {
    llamadas.push({ url: String(url), op });
    const r = respuestas(String(url), op, llamadas.length);
    return { ok: r.estado < 400, status: r.estado, text: async () => JSON.stringify(r.cuerpo) };
  };
  try { return await fn(llamadas); } finally { global.fetch = original; }
};

test('emotes de terceros: solo palabras exactas y sin tocar los emotes de Twitch', () => {
  const mapa = new Map([['KEKW', 'https://cdn.7tv.app/emote/1/2x.webp'], ['catJAM', 'https://cdn.betterttv.net/emote/2/2x']]);
  const partes = aplicar([{ t: 'texto', v: 'jaja KEKW  KEKWait catJAM' }, { t: 'emote', v: 'Kappa', img: 'https://x/k' }, { t: 'texto', v: ' KEKW' }], mapa);
  assert.deepEqual(partes.map(p => [p.t, p.v]), [
    ['texto', 'jaja '], ['emote', 'KEKW'], ['texto', '  KEKWait '], ['emote', 'catJAM'], ['emote', 'Kappa'], ['texto', ' '], ['emote', 'KEKW'],
  ]);
  assert.deepEqual(aplicar([{ t: 'texto', v: 'hola' }], new Map()), [{ t: 'texto', v: 'hola' }]);
});

test('emotes de terceros: se cargan una vez por canal', async () => {
  let cargas = 0;
  const e = new EmotesCanal('twitch', async () => { cargas++; return new Map([['GAMBA', 'https://cdn.7tv.app/emote/g/2x.webp']]); });
  await e.preparar('123');
  await e.preparar('123');
  assert.equal(cargas, 1);
  assert.equal(e.aplicar([{ t: 'texto', v: 'GAMBA' }])[0].t, 'emote');
});

test('inicio de sesión por código: espera la confirmación y devuelve la sesión', async () => {
  await conFetch((url, op, n) => {
    if (url.endsWith('/oauth2/device')) return { estado: 200, cuerpo: { device_code: 'D', user_code: 'ABCD1234', verification_uri: 'https://www.twitch.tv/activate?public=true&device-code=ABCD1234', expires_in: 1800, interval: 5 } };
    // Las dos primeras consultas: aún sin confirmar.
    if (n <= 3) return { estado: 400, cuerpo: { status: 400, message: 'authorization_pending' } };
    return { estado: 200, cuerpo: { access_token: 'AT', refresh_token: 'RT', expires_in: 14400, scope: cuenta.ALCANCES, token_type: 'bearer' } };
  }, async llamadas => {
    const codigo = await cuenta.pedirCodigo('CID');
    assert.equal(codigo.user_code, 'ABCD1234');
    const cuerpo = new URLSearchParams(llamadas[0].op.body);
    assert.equal(cuerpo.get('client_id'), 'CID');
    assert.match(cuerpo.get('scopes'), /moderator:read:followers/);
    const sesion = await cuenta.esperarConfirmacion('CID', codigo, { dormir: async () => {} });
    assert.equal(sesion.access_token, 'AT');
    assert.equal(sesion.refresh_token, 'RT');
    assert.ok(sesion.expira > Date.now() + 3 * 3600_000);
    const ultima = new URLSearchParams(llamadas.at(-1).op.body);
    assert.equal(ultima.get('grant_type'), 'urn:ietf:params:oauth:grant-type:device_code');
    assert.equal(ultima.get('client_secret'), null);
  });
});

test('inicio de sesión por código: código rechazado o cancelado', async () => {
  await conFetch(() => ({ estado: 400, cuerpo: { status: 400, message: 'invalid device code' } }), async () => {
    await assert.rejects(cuenta.esperarConfirmacion('CID', { device_code: 'D', expires_in: 60, interval: 1 }, { dormir: async () => {} }), /invalid device code/);
    await assert.rejects(cuenta.esperarConfirmacion('CID', { device_code: 'D', expires_in: 60, interval: 1 }, { dormir: async () => {}, cancelado: () => true }), /Cancelado/);
  });
});

test('renovar sin client_secret; un refresh token caducado devuelve null', async () => {
  await conFetch(() => ({ estado: 200, cuerpo: { access_token: 'AT2', refresh_token: 'RT2', expires_in: 14400 } }), async llamadas => {
    const s = await cuenta.renovar('CID', { access_token: 'AT', refresh_token: 'RT', expira: 0, user_id: '9' });
    assert.deepEqual([s.access_token, s.refresh_token, s.user_id], ['AT2', 'RT2', '9']);
    const cuerpo = new URLSearchParams(llamadas[0].op.body);
    assert.deepEqual([cuerpo.get('grant_type'), cuerpo.get('refresh_token'), cuerpo.get('client_secret')], ['refresh_token', 'RT', null]);
  });
  await conFetch(() => ({ estado: 400, cuerpo: { status: 400, message: 'Invalid refresh token' } }), async () => {
    assert.equal(await cuenta.renovar('CID', { refresh_token: 'X' }), null);
  });
});

test('avatares por lotes con caché', async () => {
  await conFetch(url => ({ estado: 200, cuerpo: { data: new URL(url).searchParams.getAll('id').map(id => ({ id, profile_image_url: `https://static-cdn.jtvnw.net/${id}.png` })) } }), async llamadas => {
    const helix = new cuenta.Helix(() => 'CID', () => 'AT');
    const a = new cuenta.Avatares(helix);
    const [x, y] = await Promise.all([a.obtener('1'), a.obtener('2')]);
    assert.deepEqual([x, y], ['https://static-cdn.jtvnw.net/1.png', 'https://static-cdn.jtvnw.net/2.png']);
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].op.headers['Client-Id'], 'CID');
    assert.equal(llamadas[0].op.headers.Authorization, 'Bearer AT');
    await a.obtener('1');
    assert.equal(llamadas.length, 1);
  });
});

test('insignias oficiales a partir de la etiqueta del chat', async () => {
  await conFetch(url => ({ estado: 200, cuerpo: { data: url.includes('global')
    ? [{ set_id: 'moderator', versions: [{ id: '1', image_url_1x: 'https://b/mod1', image_url_2x: 'https://b/mod2', title: 'Moderator' }] }]
    : [{ set_id: 'subscriber', versions: [{ id: '12', image_url_2x: 'https://b/sub12', title: '1-Year Subscriber' }] }] } }), async () => {
    const ins = new cuenta.Insignias(new cuenta.Helix(() => 'CID', () => 'AT'));
    await ins.cargar('55');
    assert.deepEqual(ins.de('moderator/1,subscriber/12,vip/1'), [{ img: 'https://b/mod2', titulo: 'Moderator', tipo: 'mod' }, { img: 'https://b/sub12', titulo: '1-Year Subscriber', tipo: 'sub' }]);
    assert.deepEqual(ins.de(''), []);
  });
});

test('EventSub: follow y canje de puntos', () => {
  const f = cuenta.interpretarEventSub('channel.follow', { user_id: '7', user_login: 'nuevo', user_name: 'Nuevo', broadcaster_user_login: 'mafla', followed_at: '2026-11-11T20:00:00Z' }, 'M1');
  assert.deepEqual([f.tipo, f.titulo, f.autor.id, f.id], ['follow', 'Nuevo te sigue', '7', 'twitch:follow:M1']);
  const c = cuenta.interpretarEventSub('channel.channel_points_custom_reward_redemption.add', { id: 'R1', user_id: '8', user_name: 'Pepe', user_input: 'hola', reward: { title: 'Hidratarse', cost: 500 }, broadcaster_user_login: 'mafla', redeemed_at: '2026-11-11T20:00:00Z' }, 'M2');
  assert.deepEqual([c.tipo, c.titulo, c.texto], ['aviso', 'Pepe canjea «Hidratarse» (500 puntos)', 'hola']);
  assert.equal(cuenta.interpretarEventSub('channel.ban', {}, 'M3'), null);
});

test('emotes superpuestos: se apilan solo justo detrás de otro emote', () => {
  const mapa = new Map([['KEKW', { img: 'https://k' }], ['RainTime', { img: 'https://r', encima: true }]]);
  assert.deepEqual(aplicar([{ t: 'texto', v: 'KEKW RainTime' }], mapa).map(p => [p.v, !!p.encima]), [['KEKW', false], ['RainTime', true]]);
  // Sin emote delante, se muestra como uno normal.
  assert.deepEqual(aplicar([{ t: 'texto', v: 'hola RainTime' }], mapa).map(p => [p.t, p.v, !!p.encima]), [['texto', 'hola ', false], ['emote', 'RainTime', false]]);
});

test('emotes por plataforma: cada una pide sus servicios', async () => {
  await conFetch(() => ({ estado: 404, cuerpo: {} }), async llamadas => {
    await cargar('youtube', 'UCabc');
    const yt = llamadas.map(l => l.url);
    assert.ok(yt.some(u => u.includes('betterttv.net/3/cached/users/youtube/UCabc')));
    assert.ok(yt.some(u => u.includes('7tv.io/v3/emote-sets/global')));
    assert.ok(!yt.some(u => u.includes('frankerfacez')));
    llamadas.length = 0;
    await cargar('kick', '123');
    assert.deepEqual(llamadas.map(l => l.url).sort(), ['https://7tv.io/v3/emote-sets/global', 'https://7tv.io/v3/users/kick/123']);
    llamadas.length = 0;
    assert.equal((await cargar('tiktok', 'x')).size, 0);
    assert.equal(llamadas.length, 0);
  });
});
