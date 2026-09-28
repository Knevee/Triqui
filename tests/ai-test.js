/* Triqui Neón — tests/ai-test.js
 * Ejecutar con: node tests/ai-test.js
 * 1) Verifica las 8 combinaciones ganadoras + empate.
 * 2) Simula TODAS las partidas posibles vs Hardcore (humano empieza y máquina empieza)
 *    y confirma que la máquina nunca pierde.
 * 3) Verifica que easy/medium/hard devuelven siempre jugadas válidas.
 */
'use strict';
const path = require('path');
const Game = require(path.join('..', 'js', 'game.js'));
const AI = require(path.join('..', 'js', 'ai.js'));

let fallos = 0;
let checks = 0;

function assert(cond, msg) {
  checks++;
  if (!cond) {
    fallos++;
    console.error('  ✗ FAIL:', msg);
  }
}

// ---------- 1) Reglas ----------
function testReglas() {
  console.log('1) Reglas: 8 combinaciones + empate');
  const lineas = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  for (const sym of ['X', 'O']) {
    for (const line of lineas) {
      const b = Array(9).fill(null);
      b[line[0]] = sym; b[line[1]] = sym; b[line[2]] = sym;
      const r = Game.checkWinner(b);
      assert(r.winner === sym, `gana ${sym} en [${line}]`);
      assert(r.line && r.line.join(',') === line.join(','), `línea exacta [${line}]`);
    }
  }
  // Sin ganador en tablero vacío y parcial
  assert(Game.checkWinner(Array(9).fill(null)).winner === null, 'vacío sin ganador');
  const parcial = ['X', 'O', 'X', 'X', 'O', null, null, null, null];
  assert(Game.checkWinner(parcial).winner === null, 'parcial sin ganador');
  // Empate clásico
  const empate = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'];
  assert(Game.checkWinner(empate).winner === null, 'empate sin ganador');
  assert(Game.isDraw(empate) === true, 'detecta empate');
  assert(Game.isDraw(parcial) === false, 'no marca empate prematuro');
  // makeMove: ocupada, terminada, inválida
  const st = Game.createState({ mode: 'ai', humanSymbol: 'X', starter: 'X' });
  assert(Game.makeMove(st, 0).ok === true, 'movimiento válido');
  assert(Game.makeMove(st, 0).ok === false, 'casilla ocupada bloqueada');
  assert(Game.makeMove(st, 99).ok === false, 'índice inválido bloqueado');
  // Un clic = un movimiento (alterna turno)
  assert(st.current === 'O', 'alterna turno tras jugada');
}

// ---------- 2) Hardcore nunca pierde (exhaustivo) ----------
function testHardcoreInvencible() {
  console.log('2) Hardcore invencible (búsqueda exhaustiva de todas las partidas)');
  // Simula el juego completo: en cada turno humano prueba TODAS las respuestas.
  // La IA hardcore responde con minimax perfecto. Si en alguna rama el humano gana, falla.
  let nodos = 0;

  function jugarRama(board, turno, aiSym, humanSym) {
    nodos++;
    const w = Game.checkWinner(board).winner;
    if (w === humanSym) return false; // ¡la máquina perdió! rama inválida
    if (w === aiSym) return true;     // máquina ganó, rama ok (podar)
    if (Game.isBoardFull(board)) return true; // empate ok
    if (turno === aiSym) {
      const m = AI.getBestMove(board.slice(), aiSym, humanSym, 'hardcore', Math.random);
      if (m < 0 || m > 8 || board[m] === 'X' || board[m] === 'O') return false;
      board[m] = aiSym;
      const r = jugarRama(board, humanSym, aiSym, humanSym);
      board[m] = null; // restaurar para que las ramas hermanas partan del mismo tablero
      return r;
    } else {
      // Turno humano: probar TODAS las respuestas posibles.
      const mv = Game.getAvailableMoves(board);
      for (const m of mv) {
        board[m] = humanSym;
        const ok = jugarRama(board, aiSym, aiSym, humanSym);
        board[m] = null;
        if (!ok) return false;
      }
      return true;
    }
  }

  for (const caso of [
    { humano: 'X', maquina: 'O', empieza: 'X', nombre: 'humano X empieza' },
    { humano: 'X', maquina: 'O', empieza: 'O', nombre: 'máquina O empieza' },
    { humano: 'O', maquina: 'X', empieza: 'O', nombre: 'humano O empieza' },
    { humano: 'O', maquina: 'X', empieza: 'X', nombre: 'máquina X empieza' }
  ]) {
    const board = Array(9).fill(null);
    const ok = jugarRama(board, caso.empieza, caso.maquina, caso.humano);
    assert(ok === true, `hardcore nunca pierde (${caso.nombre})`);
  }
  console.log(`   (nodos explorados: ${nodos})`);
}

// ---------- 3) Dificultades débiles devuelven jugadas válidas ----------
function testJugadasValidas() {
  console.log('3) Fácil/Medio/Difícil devuelven jugadas válidas');
  // LCG determinista para reproducibilidad
  function lcg(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  const tableros = [
    Array(9).fill(null),
    ['X', null, null, null, 'O', null, null, null, null],
    ['X', 'O', 'X', null, 'O', null, null, null, null],
    ['X', 'O', null, null, null, null, null, null, null],
    [null, null, null, null, 'X', null, null, 'O', null]
  ];
  for (const diff of ['easy', 'medium', 'hard']) {
    const rand = lcg(diff === 'easy' ? 123 : diff === 'medium' ? 456 : 789);
    for (let t = 0; t < 200; t++) {
      const base = tableros[t % tableros.length];
      // Tablero pseudoaleatorio válido (sin pisar ganados)
      const b = base.slice();
      const libres = Game.getAvailableMoves(b);
      // relleno parcial aleatorio para variedad
      const extra = Math.floor(rand() * Math.min(3, libres.length));
      const pool = libres.slice();
      for (let k = 0; k < extra; k++) {
        const idx = Math.floor(rand() * pool.length);
        const pos = pool.splice(idx, 1)[0];
        b[pos] = rand() < 0.5 ? 'X' : 'O';
      }
      if (Game.checkWinner(b).winner || Game.isBoardFull(b)) continue;
      const aiSym = rand() < 0.5 ? 'X' : 'O';
      const huSym = aiSym === 'X' ? 'O' : 'X';
      const m = AI.getBestMove(b.slice(), aiSym, huSym, diff, rand);
      const ok = Number.isInteger(m) && m >= 0 && m <= 8 && b[m] !== 'X' && b[m] !== 'O';
      assert(ok, `${diff} jugada válida (intento ${t}) → ${m} en [${b.map(v => v || '-').join('')}]`);
      if (!ok) break;
    }
  }
}

console.log('=== TRIQUI NEÓN — AI TEST ===');
testReglas();
testHardcoreInvencible();
testJugadasValidas();
console.log(`\n${checks - fallos}/${checks} checks OK, ${fallos} fallos.`);
if (fallos > 0) {
  console.error('RESULTADO: FAIL');
  process.exitCode = 1;
} else {
  console.log('RESULTADO: PASS ✓ — la IA hardcore nunca pierde y las reglas están OK.');
}
