/* Efek suara ringan memakai Web Audio API — tanpa file aset. */
(function (global) {
  'use strict';

  var ctx = null;
  var enabled = true;

  function audio() {
    if (ctx) return ctx;
    var Ctor = global.AudioContext || global.webkitAudioContext;
    if (!Ctor) return null;
    try { ctx = new Ctor(); } catch (err) { ctx = null; }
    return ctx;
  }

  function beep(freq, duration, type, gainValue, startOffset) {
    if (!enabled) return;
    var ac = audio();
    if (!ac) return;
    if (ac.state === 'suspended' && ac.resume) ac.resume();

    var t0 = ac.currentTime + (startOffset || 0);
    var osc = ac.createOscillator();
    var gain = ac.createGain();

    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(gainValue, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  }

  var lastTick = 0;

  global.FWSound = {
    /* Bunyi "tek" saat satu segmen melewati jarum. */
    tick: function () {
      var now = Date.now();
      if (now - lastTick < 28) return; // jangan menumpuk saat roda masih kencang
      lastTick = now;
      beep(1180 + Math.random() * 90, 0.045, 'square', 0.045);
    },
    /* Fanfare pendek saat pemenang muncul. */
    win: function () {
      var notes = [523.25, 659.25, 783.99, 1046.5];
      for (var i = 0; i < notes.length; i++) {
        beep(notes[i], 0.34, 'triangle', 0.12, i * 0.09);
      }
    },
    setEnabled: function (value) {
      enabled = !!value;
      if (enabled) audio();
    },
    isEnabled: function () { return enabled; }
  };
})(window);
