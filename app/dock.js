// Dock: conexiones, chat unificado y editor visual del overlay.
/* global MC, document, window, navigator */
(() => {
  const $ = id => document.getElementById(id);
  const feed = $('feed');
  let config = null;
  let conexiones = [];
  const filtro = { tipo: 'todo', plataformas: new Set(), texto: '' };
  const LIMITE_FEED = 500;

  // ---------- Plataformas ----------

  const CUENTAS = [
    { id: 'twitch', cuentaTwitch: true, campo: 'canal', etiqueta: 'Canal', ejemplo: 'nombre_del_canal', limpiar: v => v.replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '').replace(/[/?#].*$/, '') },
    { id: 'youtube', campo: 'canal', etiqueta: 'Canal o enlace del directo', ejemplo: '@tucanal', ayuda: 'Pon tu canal: se conectará solo cada vez que empieces un directo.' },
    { id: 'tiktok', campo: 'canal', etiqueta: 'Usuario de TikTok', ejemplo: '@tuusuario', limpiar: v => v.replace(/^https?:\/\/(www\.)?tiktok\.com\//i, '').replace(/[/?#].*$/, '').replace(/^@/, ''), ayuda: 'Solo en la app de escritorio. Pon tu usuario: se conectará solo al empezar el directo.', login: true },
    { id: 'kick', campo: 'canal', etiqueta: 'Canal', ejemplo: 'nombre_del_canal', limpiar: v => v.replace(/^https?:\/\/(www\.)?kick\.com\//i, '').replace(/[/?#].*$/, ''), modos: true },
  ];
  const TEXTO_ESTADO = { parado: 'Desactivado', conectando: 'Conectando…', conectado: 'Conectado', reconectando: 'Reconectando', esperando: 'Esperando directo', error: 'Error' };

  const guardarCuenta = async (id, cambios) => { config = await MC.orden('config', { cuentas: { [id]: cambios } }); dibujarCuentas(); };

  // Campo + botón Conectar/Desconectar.
  function formularioCanal(c, cuenta) {
    const form = MC.el('form', 'cuenta-form');
    const input = MC.el('input');
    input.value = cuenta[c.campo] || '';
    input.placeholder = c.ejemplo;
    input.setAttribute('aria-label', c.etiqueta);
    const boton = MC.el('button', cuenta.activa ? 'secundario' : 'principal', cuenta.activa ? 'Desconectar' : 'Conectar');
    form.append(input, boton);
    form.onsubmit = ev => {
      ev.preventDefault();
      const valor = c.limpiar ? c.limpiar(input.value.trim()) : input.value.trim();
      const activar = !cuenta.activa || valor !== cuenta[c.campo];
      if (activar && !valor) return input.focus();
      guardarCuenta(c.id, { [c.campo]: valor, activa: activar });
    };
    return form;
  }

  // Kick: con la cuenta del streamer (API oficial) o sin cuenta (ventana, solo app de escritorio).
  function cuerpoKick(c, cuenta, tarjeta) {
    const modos = MC.el('div', 'segmentos modos');
    for (const [valor, texto] of [['oficial', 'Con mi cuenta'], ['ventana', 'Sin cuenta']]) {
      const b = MC.el('button', cuenta.modo === valor ? 'activo' : null, texto);
      b.type = 'button';
      b.onclick = () => { if (cuenta.modo !== valor) guardarCuenta('kick', { modo: valor, activa: false }); };
      modos.append(b);
    }
    tarjeta.append(modos);

    if (cuenta.modo === 'ventana') {
      tarjeta.append(formularioCanal(c, cuenta));
      return 'Solo en la app de escritorio: abre el chat de Kick en una ventana oculta. Trae chat, subs, regalos y raids (sin follows).';
    }
    if (!cuenta.puenteListo) {
      tarjeta.append(MC.el('p', 'detalle', 'Falta la dirección del servidor puente de Kick.'));
    } else if (!cuenta.conSesion) {
      const b = MC.el('button', 'principal ancho', 'Iniciar sesión con Kick');
      b.onclick = () => window.open('/kick/login', '_blank');
      tarjeta.append(b);
    } else {
      const fila = MC.el('div', 'cuenta-form');
      fila.append(MC.el('span', 'usuario', `@${cuenta.usuario || 'kick'}`));
      const b = MC.el('button', cuenta.activa ? 'secundario' : 'principal', cuenta.activa ? 'Desconectar' : 'Conectar');
      b.onclick = () => guardarCuenta('kick', { activa: !cuenta.activa });
      fila.append(b);
      tarjeta.append(fila);
      const salir = MC.el('button', 'enlace', 'Cerrar sesión');
      salir.onclick = async () => { config = await MC.orden('kick-salir'); dibujarCuentas(); };
      tarjeta.append(salir);
    }
    // Dirección del puente: solo hace falta si no viene configurada en la app.
    const avanzado = MC.el('details', 'avanzado');
    if (!cuenta.puenteListo) avanzado.open = true;
    avanzado.append(MC.el('summary', null, 'Servidor puente'));
    const f = MC.el('form', 'cuenta-form');
    const input = MC.el('input');
    input.value = cuenta.puente || '';
    input.placeholder = 'https://…workers.dev';
    input.setAttribute('aria-label', 'Dirección del servidor puente de Kick');
    f.append(input, MC.el('button', null, 'Guardar'));
    f.onsubmit = ev => { ev.preventDefault(); guardarCuenta('kick', { puente: input.value.trim().replace(/\/+$/, ''), activa: false }); };
    avanzado.append(f);
    tarjeta.append(avanzado);
    return cuenta.conSesion ? '' : 'Inicia sesión una vez: trae chat, follows, subs, regalos, KICKs y canjes.';
  }

  // Cuenta de Twitch opcional: inicio de sesión por código (twitch.tv/activate).
  let codigoTwitch = null;
  function cuerpoTwitch(cuenta, tarjeta) {
    const caja = MC.el('div', 'sesion-twitch');
    if (cuenta.conSesion) {
      caja.append(MC.el('span', 'usuario', `Sesión: @${cuenta.usuario || 'twitch'}`));
      const salir = MC.el('button', 'enlace', 'Cerrar sesión');
      salir.onclick = async () => { config = await MC.orden('twitch-salir'); dibujarCuentas(); };
      caja.append(salir);
    } else if (codigoTwitch) {
      caja.append(MC.el('p', 'detalle', 'Abre twitch.tv/activate e introduce este código:'));
      const codigo = MC.el('div', 'codigo', codigoTwitch.codigo);
      caja.append(codigo);
      const abrir = MC.el('a', 'boton principal ancho', 'Abrir twitch.tv/activate');
      abrir.href = codigoTwitch.url;
      abrir.target = '_blank';
      abrir.rel = 'noopener';
      const cancelar = MC.el('button', 'enlace', 'Cancelar');
      cancelar.onclick = () => { codigoTwitch = null; MC.orden('twitch-cancelar'); dibujarCuentas(); };
      caja.append(abrir, cancelar);
    } else if (cuenta.clientIdListo) {
      const b = MC.el('button', 'enlace', 'Iniciar sesión en Twitch (follows, canjes, avatares)');
      b.onclick = async () => {
        try { codigoTwitch = await MC.orden('twitch-login'); } catch (e) { alert(MC.t(e.message)); }
        dibujarCuentas();
      };
      caja.append(b);
    }
    if (!cuenta.conSesion) {
      const avanzado = MC.el('details', 'avanzado');
      avanzado.append(MC.el('summary', null, 'Client ID de Twitch'));
      const f = MC.el('form', 'cuenta-form');
      const input = MC.el('input');
      input.value = cuenta.clientId || '';
      input.placeholder = 'Client ID (aplicación pública)';
      input.setAttribute('aria-label', 'Client ID de la aplicación de Twitch');
      f.append(input, MC.el('button', null, 'Guardar'));
      f.onsubmit = ev => { ev.preventDefault(); guardarCuenta('twitch', { clientId: input.value.trim() }); };
      avanzado.append(f);
      caja.append(avanzado);
    }
    tarjeta.append(caja);
  }

  function dibujarCuentas() {
    const lista = $('lista-cuentas');
    lista.replaceChildren();
    for (const c of CUENTAS) {
      const p = MC.PLATAFORMAS[c.id];
      const tarjeta = MC.el('div', 'cuenta');
      const cab = MC.el('div', 'cuenta-cab');
      cab.append(MC.iconoPlataforma(c.id), MC.el('strong', null, p.nombre));
      tarjeta.append(cab);
      if (c.pronto) {
        cab.append(MC.el('span', 'estado pronto', 'Próximamente'));
        tarjeta.classList.add('inactiva');
        lista.append(tarjeta);
        continue;
      }
      const cuenta = config.cuentas[c.id];
      const est = conexiones.find(x => x.plataforma === c.id) || { estado: 'parado' };
      const estado = MC.el('span', `estado e-${est.estado}`, TEXTO_ESTADO[est.estado] || est.estado);
      if (est.detalle) estado.title = est.detalle;
      cab.append(estado);

      let ayuda = c.ayuda;
      if (c.modos) ayuda = cuerpoKick(c, cuenta, tarjeta);
      else tarjeta.append(formularioCanal(c, cuenta));
      if (c.cuentaTwitch) cuerpoTwitch(cuenta, tarjeta);
      if (c.login) {
        // Algunos directos solo se ven con sesión iniciada: abre TikTok en una ventana de la app.
        const b = MC.el('button', 'enlace', 'Iniciar sesión en TikTok (opcional)');
        b.onclick = () => MC.orden('tiktok-login').catch(e => alert(MC.t(e.message)));
        tarjeta.append(b);
      }
      if (est.detalle && est.estado !== 'parado') tarjeta.append(MC.el('p', 'detalle', est.detalle));
      else if (!cuenta.activa && ayuda) tarjeta.append(MC.el('p', 'detalle', ayuda));
      lista.append(tarjeta);
    }
    dibujarFiltrosPlataforma();
  }

  // ---------- Chat ----------

  function pasaFiltro(m) {
    if (filtro.tipo === 'eventos' && m.tipo === 'mensaje') return false;
    if (filtro.plataformas.size && !filtro.plataformas.has(m.plataforma)) return false;
    if (filtro.texto && !`${m.autor.nombre} ${m.texto} ${m.titulo}`.toLowerCase().includes(filtro.texto)) return false;
    return true;
  }

  const abajoDelTodo = () => feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;

  function anadir(m, { animar = true } = {}) {
    const seguir = abajoDelTodo();
    const ov = config?.overlay || {};
    // En el dock (fondo oscuro) un color fijo o de plataforma se mantiene; el resto, con el tema elegido.
    const nodo = MC.dibujarMensaje(m, { colorNombre: ov.colorNombre, temaNombres: ov.temaNombres, nombreFijo: ov.nombreFijo });
    nodo._m = m;
    const hora = MC.el('time', 'hora', new Date(m.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    nodo.prepend(hora);
    const acciones = MC.el('div', 'acciones');
    const b1 = MC.el('button', 'con-icono');
    b1.append(MC.el('i', 'ico ico-destacar'));
    b1.title = 'Destacar en el overlay';
    b1.onclick = () => MC.orden('destacar', { id: nodo.classList.contains('es-destacado') ? null : m.id });
    const b2 = MC.el('button', 'con-icono');
    b2.append(MC.el('i', 'ico ico-limpiar-chat'));
    b2.title = 'Quitar del overlay';
    b2.onclick = () => MC.orden('ocultar', { id: m.id });
    acciones.append(b1, b2);
    nodo.append(acciones);
    if (animar) nodo.classList.add('nuevo');
    // Clic en un mensaje cortado: se despliega entero (otro clic lo vuelve a plegar). Los botones no cuentan.
    nodo.addEventListener('click', e => {
      if (e.target.closest('button, a') || !(nodo.classList.contains('cortado') || nodo.classList.contains('expandido'))) return;
      nodo.classList.toggle('expandido');
      if (!nodo.classList.contains('expandido')) marcarCortado(nodo);
      else nodo.classList.remove('cortado');
    });
    requestAnimationFrame(() => marcarCortado(nodo));
    nodo.hidden = !pasaFiltro(m);
    feed.append(nodo);
    while (feed.children.length > LIMITE_FEED) feed.firstChild.remove();
    $('vacio').hidden = true;
    if (seguir) feed.scrollTop = feed.scrollHeight;
    else if (!nodo.hidden) $('nuevos').hidden = false;
  }

  function refiltrar() {
    for (const n of feed.children) n.hidden = !pasaFiltro(n._m);
    feed.scrollTop = feed.scrollHeight;
  }

  function dibujarFiltrosPlataforma() {
    const caja = $('filtros-plataforma');
    caja.replaceChildren();
    for (const id of ['twitch', 'youtube', 'tiktok', 'kick']) {
      const b = MC.el('button', `filtro plat-filtro${filtro.plataformas.has(id) ? ' activo' : ''}`);
      b.append(MC.iconoPlataforma(id));
      b.title = `Solo ${MC.PLATAFORMAS[id].nombre}`;
      b.onclick = () => {
        if (filtro.plataformas.has(id)) filtro.plataformas.delete(id); else filtro.plataformas.add(id);
        dibujarFiltrosPlataforma();
        refiltrar();
      };
      caja.append(b);
    }
  }

  for (const b of document.querySelectorAll('[data-filtro]')) {
    b.onclick = () => {
      filtro.tipo = b.dataset.filtro;
      document.querySelectorAll('[data-filtro]').forEach(x => x.classList.toggle('activo', x === b));
      refiltrar();
    };
  }
  $('buscar').oninput = e => { filtro.texto = e.target.value.trim().toLowerCase(); refiltrar(); };
  feed.onscroll = () => { if (abajoDelTodo()) $('nuevos').hidden = true; };
  $('nuevos').onclick = () => { feed.scrollTop = feed.scrollHeight; $('nuevos').hidden = true; };
  for (const b of document.querySelectorAll('[data-prueba]')) b.onclick = () => MC.orden('prueba', { tipo: b.dataset.prueba });

  // Envío automático de pruebas (lo hace el servidor, así sigue aunque se cierre el dock).
  const enviarAuto = () => MC.orden('prueba-auto', { activo: $('auto-activo').checked, mensajes: Number($('auto-mensajes').value), eventos: Number($('auto-eventos').value) });
  $('auto-activo').onchange = enviarAuto;
  for (const id of ['auto-mensajes', 'auto-eventos']) $(id).onchange = () => { if ($('auto-activo').checked) enviarAuto(); };
  function mostrarAuto(e) {
    $('auto-activo').checked = !!e.activo;
    $('auto-mensajes').value = e.mensajes;
    $('auto-eventos').value = e.eventos;
    document.querySelector('.prueba-auto').classList.toggle('en-marcha', !!e.activo);
  }

  function marcarOcultos(ids) {
    for (const id of ids) feed.querySelectorAll(`.msg[data-id="${CSS.escape(id)}"]`).forEach(n => n.classList.add('oculto'));
  }
  function marcarDestacado(m) {
    feed.querySelectorAll('.es-destacado').forEach(n => n.classList.remove('es-destacado'));
    if (m) feed.querySelectorAll(`.msg[data-id="${CSS.escape(m.id)}"]`).forEach(n => n.classList.add('es-destacado'));
  }

  // ---------- Editor de overlays (pestañas Chat y Alertas) ----------

  const FUENTES = ['Segoe UI', 'Arial', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Consolas', 'Impact', 'Comic Sans MS', ...MC.FUENTES_GOOGLE];
  const PESTANAS = {
    chat: {
      seccion: 'overlay', ruta: '/overlay', ayuda: 'En OBS: Fuente → Navegador → pega esta URL. Recomendado 450 × 800.',
      // Estilos rápidos: cambian varias opciones de una vez. Luego se puede retocar cualquier cosa.
      rapidos: [
        ['Oscuro', { tema: 'tarjetas', colorFondo: '#100e18', fondo: 0.55, colorTexto: '#ffffff', colorNombre: 'usuario', contorno: 1, iconoEstilo: 'color', grosor: 'normal', separacion: 'normal' }],
        ['Claro', { tema: 'burbujas', colorFondo: '#ffffff', fondo: 0.92, colorTexto: '#1b1824', colorNombre: 'usuario', contorno: 0, iconoEstilo: 'color', grosor: 'normal', separacion: 'normal' }],
        ['Neón', { tema: 'neon', acento: '#00e5ff', colorFondo: '#0a0812', fondo: 0.7, colorTexto: '#ffffff', colorNombre: 'plataforma', contorno: 1, iconoEstilo: 'color', grosor: 'negrita' }],
        ['Solo texto', { tema: 'limpio', fondo: 0, colorTexto: '#ffffff', colorNombre: 'usuario', contorno: 2, iconoEstilo: 'blanco', grosor: 'negrita', separacion: 'compacta' }],
        ['Cristal', { tema: 'cristal', colorTexto: '#ffffff', fondo: 0.6, colorNombre: 'usuario', contorno: 1, iconoEstilo: 'insignia' }],
      ],
      controles: [
        { titulo: 'Tamaño y posición', abierto: true, ayuda: 'Pon en OBS la fuente de navegador con este mismo tamaño. La vista previa lo muestra a escala.' },
        { tipo: 'presets', t: 'Tamaños rápidos', op: [
          ['Vertical 450 × 800', { fuenteAncho: 450, fuenteAlto: 800, ancho: 0, alto: 0, margen: 0 }],
          ['Columna en escena 1080p', { fuenteAncho: 1920, fuenteAlto: 1080, ancho: 420, alto: 900, anclaje: 'abajo-izquierda', margen: 30 }],
          ['Banda inferior 1080p', { fuenteAncho: 1920, fuenteAlto: 1080, ancho: 1100, alto: 260, anclaje: 'abajo-centro', margen: 20 }],
          ['Esquina derecha 1080p', { fuenteAncho: 1920, fuenteAlto: 1080, ancho: 480, alto: 520, anclaje: 'abajo-derecha', margen: 30 }],
          ['Pantalla completa 1080p', { fuenteAncho: 1920, fuenteAlto: 1080, ancho: 0, alto: 0, margen: 0 }],
        ] },
        { k: 'fuenteAncho', t: 'Ancho de la fuente en OBS', tipo: 'numero', min: 100, max: 3840, u: 'px' },
        { k: 'fuenteAlto', t: 'Alto de la fuente en OBS', tipo: 'numero', min: 100, max: 2160, u: 'px' },
        { k: 'ancho', t: 'Ancho del chat', tipo: 'numero', min: 0, max: 3840, u: 'px', ayuda: '0 = todo el ancho' },
        { k: 'alto', t: 'Alto del chat', tipo: 'numero', min: 0, max: 2160, u: 'px', ayuda: '0 = todo el alto' },
        { k: 'anclaje', t: 'Posición del chat', tipo: 'anclaje' },
        { k: 'margen', t: 'Margen al borde', tipo: 'rango', min: 0, max: 200, paso: 5, u: 'px' },
        { titulo: 'Estilo', abierto: true },
        { k: 'tema', t: 'Estilo', tipo: 'opciones', op: [['tarjetas', 'Tarjetas'], ['limpio', 'Limpio'], ['burbujas', 'Burbujas'], ['neon', 'Neón'], ['cristal', 'Cristal']] },
        { k: 'tamano', t: 'Tamaño del texto', tipo: 'rango', min: 12, max: 48, paso: 1, u: 'px' },
        { k: 'fondo', t: 'Transparencia del fondo', tipo: 'rango', min: 0, max: 1, paso: 0.05, u: '%', invertir: true, mostrar: v => Math.round(v * 100) },
        { k: 'opacidad', t: 'Transparencia del chat', tipo: 'rango', min: 0, max: 0.8, paso: 0.05, u: '%', invertir: true, mostrar: v => Math.round(v * 100) },
        { titulo: 'Colores', abierto: true },
        { k: 'colorTexto', t: 'Color del texto', tipo: 'color' },
        { k: 'colorFondo', t: 'Color del fondo', tipo: 'color' },
        { k: 'colorNombre', t: 'Color de los nombres', tipo: 'opciones', op: [['usuario', 'El de cada usuario'], ['tema', 'Tema de colores'], ['plataforma', 'De la plataforma'], ['fijo', 'Uno fijo']] },
        { k: 'temaNombres', t: 'Tema de colores', tipo: 'paleta', si: o => o.colorNombre === 'tema' || o.colorNombre === 'usuario', ayuda: o => (o.colorNombre === 'usuario' ? 'Para quien no eligió color en su plataforma.' : 'Cada persona tiene siempre el mismo color.') },
        { k: 'nombreFijo', t: 'Color fijo de los nombres', tipo: 'color', si: o => o.colorNombre === 'fijo' },
        { k: 'acento', t: 'Color de acento (Neón, Cristal, eventos)', tipo: 'color' },
        { titulo: 'Texto' },
        { k: 'fuente', t: 'Fuente', tipo: 'lista', op: FUENTES },
        { k: 'grosor', t: 'Grosor', tipo: 'opciones', op: [['normal', 'Normal'], ['negrita', 'Negrita']] },
        { k: 'interlineado', t: 'Interlineado', tipo: 'rango', min: 1, max: 2, paso: 0.05, mostrar: v => `${(Math.round(v * 100) / 100).toLocaleString('es')}${v >= 1.3 && v <= 1.5 ? ' (recomendado)' : ''}` },
        { k: 'contorno', t: 'Contorno del texto', tipo: 'opciones', op: [[0, 'Ninguno'], [1, 'Fino'], [2, 'Grueso']] },
        { k: 'tamEmotes', t: 'Tamaño de los emotes', tipo: 'rango', min: 1, max: 3, paso: 0.1, mostrar: v => `${Math.round(v * 100) / 100}×` },
        { k: 'recortar', t: 'Cortar mensajes largos', tipo: 'rango', min: 0, max: 300, paso: 10, mostrar: v => (v ? `a ${v} letras` : 'no') },
        { k: 'lineas', t: 'Máximo de líneas por mensaje', tipo: 'rango', min: 0, max: 10, paso: 1, mostrar: v => (v ? `${v} ${v === 1 ? 'línea' : 'líneas'}` : 'sin límite') },
        { titulo: 'Disposición' },
        { k: 'disposicion', t: 'Nombre y mensaje', tipo: 'opciones', op: [['linea', 'En una línea'], ['dos', 'En dos líneas']] },
        { k: 'lado', t: 'Lado', tipo: 'opciones', op: [['izquierda', 'Izquierda'], ['derecha', 'Derecha']] },
        { k: 'alinear', t: 'Los nuevos entran por', tipo: 'opciones', op: [['abajo', 'Abajo'], ['arriba', 'Arriba']] },
        { k: 'separacion', t: 'Separación', tipo: 'opciones', op: [['compacta', 'Compacta'], ['normal', 'Normal'], ['amplia', 'Amplia']] },
        { k: 'maximo', t: 'Mensajes a la vez', tipo: 'rango', min: 1, max: 30, paso: 1 },
        { k: 'duracion', t: 'Desaparecen tras', tipo: 'rango', min: 0, max: 120, paso: 5, u: 's', mostrar: v => (v ? v : 'nunca') },
        { k: 'animacion', t: 'Animación', tipo: 'opciones', op: [['deslizar', 'Deslizar'], ['aparecer', 'Aparecer'], ['ninguna', 'Ninguna']] },
        { k: 'agrupar', t: 'Agrupar mensajes seguidos de la misma persona', tipo: 'si' },
        { k: 'difuminar', t: 'Difuminar el borde del chat', tipo: 'si' },
        { titulo: 'Qué se muestra' },
        { k: 'iconoEstilo', t: 'Logotipo de la plataforma', tipo: 'opciones', op: [['color', 'A color'], ['insignia', 'Insignia'], ['blanco', 'Blanco']] },
        { k: 'plataforma', t: 'Mostrar el logotipo', tipo: 'si' },
        { k: 'roles', t: 'Insignias', tipo: 'si' },
        { k: 'avatar', t: 'Avatares', tipo: 'si' },
        { k: 'eventos', t: 'Subs, donaciones y raids', tipo: 'si' },
        { k: 'soloEventos', t: 'Solo eventos (sin chat)', tipo: 'si' },
        { titulo: 'Filtros' },
        { k: 'ocultarComandos', t: 'Ocultar comandos (!algo)', tipo: 'si' },
        { k: 'ocultarLargos', t: 'Ocultar mensajes de más de', tipo: 'rango', min: 0, max: 500, paso: 10, mostrar: v => (v ? `${v} letras` : 'no ocultar') },
        { k: 'ocultarBots', t: 'Ocultar bots', tipo: 'si' },
        { k: 'bots', t: 'Bots (separados por comas)', tipo: 'texto' },
      ],
    },
    alertas: {
      seccion: 'alertas', ruta: '/alertas', ayuda: 'En OBS: Fuente → Navegador → pega esta URL, a pantalla completa (1920 × 1080). Activa "Controlar audio mediante OBS" para el sonido.',
      controles: [
        { titulo: 'Qué alertas salen', abierto: true },
        { k: 'tipos.follow', t: 'Follows', tipo: 'si', probar: 'follow' },
        { k: 'tipos.suscripcion', t: 'Suscripciones y miembros', tipo: 'si', probar: 'suscripcion' },
        { k: 'tipos.regalo_subs', t: 'Subs regalados', tipo: 'si', probar: 'regalo_subs' },
        { k: 'tipos.donacion', t: 'Donaciones, bits, regalos y KICKs', tipo: 'si', probar: 'donacion' },
        { k: 'tipos.raid', t: 'Raids', tipo: 'si', probar: 'raid' },
        { k: 'tipos.aviso', t: 'Canjes de puntos', tipo: 'si' },
        { k: 'minimoUsd', t: 'Donación mínima', tipo: 'rango', min: 0, max: 50, paso: 1, mostrar: v => (v ? `${v} USD aprox.` : 'todas') },
        { titulo: 'Tamaño y posición', ayuda: 'Pon en OBS la fuente de navegador con este mismo tamaño (normalmente el de tu escena).' },
        { k: 'fuenteAncho', t: 'Ancho de la fuente en OBS', tipo: 'numero', min: 100, max: 3840, u: 'px' },
        { k: 'fuenteAlto', t: 'Alto de la fuente en OBS', tipo: 'numero', min: 100, max: 2160, u: 'px' },
        { k: 'anchoAlerta', t: 'Ancho de la alerta', tipo: 'rango', min: 0, max: 1600, paso: 20, mostrar: v => (v ? `${v} px` : 'automático') },
        { k: 'lado', t: 'Lado', tipo: 'opciones', op: [['izquierda', 'Izquierda'], ['centro', 'Centro'], ['derecha', 'Derecha']] },
        { titulo: 'Aspecto' },
        { k: 'estilo', t: 'Estilo', tipo: 'opciones', op: [['neon', 'Neón'], ['clasico', 'Clásico'], ['minimal', 'Minimal']] },
        { k: 'acento', t: 'Color de acento', tipo: 'color' },
        { k: 'fuente', t: 'Fuente', tipo: 'lista', op: FUENTES },
        { k: 'posicion', t: 'Posición', tipo: 'opciones', op: [['arriba', 'Arriba'], ['centro', 'Centro'], ['abajo', 'Abajo']] },
        { k: 'tamano', t: 'Tamaño', tipo: 'rango', min: 18, max: 72, paso: 1, u: 'px' },
        { k: 'duracion', t: 'Tiempo en pantalla', tipo: 'rango', min: 3, max: 20, paso: 1, u: 's' },
        { k: 'mensaje', t: 'Mostrar el mensaje que la acompaña', tipo: 'si' },
        { titulo: 'Animación y texto' },
        { k: 'entrada', t: 'Animación de entrada', tipo: 'lista', op: [['rebote', 'Rebote'], ['aparecer', 'Aparecer'], ['desde-abajo', 'Desde abajo'], ['desde-arriba', 'Desde arriba'], ['desde-izquierda', 'Desde la izquierda'], ['desde-derecha', 'Desde la derecha'], ['zoom', 'Zoom'], ['girar', 'Girar'], ['sacudir', 'Sacudir'], ['ninguna', 'Ninguna']] },
        { k: 'salida', t: 'Animación de salida', tipo: 'lista', op: [['desvanecer', 'Desvanecer'], ['hacia-arriba', 'Hacia arriba'], ['hacia-abajo', 'Hacia abajo'], ['zoom', 'Zoom'], ['ninguna', 'Ninguna']] },
        { k: 'disposicion', t: 'Texto respecto a la imagen', tipo: 'opciones', op: [['derecha', 'A la derecha'], ['izquierda', 'A la izquierda'], ['debajo', 'Debajo'], ['encima', 'Encima'], ['superpuesto', 'Superpuesto']] },
        { k: 'alinearTexto', t: 'Alineación del texto', tipo: 'opciones', op: [['izquierda', 'Izquierda'], ['centro', 'Centro'], ['derecha', 'Derecha']] },
        { titulo: 'Imagen o animación', ayuda: 'Tu propia imagen, GIF o vídeo (PNG, JPG, GIF, WebP, MP4, WebM). Sin ninguna, se muestra el avatar o la imagen del regalo.' },
        { k: 'medio', t: 'Imagen o animación', tipo: 'medio' },
        { k: 'sonidoVideo', t: 'Que el vídeo suene', tipo: 'si', si: o => /\.(mp4|webm)$/i.test(o.medio || '') },
        { k: 'tamImagen', t: 'Tamaño de la imagen', tipo: 'rango', min: 1.5, max: 10, paso: 0.25, mostrar: v => `${v}×` },
        { titulo: 'Sonido', ayuda: 'Sonidos de serie (Kenney, CC0), generados o tus propios archivos (MP3, OGG, WAV, M4A).' },
        { k: 'sonido', t: 'Sonido', tipo: 'sonido' },
        { k: 'volumen', t: 'Volumen', tipo: 'rango', min: 0, max: 1, paso: 0.05, u: '%', mostrar: v => Math.round(v * 100) },
        { titulo: 'Por tipo de alerta', ayuda: 'Un sonido o imagen distinto para cada tipo. "Usar el general" = el de arriba.' },
        { k: 'porTipo.follow.sonido', t: 'Follow: sonido', tipo: 'sonido', vacio: true },
        { k: 'porTipo.follow.medio', t: 'Follow: imagen', tipo: 'medio', vacio: true },
        { k: 'porTipo.suscripcion.sonido', t: 'Suscripción: sonido', tipo: 'sonido', vacio: true },
        { k: 'porTipo.suscripcion.medio', t: 'Suscripción: imagen', tipo: 'medio', vacio: true },
        { k: 'porTipo.regalo_subs.sonido', t: 'Subs regalados: sonido', tipo: 'sonido', vacio: true },
        { k: 'porTipo.regalo_subs.medio', t: 'Subs regalados: imagen', tipo: 'medio', vacio: true },
        { k: 'porTipo.donacion.sonido', t: 'Donación: sonido', tipo: 'sonido', vacio: true },
        { k: 'porTipo.donacion.medio', t: 'Donación: imagen', tipo: 'medio', vacio: true },
        { k: 'porTipo.raid.sonido', t: 'Raid: sonido', tipo: 'sonido', vacio: true },
        { k: 'porTipo.raid.medio', t: 'Raid: imagen', tipo: 'medio', vacio: true },
        { k: 'porTipo.aviso.sonido', t: 'Canje: sonido', tipo: 'sonido', vacio: true },
        { k: 'porTipo.aviso.medio', t: 'Canje: imagen', tipo: 'medio', vacio: true },
        { titulo: 'Textos propios', ayuda: 'Vacío = texto de la plataforma. Puedes usar {nombre}, {cantidad}, {importe} y {plataforma}.' },
        { k: 'plantillas.follow', t: 'Follow', tipo: 'texto', ejemplo: '¡{nombre} se une a la familia!' },
        { k: 'plantillas.suscripcion', t: 'Suscripción', tipo: 'texto', ejemplo: '{nombre} lleva {cantidad} meses' },
        { k: 'plantillas.regalo_subs', t: 'Subs regalados', tipo: 'texto', ejemplo: '{nombre} regala {cantidad} subs' },
        { k: 'plantillas.donacion', t: 'Donación', tipo: 'texto', ejemplo: '{nombre} dona {importe}' },
        { k: 'plantillas.raid', t: 'Raid', tipo: 'texto', ejemplo: '¡Raid de {nombre} con {cantidad}!' },
      ],
    },
  };
  let pestana = 'chat';

  const leerRuta = (obj, ruta) => ruta.split('.').reduce((o, k) => o?.[k], obj);
  function ponerRuta(obj, ruta, v) {
    const partes = ruta.split('.');
    const ultimo = partes.pop();
    partes.reduce((o, k) => (o[k] = o[k] || {}), obj)[ultimo] = v;
  }

  const guardados = {};
  function cambiar(seccion, ruta, v) {
    ponerRuta(config[seccion], ruta, v);
    clearTimeout(guardados[seccion]);
    guardados[seccion] = setTimeout(() => MC.orden('config', { [seccion]: config[seccion] }), 150);
  }

  function dibujarEditor() {
    const p = PESTANAS[pestana];
    const datos = config[p.seccion];
    document.querySelectorAll('[data-pestana]').forEach(b => b.classList.toggle('activo', b.dataset.pestana === pestana));
    const url = `${window.location.origin}${p.ruta}`;
    $('url-overlay').textContent = url;
    $('copiar').onclick = async () => {
      await navigator.clipboard.writeText(url);
      $('copiar').querySelector('span').textContent = '¡Copiada!';
      setTimeout(() => { $('copiar').querySelector('span').textContent = 'Copiar'; }, 1500);
    };
    $('ayuda-obs').textContent = p.ayuda;
    const vista = `${p.ruta}?vista=1`;
    if ($('vista').getAttribute('src') !== vista) $('vista').src = vista;
    ajustarVista();

    const form = $('form-overlay');
    form.replaceChildren();
    if (p.rapidos) {
      const caja = MC.el('div', 'rapidos');
      caja.append(MC.el('span', 'control-nombre', 'Estilos rápidos'));
      const fila = MC.el('div', 'rapidos-botones');
      for (const [nombre, valores] of p.rapidos) {
        const b = MC.el('button', null, nombre);
        b.type = 'button';
        b.onclick = () => { Object.assign(config[p.seccion], valores); MC.orden('config', { [p.seccion]: config[p.seccion] }); dibujarEditor(); };
        fila.append(b);
      }
      caja.append(fila);
      form.append(caja);
    }
    let destino = form;
    for (const c of p.controles) {
      if (c.titulo) {
        // Sección plegable; se recuerda cuáles abrió el usuario.
        const clave = `${pestana}:${c.titulo}`;
        const det = MC.el('details', 'grupo');
        const tocada = [...abiertos].some(k => k.startsWith(`${pestana}:`)) || cerradas.has(pestana);
        det.open = abiertos.has(clave) || (!tocada && !!c.abierto);
        det.ontoggle = () => { if (det.open) abiertos.add(clave); else { abiertos.delete(clave); cerradas.add(pestana); } };
        if (det.open) abiertos.add(clave);
        det.append(MC.el('summary', null, c.titulo));
        if (c.ayuda) det.append(MC.el('p', 'ayuda', c.ayuda));
        form.append(det);
        destino = det;
        continue;
      }
      // Controles que solo tienen sentido con cierta opción (p. ej. el color fijo de los nombres).
      if (c.si && !c.si(datos)) continue;
      const fila = MC.el('label', `control c-${c.tipo}`);
      const nombre = MC.el('span', 'control-nombre', c.t);
      fila.append(nombre);
      const v = c.k ? leerRuta(datos, c.k) : undefined;
      const poner = valor => cambiar(p.seccion, c.k, valor);
      if (c.tipo === 'opciones') {
        const grupo = MC.el('span', 'segmentos');
        for (const [valor, texto] of c.op) {
          const b = MC.el('button', valor === v ? 'activo' : null, texto);
          b.type = 'button';
          b.onclick = () => {
            poner(valor);
            grupo.querySelectorAll('button').forEach(x => x.classList.toggle('activo', x === b));
            if (p.controles.some(o => o.si)) dibujarEditor();
          };
          grupo.append(b);
        }
        fila.append(grupo);
      } else if (c.tipo === 'rango') {
        const etiqueta = n => { const vis = c.mostrar ? c.mostrar(n) : n; return typeof vis === 'number' && c.u ? `${vis} ${c.u}` : String(vis); };
        const vis = n => (c.invertir ? Math.round((1 - n) * 100) / 100 : n);
        const valor = MC.el('output', null, etiqueta(vis(v ?? 1)));
        const r = MC.el('input');
        Object.assign(r, { type: 'range', min: c.min, max: c.max, step: c.paso, value: vis(v ?? 1) });
        r.oninput = () => { const n = Number(r.value); valor.textContent = etiqueta(n); poner(c.invertir ? Math.round((1 - n) * 100) / 100 : n); };
        nombre.append(valor);
        fila.append(r);
      } else if (c.tipo === 'paleta') {
        // Temas de color con sus muestras.
        const lista = MC.el('span', 'paletas');
        for (const [id, tema] of Object.entries(MC.TEMAS_NOMBRES)) {
          const b = MC.el('button', `paleta${id === v ? ' activo' : ''}`);
          b.type = 'button';
          b.title = tema.nombre;
          const muestras = MC.el('span', 'muestras');
          for (const col of tema.colores) { const m = MC.el('i'); m.style.background = col; muestras.append(m); }
          b.append(muestras, MC.el('span', null, tema.nombre));
          b.onclick = () => { poner(id); lista.querySelectorAll('.paleta').forEach(x => x.classList.toggle('activo', x === b)); };
          lista.append(b);
        }
        fila.append(lista);
        if (c.ayuda) fila.append(MC.el('span', 'ayuda', c.ayuda(datos)));
      } else if (c.tipo === 'numero') {
        const n = MC.el('input');
        Object.assign(n, { type: 'number', min: c.min, max: c.max, step: 1, value: v ?? 0 });
        n.onchange = () => { const x = Math.min(Math.max(Math.round(Number(n.value) || 0), c.min), c.max); n.value = x; poner(x); ajustarVista(); };
        const caja = MC.el('span', 'numero');
        caja.append(n, MC.el('span', 'unidad', c.u || ''));
        if (c.ayuda) caja.append(MC.el('span', 'ayuda', c.ayuda));
        fila.append(caja);
      } else if (c.tipo === 'presets') {
        const g = MC.el('span', 'rapidos-botones');
        for (const [nombre, valores] of c.op) {
          const b = MC.el('button', null, nombre);
          b.type = 'button';
          b.onclick = e => { e.preventDefault(); Object.assign(config[p.seccion], valores); MC.orden('config', { [p.seccion]: config[p.seccion] }); dibujarEditor(); };
          g.append(b);
        }
        fila.append(g);
      } else if (c.tipo === 'anclaje') {
        const rejilla = MC.el('span', 'anclaje');
        for (const vv of ['arriba', 'centro', 'abajo']) for (const hh of ['izquierda', 'centro', 'derecha']) {
          const valor = `${vv}-${hh}`;
          const b = MC.el('button', valor === v ? 'activo' : null);
          b.type = 'button';
          b.title = valor;
          b.onclick = e => { e.preventDefault(); poner(valor); rejilla.querySelectorAll('button').forEach(x => x.classList.toggle('activo', x === b)); };
          rejilla.append(b);
        }
        fila.append(rejilla);
      } else if (c.tipo === 'color') {
        const col = MC.el('input');
        col.type = 'color';
        col.value = v || '#a56bff';
        col.oninput = () => poner(col.value);
        fila.append(col);
      } else if (c.tipo === 'lista') {
        const sel = MC.el('select');
        for (const f of c.op) {
          const [valor, texto] = Array.isArray(f) ? f : [f, f];
          const o = MC.el('option', null, texto);
          o.value = valor;
          if (!Array.isArray(f)) o.style.fontFamily = f;
          sel.append(o);
        }
        sel.value = v;
        sel.onchange = () => poner(sel.value);
        fila.append(sel);
      } else if (c.tipo === 'sonido' || c.tipo === 'medio') {
        fila.classList.add('c-archivo');
        fila.append(controlArchivo(c, v, poner));
      } else if (c.tipo === 'texto') {
        const t = MC.el('input');
        t.type = 'text';
        t.value = v || '';
        t.placeholder = c.ejemplo || '';
        t.oninput = () => poner(t.value);
        fila.append(t);
      } else {
        const ch = MC.el('input');
        ch.type = 'checkbox';
        ch.checked = !!v;
        ch.onchange = () => poner(ch.checked);
        fila.prepend(ch);
        if (c.probar) {
          const b = MC.el('button', 'probar', 'Probar');
          b.type = 'button';
          b.title = 'Envía una alerta de prueba';
          b.onclick = e => { e.preventDefault(); MC.orden('prueba', { tipo: c.probar }); };
          fila.append(b);
        }
      }
      destino.append(fila);
    }
  }
  // La vista previa se dibuja al tamaño de la fuente de OBS y se reduce para caber: así se ve igual que en OBS.
  function ajustarVista() {
    const datos = config?.[PESTANAS[pestana].seccion];
    if (!datos) return;
    const w = Number(datos.fuenteAncho) || (pestana === 'chat' ? 450 : 1920);
    const h = Number(datos.fuenteAlto) || (pestana === 'chat' ? 800 : 1080);
    const caja = $('vista-caja');
    const escala = Math.min(caja.clientWidth / w, 420 / h, 1);
    Object.assign($('vista').style, { width: `${w}px`, height: `${h}px`, transform: `scale(${escala})` });
    caja.style.height = `${Math.round(h * escala)}px`;
    $('vista-medida').textContent = `${w} × ${h}`;
  }
  window.addEventListener('resize', () => ajustarVista());
  const abiertos = new Set();

  // ---------- Sonidos y archivos propios de las alertas ----------
  const SONIDOS_SERIE = [
    ['fanfarria-8bits.ogg', 'Fanfarria 8 bits'], ['victoria-8bits.ogg', 'Victoria 8 bits'], ['steel-alegre.ogg', 'Steel drum alegre'],
    ['steel-fiesta.ogg', 'Steel drum fiesta'], ['pizzicato-1.ogg', 'Pizzicato 1'], ['pizzicato-2.ogg', 'Pizzicato 2'], ['saxo-1.ogg', 'Saxo 1'],
    ['saxo-2.ogg', 'Saxo 2'], ['golpe-1.ogg', 'Golpe 1'], ['golpe-2.ogg', 'Golpe 2'], ['subida-nivel.ogg', 'Subida de nivel'],
    ['tres-tonos.ogg', 'Tres tonos'], ['zap-ascendente.ogg', 'Zap ascendente'], ['pep.ogg', 'Pep'], ['confirmacion.wav', 'Confirmación'],
    ['cristal.wav', 'Cristal'], ['gong.wav', 'Gong'], ['aparecer.wav', 'Aparecer'],
  ];
  let biblioteca = [];
  const cargarBiblioteca = () => fetch('/api/medios').then(r => r.json()).then(l => { biblioteca = l; }).catch(() => {});

  async function subirArchivo(acepta) {
    const input = MC.el('input');
    input.type = 'file';
    input.accept = acepta;
    const archivo = await new Promise(ok => { input.onchange = () => ok(input.files[0]); input.click(); });
    if (!archivo) return null;
    const r = await fetch('/api/medios', { method: 'POST', headers: { 'X-MultiChat': '1', 'X-Nombre': encodeURIComponent(archivo.name), 'Content-Type': archivo.type || 'application/octet-stream' }, body: archivo });
    const j = await r.json();
    if (!r.ok) { alert(j.error || MC.t('No se pudo subir el archivo')); return null; }
    await cargarBiblioteca();
    return j.url;
  }

  let reproduciendo = null;
  function controlArchivo(c, v, poner) {
    const caja = MC.el('span', 'archivo');
    const sel = MC.el('select');
    const op = (valor, texto, grupo = sel) => { const o = MC.el('option', null, texto); o.value = valor; grupo.append(o); };
    const grupo = nombre => { const g = MC.el('optgroup'); g.label = nombre; sel.append(g); return g; };
    if (c.tipo === 'sonido') {
      if (c.vacio) op('', 'Usar el general');
      const serie = grupo('De serie');
      for (const [a, n] of SONIDOS_SERIE) op(`/sonidos/${a}`, n, serie);
      const gen = grupo('Generados');
      op('campana', 'Campana', gen); op('moneda', 'Moneda', gen); op('suave', 'Suave', gen);
      const propios = biblioteca.filter(m => m.tipo === 'audio');
      if (propios.length) { const g = grupo('Tus sonidos'); for (const m of propios) op(m.url, m.nombre, g); }
      op('ninguno', 'Ninguno');
    } else {
      op('', c.vacio ? 'Usar la general' : 'Ninguna (avatar o regalo)');
      const propios = biblioteca.filter(m => m.tipo === 'imagen' || m.tipo === 'video');
      if (propios.length) { const g = grupo('Tus imágenes y vídeos'); for (const m of propios) op(m.url, m.nombre, g); }
    }
    // Un archivo que ya no está en la biblioteca se muestra igualmente, para no perder el valor guardado.
    if (v && ![...sel.querySelectorAll('option')].some(o => o.value === v)) op(v, `${String(v).split('/').pop()} (no encontrado)`);
    sel.value = v || (c.vacio ? '' : (c.tipo === 'sonido' ? 'ninguno' : ''));
    sel.onchange = () => { poner(sel.value); actualizarVista(); };
    caja.append(sel);

    const botones = MC.el('span', 'archivo-botones');
    if (c.tipo === 'sonido') {
      const play = MC.el('button', null, '▶');
      play.type = 'button';
      play.title = 'Escuchar (los generados se oyen con "Probar")';
      play.onclick = e => {
        e.preventDefault();
        if (!/^\/(sonidos|medios)\//.test(sel.value)) return;
        reproduciendo?.pause();
        reproduciendo = new Audio(sel.value);
        reproduciendo.volume = config.alertas.volumen ?? 0.6;
        reproduciendo.play().catch(() => {});
      };
      botones.append(play);
    }
    const subir = MC.el('button', null, 'Subir…');
    subir.type = 'button';
    subir.onclick = async e => {
      e.preventDefault();
      const url = await subirArchivo(c.tipo === 'sonido' ? '.mp3,.ogg,.wav,.m4a,audio/*' : '.png,.jpg,.jpeg,.gif,.webp,.apng,.mp4,.webm');
      if (url) { poner(url); dibujarEditor(); }
    };
    botones.append(subir);
    caja.append(botones);

    const vista = MC.el('span', 'archivo-vista');
    function actualizarVista() {
      vista.replaceChildren();
      if (c.tipo !== 'medio' || !/^\/medios\//.test(sel.value)) return;
      const video = /\.(mp4|webm)$/i.test(sel.value);
      const m = MC.el(video ? 'video' : 'img');
      m.src = sel.value;
      if (video) { m.muted = true; m.autoplay = true; m.loop = true; m.playsInline = true; }
      vista.append(m);
    }
    actualizarVista();
    caja.append(vista);
    return caja;
  }
  cargarBiblioteca().then(() => { if (config?.alertas && pestana === 'alertas') dibujarEditor(); });
  const cerradas = new Set();

  for (const b of document.querySelectorAll('[data-pestana]')) b.onclick = () => { pestana = b.dataset.pestana; dibujarEditor(); };

  // ---------- Vista del dock ----------

  let escritorio = false;
  function aplicarDock() {
    document.documentElement.style.setProperty('--tam-dock', `${config.dock?.tamano || 15}px`);
    const lineas = Number(config.dock?.lineas ?? 3);
    document.documentElement.style.setProperty('--lineas-dock', String(lineas || 'none'));
    feed.classList.toggle('con-limite', lineas > 0);
    for (const n of feed.children) marcarCortado(n);
  }
  // "ver más" solo en los mensajes que de verdad no caben.
  function marcarCortado(nodo) {
    const linea = nodo.querySelector('.linea');
    if (!linea || nodo.classList.contains('expandido')) return;
    nodo.classList.toggle('cortado', feed.classList.contains('con-limite') && linea.scrollHeight > linea.clientHeight + 2);
  }
  function dibujarAjustesDock() {
    const panel = $('panel-dock');
    panel.replaceChildren();
    const d = config.dock;
    const fila = (titulo, control) => { const l = MC.el('label', 'control'); const n = MC.el('span', 'control-nombre', titulo); l.append(n, control); return { l, n }; };
    const guardar = cambios => { Object.assign(config.dock, cambios); aplicarDock(); clearTimeout(guardados.dock); guardados.dock = setTimeout(() => MC.orden('config', { dock: config.dock }), 120); };

    // Idioma de la app (y de lo que ven los espectadores en los overlays).
    const idiomaSel = MC.el('select');
    for (const [v, n] of [['auto', 'Automático'], ['es', 'Español'], ['en', 'English']]) { const o = MC.el('option', null, n); o.value = v; idiomaSel.append(o); }
    idiomaSel.value = config.idioma || 'auto';
    idiomaSel.onchange = () => MC.orden('config', { idioma: idiomaSel.value });
    panel.append(fila('Idioma', idiomaSel).l);

    const tam = MC.el('input');
    Object.assign(tam, { type: 'range', min: 11, max: 26, step: 1, value: d.tamano });
    const t1 = fila('Tamaño de letra', tam);
    const o1 = MC.el('output', null, `${d.tamano} px`);
    t1.n.append(o1);
    tam.oninput = () => { o1.textContent = `${tam.value} px`; guardar({ tamano: Number(tam.value) }); };
    panel.append(t1.l);

    const lin = MC.el('input');
    Object.assign(lin, { type: 'range', min: 0, max: 10, step: 1, value: d.lineas ?? 3 });
    const etiquetaLineas = v => (Number(v) ? `${v} ${Number(v) === 1 ? 'línea' : 'líneas'}` : 'sin límite');
    const tl = fila('Líneas por mensaje', lin);
    const ol = MC.el('output', null, etiquetaLineas(lin.value));
    tl.n.append(ol);
    lin.oninput = () => { ol.textContent = etiquetaLineas(lin.value); guardar({ lineas: Number(lin.value) }); };
    panel.append(tl.l);
    panel.append(MC.el('p', 'ayuda', 'Los mensajes más largos se cortan; haz clic en uno para verlo entero.'));

    if (escritorio) {
      const op = MC.el('input');
      Object.assign(op, { type: 'range', min: 0, max: 0.7, step: 0.05, value: Math.round((1 - d.opacidad) * 100) / 100 });
      const t2 = fila('Transparencia de la ventana', op);
      const o2 = MC.el('output', null, `${Math.round((1 - d.opacidad) * 100)} %`);
      t2.n.append(o2);
      op.oninput = () => { o2.textContent = `${Math.round(op.value * 100)} %`; guardar({ opacidad: Math.round((1 - op.value) * 100) / 100 }); };
      panel.append(t2.l);
      const enc = MC.el('input');
      enc.type = 'checkbox';
      enc.checked = !!d.encima;
      enc.onchange = () => guardar({ encima: enc.checked });
      const l = MC.el('label', 'control c-si');
      l.append(enc, MC.el('span', 'control-nombre', 'Siempre encima (ver el chat sobre el juego)'));
      panel.append(l);
    } else {
      panel.append(MC.el('p', 'ayuda', 'En la app de escritorio también puedes hacer la ventana transparente y ponerla siempre encima.'));
    }
  }
  $('ajustes-dock').onclick = () => { const p = $('panel-dock'); p.hidden = !p.hidden; if (!p.hidden) dibujarAjustesDock(); };

  // ---------- Acerca de, ayuda, redes y actualizaciones ----------

  const REDES = [
    ['GitHub', 'https://github.com/maflatv', 'github'],
    ['YouTube', 'https://www.youtube.com/@MaflaTV', 'youtube'],
    ['Twitch', 'https://www.twitch.tv/maflatv', 'twitch'],
    ['Instagram', 'https://www.instagram.com/mafla.tv/', 'instagram'],
    ['TikTok', 'https://www.tiktok.com/@maflatv', 'tiktok'],
    ['Ko-fi', 'https://ko-fi.com/maflatv', 'kofi'],
  ];
  $('redes').replaceChildren(...REDES.map(([nombre, url, icono]) => {
    const a = MC.el('a', `boton red con-icono red-${icono}`);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.append(MC.el('i', `ico ico-marca-${icono}`), MC.el('span', null, nombre));
    return a;
  }));
  // La Ayuda en inglés va completa en una plantilla (frases largas con negritas: se lee mejor que traducida a trozos).
  $('boton-ayuda').onclick = () => {
    if (MC.idioma === 'en' && !$('dialogo-ayuda').dataset.en) {
      $('dialogo-ayuda').replaceChildren($('ayuda-en').content.cloneNode(true));
      $('dialogo-ayuda').dataset.en = '1';
      for (const b of $('dialogo-ayuda').querySelectorAll('[data-cerrar]')) b.onclick = () => $('dialogo-ayuda').close();
    }
    $('dialogo-ayuda').showModal();
  };
  $('boton-acerca').onclick = () => $('dialogo-acerca').showModal();
  for (const b of document.querySelectorAll('[data-cerrar]')) b.onclick = () => b.closest('dialog').close();
  // Clic fuera del contenido: cerrar.
  for (const d of document.querySelectorAll('dialog')) d.addEventListener('click', e => { if (e.target === d) d.close(); });

  const TEXTO_ACT = {
    buscando: () => 'Buscando actualizaciones…',
    'al-dia': () => 'Tienes la última versión.',
    disponible: e => `Hay una versión nueva: ${e.version}.`,
    descargando: e => `Descargando la versión ${e.version}… ${e.porcentaje} %`,
    lista: e => `La versión ${e.version} está lista. Se instala al reiniciar.`,
    error: e => `No se pudo comprobar: ${e.error}`,
    inactiva: () => '',
  };
  const BOTON_ACT = { disponible: ['Descargar', 'descargar'], lista: ['Reiniciar y actualizar', 'instalar'], 'al-dia': ['Buscar de nuevo', 'buscar'], error: ['Reintentar', 'buscar'], inactiva: ['Buscar actualizaciones', 'buscar'] };
  function mostrarActualizacion(e) {
    if (!e?.instalada) return;
    $('caja-actualizacion').hidden = false;
    $('texto-actualizacion').textContent = (TEXTO_ACT[e.estado] || (() => ''))(e);
    const b = BOTON_ACT[e.estado];
    $('boton-actualizacion').hidden = !b;
    if (b) { $('boton-actualizacion').textContent = b[0]; $('boton-actualizacion').onclick = () => MC.orden('actualizar', { accion: b[1] }); }
    // Aviso en la cabecera cuando hay algo que hacer.
    const aviso = $('aviso-actualizacion');
    aviso.hidden = !['disponible', 'descargando', 'lista'].includes(e.estado);
    aviso.textContent = e.estado === 'lista' ? 'Reiniciar y actualizar' : e.estado === 'descargando' ? `Descargando ${e.porcentaje} %` : `Nueva versión ${e.version}`;
    aviso.onclick = () => (e.estado === 'lista' ? MC.orden('actualizar', { accion: 'instalar' }) : $('dialogo-acerca').showModal());
  }
  fetch('/api/info').then(r => r.json()).then(i => { $('version').textContent = i.version; mostrarActualizacion(i.actualizacion); }).catch(() => {});

  // ---------- Conexión con el servidor ----------

  MC.conectar({
    abierta() { $('servidor').textContent = 'En marcha'; $('servidor').className = 'chip ok'; },
    caida() { $('servidor').textContent = 'Sin conexión con la app'; $('servidor').className = 'chip mal'; },
    inicio(e) {
      config = { ...(config || {}), overlay: e.overlay, alertas: e.alertas };
      conexiones = e.conexiones;
      escritorio = !!e.escritorio;
      if (e.pruebaAuto) mostrarAuto(e.pruebaAuto);
      fetch('/api/config').then(r => r.json()).then(c => { config = c; aplicarDock(); dibujarCuentas(); dibujarEditor(); });
      feed.replaceChildren();
      for (const m of e.historial) anadir(m, { animar: false });
      marcarOcultos(e.ocultos);
      marcarDestacado(e.destacado);
      $('vacio').hidden = e.historial.length > 0;
    },
    mensaje(e) { anadir(e.m); },
    borrar(e) { marcarOcultos(e.ids); },
    destacar(e) { marcarDestacado(e.m); },
    conexiones(e) { conexiones = e.lista; if (config?.cuentas) dibujarCuentas(); },
    // Tras iniciar o cerrar sesión con Kick en otra pestaña.
    cuentas() {
      fetch('/api/config').then(r => r.json()).then(c => {
        config = c;
        if (c.cuentas.twitch.conSesion) codigoTwitch = null;
        dibujarCuentas();
      });
    },
    aviso(e) { codigoTwitch = null; alert(MC.t(e.texto)); },
    'prueba-auto'(e) { mostrarAuto(e); },
    actualizacion(e) { mostrarActualizacion(e); },
  });
})();
