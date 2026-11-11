// Pruebas del conector de YouTube. Las acciones tienen la forma que devuelve get_live_chat
// (comprobada con un directo real el 11/11/2026; nombres e IDs cambiados).
const test = require('node:test');
const assert = require('node:assert');
const { interpretar, objetivo, leerChat } = require('../lib/conectores/youtube.js');
const { leerImporte } = require('../lib/moneda.js');

const foto = { thumbnails: [{ url: 'https://yt4.ggpht.com/a=s32' }, { url: 'https://yt4.ggpht.com/a=s64' }] };
const add = item => ({ addChatItemAction: { item } });

test('mensaje normal con emoji Unicode y emoji propio del canal', () => {
  const { mensaje: m } = interpretar(add({
    liveChatTextMessageRenderer: {
      id: 'ABC', timestampUsec: '1794406881804031', authorExternalChannelId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
      authorName: { simpleText: '@Luna-x1' }, authorPhoto: foto,
      message: { runs: [
        { text: 'Feliz navidad ' },
        { emoji: { emojiId: '🎄', shortcuts: [':christmas_tree:'], image: { thumbnails: [{ url: 'https://fonts.gstatic.com/x.png' }] } } },
        { emoji: { emojiId: 'UCxx/abc', shortcuts: [':hola:'], isCustomEmoji: true, image: { thumbnails: [{ url: 'https://yt3.ggpht.com/e=w24' }, { url: 'https://yt3.ggpht.com/e=w48' }] } } },
      ] },
    },
  }), 'vid');
  assert.equal(m.id, 'youtube:ABC');
  assert.equal(m.tipo, 'mensaje');
  assert.equal(m.fecha, 1794406881804);
  assert.equal(m.autor.nombre, 'Luna-x1');
  assert.equal(m.autor.avatar, 'https://yt4.ggpht.com/a=s64');
  assert.equal(m.texto, 'Feliz navidad 🎄:hola:');
  assert.deepEqual(m.partes.map(p => p.t), ['texto', 'texto', 'emote']);
  assert.equal(m.partes[2].img, 'https://yt3.ggpht.com/e=w48');
});

test('insignias: dueño, moderador y miembro con meses', () => {
  const r = (badges) => interpretar(add({ liveChatTextMessageRenderer: { id: 'x', authorName: { simpleText: 'A' }, message: { runs: [{ text: 'hola' }] }, authorBadges: badges } })).mensaje.autor;
  assert.equal(r([{ liveChatAuthorBadgeRenderer: { icon: { iconType: 'OWNER' }, tooltip: 'Owner' } }]).roles.emisor, true);
  assert.equal(r([{ liveChatAuthorBadgeRenderer: { icon: { iconType: 'MODERATOR' }, tooltip: 'Moderator' } }]).roles.mod, true);
  const miembro = r([{ liveChatAuthorBadgeRenderer: { customThumbnail: foto, tooltip: 'Member (6 months)' } }]);
  assert.equal(miembro.roles.miembro, true);
  assert.equal(miembro.meses, 6);
  assert.equal(r([{ liveChatAuthorBadgeRenderer: { customThumbnail: foto, tooltip: 'Member (2 years)' } }]).meses, 24);
  // La insignia de miembro de cada canal llega como imagen y marca el rol que cubre.
  assert.deepEqual(miembro.insignias, [{ img: 'https://yt4.ggpht.com/a=s64', tipo: 'miembro', titulo: 'Member (6 months)' }]);
  assert.equal(r([{ liveChatAuthorBadgeRenderer: { icon: { iconType: 'VERIFIED' }, tooltip: 'Verified' } }]).roles.verificado, true);
});

test('Super Chat con importe en otra moneda', () => {
  const { mensaje: m } = interpretar(add({
    liveChatPaidMessageRenderer: { id: 'SC1', authorName: { simpleText: '@Rico' }, authorPhoto: foto, purchaseAmountText: { simpleText: 'MX$100.00' }, message: { runs: [{ text: 'saludos' }] } },
  }));
  assert.equal(m.tipo, 'donacion');
  assert.equal(m.importe.valor, 100);
  assert.equal(m.importe.moneda, 'MXN');
  assert.ok(m.importe.usd > 3 && m.importe.usd < 8);
  assert.equal(m.titulo, 'Super Chat MX$100.00');
  assert.equal(m.texto, 'saludos');
});

test('Super Sticker con imagen', () => {
  const { mensaje: m } = interpretar(add({
    liveChatPaidStickerRenderer: { id: 'ST1', authorName: { simpleText: 'B' }, purchaseAmountText: { simpleText: '€2.00' }, sticker: { thumbnails: [{ url: '//lh3.googleusercontent.com/s=s40' }, { url: '//lh3.googleusercontent.com/s=s80' }] } },
  }));
  assert.equal(m.tipo, 'donacion');
  assert.deepEqual([m.importe.valor, m.importe.moneda], [2, 'EUR']);
  assert.equal(m.imagen, 'https://lh3.googleusercontent.com/s=s80');
});

test('miembro nuevo y aniversario', () => {
  const nuevo = interpretar(add({ liveChatMembershipItemRenderer: { id: 'M1', authorName: { simpleText: '@Nuevo' }, headerSubtext: { runs: [{ text: 'Welcome to ' }, { text: 'Fans' }, { text: '!' }] } } })).mensaje;
  assert.equal(nuevo.tipo, 'suscripcion');
  assert.equal(nuevo.titulo, 'Nuevo se ha hecho miembro');
  const hito = interpretar(add({ liveChatMembershipItemRenderer: { id: 'M2', authorName: { simpleText: 'Fiel' }, headerPrimaryText: { runs: [{ text: 'Member for ' }, { text: '14' }, { text: ' months' }] }, message: { runs: [{ text: 'gracias' }] } } })).mensaje;
  assert.equal(hito.cantidad, 14);
  assert.equal(hito.titulo, 'Fiel es miembro desde hace 14 meses');
  assert.equal(hito.texto, 'gracias');
});

test('membresías regaladas', () => {
  const { mensaje: m } = interpretar(add({
    liveChatSponsorshipsGiftPurchaseAnnouncementRenderer: {
      id: 'G1', authorExternalChannelId: 'UCbbbbbbbbbbbbbbbbbbbbbb',
      header: { liveChatSponsorshipsHeaderRenderer: { authorName: { simpleText: '@Generoso' }, authorPhoto: foto, primaryText: { runs: [{ text: 'Gifted ' }, { text: '5' }, { text: ' Canal memberships' }] } } },
    },
  }));
  assert.equal(m.tipo, 'regalo_subs');
  assert.equal(m.cantidad, 5);
  assert.equal(m.autor.id, 'UCbbbbbbbbbbbbbbbbbbbbbb');
  assert.equal(m.titulo, 'Generoso regala 5 membresías');
  // Cada membresía recibida no se muestra suelta.
  assert.equal(interpretar(add({ liveChatSponsorshipsGiftRedemptionAnnouncementRenderer: { id: 'G2' } })), null);
});

test('regalo de YouTube (giftMessageViewModel)', () => {
  const { mensaje: m } = interpretar(add({
    giftMessageViewModel: {
      id: 'GF1', text: { content: 'sent Star' }, authorName: { content: '@pepe ' },
      authorAvatar: { avatarViewModel: { image: { sources: [{ url: 'https://yt4.ggpht.com/p=s32' }, { url: 'https://yt4.ggpht.com/p=s64' }] } } },
      giftImage: { sources: [{ url: '//www.gstatic.com/youtube/img/pdg/gift/assets/silver_star_v2_320x320.png=w480-h480' }] },
    },
  }));
  assert.equal(m.tipo, 'donacion');
  assert.equal(m.autor.nombre, 'pepe');
  assert.equal(m.titulo, 'Regalo: Star');
  assert.match(m.imagen, /^https:\/\/www\.gstatic\.com\//);
  assert.equal(m.importe, null);
});

test('borrados y avisos del sistema', () => {
  assert.deepEqual(interpretar({ removeChatItemAction: { targetItemId: 'X1' } }), { borrar: { ids: ['youtube:X1'] } });
  assert.deepEqual(interpretar({ markChatItemAsDeletedAction: { targetItemId: 'X2' } }), { borrar: { ids: ['youtube:X2'] } });
  assert.deepEqual(interpretar({ markChatItemsByAuthorAsDeletedAction: { externalChannelId: 'UCc' } }), { borrar: { plataforma: 'youtube', autorId: 'UCc' } });
  assert.equal(interpretar(add({ liveChatViewerEngagementMessageRenderer: { id: 'S' } })), null);
  assert.equal(interpretar({ addLiveChatTickerItemAction: {} }), null);
});

test('qué escribe el usuario: canal, URL, ID o directo', () => {
  assert.deepEqual(objetivo('@MaflaTV'), { url: 'https://www.youtube.com/@MaflaTV/live' });
  assert.deepEqual(objetivo('https://www.youtube.com/@MaflaTV'), { url: 'https://www.youtube.com/@MaflaTV/live' });
  assert.deepEqual(objetivo('maflatv'), { url: 'https://www.youtube.com/@maflatv/live' });
  assert.deepEqual(objetivo('https://www.youtube.com/channel/UCSJ4gkVC6NrvII8umztf0Ow'), { url: 'https://www.youtube.com/channel/UCSJ4gkVC6NrvII8umztf0Ow/live' });
  assert.deepEqual(objetivo('https://www.youtube.com/watch?v=4t4AQ15yj1M'), { video: '4t4AQ15yj1M' });
  assert.deepEqual(objetivo('https://youtu.be/4t4AQ15yj1M'), { video: '4t4AQ15yj1M' });
  assert.deepEqual(objetivo('https://www.youtube.com/live/4t4AQ15yj1M?si=x'), { video: '4t4AQ15yj1M' });
  assert.equal(objetivo(''), null);
});

test('se elige el "Chat en vivo" completo y no el "Top chat"', () => {
  const datos = { contents: { liveChatRenderer: {
    continuations: [{ invalidationContinuationData: { continuation: 'TOP' } }],
    header: { liveChatHeaderRenderer: { viewSelector: { sortFilterSubMenuRenderer: { subMenuItems: [
      { title: 'Top chat', continuation: { reloadContinuationData: { continuation: 'TOP' } } },
      { title: 'Live chat', continuation: { reloadContinuationData: { continuation: 'TODOS' } } },
    ] } } } },
  } } };
  const html = `<script>window["ytInitialData"] = ${JSON.stringify(datos)};</script>"INNERTUBE_CONTEXT_CLIENT_VERSION":"2.1"`;
  assert.deepEqual(leerChat(html), { continuacion: 'TODOS', version: '2.1' });
  assert.equal(leerChat('<html>sin chat</html>'), null);
});

test('importes en formatos de distintos países', () => {
  const v = t => { const i = leerImporte(t); return [i.valor, i.moneda]; };
  assert.deepEqual(v('$5.00'), [5, 'USD']);
  assert.deepEqual(v('CA$10.00'), [10, 'CAD']);
  assert.deepEqual(v('€2,00'), [2, 'EUR']);
  assert.deepEqual(v('1.000,50 €'), [1000.5, 'EUR']);
  assert.deepEqual(v('ARS 2,000.00'), [2000, 'ARS']);
  assert.deepEqual(v('CLP 1.000'), [1000, 'CLP']);
  assert.deepEqual(v('COP 10,000'), [10000, 'COP']);
  assert.deepEqual(v('¥500'), [500, 'JPY']);
  assert.deepEqual(v('R$ 25,90'), [25.9, 'BRL']);
  assert.deepEqual(v('PEN 20.00'), [20, 'PEN']);
  assert.equal(leerImporte('$5.00').usd, 5);
  assert.equal(leerImporte('nada'), null);
});
