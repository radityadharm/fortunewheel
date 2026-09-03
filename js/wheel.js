/* Mesin roda: menggambar segmen di canvas dan menganimasikan putaran.
   Pemenang ditentukan lebih dulu dengan angka acak, lalu rotasi akhir dihitung
   supaya segmen itu benar-benar berhenti tepat di bawah jarum — jadi hasil yang
   terlihat selalu sama dengan hasil yang dilaporkan. */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;
  var POINTER_ANGLE = -Math.PI / 2; // jarum di posisi jam 12

  var PALETTE = [
    '#ff5c8a', '#ffb648', '#ffe15c', '#4fd18b',
    '#3fc7d4', '#5b8cff', '#a06bff', '#ff77c8'
  ];

  /* Angka acak 0..1 dari sumber kriptografis bila tersedia. */
  function rand() {
    if (global.crypto && global.crypto.getRandomValues) {
      var buf = new Uint32Array(1);
      global.crypto.getRandomValues(buf);
      return buf[0] / 4294967296;
    }
    return Math.random();
  }

  function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }

  /* Warna segmen; segmen terakhir digeser agar tidak kembar dengan segmen pertama. */
  function colorFor(index, total) {
    var slot = index % PALETTE.length;
    if (total > 1 && index === total - 1 && slot === 0) slot = 1;
    return PALETTE[slot];
  }

  function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    var cut = text;
    while (cut.length > 1 && ctx.measureText(cut + '…').width > maxWidth) {
      cut = cut.slice(0, -1);
    }
    return cut + '…';
  }

  function Wheel(canvas, options) {
    options = options || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.labels = [];
    this.rotation = -Math.PI / 6;
    this.spinning = false;
    this.size = 320;
    this.onTick = options.onTick || function () {};
    this.emptyText = options.emptyText || 'Tambahkan nama dulu';
    this.resize();
  }

  Wheel.prototype.setLabels = function (labels) {
    this.labels = labels.slice();
    this.draw();
  };

  Wheel.prototype.resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    var width = rect.width || this.canvas.clientWidth || 320;
    var size = Math.max(180, Math.round(width));
    var dpr = Math.min(global.devicePixelRatio || 1, 2);

    this.size = size;
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  };

  Wheel.prototype.draw = function () {
    var ctx = this.ctx;
    var size = this.size;
    var cx = size / 2;
    var cy = size / 2;
    var radius = size / 2 - 8;
    var n = this.labels.length;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(cx, cy);

    if (n === 0) {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fill();
      ctx.setLineDash([7, 8]);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(233,236,247,0.55)';
      ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.emptyText, 0, radius * 0.46);
    } else {
      var seg = TAU / n;
      var fontSize = Math.max(9, Math.min(19, Math.round(radius * 0.13), Math.round((seg * radius) * 0.62)));
      var hub = radius * 0.2;
      var clearance = radius * 0.32; // ruang untuk poros + tombol PUTAR

      for (var i = 0; i < n; i++) {
        var start = this.rotation + i * seg;

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, start, start + seg);
        ctx.closePath();
        ctx.fillStyle = colorFor(i, n);
        ctx.fill();
        if (n <= 60) {
          ctx.strokeStyle = 'rgba(10,12,20,0.35)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        if (fontSize >= 8) {
          var mid = start + seg / 2;
          var facing = ((mid % TAU) + TAU) % TAU;
          /* Separuh kiri roda diputar setengah lingkaran lagi supaya teksnya
             tidak terbaca terbalik. */
          var flipped = facing > Math.PI / 2 && facing < Math.PI * 1.5;

          ctx.save();
          ctx.rotate(flipped ? mid + Math.PI : mid);
          ctx.textAlign = flipped ? 'left' : 'right';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(14,17,30,0.92)';
          ctx.font = '700 ' + fontSize + 'px ui-sans-serif, system-ui, sans-serif';

          var text = fitText(ctx, this.labels[i], radius - clearance - 14);
          ctx.fillText(text, flipped ? -(radius - 12) : radius - 12, 0);
          ctx.restore();
        }
      }

      /* Poros tengah */
      ctx.beginPath();
      ctx.arc(0, 0, hub, 0, TAU);
      ctx.fillStyle = '#0e1220';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();

    /* Bingkai luar */
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 4, 0, TAU);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 6;
    ctx.stroke();
  };

  /* Indeks segmen yang berada tepat di bawah jarum untuk rotasi tertentu. */
  Wheel.prototype.indexAt = function (rotation) {
    var n = this.labels.length;
    if (!n) return -1;
    var seg = TAU / n;
    var angle = (POINTER_ANGLE - rotation) % TAU;
    if (angle < 0) angle += TAU;
    return Math.floor(angle / seg) % n;
  };

  /* Memutar roda; mengembalikan Promise berisi { index, label }. */
  Wheel.prototype.spin = function () {
    var self = this;
    var n = this.labels.length;

    if (this.spinning || n === 0) return Promise.resolve(null);

    var seg = TAU / n;
    var target = Math.floor(rand() * n) % n;
    var jitter = (rand() - 0.5) * seg * 0.7;      // supaya tidak selalu pas di tengah
    var turns = 5 + Math.floor(rand() * 3);
    var duration = 4600 + rand() * 1300;
    var from = this.rotation;

    /* Rotasi yang membuat segmen `target` berhenti di bawah jarum, lalu digeser
       maju beberapa putaran penuh agar animasinya panjang. */
    var to = POINTER_ANGLE - (target * seg + seg / 2) + jitter;
    to += Math.ceil((from + turns * TAU - to) / TAU) * TAU;

    this.spinning = true;
    var lastIndex = this.indexAt(from);
    var startTime = null;

    return new Promise(function (resolve) {
      function frame(now) {
        if (startTime === null) startTime = now;
        var progress = Math.min(1, (now - startTime) / duration);

        self.rotation = from + (to - from) * easeOutQuart(progress);
        self.draw();

        var current = self.indexAt(self.rotation);
        if (current !== lastIndex) {
          lastIndex = current;
          self.onTick();
        }

        if (progress < 1) {
          global.requestAnimationFrame(frame);
          return;
        }

        self.rotation = ((to % TAU) + TAU) % TAU;
        self.draw();
        self.spinning = false;

        var index = self.indexAt(self.rotation);
        resolve({ index: index, label: self.labels[index] });
      }

      global.requestAnimationFrame(frame);
    });
  };

  Wheel.colorFor = colorFor;
  Wheel.palette = PALETTE;
  global.FWWheel = Wheel;
})(window);
