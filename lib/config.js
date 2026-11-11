// Configuración del usuario en userdata/config.json. Se escribe entera de una vez (archivo temporal + renombrar)
// para que un cierre a mitad de escritura no la deje rota.
const fs = require('fs');
const path = require('path');
const { PUENTE_POR_DEFECTO } = require('./conectores/kick.js');
const { CLIENT_ID_POR_DEFECTO } = require('./conectores/twitch-cuenta.js');

const POR_DEFECTO = {
  cuentas: {
    // sesion/usuario/clientId: cuenta de Twitch opcional (follows, canjes, avatares e insignias).
    twitch: { activa: false, canal: '', usuario: '', clientId: '', sesion: null },
    youtube: { activa: false, canal: '' },
    tiktok: { activa: false, canal: '' },
    // modo 'oficial' (inicio de sesión + puente) o 'ventana' (solo app de escritorio).
    kick: { activa: false, modo: 'oficial', canal: '', usuario: '', puente: '', sesion: null },
  },
  overlay: {
    tema: 'tarjetas',          // 'tarjetas' | 'limpio' | 'burbujas' | 'neon' | 'cristal'
    fuente: 'Segoe UI',
    acento: '#a56bff',         // color de los estilos Neón y Cristal y del mensaje destacado
    iconoEstilo: 'color',      // logotipo de la plataforma: 'color' | 'insignia' | 'blanco'
    colorTexto: '#ffffff',     // color del texto de los mensajes
    colorFondo: '#100e18',     // color del fondo de cada mensaje (su transparencia es 'fondo')
    colorNombre: 'usuario',    // 'usuario' (el suyo; si no tiene, el del tema) | 'tema' | 'plataforma' | 'fijo'
    temaNombres: 'vivos',      // paleta de app/comun.js (TEMAS_NOMBRES); cada usuario recibe siempre el mismo color
    nombreFijo: '#c9b8ff',
    grosor: 'normal',          // 'normal' | 'negrita'
    separacion: 'normal',      // 'compacta' | 'normal' | 'amplia'
    tamEmotes: 1.6,            // alto de los emotes respecto al texto
    interlineado: 1.35,        // altura de línea respecto al tamaño de letra (recomendado 1,3–1,5)
    disposicion: 'linea',      // 'linea' (nombre: mensaje) | 'dos' (nombre arriba, mensaje debajo)
    lado: 'izquierda',         // 'izquierda' | 'derecha'
    agrupar: false,            // mensajes seguidos de la misma persona sin repetir nombre ni iconos
    difuminar: false,          // difuminar la parte de arriba del chat
    recortar: 0,               // cortar mensajes de más de N caracteres (0 = no)
    lineas: 0,                 // máximo de líneas por mensaje en pantalla (0 = sin límite)
    ocultarLargos: 0,          // no mostrar mensajes de más de N caracteres (0 = mostrarlos todos)
    opacidad: 1,               // opacidad de todo el chat (1 = sin transparencia)
    contorno: 1,               // contorno del texto para leerlo sobre cualquier fondo: 0 ninguno, 1 fino, 2 grueso
    ocultarComandos: true,     // mensajes que empiezan por "!"
    ocultarBots: true,
    bots: 'nightbot, streamelements, streamlabs, moobot, fossabot, wizebot, botrix, kickbot, sery_bot',
    tamano: 22,                // px del texto del mensaje
    maximo: 12,                // mensajes visibles a la vez
    duracion: 0,               // segundos que se ve cada mensaje; 0 = no desaparecen
    avatar: true,
    plataforma: true,          // icono de la plataforma
    roles: true,               // etiquetas MOD / VIP / SUB
    eventos: true,             // mostrar subs, bits, raids...
    soloEventos: false,
    alinear: 'abajo',          // los mensajes nuevos entran por 'abajo' o por 'arriba'
    fondo: 0.55,               // opacidad del fondo de cada mensaje (0–1)
    animacion: 'deslizar',     // 'deslizar' | 'aparecer' | 'ninguna'
  },
  // Vista del dock. opacidad y encima solo tienen efecto en la app de escritorio (ver el chat sobre el juego).
  dock: { tamano: 15, opacidad: 1, encima: false },
  // Overlay de alertas (http://localhost:7390/alertas): una alerta grande cada vez, en cola.
  alertas: {
    tipos: { follow: true, suscripcion: true, regalo_subs: true, donacion: true, raid: true, aviso: false },
    minimoUsd: 0,              // las donaciones por debajo de este importe (en USD aprox.) no salen como alerta
    duracion: 7,               // segundos en pantalla
    estilo: 'neon',            // 'neon' | 'clasico' | 'minimal'
    posicion: 'centro',        // 'arriba' | 'centro' | 'abajo'
    tamano: 34,
    acento: '#a56bff',
    fuente: 'Segoe UI',
    mensaje: true,             // mostrar el mensaje que acompaña a la donación o la sub
    // Sonido: generado ('campana' | 'moneda' | 'suave'), 'ninguno', uno de serie ('/sonidos/x.ogg') o uno propio ('/medios/x.mp3').
    sonido: '/sonidos/fanfarria-8bits.ogg',
    volumen: 0.6,
    // Imagen, GIF o vídeo propio ('/medios/x.gif'); vacío = avatar del usuario o imagen del regalo.
    medio: '',
    sonidoVideo: false,        // si el vídeo propio suena (además del sonido de la alerta)
    tamImagen: 2.6,            // tamaño de la imagen o animación, respecto al texto
    entrada: 'rebote',         // 'rebote' | 'aparecer' | 'desde-abajo' | 'desde-arriba' | 'desde-izquierda' | 'desde-derecha' | 'zoom' | 'girar' | 'sacudir' | 'ninguna'
    salida: 'desvanecer',      // 'desvanecer' | 'hacia-arriba' | 'hacia-abajo' | 'zoom' | 'ninguna'
    disposicion: 'derecha',    // dónde va el texto respecto a la imagen: 'derecha' | 'izquierda' | 'debajo' | 'encima' | 'superpuesto'
    alinearTexto: 'izquierda', // 'izquierda' | 'centro' | 'derecha'
    // Sonido e imagen propios de cada tipo de alerta. Vacío = los generales.
    porTipo: {
      follow: { sonido: '', medio: '' }, suscripcion: { sonido: '', medio: '' }, regalo_subs: { sonido: '', medio: '' },
      donacion: { sonido: '', medio: '' }, raid: { sonido: '', medio: '' }, aviso: { sonido: '', medio: '' },
    },
    // Textos propios por tipo. Vacío = texto de la plataforma. Variables: {nombre} {cantidad} {importe} {plataforma}
    plantillas: { follow: '', suscripcion: '', regalo_subs: '', donacion: '', raid: '', aviso: '' },
  },
};

function mezclar(base, cambios) {
  const r = { ...base };
  for (const [k, v] of Object.entries(cambios || {})) {
    if (!(k in base)) continue;
    const objeto = x => x && typeof x === 'object' && !Array.isArray(x);
    // La sesión se guarda o se borra entera; el resto se mezcla campo a campo.
    r[k] = k !== 'sesion' && objeto(base[k]) && objeto(v) ? mezclar(base[k], v) : v;
  }
  return r;
}

class Config {
  constructor(archivo) {
    this.archivo = archivo;
    let guardada = {};
    try { guardada = JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch { /* primera vez o archivo dañado */ }
    this.datos = mezclar(POR_DEFECTO, guardada);
  }

  // Lo que pueden ver las páginas: sin tokens de sesión.
  publica() {
    const copia = JSON.parse(JSON.stringify(this.datos));
    for (const c of Object.values(copia.cuentas)) {
      if ('sesion' in c) { c.conSesion = !!c.sesion?.access_token; delete c.sesion; }
    }
    copia.cuentas.kick.puenteListo = !!(copia.cuentas.kick.puente || PUENTE_POR_DEFECTO);
    copia.cuentas.twitch.clientIdListo = !!(copia.cuentas.twitch.clientId || CLIENT_ID_POR_DEFECTO);
    return copia;
  }

  cambiar(cambios) {
    this.datos = mezclar(this.datos, cambios);
    fs.mkdirSync(path.dirname(this.archivo), { recursive: true });
    const tmp = this.archivo + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.datos, null, 2));
    fs.renameSync(tmp, this.archivo);
  }
}

module.exports = { Config, POR_DEFECTO };
