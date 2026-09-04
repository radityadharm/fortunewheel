/* Penghubung antar tab: halaman utama menyiarkan perubahan, halaman slide
   mendengarkannya. Pakai BroadcastChannel bila tersedia, dengan cadangan lewat
   event `storage` (yang juga hanya menyala di tab lain pada origin yang sama). */
(function (global) {
  'use strict';

  var CHANNEL = 'fortunewheel-v1';
  var BUS_KEY = 'fortunewheel.v1.bus';
  var listeners = [];
  var channel = null;

  try {
    if (global.BroadcastChannel) channel = new global.BroadcastChannel(CHANNEL);
  } catch (err) {
    channel = null;
  }

  function deliver(message) {
    if (!message || typeof message.type !== 'string') return;
    listeners.forEach(function (fn) {
      try { fn(message); } catch (err) { /* satu pendengar error, yang lain jalan terus */ }
    });
  }

  if (channel) {
    channel.onmessage = function (event) { deliver(event.data); };
  }

  global.addEventListener('storage', function (event) {
    if (event.key !== BUS_KEY || !event.newValue) return;
    try { deliver(JSON.parse(event.newValue)); } catch (err) { /* abaikan */ }
  });

  function publish(type, payload) {
    var message = payload || {};
    message.type = type;
    message.at = Date.now();
    message.nonce = Math.random().toString(36).slice(2);

    if (channel) {
      try { channel.postMessage(message); } catch (err) { /* lanjut ke cadangan */ }
    }

    /* Selalu tulis juga ke localStorage: BroadcastChannel tidak sampai ke tab
       yang dibuka dari berkas berbeda di sebagian browser lama. */
    try { global.localStorage.setItem(BUS_KEY, JSON.stringify(message)); } catch (err) { /* abaikan */ }
  }

  function subscribe(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  global.FWSync = { publish: publish, subscribe: subscribe };
})(window);
