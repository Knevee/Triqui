/* Triqui Neón — ui.js
 * Todo lo DOM: pantallas, tablero, animaciones, mensajes, estadísticas y persistencia.
 * No contiene reglas del juego (eso vive en game.js) ni IA (ai.js).
 */
(function (root) {
  'use strict';

  var G = root.TriquiGame;
  var Sound = root.TriquiSound;

  var STORE_KEY = 'triquiNeon.v1';
  var DIFFS = ['easy', 'medium', 'hard', 'hardcore'];
  var DIFF_LABEL = { easy: '🌱 FÁCIL', medium: '⚡ MEDIO', hard: '🧠 DIFÍCIL', hardcore: '🔥 HARDCORE' };

  var TAUNTS = {
    thinking: {
      easy: ['Hmm… ¿aquí? ¿o aquí? 🤔', 'Estoy pensando… creo. 🌱'],
      medium: ['Calculando jugada… ⚡', 'A ver si te pillo…'],
      hard: ['Analizando tus patrones… 🧠', 'Interesante. Muy interesante.'],
      hardcore: ['Ya vi 200 futuros. Pierdes en todos. 🔥', 'Corre. Todavía puedes rendirte. 😈', 'Tic… tac… tu final se acerca.']
    },
    winUser: ['¡BRUTAL! La parrilla es tuya. 🏆', '¡Neón total! Sigue la racha 🔥', 'Lo clavaste. ¿Otra? ⚡'],
    loseUser: {
      easy: ['Vaya… hasta yo pierdo a veces. 🌱', 'Te dejé ganar… no, espera. 😅'],
      medium: ['Buena partida. La revancha te espera. ⚡', 'Casi. ¡Otra!'],
      hard: ['Te lo dije: casi no perdono. 🧠', 'Bien jugado. Pero no suficiente.'],
      hardcore: ['JA. Vuelve cuando sepas jugar. 😈🔥', 'Empatarme es tu techo. Acéptalo.', '¿Eso fue tu mejor jugada? Adorable.']
    },
    draw: ['Empate cósmico. Nadie parpadea. 🌀', 'Tablas. La parrilla exige revancha.']
  };

  // ---------- Persistencia (try/catch) ----------
  function statsVacios() {
    function cero() { return { w: 0, l: 0, d: 0, streak: 0, best: 0 }; }
    return {
      ai: { easy: cero(), medium: cero(), hard: cero(), hardcore: cero() },
      pvp: { p1: 0, p2: 0, d: 0, total: 0, streakOwner: null, streak: 0, best: 0 }
    };
  }

  function loadStore() {
    var data = { stats: statsVacios(), soundOn: false, lastMode: 'ai', lastDiff: 'medium' };
    try {
      var raw = root.localStorage ? root.localStorage.getItem(STORE_KEY) : null;
      if (raw) {
        var p = JSON.parse(raw);
        if (p && p.stats) {
          // Fusión defensiva por si el esquema cambió.
          data.stats = Object.assign(statsVacios(), p.stats);
          data.stats.ai = Object.assign(statsVacios().ai, p.stats.ai || {});
          DIFFS.forEach(function (d) {
            data.stats.ai[d] = Object.assign({ w: 0, l: 0, d: 0, streak: 0, best: 0 }, (p.stats.ai || {})[d] || {});
          });
          data.stats.pvp = Object.assign(statsVacios().pvp, p.stats.pvp || {});
        }
        if (typeof p.soundOn === 'boolean') data.soundOn = p.soundOn;
        if (p.lastMode === 'ai' || p.lastMode === 'pvp') data.lastMode = p.lastMode;
        if (DIFFS.indexOf(p.lastDiff) !== -1) data.lastDiff = p.lastDiff;
      }
    } catch (e) { /* almacenamiento no disponible: se juega sin persistir */ }
    return data;
  }

  function saveStore(data) {
    try {
      if (root.localStorage) root.localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch (e) { /* ignorar: cuota o modo privado */ }
  }

  function registrarResultado(store, ctx, resultado) {
    // ctx: { mode:'ai'|'pvp', difficulty, winnerSymbol:'X'|'O'|null, userSymbol }
    // resultado: 'user' | 'cpu' | 'p1' | 'p2' | 'draw'
    if (ctx.mode === 'ai') {
      var s = store.stats.ai[ctx.difficulty] || (store.stats.ai[ctx.difficulty] = { w: 0, l: 0, d: 0, streak: 0, best: 0 });
      if (resultado === 'user') {
        s.w++; s.streak++;
        if (s.streak > s.best) s.best = s.streak;
      } else if (resultado === 'cpu') {
        s.l++; s.streak = 0;
      } else {
        s.d++; s.streak = 0;
      }
    } else {
      var p = store.stats.pvp;
      p.total++;
      if (resultado === 'p1') {
        p.p1++;
        if (p.streakOwner === 'X') p.streak++; else { p.streakOwner = 'X'; p.streak = 1; }
        if (p.streak > p.best) p.best = p.streak;
      } else if (resultado === 'p2') {
        p.p2++;
        if (p.streakOwner === 'O') p.streak++; else { p.streakOwner = 'O'; p.streak = 1; }
        if (p.streak > p.best) p.best = p.streak;
      } else {
        p.d++; p.streakOwner = null; p.streak = 0;
      }
    }
    saveStore(store);
  }

  // ---------- SVG de fichas ----------
  function svgX(fantasma) {
    return '<svg viewBox="0 0 64 64" class="' + (fantasma ? 'mark-ghost' : 'mark-x') + '" aria-hidden="true">' +
      '<path d="M14 14 L50 50 M50 14 L14 50" pathLength="100"/></svg>';
  }
  function svgO(fantasma) {
    return '<svg viewBox="0 0 64 64" class="' + (fantasma ? 'mark-ghost' : 'mark-o') + '" aria-hidden="true">' +
      '<circle cx="32" cy="32" r="19" pathLength="200"/></svg>';
  }
  function svgPara(sym, fantasma) {
    return sym === 'X' ? svgX(fantasma) : svgO(fantasma);
  }

  // ---------- Referencias DOM ----------
  var el = {};
  function cacheDom() {
    ['screen-home', 'screen-config', 'screen-game', 'liveStatus', 'floaters',
      'mode-badge', 'diff-badge', 'streak-badge', 'turn-chip', 'turn-text', 'thinking',
      'thinking-text', 'taunt', 'board', 'winline', 'winline-el',
      'score-label-p1', 'score-label-p2', 'score-p1', 'score-p2', 'score-draw',
      'score-sub-p1', 'score-sub-p2', 'score-total',
      'btn-sound', 'ic-sound-on', 'ic-sound-off', 'home-best',
      'resultModal', 'result-card', 'result-emoji', 'result-title', 'result-sub',
      'confirmModal', 'confirm-title', 'confirm-text', 'btn-confirm-yes', 'confetti'
    ].forEach(function (id) { el[id] = document.getElementById(id); });
    el.cells = Array.prototype.slice.call(document.querySelectorAll('#board .cell'));
  }

  // ---------- Modales con fallback sin Bootstrap ----------
  function modalInst(id) {
    var node = document.getElementById(id);
    if (root.bootstrap && root.bootstrap.Modal) {
      try { return root.bootstrap.Modal.getOrCreateInstance(node); } catch (e) { /* fallback abajo */ }
    }
    return {
      show: function () { node.classList.add('show'); node.style.display = 'block'; node.removeAttribute('aria-hidden'); document.body.classList.add('modal-open'); },
      hide: function () { node.classList.remove('show'); node.style.display = 'none'; node.setAttribute('aria-hidden', 'true'); document.body.classList.remove('modal-open'); var bd = document.querySelector('.modal-backdrop'); if (bd && !root.bootstrap) bd.remove(); }
    };
  }

  var confirmResolver = null;
  function askConfirm(titulo, texto) {
    el['confirm-title'].textContent = titulo;
    el['confirm-text'].textContent = texto;
    modalInst('confirmModal').show();
    return new Promise(function (resolve) { confirmResolver = resolve; });
  }
  function wireConfirm() {
    el['btn-confirm-yes'].addEventListener('click', function () {
      modalInst('confirmModal').hide();
      if (confirmResolver) { confirmResolver(true); confirmResolver = null; }
    });
    el.confirmModal.addEventListener('hidden.bs.modal', function () {
      if (confirmResolver) { confirmResolver(false); confirmResolver = null; }
    });
  }

  // ---------- Pantallas ----------
  function show(nombre) {
    ['home', 'config', 'game'].forEach(function (n) {
      document.getElementById('screen-' + n).classList.toggle('is-active', n === nombre);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function announce(msg) {
    el.liveStatus.textContent = '';
    // Pequeño retardo para que los lectores anuncien el cambio.
    setTimeout(function () { el.liveStatus.textContent = msg; }, 30);
  }

  // ---------- Tablero ----------
  function filaCol(i) {
    return { fila: Math.floor(i / 3) + 1, col: (i % 3) + 1 };
  }

  function pintarTablero(state, interactivo) {
    el.cells.forEach(function (cell) {
      var i = parseInt(cell.dataset.index, 10);
      var v = state.board[i];
      var mark = cell.querySelector('.mark');
      cell.classList.toggle('filled', v === 'X' || v === 'O');
      // OJO: no se usa `disabled` físico. Un botón deshabilitado no dispara
      // clic/teclado y, si un flag se quedara atascado, el tablero moriría.
      // Se marca con aria-disabled + clase visual; el handler rechaza lo inválido.
      var bloqueada = !interactivo || v === 'X' || v === 'O' || state.status !== 'playing';
      cell.setAttribute('aria-disabled', String(bloqueada));
      cell.classList.toggle('is-off', bloqueada);
      if (v === 'X' || v === 'O') {
        if (!cell.dataset.sym || cell.dataset.sym !== v) {
          mark.innerHTML = svgPara(v, false);
          cell.dataset.sym = v;
          // Re-dispara la animación de trazo al repintar.
          var svg = mark.querySelector('svg');
          if (svg) { svg.style.animation = 'none'; void svg.offsetWidth; svg.style.animation = ''; }
          cell.classList.remove('placed'); void cell.offsetWidth; cell.classList.add('placed');
        }
      } else {
        mark.innerHTML = '';
        delete cell.dataset.sym;
        cell.classList.remove('placed');
      }
      cell.classList.toggle('win', !!(state.winLine && state.winLine.indexOf(i) !== -1));
      var rc = filaCol(i);
      var estado = v === 'X' ? 'con X' : v === 'O' ? 'con O' : 'vacía';
      cell.setAttribute('aria-label', 'Fila ' + rc.fila + ', columna ' + rc.col + ', ' + estado);
    });
    var board = el.board;
    board.classList.toggle('dim', state.status === 'won');
    board.dataset.turn = state.current;
    if (state.status === 'won' && state.winLine) {
      trazarLinea(state.winLine);
    } else {
      el.winline.classList.remove('go');
    }
  }

  function trazarLinea(line) {
    // viewBox 300x300: centros en (col*100+50, fila*100+50), extendida 32px.
    function centro(i) { return { x: (i % 3) * 100 + 50, y: Math.floor(i / 3) * 100 + 50 }; }
    var a = centro(line[0]), b = centro(line[2]);
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.hypot(dx, dy) || 1;
    var ex = (dx / len) * 34, ey = (dy / len) * 34;
    var l = el['winline-el'];
    l.setAttribute('x1', a.x - ex); l.setAttribute('y1', a.y - ey);
    l.setAttribute('x2', a.x - ex); l.setAttribute('y2', a.y - ey);
    el.winline.classList.remove('go');
    void el.winline.getBoundingClientRect();
    requestAnimationFrame(function () {
      l.setAttribute('x2', b.x + ex); l.setAttribute('y2', b.y + ey);
      el.winline.classList.add('go');
    });
  }

  // Vista previa fantasma en hover/foco (solo casillas vacías y turno activo).
  function wireGhost(getPuedeJugar) {
    el.cells.forEach(function (cell) {
      cell.addEventListener('mouseenter', function () { fantasma(cell, getPuedeJugar, true); });
      cell.addEventListener('mouseleave', function () { limpiarFantasma(cell); });
      cell.addEventListener('focus', function () { fantasma(cell, getPuedeJugar, true); });
      cell.addEventListener('blur', function () { limpiarFantasma(cell); });
    });
  }
  function fantasma(cell, getPuedeJugar, on) {
    var i = parseInt(cell.dataset.index, 10);
    var ctx = getPuedeJugar();
    if (!on || !ctx.puede || cell.dataset.sym) return;
    cell.querySelector('.mark').innerHTML = svgPara(ctx.turno, true);
  }
  function limpiarFantasma(cell) {
    if (!cell.dataset.sym) cell.querySelector('.mark').innerHTML = '';
  }

  // ---------- Turno / badges / marcador ----------
  function pintarTurno(texto, turno, pensando, textoPensando) {
    var chip = el['turn-chip'];
    chip.classList.toggle('turn-x', turno === 'X');
    chip.classList.toggle('turn-o', turno === 'O');
    el['turn-text'].textContent = texto;
    el.thinking.hidden = !pensando;
    if (textoPensando) el['thinking-text'].textContent = textoPensando;
    announce(texto);
  }

  function pintarTaunt(msg) {
    el.taunt.textContent = msg || '';
  }

  function pintarBadges(mode, difficulty, racha) {
    el['mode-badge'].textContent = mode === 'ai' ? '🤖 VS MÁQUINA' : '👥 2 JUGADORES';
    var badge = el['diff-badge'];
    if (mode === 'ai') {
      badge.hidden = false;
      badge.textContent = DIFF_LABEL[difficulty] || '';
      badge.className = 'badge-neon ' + difficulty;
    } else {
      badge.hidden = true;
    }
    el['streak-badge'].textContent = '🔥 Racha ' + racha;
    document.body.dataset.difficulty = difficulty || 'medium';
  }

  function popNum(node, valor) {
    if (node.textContent !== String(valor)) {
      node.textContent = String(valor);
      node.classList.remove('pop'); void node.offsetWidth; node.classList.add('pop');
    }
  }

  function pintarMarcador(vista) {
    // vista: { p1label, p2label, p1, p2, draws, total, p1sub, p2sub }
    el['score-label-p1'].textContent = vista.p1label;
    el['score-label-p2'].textContent = vista.p2label;
    popNum(el['score-p1'], vista.p1);
    popNum(el['score-p2'], vista.p2);
    popNum(el['score-draw'], vista.draws);
    el['score-total'].textContent = vista.total + (vista.total === 1 ? ' partida' : ' partidas');
    if (vista.p1sub) el['score-sub-p1'].textContent = vista.p1sub;
    if (vista.p2sub) el['score-sub-p2'].textContent = vista.p2sub;
  }

  function pintarMejorRacha(store) {
    var mejor = { v: 0, donde: '' };
    DIFFS.forEach(function (d) {
      var b = (store.stats.ai[d] || {}).best || 0;
      if (b > mejor.v) mejor = { v: b, donde: DIFF_LABEL[d] };
    });
    el['home-best'].innerHTML = mejor.v > 0
      ? '🔥 Mejor racha: <b>' + mejor.v + '</b> (' + mejor.donde + ')'
      : '🔥 Mejor racha: — (¡juega y marca la primera!)';
  }

  // ---------- Resultado ----------
  function mostrarResultado(kind, titulo, sub, emoji) {
    // kind: 'win' | 'lose' | 'draw'
    el['result-card'].classList.remove('result-win', 'result-lose', 'result-draw');
    el['result-card'].classList.add('result-' + kind);
    el['result-title'].textContent = titulo;
    el['result-sub'].textContent = sub;
    el['result-emoji'].textContent = emoji;
    modalInst('resultModal').show();
    announce(titulo + '. ' + sub);
  }
  function ocultarResultado() { modalInst('resultModal').hide(); }

  // ---------- Efectos ----------
  var reduceMotion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function shakeBoard() {
    if (reduceMotion) return;
    el.board.classList.remove('shake'); void el.board.offsetWidth; el.board.classList.add('shake');
  }
  function drawPulse() {
    if (reduceMotion) return;
    el.board.classList.remove('draw-pulse'); void el.board.offsetWidth; el.board.classList.add('draw-pulse');
  }

  var confettiParts = [];
  var confettiRunning = false;
  function confettiBurst(n) {
    if (reduceMotion) return;
    var cv = el.confetti;
    var ctx = cv.getContext('2d');
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    var colores = ['#00f0ff', '#ff2bd6', '#ffe600', '#2effa8', '#ffffff'];
    for (var i = 0; i < (n || 140); i++) {
      confettiParts.push({
        x: window.innerWidth / 2 + (Math.random() - 0.5) * 200,
        y: window.innerHeight * 0.35,
        vx: (Math.random() - 0.5) * 11,
        vy: Math.random() * -9 - 2,
        s: Math.random() * 7 + 3,
        c: colores[i % colores.length],
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        life: 1
      });
    }
    if (!confettiRunning) { confettiRunning = true; requestAnimationFrame(tickConfetti.bind(null, ctx)); }
  }
  function tickConfetti(ctx) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    confettiParts = confettiParts.filter(function (p) { return p.life > 0 && p.y < ctx.canvas.height + 20; });
    confettiParts.forEach(function (p) {
      p.vy += 0.28; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= 0.008;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
      ctx.restore();
    });
    if (confettiParts.length) requestAnimationFrame(tickConfetti.bind(null, ctx));
    else { confettiRunning = false; ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); }
  }

  // Partículas flotantes del fondo (CSS + JS ligero).
  function initFloaters() {
    if (reduceMotion || !el.floaters) return;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 22; i++) {
      var s = document.createElement('span');
      var size = 4 + Math.random() * 10;
      s.style.width = size + 'px'; s.style.height = size + 'px';
      s.style.left = (Math.random() * 100) + 'vw';
      s.style.bottom = '-20px';
      s.style.background = ['#00f0ff', '#ff2bd6', '#ffe600'][i % 3];
      s.style.boxShadow = '0 0 10px ' + s.style.background;
      s.style.animationDuration = (9 + Math.random() * 12) + 's';
      s.style.animationDelay = (-Math.random() * 14) + 's';
      if (Math.random() < 0.4) s.style.borderRadius = '50%';
      frag.appendChild(s);
    }
    el.floaters.appendChild(frag);
  }

  // ---------- Sonido ----------
  function pintarSonido(on) {
    el['ic-sound-on'].hidden = !on;
    el['ic-sound-off'].hidden = on;
    var btn = el['btn-sound'];
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Silenciar sonido' : 'Activar sonido');
  }

  function pickAzar(arr, rand) {
    var r = (rand || Math.random)();
    return arr[Math.floor(r * arr.length)];
  }

  root.TriquiUI = {
    DIFFS: DIFFS,
    DIFF_LABEL: DIFF_LABEL,
    TAUNTS: TAUNTS,
    loadStore: loadStore,
    saveStore: saveStore,
    registrarResultado: registrarResultado,
    cacheDom: cacheDom,
    wireConfirm: wireConfirm,
    wireGhost: wireGhost,
    show: show,
    announce: announce,
    pintarTablero: pintarTablero,
    pintarTurno: pintarTurno,
    pintarTaunt: pintarTaunt,
    pintarBadges: pintarBadges,
    pintarMarcador: pintarMarcador,
    pintarMejorRacha: pintarMejorRacha,
    mostrarResultado: mostrarResultado,
    ocultarResultado: ocultarResultado,
    askConfirm: askConfirm,
    shakeBoard: shakeBoard,
    drawPulse: drawPulse,
    confettiBurst: confettiBurst,
    initFloaters: initFloaters,
    pintarSonido: pintarSonido,
    pickAzar: pickAzar,
    modalInst: modalInst,
    svgPara: svgPara
  };
})(typeof self !== 'undefined' ? self : this);
