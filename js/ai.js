/* Triqui Neón — ai.js
 * Inteligencia artificial por nivel. NO toca el DOM.
 * Compatible navegador (window.TriquiAI) y Node (module.exports).
 * Depende de TriquiGame solo para evaluar tableros (inyectable en Node).
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    var G = null;
    try { G = require('./game.js'); } catch (e) { G = null; }
    module.exports = factory(G);
  } else {
    root.TriquiAI = factory(root.TriquiGame);
  }
})(typeof self !== 'undefined' ? self : this, function (Game) {
  'use strict';

  // Fallback mínimo si Game no está disponible (tests lo inyectan vía require).
  var G = Game || {
    checkWinner: function (b) {
      var L = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      for (var i = 0; i < L.length; i++) {
        var a = b[L[i][0]];
        if ((a === 'X' || a === 'O') && a === b[L[i][1]] && a === b[L[i][2]]) {
          return { winner: a, line: L[i].slice() };
        }
      }
      return { winner: null, line: null };
    },
    getAvailableMoves: function (b) {
      var r = [];
      for (var i = 0; i < 9; i++) if (b[i] !== 'X' && b[i] !== 'O') r.push(i);
      return r;
    }
  };

  var CENTRO = 4;
  var ESQUINAS = [0, 2, 6, 8];
  var LADOS = [1, 3, 5, 7];
  // Orden de preferencia para desempates y juego posicional.
  var ORDEN_POSICIONAL = [4, 0, 2, 6, 8, 1, 3, 5, 7];

  function otro(s) { return s === 'X' ? 'O' : 'X'; }

  function libres(board) { return G.getAvailableMoves(board); }

  function aleatorio(arr, rand) {
    if (!arr.length) return -1;
    var r = Math.floor((rand || Math.random)() * arr.length);
    return arr[r];
  }

  /** Si `sym` puede ganar en una jugada, devuelve esa casilla; si no, -1. */
  function jugadaGanadora(board, sym) {
    var mv = libres(board);
    for (var i = 0; i < mv.length; i++) {
      board[mv[i]] = sym;
      var w = G.checkWinner(board).winner;
      board[mv[i]] = null;
      if (w === sym) return mv[i];
    }
    return -1;
  }

  /** Cuenta líneas donde `sym` tiene 2 fichas y un hueco (amenaza inmediata). */
  function contarAmenazas(board, sym) {
    var L = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    var n = 0;
    for (var i = 0; i < L.length; i++) {
      var a = board[L[i][0]], b = board[L[i][1]], c = board[L[i][2]];
      var propias = (a === sym ? 1 : 0) + (b === sym ? 1 : 0) + (c === sym ? 1 : 0);
      var rival = (a !== null && a !== sym ? 1 : 0) + (b !== null && b !== sym ? 1 : 0) + (c !== null && c !== sym ? 1 : 0);
      if (propias === 2 && rival === 0) n++;
    }
    return n;
  }

  /** Busca jugada que cree horquilla (≥2 amenazas a la vez). */
  function jugadaHorquilla(board, sym) {
    var mv = libres(board);
    // Probar en orden posicional para juego bonito.
    var ordenados = ORDEN_POSICIONAL.filter(function (i) { return mv.indexOf(i) !== -1; });
    for (var i = 0; i < ordenados.length; i++) {
      board[ordenados[i]] = sym;
      var amenazas = contarAmenazas(board, sym);
      board[ordenados[i]] = null;
      if (amenazas >= 2) return ordenados[i];
    }
    return -1;
  }

  /** Juego posicional: centro > esquinas > lados (solo casillas libres). */
  function jugadaPosicional(board, rand) {
    var mv = libres(board);
    if (mv.indexOf(CENTRO) !== -1) return CENTRO;
    var esq = ESQUINAS.filter(function (i) { return mv.indexOf(i) !== -1; });
    if (esq.length) {
      // Mezcla leve para no ser predecible en niveles medios.
      return aleatorio(esq, rand);
    }
    var lad = LADOS.filter(function (i) { return mv.indexOf(i) !== -1; });
    if (lad.length) return aleatorio(lad, rand);
    return mv.length ? mv[0] : -1;
  }

  /** Lógica "buena" sin minimax: ganar > bloquear > horquilla propia > anti-horquilla > centro/esquinas. */
  function jugadaBuena(board, yo, rival, rand) {
    var g = jugadaGanadora(board, yo);
    if (g !== -1) return g;
    var b = jugadaGanadora(board, rival);
    if (b !== -1) return b;
    var f = jugadaHorquilla(board, yo);
    if (f !== -1) return f;
    // Anti-horquilla simple: si el rival puede crear horquilla, ocupar su casilla clave.
    var fr = jugadaHorquilla(board, rival);
    if (fr !== -1) return fr;
    return jugadaPosicional(board, rand);
  }

  // ---------- Minimax con poda alfa-beta ----------
  function minimax(board, turno, yo, rival, depth, alpha, beta) {
    var res = G.checkWinner(board);
    if (res.winner === yo) return 10 - depth;      // ganar rápido vale más
    if (res.winner === rival) return depth - 10;   // perder tarde duele menos
    var mv = libres(board);
    if (!mv.length) return 0;

    // Ordenar para podar mejor: centro, esquinas, lados.
    mv.sort(function (a, b) { return ORDEN_POSICIONAL.indexOf(a) - ORDEN_POSICIONAL.indexOf(b); });

    if (turno === yo) {
      var best = -Infinity;
      for (var i = 0; i < mv.length; i++) {
        board[mv[i]] = turno;
        var v = minimax(board, otro(turno), yo, rival, depth + 1, alpha, beta);
        board[mv[i]] = null;
        if (v > best) best = v;
        if (v > alpha) alpha = v;
        if (beta <= alpha) break;
      }
      return best;
    } else {
      var worst = Infinity;
      for (var j = 0; j < mv.length; j++) {
        board[mv[j]] = turno;
        var w = minimax(board, otro(turno), yo, rival, depth + 1, alpha, beta);
        board[mv[j]] = null;
        if (w < worst) worst = w;
        if (w < beta) beta = w;
        if (beta <= alpha) break;
      }
      return worst;
    }
  }

  /** Mejor jugada minimax (perfecta). Devuelve { move, score }. */
  function mejorMinimax(board, yo, rival) {
    var mv = libres(board);
    mv.sort(function (a, b) { return ORDEN_POSICIONAL.indexOf(a) - ORDEN_POSICIONAL.indexOf(b); });
    var bestMove = mv.length ? mv[0] : -1;
    var bestScore = -Infinity;
    for (var i = 0; i < mv.length; i++) {
      board[mv[i]] = yo;
      var s = minimax(board, rival, yo, rival, 0, -Infinity, Infinity);
      board[mv[i]] = null;
      if (s > bestScore) {
        bestScore = s;
        bestMove = mv[i];
      }
    }
    return { move: bestMove, score: bestScore };
  }

  /** Todas las jugadas ordenadas por score minimax (para el error leve de Difícil). */
  function todasOrdenadas(board, yo, rival) {
    var mv = libres(board);
    mv.sort(function (a, b) { return ORDEN_POSICIONAL.indexOf(a) - ORDEN_POSICIONAL.indexOf(b); });
    var lista = mv.map(function (m) {
      board[m] = yo;
      var s = minimax(board, rival, yo, rival, 0, -Infinity, Infinity);
      board[m] = null;
      return { move: m, score: s };
    });
    lista.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return ORDEN_POSICIONAL.indexOf(a.move) - ORDEN_POSICIONAL.indexOf(b.move);
    });
    return lista;
  }

  /**
   * API principal: devuelve un índice libre válido según dificultad.
   * difficulty: 'easy' | 'medium' | 'hard' | 'hardcore'
   * rand: función aleatoria inyectable (por defecto Math.random).
   */
  function getBestMove(board, aiSymbol, humanSymbol, difficulty, rand) {
    var random = (typeof rand === 'function') ? rand : Math.random;
    var copia = board.slice();
    var yo = (aiSymbol === 'X' || aiSymbol === 'O') ? aiSymbol : 'O';
    var rival = (humanSymbol === 'X' || humanSymbol === 'O') ? humanSymbol : otro(yo);
    var mv = libres(copia);
    if (!mv.length) return -1;
    if (mv.length === 1) return mv[0];

    var diff = (difficulty || 'medium').toLowerCase();
    var tiro;

    if (diff === 'easy') {
      // Fácil: ~15% juega obvio (ganar/bloquear), resto azar puro.
      if (random() < 0.15) {
        var g = jugadaGanadora(copia, yo);
        if (g !== -1) return g;
        var bl = jugadaGanadora(copia, rival);
        if (bl !== -1) return bl;
      }
      return aleatorio(mv, random);
    }

    if (diff === 'medium') {
      // Medio: ~50% bien, ~50% azar.
      if (random() < 0.5) {
        return jugadaBuena(copia, yo, rival, random);
      }
      return aleatorio(mv, random);
    }

    if (diff === 'hard') {
      // Difícil: táctica completa + minimax, con ~10% de error leve.
      var lista = todasOrdenadas(copia, yo, rival);
      var mejor = lista[0].move;
      // Si hay victoria inmediata o bloqueo, nunca fallar (sensación de "muy fuerte").
      var gw = jugadaGanadora(copia, yo);
      if (gw !== -1) return gw;
      var bw = jugadaGanadora(copia, rival);
      if (bw !== -1) return bw;
      if (random() < 0.10 && lista.length > 1) {
        // Error leve: elige entre las jugadas empatadas en 2º grupo, o la 2ª mejor.
        var segundo = lista[1];
        // Solo acepta el error si no regala victoria inmediata al rival.
        copia[segundo.move] = yo;
        var regala = jugadaGanadora(copia, rival) !== -1;
        copia[segundo.move] = null;
        if (!regala) return segundo.move;
      }
      // Si no hubo error, devuelve la mejor (que ya incluye horquillas y centro).
      tiro = mejor;
      // Seguridad: nunca devolver ocupada.
      if (mv.indexOf(tiro) === -1) return jugadaBuena(copia, yo, rival, random);
      return tiro;
    }

    // Hardcore: minimax perfecto, sin errores.
    return mejorMinimax(copia, yo, rival).move;
  }

  return {
    getBestMove: getBestMove,
    // Expuestas para tests y depuración:
    _jugadaGanadora: jugadaGanadora,
    _jugadaHorquilla: jugadaHorquilla,
    _mejorMinimax: mejorMinimax
  };
});
