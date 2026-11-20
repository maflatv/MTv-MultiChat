// Panel de espectadores (pensado como panel personalizado de OBS): una fila por plataforma activa con su logo,
// los espectadores de ahora y el máximo del directo, y el total. Los datos llegan con el estado de las conexiones.
(() => {
  const $ = id => document.getElementById(id);
  const ORDEN = ['twitch', 'youtube', 'tiktok', 'kick'];
  const TEXTO_ESTADO = { conectando: 'Conectando…', reconectando: 'Reconectando', esperando: 'Sin directo', revisar: 'Revisar', error: 'Error' };
  let conexiones = [];
  let sesionTwitch = false;
  const anteriores = new Map();
  const n = v => v.toLocaleString(MC.idioma === 'en' ? 'en' : 'es');

  function nota(c) {
    if (c.estado !== 'conectado') return TEXTO_ESTADO[c.estado] || c.estado;
    if (Number.isFinite(c.espectadores)) return '';
    if (c.plataforma === 'twitch' && !sesionTwitch) return 'Inicia sesión en el dock';
    return '';
  }

  function cifra(nodo, clave, valor) {
    const antes = anteriores.get(clave);
    nodo.textContent = valor == null ? '—' : n(valor);
    nodo.classList.remove('sube', 'baja');
    if (valor != null && antes != null && valor !== antes) {
      void nodo.offsetWidth; // reinicia la animación
      nodo.classList.add(valor > antes ? 'sube' : 'baja');
    }
    anteriores.set(clave, valor);
  }

  function dibujar() {
    const activas = conexiones.filter(c => c.estado !== 'parado')
      .sort((a, b) => ORDEN.indexOf(a.plataforma) - ORDEN.indexOf(b.plataforma));
    const lista = $('lista');
    // Se reutilizan las filas para que las animaciones de subida y bajada se vean.
    const filas = new Map([...lista.children].map(f => [f.dataset.plataforma, f]));
    lista.replaceChildren(...activas.map(c => {
      let f = filas.get(c.plataforma);
      if (!f) {
        f = MC.el('div', 'fila');
        f.dataset.plataforma = c.plataforma;
        f.append(MC.iconoPlataforma(c.plataforma, 'insignia'), MC.el('span', 'v-nombre', MC.PLATAFORMAS[c.plataforma]?.nombre || c.plataforma),
          MC.el('b', 'v-cifra'), MC.el('span', 'v-nota'), MC.el('span', 'v-maximo'));
      }
      const tiene = Number.isFinite(c.espectadores);
      const texto = MC.t(nota(c));
      f.className = `fila e-${c.estado}${tiene ? '' : ' sin-cifra'}${texto ? '' : ' sin-nota'}`;
      cifra(f.querySelector('.v-cifra'), c.plataforma, tiene ? c.espectadores : null);
      f.querySelector('.v-nota').textContent = texto;
      f.querySelector('.v-maximo').textContent = Number.isFinite(c.maximo) ? `${MC.t('máx.')} ${n(c.maximo)}` : '';
      return f;
    }));

    const conCifra = activas.filter(c => Number.isFinite(c.espectadores));
    $('total').hidden = conCifra.length < 2;
    cifra($('total').querySelector('.v-cifra'), 'total', conCifra.reduce((s, c) => s + c.espectadores, 0));
    $('vacio').hidden = activas.length > 0;
  }

  // Solo hace falta saber si hay sesión de Twitch, para explicar por qué no hay cifra.
  const leerCuentas = () => fetch('/api/config').then(r => r.json()).then(c => { sesionTwitch = !!c.cuentas?.twitch?.conSesion; dibujar(); }).catch(() => {});

  MC.conectar({
    abierta() { $('caida').hidden = true; },
    caida() { $('caida').hidden = false; },
    inicio(e) { conexiones = e.conexiones || []; dibujar(); leerCuentas(); },
    conexiones(e) { conexiones = e.lista; dibujar(); },
    cuentas() { leerCuentas(); },
  });
})();
