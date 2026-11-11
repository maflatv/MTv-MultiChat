// Servidor local de MTv MultiChat. Solo escucha en este PC (127.0.0.1): OBS y el dock cargan
// http://localhost:7390 y reciben los mensajes en tiempo real por Server-Sent Events, sin pasar por Internet.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Bus } = require('./lib/bus.js');
const { Config } = require('./lib/config.js');
const { Twitch } = require('./lib/conectores/twitch.js');
const { YouTube } = require('./lib/conectores/youtube.js');
const { Conector } = require('./lib/conectores/base.js');
const kick = require('./lib/conectores/kick.js');
const twitchCuenta = require('./lib/conectores/twitch-cuenta.js');
const { mensajePrueba, PruebaAuto } = require('./lib/prueba.js');
const { Medios } = require('./lib/medios.js');
const { VERSION } = require('./lib/runtime.js');

const PUERTO = Number(process.env.PORT) || 7390;
const APP = path.join(__dirname, 'app');
const TIPOS_MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
// El modo ventana de Kick solo existe dentro de la app de escritorio, que pasa su clase en `extras`.
const soloEscritorio = plataforma => class extends Conector {
  constructor(bus, opciones) { super(bus, plataforma, opciones); }
  conectar() { this.fallo('Este modo solo funciona en la app de escritorio'); }
};

// extras (desktop/main.js): KickVentana, TikTokVentana y abrirLoginTikTok().
function crearServidor({ datos = path.join(__dirname, 'userdata'), extras = {} } = {}) {
  const bus = new Bus();
  const config = new Config(path.join(datos, 'config.json'));
  // Sonidos e imágenes propios para las alertas (userdata/medios). Los sonidos de serie van en app/sonidos.
  const medios = new Medios(path.join(datos, 'medios'));
  const conectores = {};
  const clientes = new Set();

  const enviar = (res, evento) => res.write(`data: ${JSON.stringify(evento)}\n\n`);
  const difundir = evento => { for (const c of clientes) enviar(c, evento); };
  const estadoConexiones = () => Object.values(conectores).map(c => c.estado);

  bus.on('evento', difundir);
  const pruebaAuto = new PruebaAuto(tipo => bus.mensaje(mensajePrueba(tipo)));
  // Actualizaciones (solo en la app de escritorio instalada): cada cambio de estado llega al dock.
  if (extras.actualizacion) extras.actualizacion.alCambiar = estado => difundir({ ev: 'actualizacion', ...estado });
  const info = () => ({ version: VERSION, escritorio: !!extras.ajustarVentana, actualizacion: extras.actualizacion?.estado() || null });
  bus.on('conexion', () => difundir({ ev: 'conexiones', lista: estadoConexiones() }));

  // La sesión de Kick se lee y se guarda aparte: renovar el token no debe reiniciar la conexión.
  const ctxKick = {
    sesion: () => config.datos.cuentas.kick.sesion,
    guardarSesion: sesion => config.cambiar({ cuentas: { kick: { sesion } } }),
  };
  const twitchClientId = () => config.datos.cuentas.twitch.clientId || twitchCuenta.CLIENT_ID_POR_DEFECTO;
  const ctxTwitch = {
    sesion: () => config.datos.cuentas.twitch.sesion,
    guardarSesion: sesion => config.cambiar({ cuentas: { twitch: { sesion } } }),
    clientId: twitchClientId,
  };
  const CONECTORES = {
    twitch: cuenta => new Twitch(bus, cuenta, ctxTwitch),
    youtube: cuenta => new YouTube(bus, cuenta),
    tiktok: cuenta => new (extras.TikTokVentana || soloEscritorio('tiktok'))(bus, cuenta),
    kick: cuenta => (cuenta.modo === 'ventana'
      ? new (extras.KickVentana || soloEscritorio('kick'))(bus, cuenta)
      : new kick.KickOficial(bus, { ...cuenta, puente: cuenta.puente || kick.PUENTE_POR_DEFECTO }, ctxKick)),
  };
  const sinSesion = c => JSON.stringify({ ...c, sesion: undefined, puente: c.puente || kick.PUENTE_POR_DEFECTO });

  // Arranca, para o reinicia cada conector según la configuración guardada.
  function aplicarCuentas() {
    for (const [plataforma, nuevo] of Object.entries(CONECTORES)) {
      const cuenta = config.datos.cuentas[plataforma] || {};
      const actual = conectores[plataforma];
      const igual = actual && sinSesion(actual.opciones) === sinSesion(cuenta);
      if (actual && igual && actual.activo === !!cuenta.activa) continue;
      if (actual) { actual.detener(); delete conectores[plataforma]; }
      if (cuenta.activa) { conectores[plataforma] = nuevo(cuenta); conectores[plataforma].iniciar(); }
    }
    difundir({ ev: 'conexiones', lista: estadoConexiones() });
  }

  const json = (res, codigo, cuerpo) => { res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(cuerpo)); };

  function leerCuerpo(req) {
    return new Promise((ok, mal) => {
      let s = '';
      req.on('data', c => { s += c; if (s.length > 1e6) { mal(new Error('demasiado grande')); req.destroy(); } });
      req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { mal(e); } });
    });
  }

  function leerBinario(req, maximo) {
    return new Promise((ok, mal) => {
      const trozos = [];
      let total = 0;
      req.on('data', c => { total += c.length; if (total > maximo) { mal(new Error('El archivo pesa más de 50 MB')); req.destroy(); } else trozos.push(c); });
      req.on('end', () => ok(Buffer.concat(trozos)));
      req.on('error', mal);
    });
  }

  const acciones = {
    async actualizar({ accion }) { return extras.actualizacion ? extras.actualizacion.accion(accion) : null; },
    async 'medios-borrar'({ url }) { medios.borrar(String(url || '').replace(/^\/medios\//, '')); return medios.lista(); },
    // Guardar cambios de cuentas u overlay desde el dock.
    async config(cuerpo) {
      // Los tokens solo los escribe el servidor (inicio de sesión), nunca una página.
      for (const c of Object.values(cuerpo.cuentas || {})) if (c) delete c.sesion;
      config.cambiar(cuerpo);
      if (cuerpo.cuentas) aplicarCuentas();
      if (cuerpo.overlay) difundir({ ev: 'overlay', overlay: config.datos.overlay });
      if (cuerpo.alertas) difundir({ ev: 'alertas', alertas: config.datos.alertas });
      if (cuerpo.dock) extras.ajustarVentana?.(config.datos.dock);
      return config.publica();
    },
    async 'tiktok-login'() {
      if (!extras.abrirLoginTikTok) throw new Error('Solo en la app de escritorio');
      extras.abrirLoginTikTok();
      return { ok: true };
    },
    // Inicio de sesión en Twitch por código: devuelve el código para mostrarlo y espera la confirmación aparte.
    async 'twitch-login'() {
      const clientId = twitchClientId();
      if (!clientId) throw new Error('Falta el Client ID de la aplicación de Twitch');
      const codigo = await twitchCuenta.pedirCodigo(clientId);
      const intento = {};
      loginTwitch = intento;
      twitchCuenta.esperarConfirmacion(clientId, codigo, { cancelado: () => loginTwitch !== intento }).then(async sesion => {
        const yo = (await twitchCuenta.pedir('https://api.twitch.tv/helix/users', { headers: { 'Client-Id': clientId, Authorization: `Bearer ${sesion.access_token}` } }).catch(() => null))?.cuerpo?.data?.[0] || {};
        config.cambiar({ cuentas: { twitch: { sesion: { ...sesion, user_id: yo.id || null }, usuario: yo.display_name || yo.login || '' } } });
        // Reinicia la conexión para cargar avatares, insignias, follows y canjes.
        conectores.twitch?.detener();
        delete conectores.twitch;
        aplicarCuentas();
      }).catch(e => { if (loginTwitch === intento) difundir({ ev: 'aviso', texto: `Twitch: ${e.message}` }); }).finally(() => {
        if (loginTwitch === intento) loginTwitch = null;
        difundir({ ev: 'cuentas' });
      });
      return { codigo: codigo.user_code, url: codigo.verification_uri, caduca: Number(codigo.expires_in || 1800) };
    },
    async 'twitch-cancelar'() { loginTwitch = null; return { ok: true }; },
    async 'twitch-salir'() {
      config.cambiar({ cuentas: { twitch: { sesion: null, usuario: '' } } });
      conectores.twitch?.detener();
      delete conectores.twitch;
      aplicarCuentas();
      difundir({ ev: 'cuentas' });
      return config.publica();
    },
    async 'kick-salir'() {
      config.cambiar({ cuentas: { kick: { sesion: null, usuario: '', activa: false } } });
      aplicarCuentas();
      difundir({ ev: 'cuentas' });
      return config.publica();
    },
    async destacar({ id }) { bus.destacar(id || null); return { ok: true }; },
    async ocultar({ id }) { bus.borrar({ ids: [id] }); return { ok: true }; },
    async prueba({ tipo }) { bus.mensaje(mensajePrueba(tipo)); return { ok: true }; },
    // Envío automático: mensajes cada X s y eventos cada Y s (0 = sin eventos). No se guarda: es solo para probar.
    async 'prueba-auto'({ activo, mensajes, eventos }) {
      pruebaAuto.configurar({ activo: !!activo, mensajes: Number(mensajes), eventos: Number(eventos) });
      difundir({ ev: 'prueba-auto', ...pruebaAuto.estado });
      return pruebaAuto.estado;
    },
    async reconectar({ plataforma }) { const c = conectores[plataforma]; if (c) { c.detener(); c.iniciar(); } return { ok: true }; },
  };

  // ---------- Inicio de sesión con Kick ----------
  // La app genera el PKCE; el puente solo canjea el código con el secreto de la aplicación de Kick.
  const pendientes = new Map();
  let loginTwitch = null;
  const pagina = (res, codigo, titulo, texto) => {
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    res.writeHead(codigo, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`<!doctype html><meta charset="utf-8"><title>MTv MultiChat</title><body style="font:16px system-ui;background:#121018;color:#ece8f5;display:grid;place-content:center;height:90vh;text-align:center"><h2>${esc(titulo)}</h2><p>${esc(texto)}</p>`);
  };

  async function kickLogin(res, url, req) {
    const puente = kick.limpiarPuente(config.datos.cuentas.kick.puente || kick.PUENTE_POR_DEFECTO);
    if (!puente) return pagina(res, 400, 'Falta el servidor puente', 'Indica la dirección del puente de Kick en el dock.');
    const r = await kick.pedirJson(`${puente}/config`).catch(() => null);
    if (!r?.ok || !r.cuerpo?.client_id) return pagina(res, 502, 'El servidor puente no responde', 'Comprueba su dirección o vuelve a intentarlo en un momento.');
    const { verificador, reto } = kick.nuevoPkce();
    const puerto = Number((req.headers.host || '').split(':')[1]) || PUERTO;
    const estado = `${crypto.randomBytes(16).toString('hex')}.${puerto}`;
    for (const [k, v] of pendientes) if (Date.now() - v.creado > 10 * 60_000) pendientes.delete(k);
    pendientes.set(estado, { verificador, puente, creado: Date.now() });
    res.writeHead(302, { Location: kick.urlAutorizar({ clientId: r.cuerpo.client_id, redirectUri: r.cuerpo.redirect_uri, reto, estado }) });
    res.end();
  }

  async function kickCallback(res, url) {
    const estado = url.searchParams.get('state') || '';
    const p = pendientes.get(estado);
    pendientes.delete(estado);
    if (!p) return pagina(res, 400, 'Inicio de sesión caducado', 'Vuelve a pulsar «Iniciar sesión con Kick» en el dock.');
    if (url.searchParams.get('error')) return pagina(res, 400, 'Kick canceló el inicio de sesión', url.searchParams.get('error_description') || url.searchParams.get('error'));
    const t = await kick.pedirJson(`${p.puente}/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: url.searchParams.get('code'), code_verifier: p.verificador }) }).catch(() => null);
    if (!t?.ok || !t.cuerpo?.access_token) return pagina(res, 502, 'No se pudo completar el inicio de sesión', 'El servidor puente o Kick no respondieron bien. Vuelve a intentarlo.');
    const u = await kick.pedirJson(`${kick.API}/users`, { headers: { Authorization: `Bearer ${t.cuerpo.access_token}` } }).catch(() => null);
    const yo = u?.cuerpo?.data?.[0] || {};
    config.cambiar({ cuentas: { kick: {
      modo: 'oficial', activa: true, usuario: yo.name || '',
      sesion: { access_token: t.cuerpo.access_token, refresh_token: t.cuerpo.refresh_token, expira: Date.now() + Number(t.cuerpo.expires_in || 3600) * 1000, user_id: yo.user_id ?? null },
    } } });
    aplicarCuentas();
    difundir({ ev: 'cuentas' });
    return pagina(res, 200, `Sesión iniciada${yo.name ? ` como ${yo.name}` : ''}`, 'Ya puedes cerrar esta pestaña y volver a MTv MultiChat.');
  }

  const servidor = http.createServer(async (req, res) => {
    // Protección contra webs que intenten hablar con el servidor desde el navegador (DNS rebinding):
    // solo se aceptan peticiones dirigidas a localhost.
    const host = (req.headers.host || '').replace(/:\d+$/, '');
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) { res.writeHead(403); return res.end(); }
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/api/eventos') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write('retry: 2000\n\n');
      enviar(res, { ev: 'inicio', ...bus.estado(), overlay: config.datos.overlay, alertas: config.datos.alertas, conexiones: estadoConexiones(), escritorio: !!extras.ajustarVentana, pruebaAuto: pruebaAuto.estado });
      clientes.add(res);
      const latido = setInterval(() => res.write(': latido\n\n'), 20_000);
      req.on('close', () => { clearInterval(latido); clientes.delete(res); });
      return;
    }
    if (url.pathname === '/api/config' && req.method === 'GET') return json(res, 200, config.publica());
    if (url.pathname === '/api/medios' && req.method === 'GET') return json(res, 200, medios.lista());
    if (url.pathname === '/api/info') return json(res, 200, info());
    // Subida de un archivo: el cuerpo es el archivo tal cual y el nombre va en X-Nombre.
    if (url.pathname === '/api/medios' && req.method === 'POST') {
      if (req.headers['x-multichat'] !== '1') return json(res, 403, { error: 'prohibido' });
      try {
        const datos = await leerBinario(req, 50 * 1024 * 1024 + 1);
        return json(res, 200, medios.guardar(decodeURIComponent(String(req.headers['x-nombre'] || '')), datos));
      } catch (e) { return json(res, 400, { error: e.message }); }
    }
    if (url.pathname.startsWith('/medios/')) {
      const ruta = medios.ruta(decodeURIComponent(url.pathname.slice(8)));
      if (!ruta) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': medios.mime(ruta), 'Cache-Control': 'max-age=3600' });
      return fs.createReadStream(ruta).pipe(res);
    }
    if (url.pathname === '/kick/login') return kickLogin(res, url, req);
    if (url.pathname === '/kick/callback') return kickCallback(res, url);
    if (url.pathname.startsWith('/api/') && req.method === 'POST') {
      // Una cabecera propia obliga al navegador a pedir permiso (CORS) antes de enviar desde otra web,
      // y ese permiso nunca se concede: solo el dock puede mandar órdenes.
      if (req.headers['x-multichat'] !== '1') return json(res, 403, { error: 'prohibido' });
      const accion = acciones[url.pathname.slice(5)];
      if (!accion) return json(res, 404, { error: 'no existe' });
      try { return json(res, 200, await accion(await leerCuerpo(req))); } catch (e) { return json(res, 400, { error: e.message }); }
    }

    // Archivos de la interfaz. /overlay y /dock sin extensión, para que la URL de OBS sea corta.
    const nombre = { '/': '/dock.html', '/dock': '/dock.html', '/overlay': '/overlay.html', '/alertas': '/alertas.html' }[url.pathname] || url.pathname;
    const archivo = path.normalize(path.join(APP, nombre));
    if (!archivo.startsWith(APP + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(archivo, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('No encontrado'); }
      res.writeHead(200, { 'Content-Type': TIPOS_MIME[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
  });

  return {
    bus, config, servidor,
    escuchar(puerto = PUERTO) {
      return new Promise((ok, mal) => {
        servidor.once('error', mal);
        servidor.listen(puerto, '127.0.0.1', () => { aplicarCuentas(); ok(servidor.address().port); });
      });
    },
    cerrar() {
      pruebaAuto.configurar({ activo: false });
      for (const c of Object.values(conectores)) c.detener();
      for (const c of clientes) c.end();
      servidor.close();
    },
  };
}

if (require.main === module) {
  const app = crearServidor();
  app.escuchar().then(puerto => {
    console.log(`MTv MultiChat en marcha`);
    console.log(`  Dock:    http://localhost:${puerto}/dock`);
    console.log(`  Overlay: http://localhost:${puerto}/overlay  (fuente de navegador en OBS)`);
  }).catch(e => {
    console.error(e.code === 'EADDRINUSE' ? `El puerto ${PUERTO} ya está en uso: ¿MTv MultiChat ya está abierto?` : e.message);
    process.exit(1);
  });
}

module.exports = { crearServidor };
