/* Triqui Neón — sound.js
 * Efectos generados con Web Audio API (sin archivos externos).
 * El contexto solo se crea tras interacción del usuario.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.TriquiSound = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ctx = null;
  var enabled = false; // arranca desactivado; se activa con primer gesto si el usuario lo permite
  var masterGain = null;

  function crearContexto() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!ctx) {
        ctx = new AC();
        masterGain = ctx.createGain();
        masterGain.gain.value = 0.5;
        masterGain.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) {
      return null;
    }
  }

  function setEnabled(v) {
    enabled = !!v;
    if (enabled) crearContexto();
    return enabled;
  }

  function isEnabled() { return enabled; }

  // Nota envolvente: ataque rápido, decaimiento exponencial.
  function tono(freq, dur, tipo, vol, cuando, deslizarA) {
    if (!enabled) return;
    var c = crearContexto();
    if (!c) return;
    try {
      var t0 = c.currentTime + (cuando || 0);
      var osc = c.createOscillator();
      var g = c.createGain();
      osc.type = tipo || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (deslizarA) osc.frequency.exponentialRampToValueAtTime(deslizarA, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.4, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch (e) { /* silencio seguro */ }
  }

  function play(nombre) {
    if (!enabled) return;
    switch (nombre) {
      case 'move': // blip corto X/O (tono distinto lo elige ui.js)
        tono(520, 0.12, 'square', 0.18, 0, 660);
        break;
      case 'moveO':
        tono(440, 0.12, 'square', 0.18, 0, 560);
        break;
      case 'click':
        tono(700, 0.06, 'sine', 0.15, 0, 900);
        break;
      case 'win': // arpegio ascendente alegre
        tono(523, 0.14, 'triangle', 0.35);
        tono(659, 0.14, 'triangle', 0.35, 0.12);
        tono(784, 0.14, 'triangle', 0.35, 0.24);
        tono(1046, 0.28, 'triangle', 0.4, 0.36);
        break;
      case 'lose': // descendente oscuro
        tono(330, 0.18, 'sawtooth', 0.25, 0, 220);
        tono(220, 0.22, 'sawtooth', 0.25, 0.16, 147);
        tono(147, 0.34, 'sawtooth', 0.28, 0.34, 98);
        break;
      case 'draw': // dos tonos neutros
        tono(392, 0.16, 'triangle', 0.3);
        tono(392, 0.22, 'triangle', 0.3, 0.2);
        break;
      case 'select':
        tono(880, 0.07, 'sine', 0.16, 0, 1100);
        break;
      default:
        break;
    }
  }

  return {
    play: play,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    crearContexto: crearContexto
  };
});
