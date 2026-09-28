/* Triqui Neón — game.js
 * Lógica pura del juego: estado, reglas y turnos.
 * NO toca el DOM. Compatible con navegador (window.TriquiGame)
 * y con Node (module.exports) para los tests.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.TriquiGame = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Las 8 combinaciones ganadoras del tablero 3x3 (índices 0-8).
  var WIN_LINES = [
    [0, 1, 2], // filas
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6], // columnas
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8], // diagonales
    [2, 4, 6]
  ];

  function otroSimbolo(sym) {
    return sym === 'X' ? 'O' : 'X';
  }

  function tableroVacio() {
    return [null, null, null, null, null, null, null, null, null];
  }

  function esSimboloValido(s) {
    return s === 'X' || s === 'O';
  }

  /**
   * Evalúa un tablero y devuelve { winner, line }.
   * winner: 'X' | 'O' | null. line: tripleta ganadora o null.
   */
  function checkWinner(board) {
    if (!Array.isArray(board) || board.length !== 9) {
      return { winner: null, line: null };
    }
    for (var i = 0; i < WIN_LINES.length; i++) {
      var line = WIN_LINES[i];
      var a = board[line[0]];
      if ((a === 'X' || a === 'O') && a === board[line[1]] && a === board[line[2]]) {
        return { winner: a, line: [line[0], line[1], line[2]] };
      }
    }
    return { winner: null, line: null };
  }

  function isBoardFull(board) {
    for (var i = 0; i < 9; i++) {
      if (board[i] !== 'X' && board[i] !== 'O') return false;
    }
    return true;
  }

  function isDraw(board) {
    return checkWinner(board).winner === null && isBoardFull(board);
  }

  function getAvailableMoves(board) {
    var libres = [];
    for (var i = 0; i < 9; i++) {
      if (board[i] !== 'X' && board[i] !== 'O') libres.push(i);
    }
    return libres;
  }

  function isValidMove(board, index) {
    return Number.isInteger(index) && index >= 0 && index < 9 &&
      board[index] !== 'X' && board[index] !== 'O';
  }

  /**
   * Crea el estado inicial de una partida/ronda.
   * options: { mode:'ai'|'pvp', humanSymbol:'X'|'O', starter:'X'|'O'|'random', playerNames:{X,O} }
   */
  function createState(options) {
    var opts = options || {};
    var mode = opts.mode === 'pvp' ? 'pvp' : 'ai';
    var humanSymbol = esSimboloValido(opts.humanSymbol) ? opts.humanSymbol : 'X';
    var starter = opts.starter || humanSymbol;
    if (starter === 'random') {
      starter = Math.random() < 0.5 ? 'X' : 'O';
    }
    if (!esSimboloValido(starter)) starter = 'X';
    return {
      board: tableroVacio(),
      current: starter,
      starter: starter,
      status: 'playing', // 'playing' | 'won' | 'draw'
      winner: null,
      winLine: null,
      moveCount: 0,
      mode: mode,
      humanSymbol: humanSymbol,
      aiSymbol: otroSimbolo(humanSymbol)
    };
  }

  /**
   * Aplica un movimiento al estado. Un clic = un solo movimiento.
   * Devuelve { ok:true } o { ok:false, reason }.
   * reasons: 'finished' | 'occupied' | 'invalid' | 'not-your-turn'(reservado UI)
   */
  function makeMove(state, index) {
    if (!state || !Array.isArray(state.board)) {
      return { ok: false, reason: 'invalid' };
    }
    if (state.status !== 'playing') {
      return { ok: false, reason: 'finished' };
    }
    if (!Number.isInteger(index) || index < 0 || index > 8) {
      return { ok: false, reason: 'invalid' };
    }
    if (state.board[index] === 'X' || state.board[index] === 'O') {
      return { ok: false, reason: 'occupied' };
    }
    state.board[index] = state.current;
    state.moveCount++;

    var res = checkWinner(state.board);
    if (res.winner) {
      state.status = 'won';
      state.winner = res.winner;
      state.winLine = res.line;
    } else if (isBoardFull(state.board)) {
      state.status = 'draw';
      state.winner = null;
      state.winLine = null;
    } else {
      state.current = otroSimbolo(state.current);
    }
    return { ok: true };
  }

  /** Reinicia el estado para una nueva ronda manteniendo la config. */
  function resetRound(state, starter) {
    var s = starter || state.starter;
    if (s === 'random') s = Math.random() < 0.5 ? 'X' : 'O';
    if (!esSimboloValido(s)) s = 'X';
    state.board = tableroVacio();
    state.current = s;
    state.starter = s;
    state.status = 'playing';
    state.winner = null;
    state.winLine = null;
    state.moveCount = 0;
    return state;
  }

  return {
    WIN_LINES: WIN_LINES,
    otroSimbolo: otroSimbolo,
    tableroVacio: tableroVacio,
    checkWinner: checkWinner,
    isBoardFull: isBoardFull,
    isDraw: isDraw,
    getAvailableMoves: getAvailableMoves,
    isValidMove: isValidMove,
    createState: createState,
    makeMove: makeMove,
    resetRound: resetRound
  };
});
