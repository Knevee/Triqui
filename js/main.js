/* Triqui Neón — main.js
 * Arranque y eventos: une game.js + ai.js + sound.js + ui.js.
 * Sin variables globales sueltas (todo dentro de una IIFE).
 */
(function () {
  'use strict';

  var Game = window.TriquiGame;
  var AI = window.TriquiAI;
  var Sound = window.TriquiSound;
  var UI = window.TriquiUI;

  // Configuración elegida por el usuario (vive solo aquí).
  var cfg = {
    mode: 'ai',            // 'ai' | 'pvp'
    difficulty: 'medium',  // easy|medium|hard|hardcore
    humanSymbol: 'X',
    starterPref: 'human',  // human|ai|random (modo ai)
    pvpStarter: 'X',       // X|O|random (modo pvp)
    names: { X: 'Jugador 1', O: 'Jugador 2' }
  };

  var store = UI.loadStore();
  var state = null;          // estado lógico de la ronda (game.js)
  var aiTimer = null;        // timeout del turno de la máquina
  var aiPensando = false;    // bloquea clics mientras piensa
  var roundId = 0;           // invalida timeouts viejos al navegar/reiniciar
  var audioUnlocked = false;

  // ---------- Utilidades ----------
  function $(id) { return document.getElementById(id); }

  function limpiarAiTimer() {
    roundId++;
    aiPensando = false;
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
  }

  function desbloquearAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    if (store.soundOn) Sound.crearContexto();
  }

  function clickSound() { Sound.play('click'); }

  function simboloUsuario() { return cfg.humanSymbol; }
  function simboloCpu() { return cfg.humanSymbol === 'X' ? 'O' : 'X'; }

  function resolverStarterAi() {
    if (cfg.starterPref === 'human') return simboloUsuario();
    if (cfg.starterPref === 'ai') return simboloCpu();
    return Math.random() < 0.5 ? 'X' : 'O';
  }
  function resolverStarterPvp() {
    if (cfg.pvpStarter === 'X' || cfg.pvpStarter === 'O') return cfg.pvpStarter;
    return Math.random() < 0.5 ? 'X' : 'O';
  }

  function nombrePvp(sym) {
    var n = (cfg.names[sym] || '').trim();
    return n || (sym === 'X' ? 'Jugador 1' : 'Jugador 2');
  }

  // ---------- Vistas de marcador ----------
  function vistaMarcador() {
    if (cfg.mode === 'ai') {
      var s = store.stats.ai[cfg.difficulty];
      var total = s.w + s.l + s.d;
      return {
        p1label: ('TÚ (' + simboloUsuario() + ')').toUpperCase(),
        p2label: ('CPU (' + simboloCpu() + ')').toUpperCase(),
        p1: s.w, p2: s.l, draws: s.d, total: total,
        p1sub: 'victorias', p2sub: 'victorias',
        racha: s.streak
      };
    }
    var p = store.stats.pvp;
    return {
      p1label: (nombrePvp('X') + ' (X)').toUpperCase(),
      p2label: (nombrePvp('O') + ' (O)').toUpperCase(),
      p1: p.p1, p2: p.p2, draws: p.d, total: p.total,
      p1sub: 'victorias', p2sub: 'victorias',
      racha: p.streak
    };
  }

  function refrescarCromo() {
    var v = vistaMarcador();
    UI.pintarMarcador(v);
    UI.pintarBadges(cfg.mode, cfg.difficulty, v.racha);
    UI.pintarMejorRacha(store);
  }

  // ---------- Turno ----------
  function textoTurno() {
    if (cfg.mode === 'ai') {
      return state.current === simboloUsuario()
        ? 'Tu turno (' + state.current + ')'
        : 'Turno de la CPU (' + state.current + ')';
    }
    return 'Turno de ' + nombrePvp(state.current) + ' (' + state.current + ')';
  }

  function puedeJugar() {
    var humanoToca = cfg.mode === 'pvp'
      ? state && state.status === 'playing' && !aiPensando
      : state && state.status === 'playing' && !aiPensando && state.current === simboloUsuario();
    return { puede: !!humanoToca, turno: state ? state.current : 'X' };
  }

  function pintarTurnoBase() {
    UI.pintarTurno(textoTurno(), state.current, aiPensando,
      aiPensando ? UI.pickAzar(UI.TAUNTS.thinking[cfg.difficulty] || UI.TAUNTS.thinking.medium) : null);
  }

  // ---------- Flujo de partida ----------
  function empezarPartida() {
    limpiarAiTimer();
    UI.ocultarResultado();
    var starter = cfg.mode === 'ai' ? resolverStarterAi() : resolverStarterPvp();
    state = Game.createState({
      mode: cfg.mode,
      humanSymbol: cfg.humanSymbol,
      starter: starter
    });
    store.lastMode = cfg.mode;
    if (cfg.mode === 'ai') store.lastDiff = cfg.difficulty;
    UI.saveStore(store);
    UI.show('game');
    $('btn-rematch').hidden = true;
    refrescarCromo();
    UI.pintarTaunt(mensajePrevio());
    UI.pintarTablero(state, puedeJugar().puede);
    pintarTurnoBase();
    if (cfg.mode === 'ai' && state.current === simboloCpu()) {
      turnoMaquina();
    }
  }

  function mensajePrevio() {
    if (cfg.mode === 'pvp') return 'Que gane el mejor. 😎';
    if (cfg.difficulty === 'hardcore') return UI.pickAzar(UI.TAUNTS.thinking.hardcore);
    if (cfg.difficulty === 'easy') return 'Modo relax: aquí se viene a divertirse. 🌱';
    return '';
  }

  function alHacerClicCasilla(i) {
    if (!state || state.status !== 'playing') return;
    // Fuera de turno: avisar en vez de ignorar en silencio.
    if (aiPensando || (cfg.mode === 'ai' && state.current !== simboloUsuario())) {
      UI.pintarTaunt('Espera tu turno… ⚡');
      return;
    }
    var r = Game.makeMove(state, i);
    if (!r.ok) {
      if (r.reason === 'occupied') UI.pintarTaunt('Esa casilla ya está ocupada, elige otra. 😅');
      return; // ocupada / inválida: se ignora sin romper nada
    }
    UI.pintarTaunt('');
    Sound.play(state.board[i] === 'X' ? 'move' : 'moveO');
    UI.pintarTablero(state, false);
    if (terminoRonda()) return;
    if (cfg.mode === 'ai') {
      UI.pintarTablero(state, false);
      turnoMaquina();
    } else {
      UI.pintarTablero(state, true);
      pintarTurnoBase();
    }
  }

  function turnoMaquina() {
    if (!state || state.status !== 'playing') return;
    var miRonda = roundId;
    aiPensando = true;
    UI.pintarTablero(state, false);
    var taunt = UI.pickAzar(UI.TAUNTS.thinking[cfg.difficulty] || UI.TAUNTS.thinking.medium);
    UI.pintarTurno(textoTurno(), state.current, true, taunt);
    UI.pintarTaunt(cfg.difficulty === 'hardcore' ? taunt : '');
    var espera = 400 + Math.random() * 500; // 400–900 ms
    aiTimer = setTimeout(function () {
      aiTimer = null;
      if (miRonda !== roundId || !state || state.status !== 'playing') return; // partida ya terminó o cambió
      try {
        var mv = AI.getBestMove(state.board.slice(), simboloCpu(), simboloUsuario(), cfg.difficulty, Math.random);
        // Red de seguridad: si la IA devolviera algo raro, usar primera libre.
        if (!Game.isValidMove(state.board, mv)) {
          var libres = Game.getAvailableMoves(state.board);
          mv = libres.length ? libres[0] : -1;
        }
        aiPensando = false;
        if (mv === -1) return;
        Game.makeMove(state, mv);
        Sound.play(state.board[mv] === 'X' ? 'move' : 'moveO');
      } catch (err) {
        // Si algo fallara en el turno de la IA, jugada de respaldo para
        // no dejar nunca el tablero bloqueado con la máquina "pensando".
        aiPensando = false;
        try {
          var fb = Game.getAvailableMoves(state.board);
          if (fb.length) Game.makeMove(state, fb[0]);
        } catch (e2) { /* se devuelve el turno aunque no haya respaldo */ }
      }
      UI.pintarTablero(state, false);
      if (terminoRonda()) return;
      UI.pintarTablero(state, true);
      pintarTurnoBase();
    }, espera);
  }

  function terminoRonda() {
    if (!state || state.status === 'playing') {
      if (state && state.status === 'playing') pintarTurnoBase();
      return false;
    }
    aiPensando = false;
    UI.pintarTablero(state, false);
    if (state.status === 'draw') {
      storeYpinta('draw');
      Sound.play('draw');
      UI.drawPulse();
      UI.pintarTurno('Empate', state.current, false);
      UI.pintarTaunt(UI.pickAzar(UI.TAUNTS.draw));
      setTimeout(function () {
        UI.mostrarResultado('draw', 'Empate cósmico 🌀',
          cfg.mode === 'ai' && cfg.difficulty === 'hardcore'
            ? 'Contra Hardcore, esto es una medalla. Revánchala.'
            : 'Nadie parpadea. La revancha lo decide todo.', '🌀');
        $('btn-rematch').hidden = false;
      }, 650);
      return true;
    }
    // Hubo ganador
    var ganoUsuario, titulo, sub, emoji, kind;
    if (cfg.mode === 'ai') {
      ganoUsuario = state.winner === simboloUsuario();
      if (ganoUsuario) {
        storeYpinta('user');
        Sound.play('win');
        UI.confettiBurst(cfg.difficulty === 'hardcore' ? 220 : 140);
        kind = 'win'; emoji = '🏆';
        titulo = UI.pickAzar(['¡Victoria neón!', '¡Lo clavaste!', '¡Brillas más que la parrilla!']);
        sub = cfg.difficulty === 'hardcore'
          ? '¡LE GANASTE A HARDCORE! Haz captura. Racha: ' + store.stats.ai[cfg.difficulty].streak + ' 🔥'
          : UI.pickAzar(UI.TAUNTS.winUser) + ' Racha: ' + store.stats.ai[cfg.difficulty].streak + ' 🔥';
      } else {
        storeYpinta('cpu');
        Sound.play('lose');
        UI.shakeBoard();
        kind = 'lose'; emoji = cfg.difficulty === 'hardcore' ? '😈' : '🤖';
        titulo = cfg.difficulty === 'hardcore' ? 'La máquina te barrió 🔥' : 'Gana la máquina';
        sub = UI.pickAzar(UI.TAUNTS.loseUser[cfg.difficulty] || UI.TAUNTS.loseUser.medium);
      }
      UI.pintarTurno(titulo, state.winner, false);
    } else {
      var esP1 = state.winner === 'X';
      storeYpinta(esP1 ? 'p1' : 'p2');
      Sound.play('win');
      UI.confettiBurst(160);
      kind = 'win'; emoji = '🏆';
      titulo = '¡Gana ' + nombrePvp(state.winner) + '!';
      sub = 'Alineó las 3 con la ' + state.winner + '. La revancha ya está picando. ⚡';
      UI.pintarTurno(titulo, state.winner, false);
    }
    setTimeout(function () {
      UI.mostrarResultado(kind, titulo, sub, emoji);
      $('btn-rematch').hidden = false;
    }, 700);
    return true;

    function storeYpinta(resultado) {
      UI.registrarResultado(store,
        { mode: cfg.mode, difficulty: cfg.difficulty, winnerSymbol: state.winner, userSymbol: simboloUsuario() },
        resultado);
      refrescarCromo();
    }
  }

  function revancha() {
    if (!state) { empezarPartida(); return; }
    limpiarAiTimer();
    UI.ocultarResultado();
    // Alterna quién empieza para que la revancha sea justa.
    var nuevoStarter = state.starter === 'X' ? 'O' : 'X';
    state = Game.createState({ mode: cfg.mode, humanSymbol: cfg.humanSymbol, starter: nuevoStarter });
    $('btn-rematch').hidden = true;
    refrescarCromo();
    UI.pintarTaunt('Revancha: empieza la ' + nuevoStarter + '. ⚡');
    UI.pintarTablero(state, puedeJugar().puede);
    pintarTurnoBase();
    if (cfg.mode === 'ai' && state.current === simboloCpu()) turnoMaquina();
  }

  // ---------- Config UI ----------
  function setMode(m) {
    cfg.mode = m;
    var esAi = m === 'ai';
    $('seg-ai').classList.toggle('is-on', esAi);
    $('seg-pvp').classList.toggle('is-on', !esAi);
    $('seg-ai').setAttribute('aria-selected', String(esAi));
    $('seg-pvp').setAttribute('aria-selected', String(!esAi));
    $('cfg-ai').hidden = !esAi;
    $('cfg-pvp').hidden = esAi;
  }

  function setDifficulty(d) {
    cfg.difficulty = d;
    document.querySelectorAll('#diff-cards .diff-card').forEach(function (c) {
      var on = c.dataset.diff === d;
      c.classList.toggle('is-sel', on);
      c.setAttribute('aria-checked', String(on));
    });
    document.body.dataset.difficulty = d;
  }

  function setHumanSymbol(s) {
    cfg.humanSymbol = s;
    $('pick-x').classList.toggle('is-sel', s === 'X');
    $('pick-o').classList.toggle('is-sel', s === 'O');
    $('pick-x').setAttribute('aria-checked', String(s === 'X'));
    $('pick-o').setAttribute('aria-checked', String(s === 'O'));
  }

  function bindConfig() {
    $('seg-ai').addEventListener('click', function () { clickSound(); setMode('ai'); });
    $('seg-pvp').addEventListener('click', function () { clickSound(); setMode('pvp'); });
    document.querySelectorAll('#diff-cards .diff-card').forEach(function (c) {
      c.addEventListener('click', function () { Sound.play('select'); setDifficulty(c.dataset.diff); });
    });
    $('pick-x').addEventListener('click', function () { Sound.play('select'); setHumanSymbol('X'); });
    $('pick-o').addEventListener('click', function () { Sound.play('select'); setHumanSymbol('O'); });
    document.querySelectorAll('.starter-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        clickSound();
        cfg.starterPref = b.dataset.starter;
        document.querySelectorAll('.starter-btn').forEach(function (x) {
          var on = x === b;
          x.classList.toggle('is-on', on);
          x.setAttribute('aria-checked', String(on));
        });
      });
    });
    document.querySelectorAll('.pvp-starter-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        clickSound();
        cfg.pvpStarter = b.dataset.starter;
        document.querySelectorAll('.pvp-starter-btn').forEach(function (x) {
          var on = x === b;
          x.classList.toggle('is-on', on);
          x.setAttribute('aria-checked', String(on));
        });
      });
    });
  }

  // ---------- Arranque ----------
  function init() {
    UI.cacheDom();
    UI.wireConfirm();
    UI.initFloaters();

    // Estado inicial desde lo guardado.
    cfg.mode = store.lastMode === 'pvp' ? 'pvp' : 'ai';
    cfg.difficulty = store.lastDiff || 'medium';
    setMode(cfg.mode);
    setDifficulty(cfg.difficulty);
    setHumanSymbol('X');
    UI.pintarSonido(store.soundOn);
    Sound.setEnabled(store.soundOn);
    UI.pintarMejorRacha(store);

    // El audio solo tras gesto del usuario (nunca autoplay al cargar).
    ['pointerdown', 'keydown'].forEach(function (ev) {
      window.addEventListener(ev, desbloquearAudio, { once: true });
    });

    UI.wireGhost(puedeJugar);
    bindConfig();

    // Navegación
    document.querySelectorAll('[data-nav="home"]').forEach(function (b) {
      b.addEventListener('click', function () {
        clickSound();
        limpiarAiTimer();
        UI.ocultarResultado();
        UI.show('home');
        UI.pintarMejorRacha(store);
      });
    });
    $('btn-jugar').addEventListener('click', function () { clickSound(); setMode(store.lastMode === 'pvp' ? 'pvp' : 'ai'); UI.show('config'); });
    $('btn-mode-ai').addEventListener('click', function () { clickSound(); setMode('ai'); UI.show('config'); });
    $('btn-mode-pvp').addEventListener('click', function () { clickSound(); setMode('pvp'); UI.show('config'); });
    $('btn-start').addEventListener('click', function () {
      clickSound();
      cfg.names.X = $('pvp-name-x').value || 'Jugador 1';
      cfg.names.O = $('pvp-name-o').value || 'Jugador 2';
      empezarPartida();
    });

    // Tablero (delegación: un clic = un movimiento).
    // Se sube manualmente hasta el .cell para no depender de `closest()`
    // sobre el target (en algunos navegadores falla con nodos SVG).
    $('board').addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== this && !(t.classList && t.classList.contains('cell'))) {
        t = t.parentNode;
      }
      if (!t || t === this) return;
      var idx = parseInt(t.getAttribute('data-index'), 10);
      if (!Number.isInteger(idx)) return;
      alHacerClicCasilla(idx);
    });

    // Controles de partida
    $('btn-restart').addEventListener('click', async function () {
      clickSound();
      if (!state) return;
      if (state.moveCount > 0 && state.status === 'playing') {
        var ok = await UI.askConfirm('¿Reiniciar ronda?', 'Hay una partida en curso. Se pierde lo jugado.');
        if (!ok) return;
      }
      limpiarAiTimer();
      UI.ocultarResultado();
      Game.resetRound(state, state.starter);
      $('btn-rematch').hidden = true;
      UI.pintarTaunt('');
      UI.pintarTablero(state, puedeJugar().puede);
      pintarTurnoBase();
      if (cfg.mode === 'ai' && state.current === simboloCpu()) turnoMaquina();
    });

    $('btn-rematch').addEventListener('click', function () { clickSound(); revancha(); });
    $('btn-revancha').addEventListener('click', function () { clickSound(); revancha(); });
    $('btn-to-menu').addEventListener('click', function () {
      limpiarAiTimer();
      UI.show('home');
      UI.pintarMejorRacha(store);
    });
    $('btn-change-diff').addEventListener('click', function () {
      clickSound(); limpiarAiTimer(); UI.ocultarResultado(); setMode('ai'); UI.show('config');
    });
    $('btn-change-mode').addEventListener('click', function () {
      clickSound(); limpiarAiTimer(); UI.ocultarResultado(); UI.show('config');
    });
    $('btn-reset-stats').addEventListener('click', async function () {
      clickSound();
      var alcance = cfg.mode === 'ai' ? ('nivel ' + cfg.difficulty.toUpperCase()) : 'modo 2 jugadores';
      var ok = await UI.askConfirm('¿Borrar estadísticas?', 'Se reinician las stats de ' + alcance + '. No se puede deshacer.');
      if (!ok) return;
      if (cfg.mode === 'ai') {
        store.stats.ai[cfg.difficulty] = { w: 0, l: 0, d: 0, streak: 0, best: 0 };
      } else {
        store.stats.pvp = { p1: 0, p2: 0, d: 0, total: 0, streakOwner: null, streak: 0, best: 0 };
      }
      UI.saveStore(store);
      refrescarCromo();
    });
    $('btn-sound').addEventListener('click', function () {
      var on = !Sound.isEnabled();
      Sound.setEnabled(on);
      store.soundOn = on;
      UI.saveStore(store);
      UI.pintarSonido(on);
      if (on) Sound.play('select');
    });

    // Teclado: las casillas ya son <button>, funcionan con Tab+Enter nativo.
    // Fallback offline: si Bootstrap no cargó (sin internet), cerrar modales a mano.
    if (!window.bootstrap) {
      document.addEventListener('click', function (e) {
        var closer = e.target.closest('[data-bs-toggle="modal"]');
        if (closer) {
          var target = document.querySelector(closer.getAttribute('data-bs-target'));
          if (target) { target.classList.add('show'); target.style.display = 'block'; }
          return;
        }
        var dismiss = e.target.closest('[data-bs-dismiss="modal"]');
        if (dismiss) {
          var m = dismiss.closest('.modal');
          if (m) { m.classList.remove('show'); m.style.display = 'none'; }
        }
      });
    }
    UI.show('home');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
