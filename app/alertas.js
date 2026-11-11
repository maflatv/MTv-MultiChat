// Overlay de alertas para OBS: follows, subs, regalos, donaciones y raids, una cada vez y en cola.
// Toda la apariencia sale de la configuración guardada (pestaña Alertas del dock).
/* global MC, document, window */
(() => {
  const escena = document.getElementById('escena');
  const enVista = new URLSearchParams(window.location.search).has('vista');
  let op = null;
  const cola = [];
  let actual = null;
  let audio = null;

  const ETIQUETA = { follow: 'Nuevo seguidor', suscripcion: 'Suscripción', regalo_subs: 'Subs regalados', donacion: 'Donación', raid: 'Raid', aviso: 'Canje' };

  function aplicar(nueva) {
    op = nueva;
    const r = document.documentElement.style;
    r.setProperty('--tamano', `${op.tamano}px`);
    r.setProperty('--acento', op.acento);
    r.setProperty('--fuente', `"${op.fuente}", "Segoe UI", system-ui, sans-serif`);
    r.setProperty('--duracion', `${op.duracion}s`);
    MC.cargarFuente(op.fuente);
    r.setProperty('--tam-imagen', `${op.tamImagen || 2.6}em`);
    document.body.className = [`estilo-${op.estilo}`, `pos-${op.posicion}`, `disp-${op.disposicion || 'derecha'}`, `alin-${op.alinearTexto || 'izquierda'}`, `entrada-${op.entrada || 'rebote'}`, `salida-${op.salida || 'desvanecer'}`].join(' ');

  }

  function importeTexto(m) {
    const i = m.importe;
    if (!i) return '';
    if (i.texto) return i.texto;
    const nombres = { BITS: 'bits', KICKS: 'KICKs', MONEDAS: 'monedas' };
    return nombres[i.moneda] ? `${i.valor} ${nombres[i.moneda]}` : `${i.valor} ${i.moneda}`;
  }

  // Plantilla propia del usuario o el título que da la plataforma.
  function titulo(m) {
    const plantilla = op.plantillas?.[m.tipo];
    const nombre = m.autor.nombre || 'Alguien';
    if (plantilla) {
      const vars = { nombre, cantidad: m.cantidad || '', importe: importeTexto(m), plataforma: MC.PLATAFORMAS[m.plataforma]?.nombre || '' };
      return plantilla.replace(/\{(\w+)\}/g, (t, k) => (k in vars ? String(vars[k]) : t));
    }
    if (m.titulo && m.tipo !== 'donacion') return m.titulo;
    if (m.tipo === 'donacion') return `${nombre} · ${m.titulo || importeTexto(m)}`;
    return m.titulo || nombre;
  }

  const pasa = m => m.tipo !== 'mensaje' && op.tipos?.[m.tipo] && !(m.tipo === 'donacion' && m.importe?.usd != null && m.importe.usd < op.minimoUsd);

  function encolar(m) {
    if (!op || !pasa(m)) return;
    cola.push(m);
    if (!actual) siguiente();
  }

  function siguiente() {
    actual = cola.shift() || null;
    escena.replaceChildren();
    if (!actual) return;
    const m = actual;
    const caja = MC.el('div', `alerta tipo-${m.tipo}`);
    caja.dataset.plataforma = m.plataforma;
    const cab = MC.el('div', 'cabecera');
    cab.append(MC.iconoPlataforma(m.plataforma), MC.el('span', 'etiqueta', ETIQUETA[m.tipo] || m.tipo));
    caja.append(cab);
    const cuerpo = MC.el('div', 'cuerpo');
    // Imagen o animación propia (del tipo de alerta o general); si no hay, avatar o imagen del regalo.
    const propio = op.porTipo?.[m.tipo]?.medio || op.medio;
    const imagen = m.imagen || m.autor.avatar;
    if (/^\/medios\/[^/]+$/.test(propio || '')) {
      const video = /\.(mp4|webm)$/i.test(propio);
      const v = MC.el(video ? 'video' : 'img', 'imagen propia');
      v.src = propio;
      if (video) { v.autoplay = true; v.muted = !op.sonidoVideo; v.playsInline = true; v.volume = op.volumen; } else v.alt = '';
      cuerpo.append(v);
    } else if (/^https:\/\//.test(imagen || '')) {
      const img = MC.el('img', m.imagen ? 'imagen regalo' : 'imagen avatar');
      img.src = imagen;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => img.remove();
      cuerpo.append(img);
    }
    const textos = MC.el('div', 'textos');
    textos.append(MC.el('div', 'titulo', titulo(m)));
    const imp = importeTexto(m);
    if (imp && m.tipo === 'donacion' && !(m.titulo || '').includes(imp)) textos.append(MC.el('div', 'importe', imp));
    if (op.mensaje && m.partes.length) {
      // Solo el texto del mensaje, sin nombre ni iconos: se reutiliza el dibujado común.
      const linea = MC.dibujarMensaje({ ...m, tipo: 'mensaje', autor: { ...m.autor, nombre: '', avatar: null, roles: {}, insignias: [] }, imagen: null }, { plataforma: false, roles: false, avatar: false }).querySelector('.texto');
      if (linea) { linea.classList.add('mensaje'); textos.append(linea); }
    }
    cuerpo.append(textos);
    caja.append(cuerpo);
    escena.append(caja);
    sonar(op.porTipo?.[m.tipo]?.sonido || op.sonido, op.volumen);
    clearTimeout(siguiente.t);
    siguiente.t = setTimeout(() => {
      caja.classList.add('saliendo');
      setTimeout(siguiente, op.salida === 'ninguna' ? 0 : 600);
    }, Math.max(op.duracion, 2) * 1000);
  }

  // Sonidos sintetizados: no hacen falta archivos.
  function sonar(tipo, volumen) {
    if (!tipo || tipo === 'ninguno' || !volumen) return;
    if (/^\/(sonidos|medios)\/[^/]+$/.test(tipo)) {
      const a = new Audio(tipo);
      a.volume = Math.min(Math.max(volumen, 0), 1);
      a.play().catch(() => { /* el navegador puede bloquear el sonido sin interacción; en OBS suena */ });
      return;
    }
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audio.currentTime + 0.02;
      const notas = { campana: [[880, 0], [1320, 0.12], [1760, 0.24]], moneda: [[988, 0], [1319, 0.08]], suave: [[523, 0], [659, 0.15], [784, 0.3]] }[tipo] || [];
      for (const [f, d] of notas) {
        const osc = audio.createOscillator();
        const g = audio.createGain();
        osc.type = tipo === 'moneda' ? 'square' : 'sine';
        osc.frequency.value = f;
        g.gain.setValueAtTime(0, t0 + d);
        g.gain.linearRampToValueAtTime(volumen * (tipo === 'moneda' ? 0.12 : 0.3), t0 + d + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + (tipo === 'suave' ? 0.9 : 0.5));
        osc.connect(g).connect(audio.destination);
        osc.start(t0 + d);
        osc.stop(t0 + d + 1);
      }
    } catch { /* sin audio */ }
  }

  function muestra() {
    encolar({ id: 'muestra', plataforma: 'twitch', tipo: 'suscripcion', titulo: 'LunaPixel se ha suscrito 6 meses', cantidad: 6, autor: { nombre: 'LunaPixel', roles: {} }, partes: [{ t: 'texto', v: MC.t('¡Medio año ya! Así se verán tus alertas') }], importe: null });
  }

  MC.conectar({
    inicio(e) {
      aplicar(e.alertas);
      if (enVista) muestra();
    },
    mensaje(e) { encolar(e.m); },
    borrar(e) {
      // Un moderador borró el mensaje: si aún no ha salido, no sale.
      for (let i = cola.length - 1; i >= 0; i--) if (e.ids.includes(cola[i].id)) cola.splice(i, 1);
    },
    alertas(e) {
      aplicar(e.alertas);
      if (enVista) { cola.length = 0; actual = null; muestra(); }
    },
  });
})();
