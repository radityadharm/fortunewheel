/* Penyimpanan lokal dengan fallback in-memory (mis. saat dibuka lewat file://
   di browser yang memblokir localStorage). */
(function (global) {
  'use strict';

  var PREFIX = 'fortunewheel.v1.';
  var memory = {};
  var available = false;

  try {
    var probe = PREFIX + '__probe';
    global.localStorage.setItem(probe, '1');
    global.localStorage.removeItem(probe);
    available = true;
  } catch (err) {
    available = false;
  }

  function read(key, fallback) {
    var raw;
    try {
      raw = available ? global.localStorage.getItem(PREFIX + key) : memory[key];
    } catch (err) {
      raw = memory[key];
    }
    if (raw == null) return fallback;
    try {
      var parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (err) {
      return fallback;
    }
  }

  function write(key, value) {
    var raw = JSON.stringify(value);
    memory[key] = raw;
    if (!available) return false;
    try {
      global.localStorage.setItem(PREFIX + key, raw);
      return true;
    } catch (err) {
      available = false; // kuota penuh atau akses ditolak
      return false;
    }
  }

  global.FWStorage = {
    read: read,
    write: write,
    isAvailable: function () { return available; }
  };
})(window);
