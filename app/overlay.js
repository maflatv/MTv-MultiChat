// Overlay para OBS (fuente de navegador). Toda su apariencia viene de la configuración guardada,
// que se edita en el dock: la URL es siempre la misma y no lleva parámetros.
/* global MC, document, window */
(() => {
  const chat = document.getElementById('chat');
  const destacado = document.getElementById('destacado');
  // ?vista=1: la vista previa del dock, con mensajes de muestra si aún no hay ninguno.
  const enVista = new URLSearchParams(window.location.search).has('vista');
  let op = {};
  const temporizadores = new Map();

  function aplicar(nueva) {
    op = nueva;
    const r = document.documentElement.style;
    r.setProperty('--tamano', `${op.tamano}px`);
    r.setProperty('--fondo', String(op.fondo));
    r.setProperty('--fuente', op.fuente ? `"${op.fuente}", "Segoe UI", system-ui, sans-serif` : '');
    r.setProperty('--acento', op.acento || '#a56bff');
    r.setProperty('--opacidad', String(op.opacidad ?? 1));
    r.setProperty('--color-texto', op.colorTexto || '#ffffff');
    r.setProperty('--fondo-rgb', MC.rgb(op.colorFondo) || '16, 14, 24');
    r.setProperty('--emote', String(op.tamEmotes || 1.6));
    r.setProperty('--interlineado', String(op.interlineado || 1.35));
    MC.colocar(chat, op);
    r.setProperty('--lineas', String(op.lineas || 0));
    MC.cargarFuente(op.fuente);
    // Fondo claro y bastante opaco: los nombres se oscurecen en vez de aclararse.
    op.fondoClaro = op.tema !== 'limpio' && op.fondo >= 0.5 && /^#[0-9a-f]{6}$/i.test(op.colorFondo || '') && MC.luminancia(op.colorFondo) > 0.6;
    document.body.className = [
      `tema-${op.tema}`, `alinear-${op.alinear}`, `anim-${op.animacion}`, `contorno-${op.contorno ?? 1}`,
      `sep-${op.separacion || 'normal'}`, `grosor-${op.grosor || 'normal'}`, `disp-${op.disposicion || 'linea'}`, `lado-${op.lado || 'izquierda'}`,
      op.difuminar ? 'difuminar' : '',
      op.lineas > 0 ? 'con-lineas' : '',
    ].join(' ');
    bots = new Set(String(op.bots || '').toLowerCase().split(/[\s,;]+/).filter(Boolean));
    recortar();
  }

  let bots = new Set();
  const esBot = m => op.ocultarBots && bots.has(String(m.autor.nombre || '').toLowerCase());
  const esComando = m => op.ocultarComandos && m.tipo === 'mensaje' && /^\s*!/.test(m.texto || '');
  // Mensajes de chat demasiado largos (copypastas, spam): no se muestran. Los eventos siempre salen.
  const esLargo = m => op.ocultarLargos > 0 && m.tipo === 'mensaje' && MC.largoMensaje(m) > op.ocultarLargos;
  const visible = m => !(m.tipo !== 'mensaje' && !op.eventos) && !(op.soloEventos && m.tipo === 'mensaje') && !esBot(m) && !esComando(m) && !esLargo(m);

  function quitar(nodo) {
    clearTimeout(temporizadores.get(nodo));
    temporizadores.delete(nodo);
    if (op.animacion === 'ninguna') return nodo.remove();
    nodo.classList.add('saliendo');
    setTimeout(() => nodo.remove(), 400);
  }

  function recortar() {
    const nodos = [...chat.querySelectorAll('.msg:not(.saliendo)')];
    const sobran = nodos.length - (op.maximo || 12);
    // Con alinear-abajo los nuevos van al final, así que los más viejos están al principio (y al revés).
    const viejos = op.alinear === 'arriba' ? nodos.slice(-sobran) : nodos.slice(0, sobran);
    if (sobran > 0) viejos.forEach(quitar);
  }

  // Corta mensajes largos (solo el texto; los emotes cuentan como un carácter).
  function acortar(m) {
    const max = Number(op.recortar) || 0;
    if (!max || MC.largoMensaje(m) <= max) return m;
    let quedan = max;
    const partes = [];
    for (const p of m.partes) {
      if (quedan <= 0) break;
      if (p.t === 'emote') { partes.push(p); quedan -= 1; continue; }
      const trozo = Array.from(p.v);
      partes.push({ t: 'texto', v: trozo.slice(0, quedan).join('') });
      quedan -= trozo.length;
    }
    partes.push({ t: 'texto', v: '…' });
    return { ...m, partes };
  }

  function anadir(m) {
    if (!visible(m)) return;
    const nodo = MC.dibujarMensaje(acortar(m), op);
    // Agrupar: si la persona anterior es la misma, no se repiten nombre ni iconos.
    const vecino = op.alinear === 'arriba' ? chat.querySelector('.msg:not(.saliendo)') : [...chat.querySelectorAll('.msg:not(.saliendo)')].at(-1);
    if (op.agrupar && vecino?._autor && m.tipo === 'mensaje' && vecino._autor === `${m.plataforma}:${m.autor.id || m.autor.nombre}`) nodo.classList.add('seguido');
    nodo._autor = m.tipo === 'mensaje' ? `${m.plataforma}:${m.autor.id || m.autor.nombre}` : null;
    if (op.alinear === 'arriba') chat.prepend(nodo); else chat.append(nodo);
    if (op.duracion > 0) temporizadores.set(nodo, setTimeout(() => quitar(nodo), op.duracion * 1000));
    recortar();
  }

  function mostrarDestacado(m) {
    destacado.replaceChildren();
    destacado.hidden = !m;
    if (m) destacado.append(MC.dibujarMensaje(m, { ...op, avatar: true }));
  }

  MC.conectar({
    inicio(e) {
      aplicar(e.overlay);
      chat.replaceChildren();
      const ocultos = new Set(e.ocultos);
      // Al recargar la fuente en OBS se recuperan los últimos mensajes, sin temporizador de salida.
      const duracion = op.duracion;
      op.duracion = 0;
      for (const m of e.historial.slice(-op.maximo)) if (!ocultos.has(m.id)) anadir(m);
      op.duracion = duracion;
      if (enVista && !chat.children.length) muestras();
      mostrarDestacado(e.destacado);
    },
    mensaje(e) { anadir(e.m); },
    borrar(e) {
      for (const id of e.ids) chat.querySelectorAll(`.msg[data-id="${CSS.escape(id)}"]`).forEach(quitar);
    },
    destacar(e) { mostrarDestacado(e.m); },
    overlay(e) {
      aplicar(e.overlay);
      // En la vista previa se redibuja todo para ver el cambio al momento.
      if (enVista) { chat.replaceChildren(); muestras(); }
    },
  });

  function muestras() {
    const ej = [
      { plataforma: 'twitch', tipo: 'mensaje', autor: { nombre: 'LunaPixel', color: '#FF69B4', roles: { sub: true } }, partes: [{ t: 'texto', v: MC.t('¡Hola a todos! Así se verá el chat') }] },
      { plataforma: 'youtube', tipo: 'mensaje', autor: { nombre: 'ElGranTaco', color: '#1E90FF', roles: { mod: true } }, partes: [{ t: 'texto', v: MC.t('Se lee genial desde aquí') }] },
      { plataforma: 'tiktok', tipo: 'donacion', titulo: '5 USD', autor: { nombre: 'Sakura_Chan', roles: {} }, partes: [{ t: 'texto', v: MC.t('¡Sigue así!') }] },
      { plataforma: 'kick', tipo: 'mensaje', autor: { nombre: 'DonPepe', color: '#9ACD32', roles: { vip: true } }, partes: [{ t: 'texto', v: 'GG' }] },
      { plataforma: 'twitch', tipo: 'suscripcion', titulo: 'MarioGamer88 se ha suscrito 6 meses', autor: { nombre: 'MarioGamer88', roles: { sub: true } }, partes: [] },
    ];
    ej.forEach((m, i) => anadir({ id: `muestra:${i}`, ...m }));
  }
})();
