// Interfaz en español (original) e inglés. Funciona en el navegador (window.I18N) y en Node (require).
// - EN: traducción exacta de cada texto de la interfaz.
// - PATRONES: textos con datos ("Raid de X con 42 espectadores", "Hay una versión nueva: 1.2.0.").
// En el navegador, traducirArbol() recorre la página y observar() traduce también lo que se añada después.
// Nunca se traduce lo que escribe un espectador: mensajes (.texto, .mensaje) ni nombres (.nombre).
(function (raiz) {
  const EN = {
    // ---------- Cabecera, conexión y paneles ----------
    'Apoyar': 'Support', 'Apoya el proyecto en Ko-fi': 'Support the project on Ko-fi', 'Ayuda': 'Help', 'Acerca de MTv MultiChat': 'About MTv MultiChat',
    'Vista del dock': 'Dock view', 'Conectando…': 'Connecting…', 'En marcha': 'Running', 'Sin conexión con la app': 'Not connected to the app',
    'Plataformas': 'Platforms', 'Probar': 'Test', 'Envía mensajes de prueba al dock y al overlay.': 'Send test messages to the dock and the overlay.',
    'Mensaje': 'Message', 'Donación': 'Donation', 'Suscripción': 'Subscription', 'Subs regalados': 'Gifted subs', 'Raid': 'Raid', 'Follow': 'Follow',
    'Envío automático': 'Automatic sending', 'Mensajes cada': 'Messages every', 'Eventos cada': 'Events every',
    'Eventos: follow, suscripción, donación, subs regalados y raid, por turnos. 0 = solo mensajes.': 'Events: follow, subscription, donation, gifted subs and raid, in turn. 0 = messages only.',
    'Todo': 'All', 'Eventos': 'Events', 'Buscar…': 'Search…', 'Mensajes nuevos ↓': 'New messages ↓',
    'Aún no hay mensajes.': 'No messages yet.', 'Activa una plataforma a la izquierda o envía un mensaje de prueba.': 'Turn on a platform on the left or send a test message.',
    'Overlays para OBS': 'OBS overlays', 'Chat': 'Chat', 'Alertas': 'Alerts', 'Copiar': 'Copy', '¡Copiada!': 'Copied!',
    'Vista previa del overlay': 'Overlay preview', 'Cerrar': 'Close', 'Destacar en el overlay': 'Highlight on the overlay', 'Quitar del overlay': 'Remove from the overlay',

    // ---------- Cuentas ----------
    'Canal': 'Channel', 'Canal o enlace del directo': 'Channel or stream link', 'Usuario de TikTok': 'TikTok username',
    'Pon tu canal: se conectará solo cada vez que empieces un directo.': 'Enter your channel: it will connect by itself every time you go live.',
    'Solo en la app de escritorio. Pon tu usuario: se conectará solo al empezar el directo.': 'Desktop app only. Enter your username: it will connect by itself when you go live.',
    'Desactivado': 'Off', 'Conectado': 'Connected', 'Reconectando': 'Reconnecting', 'Esperando directo': 'Waiting for stream', 'Error': 'Error', 'Próximamente': 'Coming soon',
    'Desconectar': 'Disconnect', 'Conectar': 'Connect', 'Con mi cuenta': 'With my account', 'Sin cuenta': 'Without account',
    'Solo en la app de escritorio: abre el chat de Kick en una ventana oculta. Trae chat, subs, regalos y raids (sin follows).': 'Desktop app only: opens Kick chat in a hidden window. Brings chat, subs, gifts and raids (no follows).',
    'Falta la dirección del servidor puente de Kick.': 'The Kick bridge server address is missing.', 'Iniciar sesión con Kick': 'Log in with Kick', 'Cerrar sesión': 'Log out',
    'Servidor puente': 'Bridge server', 'Dirección del servidor puente de Kick': 'Kick bridge server address', 'Guardar': 'Save',
    'Inicia sesión una vez: trae chat, follows, subs, regalos, KICKs y canjes.': 'Log in once: brings chat, follows, subs, gifts, KICKs and redemptions.',
    'Abre twitch.tv/activate e introduce este código:': 'Open twitch.tv/activate and enter this code:', 'Abrir twitch.tv/activate': 'Open twitch.tv/activate', 'Cancelar': 'Cancel',
    'Iniciar sesión en Twitch (follows, canjes, avatares)': 'Log in to Twitch (follows, redemptions, avatars)', 'Client ID de Twitch': 'Twitch Client ID',
    'Client ID (aplicación pública)': 'Client ID (public app)', 'Client ID de la aplicación de Twitch': 'Twitch app Client ID', 'Iniciar sesión en TikTok (opcional)': 'Log in to TikTok (optional)',

    // ---------- Editor del overlay de chat ----------
    'En OBS: Fuente → Navegador → pega esta URL. Recomendado 450 × 800.': 'In OBS: Source → Browser → paste this URL. Recommended 450 × 800.',
    'Estilos rápidos': 'Quick styles', 'Oscuro': 'Dark', 'Claro': 'Light', 'Neón': 'Neon', 'Solo texto': 'Text only', 'Cristal': 'Glass',
    'Estilo': 'Style', 'Tarjetas': 'Cards', 'Limpio': 'Clean', 'Burbujas': 'Bubbles', 'Tamaño del texto': 'Text size',
    'Transparencia del fondo': 'Background transparency', 'Transparencia del chat': 'Chat transparency', 'Colores': 'Colours',
    'Color del texto': 'Text colour', 'Color del fondo': 'Background colour', 'Color de los nombres': 'Name colour', 'El de cada usuario': "Each user's own",
    'Tema de colores': 'Colour theme', 'De la plataforma': "The platform's", 'Uno fijo': 'A fixed one', 'Para quien no eligió color en su plataforma.': "For people who didn't pick a colour on their platform.",
    'Cada persona tiene siempre el mismo color.': 'Each person always gets the same colour.', 'Color fijo de los nombres': 'Fixed name colour',
    'Color de acento (Neón, Cristal, eventos)': 'Accent colour (Neon, Glass, events)', 'Texto': 'Text', 'Fuente': 'Font', 'Grosor': 'Weight', 'Normal': 'Normal', 'Negrita': 'Bold',
    'Interlineado': 'Line spacing', 'Contorno del texto': 'Text outline', 'Ninguno': 'None', 'Fino': 'Thin', 'Grueso': 'Thick', 'Tamaño de los emotes': 'Emote size',
    'Cortar mensajes largos': 'Trim long messages', 'Máximo de líneas por mensaje': 'Max lines per message', 'sin límite': 'no limit', 'no': 'no',
    'Disposición': 'Layout', 'Nombre y mensaje': 'Name and message', 'En una línea': 'On one line', 'En dos líneas': 'On two lines', 'Lado': 'Side',
    'Izquierda': 'Left', 'Derecha': 'Right', 'Los nuevos entran por': 'New messages enter from', 'Abajo': 'Bottom', 'Arriba': 'Top', 'Separación': 'Spacing',
    'Compacta': 'Compact', 'Amplia': 'Wide', 'Mensajes a la vez': 'Messages at once', 'Desaparecen tras': 'Disappear after', 'nunca': 'never', 'Animación': 'Animation',
    'Deslizar': 'Slide', 'Aparecer': 'Fade in', 'Ninguna': 'None', 'Agrupar mensajes seguidos de la misma persona': 'Group consecutive messages from the same person',
    'Difuminar el borde del chat': 'Fade the edge of the chat', 'Qué se muestra': 'What is shown', 'Logotipo de la plataforma': 'Platform logo', 'A color': 'In colour',
    'Insignia': 'Badge', 'Blanco': 'White', 'Mostrar el logotipo': 'Show the logo', 'Insignias': 'Badges', 'Avatares': 'Avatars', 'Subs, donaciones y raids': 'Subs, donations and raids',
    'Solo eventos (sin chat)': 'Events only (no chat)', 'Filtros': 'Filters', 'Ocultar comandos (!algo)': 'Hide commands (!something)', 'Ocultar mensajes de más de': 'Hide messages longer than',
    'no ocultar': "don't hide", 'Ocultar bots': 'Hide bots', 'Bots (separados por comas)': 'Bots (comma-separated)', '(recomendado)': '(recommended)',

    // ---------- Editor de alertas ----------
    'En OBS: Fuente → Navegador → pega esta URL, a pantalla completa (1920 × 1080). Activa "Controlar audio mediante OBS" para el sonido.': 'In OBS: Source → Browser → paste this URL, full screen (1920 × 1080). Turn on "Control audio via OBS" for the sound.',
    'Qué alertas salen': 'Which alerts show', 'Follows': 'Follows', 'Suscripciones y miembros': 'Subscriptions and members', 'Donaciones, bits, regalos y KICKs': 'Donations, bits, gifts and KICKs',
    'Raids': 'Raids', 'Canjes de puntos': 'Channel point redemptions', 'Donación mínima': 'Minimum donation', 'todas': 'all', 'Aspecto': 'Appearance', 'Clásico': 'Classic', 'Minimal': 'Minimal',
    'Color de acento': 'Accent colour', 'Posición': 'Position', 'Centro': 'Centre', 'Tamaño': 'Size', 'Tiempo en pantalla': 'Time on screen',
    'Mostrar el mensaje que la acompaña': 'Show the message that comes with it', 'Animación y texto': 'Animation and text', 'Animación de entrada': 'Entry animation',
    'Rebote': 'Bounce', 'Desde abajo': 'From below', 'Desde arriba': 'From above', 'Desde la izquierda': 'From the left', 'Desde la derecha': 'From the right', 'Zoom': 'Zoom',
    'Girar': 'Spin', 'Sacudir': 'Shake', 'Animación de salida': 'Exit animation', 'Desvanecer': 'Fade out', 'Hacia arriba': 'Upwards', 'Hacia abajo': 'Downwards',
    'Texto respecto a la imagen': 'Text position relative to the image', 'A la derecha': 'On the right', 'A la izquierda': 'On the left', 'Debajo': 'Below', 'Encima': 'Above',
    'Superpuesto': 'Overlaid', 'Alineación del texto': 'Text alignment', 'Imagen o animación': 'Image or animation',
    'Tu propia imagen, GIF o vídeo (PNG, JPG, GIF, WebP, MP4, WebM). Sin ninguna, se muestra el avatar o la imagen del regalo.': 'Your own image, GIF or video (PNG, JPG, GIF, WebP, MP4, WebM). Without one, the avatar or the gift image is shown.',
    'Que el vídeo suene': 'Play the video sound', 'Tamaño de la imagen': 'Image size', 'Sonido': 'Sound',
    'Sonidos de serie (Kenney, CC0), generados o tus propios archivos (MP3, OGG, WAV, M4A).': 'Built-in sounds (Kenney, CC0), generated ones or your own files (MP3, OGG, WAV, M4A).',
    'Volumen': 'Volume', 'Por tipo de alerta': 'Per alert type', 'Un sonido o imagen distinto para cada tipo. "Usar el general" = el de arriba.': 'A different sound or image for each type. "Use the general one" = the one above.',
    'Textos propios': 'Custom texts', 'Vacío = texto de la plataforma. Puedes usar {nombre}, {cantidad}, {importe} y {plataforma}.': "Empty = the platform's text. You can use {nombre}, {cantidad}, {importe} and {plataforma}.",
    'Envía una alerta de prueba': 'Send a test alert', 'Subir…': 'Upload…', 'Escuchar (los generados se oyen con "Probar")': 'Listen (generated ones play with "Test")',
    'No se pudo subir el archivo': 'The file could not be uploaded', 'Usar el general': 'Use the general one', 'Usar la general': 'Use the general one',
    'De serie': 'Built-in', 'Generados': 'Generated', 'Campana': 'Bell', 'Moneda': 'Coin', 'Suave': 'Soft', 'Tus sonidos': 'Your sounds', 'Ninguna (avatar o regalo)': 'None (avatar or gift)',
    'Tus imágenes y vídeos': 'Your images and videos', 'Canje': 'Redemption',
    'Fanfarria 8 bits': '8-bit fanfare', 'Victoria 8 bits': '8-bit victory', 'Steel drum alegre': 'Happy steel drum', 'Steel drum fiesta': 'Party steel drum',
    'Saxo 1': 'Sax 1', 'Saxo 2': 'Sax 2', 'Golpe 1': 'Hit 1', 'Golpe 2': 'Hit 2', 'Subida de nivel': 'Level up', 'Tres tonos': 'Three tones', 'Zap ascendente': 'Rising zap',
    'Confirmación': 'Confirmation', 'Gong': 'Gong',

    // ---------- Vista del dock ----------
    'Tamaño de letra': 'Font size', 'Transparencia de la ventana': 'Window transparency', 'Siempre encima (ver el chat sobre el juego)': 'Always on top (see the chat over your game)',
    'En la app de escritorio también puedes hacer la ventana transparente y ponerla siempre encima.': 'In the desktop app you can also make the window transparent and keep it on top.',
    'Idioma': 'Language', 'Automático': 'Automatic',

    // ---------- Acerca de y actualizaciones ----------
    'Versión': 'Version', 'Sígueme': 'Follow me', 'Creado por': 'Made by',
    'Chat unificado de Twitch, YouTube, TikTok y Kick para directos, con dock, overlay de chat y alertas para OBS. Gratuito y de código abierto.': 'Unified Twitch, YouTube, TikTok and Kick chat for live streams, with a dock, a chat overlay and alerts for OBS. Free and open source.',
    'MTv MultiChat es gratis. Si te resulta útil, puedes apoyarlo:': 'MTv MultiChat is free. If you find it useful, you can support it:',
    'Invítame a un café en Ko-fi': 'Buy me a coffee on Ko-fi', 'Sonidos de alerta: Kenney (CC0)': 'Alert sounds: Kenney (CC0)',
    'Logotipos de las plataformas y redes: Simple Icons (CC0)': 'Platform and social logos: Simple Icons (CC0)', 'Emotes: 7TV, BetterTTV y FrankerFaceZ': 'Emotes: 7TV, BetterTTV and FrankerFaceZ',
    'Licencia: MIT ·': 'License: MIT ·', 'Código en GitHub': 'Source code on GitHub', 'Actualizaciones': 'Updates', 'Créditos': 'Credits', 'Tienes la última versión.': 'You have the latest version.',
    'Buscando actualizaciones…': 'Checking for updates…', 'Descargar': 'Download', 'Reiniciar y actualizar': 'Restart and update', 'Buscar de nuevo': 'Check again',
    'Reintentar': 'Retry', 'Buscar actualizaciones': 'Check for updates',

    // ---------- Mensajes y alertas (los ven los espectadores) ----------
    'Suscripciones': 'Subscriptions', 'Aviso': 'Notice', 'Nuevo seguidor': 'New follower', 'Alguien': 'Someone', 'Alguien anónimo': 'Someone anonymous',
    'Streamer': 'Streamer', 'Moderador': 'Moderator', 'Fundador': 'Founder', 'Suscriptor': 'Subscriber', 'Verificado': 'Verified', 'Propietario': 'Owner', 'Miembro': 'Member',
    'Regala subs': 'Gifts subs', 'Anfitrión': 'Host', 'Prueba': 'Test',
    '¡Hola a todos! Así se verá el chat': 'Hi everyone! This is how the chat will look', 'Se lee genial desde aquí': 'Reads great from here', '¡Sigue así!': 'Keep it up!',
    '¡Medio año ya! Así se verán tus alertas': 'Half a year already! This is how your alerts will look',

    // ---------- Temas de nombres ----------
    'Vivos': 'Vivid', 'Cálidos': 'Warm', 'Fríos': 'Cool', 'Arcoíris': 'Rainbow', 'Océano': 'Ocean', 'Bosque': 'Forest', 'Atardecer': 'Sunset', 'Otoño': 'Autumn',
    'Galaxia': 'Galaxy', 'Caramelo': 'Candy', 'Twitch clásico': 'Classic Twitch',

    // ---------- Estados y errores de las conexiones ----------
    'Sin respuesta': 'No response', 'Nombre de canal no válido': 'Invalid channel name', 'Conexión cerrada': 'Connection closed', 'Twitch pidió reconectar': 'Twitch asked to reconnect',
    'la sesión de Twitch caducó: vuelve a iniciarla': 'your Twitch session expired: log in again', 'YouTube no responde': 'YouTube is not responding',
    'Escribe tu canal (@nombre), su URL o el enlace del directo': 'Enter your channel (@name), its URL or the stream link', 'No existe ese canal': "That channel doesn't exist",
    'Ese vídeo no tiene chat en directo (o ya terminó)': "That video has no live chat (or it's over)", 'Sin directo ahora. Se conectará solo al empezar': 'Not live right now. It will connect by itself when you go live',
    'El directo ha terminado': 'The stream has ended', 'Kick no responde': 'Kick is not responding', 'Falta la dirección del servidor puente': 'The bridge server address is missing',
    'Inicia sesión con Kick': 'Log in with Kick', 'La sesión de Kick ha caducado: vuelve a iniciar sesión': 'Your Kick session expired: log in again',
    'Conexión con el puente cerrada': 'Connection to the bridge closed', 'El puente no responde': 'The bridge is not responding', 'Kick rechazó la sesión': 'Kick rejected the session',
    'Kick cerró la conexión de chat': 'Kick closed the chat connection', 'La ventana de Kick se cerró': 'The Kick window closed', 'Kick no abre el chat. ¿Está bien escrito el canal?': "Kick doesn't open the chat. Is the channel spelled right?",
    'Nombre de usuario de TikTok no válido': 'Invalid TikTok username', 'La ventana de TikTok se cerró': 'The TikTok window closed',
    'Sin directo ahora (o TikTok pide iniciar sesión). Se conectará solo al empezar': 'Not live right now (or TikTok asks you to log in). It will connect by itself when you go live',
    'Iniciar sesión en TikTok': 'Log in to TikTok', 'Cancelado': 'Cancelled', 'El código ha caducado': 'The code has expired',
    'Este modo solo funciona en la app de escritorio': 'This mode only works in the desktop app', 'Solo en la app de escritorio': 'Desktop app only',
    'Falta el Client ID de la aplicación de Twitch': 'The Twitch app Client ID is missing', 'Falta el servidor puente': 'The bridge server is missing',
    'Indica la dirección del puente de Kick en el dock.': 'Enter the Kick bridge address in the dock.', 'El servidor puente no responde': 'The bridge server is not responding',
    'Comprueba su dirección o vuelve a intentarlo en un momento.': 'Check its address or try again in a moment.', 'Inicio de sesión caducado': 'Login expired',
    'Vuelve a pulsar «Iniciar sesión con Kick» en el dock.': 'Click "Log in with Kick" in the dock again.', 'Kick canceló el inicio de sesión': 'Kick cancelled the login',
    'No se pudo completar el inicio de sesión': 'The login could not be completed', 'El servidor puente o Kick no respondieron bien. Vuelve a intentarlo.': "The bridge server or Kick didn't respond properly. Try again.",
    'Ya puedes cerrar esta pestaña y volver a MTv MultiChat.': 'You can close this tab and go back to MTv MultiChat.', 'Sesión iniciada': 'Logged in',
    'Tipo de archivo no admitido. Usa PNG, JPG, GIF, WebP, MP4, WebM, MP3, OGG, WAV o M4A.': 'File type not supported. Use PNG, JPG, GIF, WebP, MP4, WebM, MP3, OGG, WAV or M4A.',
    'El archivo está vacío': 'The file is empty', 'El archivo pesa más de 50 MB': 'The file is larger than 50 MB',
    '¡{nombre} se une a la familia!': '{nombre} joined the family!', '{nombre} lleva {cantidad} meses': '{nombre} has been here {cantidad} months',
    '{nombre} regala {cantidad} subs': '{nombre} gifted {cantidad} subs', '{nombre} dona {importe}': '{nombre} donated {importe}', '¡Raid de {nombre} con {cantidad}!': 'Raid from {nombre} with {cantidad}!',
    'no existe': "doesn't exist", 'No encontrado': 'Not found',
    'El puerto 7390 está ocupado. ¿MTv MultiChat ya está abierto (quizá con iniciar.bat)?': 'Port 7390 is in use. Is MTv MultiChat already open (maybe with iniciar.bat)?',
  };

  // [expresión, reemplazo en inglés]. Se prueban en orden; la primera que encaja gana.
  const PATRONES = [
    // Títulos de eventos (los ven los espectadores)
    [/^(.+) te sigue$/, '$1 followed you'],
    [/^(.+) se ha suscrito (\d+) meses$/, '$1 subscribed for $2 months'],
    [/^(.+) se ha suscrito$/, '$1 subscribed'],
    [/^(.+) renueva: (\d+) (mes|meses)$/, (m, n, k) => `${n} resubscribed: ${k} ${k === '1' ? 'month' : 'months'}`],
    [/^(.+) regala (\d+) (suscripción|suscripciones)$/, (m, n, k) => `${n} gifted ${k} ${k === '1' ? 'sub' : 'subs'}`],
    [/^(.+) regala (\d+) (membresía|membresías)$/, (m, n, k) => `${n} gifted ${k} ${k === '1' ? 'membership' : 'memberships'}`],
    [/^Raid de (.+) con (\d+) (espectador|espectadores)$/, (m, n, k) => `Raid from ${n} with ${k} ${k === '1' ? 'viewer' : 'viewers'}`],
    [/^(.+) es miembro desde hace (\d+) (mes|meses)$/, (m, n, k) => `${n} has been a member for ${k} ${k === '1' ? 'month' : 'months'}`],
    [/^(.+) se ha hecho miembro$/, '$1 became a member'],
    [/^(.+) canjea «(.+)» \((\d+) puntos\)$/, '$1 redeemed "$2" ($3 points)'],
    [/^(.+) canjea «(.+)»$/, '$1 redeemed "$2"'],
    [/^Regalo: (.+)$/, 'Gift: $1'],
    [/^(.+) · (\d+) monedas$/, '$1 · $2 coins'],
    // Dock
    [/^Sesión: @(.+)$/, 'Session: @$1'],
    [/^Solo (Twitch|YouTube|TikTok|Kick)$/, '$1 only'],
    [/^Hay una versión nueva: (.+)\.$/, 'A new version is available: $1.'],
    [/^Descargando la versión (.+)… (\d+) %$/, 'Downloading version $1… $2 %'],
    [/^La versión (.+) está lista\. Se instala al reiniciar\.$/, 'Version $1 is ready. It installs when you restart.'],
    [/^No se pudo comprobar: (.+)$/, "Couldn't check: $1"],
    [/^Nueva versión (.+)$/, 'New version $1'],
    [/^Descargando (\d+) %$/, 'Downloading $1 %'],
    [/^a (\d+) letras$/, 'at $1 characters'],
    [/^(\d+) letras$/, '$1 characters'],
    [/^(\d+) (línea|líneas)$/, (m, n) => `${n} ${n === '1' ? 'line' : 'lines'}`],
    [/^(\d+) USD aprox\.$/, 'about $1 USD'],
    [/^(.+): sonido$/, (m, t) => `${traducir(t, 'en')}: sound`],
    [/^(.+): imagen$/, (m, t) => `${traducir(t, 'en')}: image`],
    [/^(.+) \(no encontrado\)$/, '$1 (not found)'],
    // Estados de conexión
    [/^En directo: (.+)$/, 'Live: $1'],
    [/^(.+)\. Reintento en (\d+) s$/, (m, motivo, s) => `${traducir(motivo, 'en')}. Retrying in ${s} s`],
    [/^Error de red \((.+)\)$/, 'Network error ($1)'],
    [/^sin datos de la cuenta \((.+)\)$/, 'no account data ($1)'],
    [/^Kick no aceptó la suscripción a eventos \((.+)\)$/, "Kick didn't accept the event subscription ($1)"],
    [/^No se pudo observar la ventana de (Kick|TikTok) \((.+)\)$/, "Couldn't watch the $1 window ($2)"],
    [/^No carga (kick\.com|tiktok\.com) \((.+)\)$/, "$1 doesn't load ($2)"],
    [/^Twitch no dio un código \((.+)\)$/, "Twitch didn't give a code ($1)"],
    [/^Twitch rechazó el inicio de sesión \((.+)\)$/, 'Twitch rejected the login ($1)'],
    [/^Twitch no responde \((.+)\)$/, 'Twitch is not responding ($1)'],
    [/^Twitch retiró el permiso de (.+)$/, 'Twitch revoked the permission for $1'],
    [/^Sin (follows|canjes)( ni (follows|canjes))?: solo con tu propio canal \(o siendo moderador\)$/, (m, a, b, c) => `No ${[a, c].filter(Boolean).map(x => (x === 'canjes' ? 'redemptions' : x)).join(' or ')}: only on your own channel (or as a moderator)`],
    [/^Twitch: (.+)$/, (m, t) => `Twitch: ${traducir(t, 'en')}`],
    [/^(.+) · (\d+) espectadores$/, '$1 · $2 viewers'],
    [/^Sesión iniciada como (.+)$/, 'Logged in as $1'],
  ];

  function traducir(texto, idioma) {
    if (idioma !== 'en' || typeof texto !== 'string') return texto;
    const limpio = texto.trim();
    if (!limpio) return texto;
    let r = EN[limpio];
    if (r == null) {
      for (const [re, sust] of PATRONES) if (re.test(limpio)) { r = limpio.replace(re, sust); break; }
    }
    if (r == null) return texto;
    // Se conservan los espacios de alrededor (texto partido por negritas, etc.).
    return texto.replace(limpio, r);
  }

  // ---------- Navegador ----------
  const NO_TRADUCIR = '.texto, .nombre, .mensaje, .no-traducir, code, .codigo, .usuario-nombre';
  const ATRIBUTOS = ['title', 'placeholder', 'aria-label', 'alt'];

  function traducirNodo(n, idioma) {
    if (n.nodeType === 3) {
      const p = n.parentElement;
      if (!p || p.closest(NO_TRADUCIR) || /^(SCRIPT|STYLE)$/.test(p.tagName)) return;
      const t = traducir(n.nodeValue, idioma);
      if (t !== n.nodeValue) n.nodeValue = t;
      return;
    }
    if (n.nodeType !== 1 || n.closest(NO_TRADUCIR)) return;
    for (const a of ATRIBUTOS) if (n.hasAttribute(a)) { const v = n.getAttribute(a); const t = traducir(v, idioma); if (t !== v) n.setAttribute(a, t); }
    if (n.tagName === 'OPTGROUP' && n.label) n.label = traducir(n.label, idioma);
    for (const h of n.childNodes) traducirNodo(h, idioma);
  }

  function traducirArbol(raizDom, idioma) { if (idioma === 'en') traducirNodo(raizDom, idioma); }

  // Traduce también lo que se añada o cambie después (mensajes, editor, estados).
  function observar(raizDom, idioma) {
    if (idioma !== 'en') return null;
    traducirNodo(raizDom, idioma);
    const obs = new MutationObserver(cambios => {
      for (const c of cambios) {
        if (c.type === 'characterData') traducirNodo(c.target, idioma);
        else if (c.type === 'attributes') traducirNodo(c.target, idioma);
        else for (const n of c.addedNodes) traducirNodo(n, idioma);
      }
    });
    obs.observe(raizDom, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
    return obs;
  }

  // Idioma de la interfaz: el elegido o, en automático, el del sistema.
  const resolver = (elegido, sistema) => (elegido === 'es' || elegido === 'en' ? elegido : /^es\b/i.test(sistema || '') ? 'es' : 'en');

  const api = { EN, PATRONES, traducir, traducirArbol, observar, resolver };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.I18N = api;
})(typeof window !== 'undefined' ? window : globalThis);
