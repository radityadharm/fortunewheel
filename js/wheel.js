/* Mesin roda: menggambar segmen di canvas dan menganimasikan putaran.
   Pemenang ditentukan lebih dulu dengan angka acak, lalu rotasi akhir dihitung
   supaya segmen itu benar-benar berhenti tepat di bawah jarum — jadi hasil yang
   terlihat selalu sama dengan hasil yang dilaporkan. */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;
  var POINTER_ANGLE = -Math.PI / 2; // jarum di posisi jam 12

  var FREE_SPEED = 0.0125;   // rad per milidetik (~1,2 putaran per detik)
  var FREE_ACCEL_MS = 700;   // waktu untuk mencapai kecepatan penuh

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

  var stripePattern = null;

  /* Arsiran diagonal sebagai penanda segmen yang tidak ikut diundi. */
  function stripes(ctx) {
    if (stripePattern) return stripePattern;
    var tile = document.createElement('canvas');
    tile.width = 10;
    tile.height = 10;
    var tctx = tile.getContext('2d');
    tctx.strokeStyle = 'rgba(255,255,255,0.12)';
    tctx.lineWidth = 3;
    tctx.beginPath();
    tctx.moveTo(-2, 12);
    tctx.lineTo(12, -2);
    tctx.moveTo(3, 17);
    tctx.lineTo(17, 3);
    tctx.stroke();
    stripePattern = ctx.createPattern(tile, 'repeat');
    return stripePattern;
  }

  function signatureOf(slices) {
    var out = '';
    for (var i = 0; i < slices.length; i++) {
      out += (slices[i].blocked ? '1' : '0') + (slices[i].marked ? 'm' : '') + slices[i].label + '\n';
    }
    return out;
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
    this.slices = [];
    this.rotation = -Math.PI / 6;
    this.spinning = false;
    this.size = 320;
    this.onTick = options.onTick || function () {};
    this.emptyText = options.emptyText || 'Tambahkan nama dulu';
    this.sprite = null;      // roda digambar sekali ke sini, lalu tinggal diputar
    this.spriteKey = '';
    this.dpr = 1;
    this.free = null;        // sedang ditahan berputar
    this.fitParent = !!options.fitParent;   // ukuran mengikuti kotak induk (dipakai layar peserta)
    this.drawPointer = !!options.drawPointer; // jarum ikut digambar di canvas
    /* Di layar peserta, nama yang tidak ikut diundi tidak ditandai apa pun —
       penandaan itu urusan halaman moderasi saja. */
    this.markBlocked = options.markBlocked !== false;
    this.resize();
  }

  /* slices: [{ label, blocked }] — yang blocked tetap digambar tapi tidak pernah menang. */
  Wheel.prototype.setSlices = function (slices) {
    var self = this;
    var next = slices.map(function (slice) {
      return {
        label: slice.label,
        blocked: !!slice.blocked,                              // menentukan kelayakan undian
        marked: self.markBlocked && !!slice.blocked            // menentukan tampilannya saja
      };
    });

    var key = signatureOf(next);
    if (key === signatureOf(this.slices)) return; // isinya sama, tidak perlu gambar ulang

    this.slices = next;
    this.spriteKey = '';
    this.draw();
  };

  Wheel.prototype.eligibleCount = function () {
    return this.slices.filter(function (slice) { return !slice.blocked; }).length;
  };

  Wheel.prototype.resize = function () {
    var size;

    if (this.fitParent && this.canvas.parentElement) {
      /* Roda harus muat utuh di kotaknya — pakai sisi terpendek, lalu ukurannya
         dipatok dalam piksel CSS supaya tidak pernah gepeng. */
      var box = this.canvas.parentElement.getBoundingClientRect();
      size = Math.max(160, Math.round(Math.min(box.width, box.height)));
      this.canvas.style.width = size + 'px';
      this.canvas.style.height = size + 'px';
    } else {
      var rect = this.canvas.getBoundingClientRect();
      size = Math.max(180, Math.round(rect.width || this.canvas.clientWidth || 320));
    }

    var dpr = Math.min(global.devicePixelRatio || 1, 2);

    this.size = size;
    this.dpr = dpr;
    this.spriteKey = '';
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  };

  /* Semua juring dan labelnya digambar sekali ke canvas bayangan. Saat roda
     berputar, tiap frame cukup memutar dan menyalin gambar itu — bukan
     menggambar ulang ratusan juring beserta teksnya. Inilah yang membuat roda
     dengan 200 nama tetap ringan. */
  Wheel.prototype.buildSprite = function () {
    var size = this.size;
    var dpr = this.dpr;
    var radius = size / 2 - 8;
    var n = this.slices.length;
    var key = size + 'x' + dpr + '|' + signatureOf(this.slices);

    if (this.spriteKey === key && this.sprite) return;

    if (!this.sprite) this.sprite = document.createElement('canvas');
    this.sprite.width = Math.round(size * dpr);
    this.sprite.height = Math.round(size * dpr);

    var ctx = this.sprite.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2);

    var seg = TAU / n;
    var clearance = radius * 0.32; // ruang untuk poros + tombol PUTAR
    var hub = radius * 0.2;

    /* Tanpa lantai ukuran huruf: kalau juringnya terlalu tipis, labelnya
       dilewati saja — kalau dipaksa, hasilnya cuma tumpukan teks yang tidak
       terbaca sekaligus memberatkan gambar. */
    var fontSize = Math.min(19, Math.round(radius * 0.13), Math.round(seg * radius * 0.72));
    var withText = fontSize >= 8;
    var withBorder = n <= 60;

    if (withText) ctx.textBaseline = 'middle';

    for (var i = 0; i < n; i++) {
      var start = i * seg;
      var marked = this.slices[i].marked;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, start, start + seg);
      ctx.closePath();
      ctx.fillStyle = marked ? '#39405e' : colorFor(i, n);
      ctx.fill();

      if (marked) {
        ctx.fillStyle = stripes(ctx);
        ctx.fill();
      }

      if (withBorder) {
        ctx.strokeStyle = 'rgba(10,12,20,0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      if (!withText) continue;

      var mid = start + seg / 2;
      /* Separuh kiri roda diputar setengah lingkaran lagi supaya teksnya
         tidak terbaca terbalik. */
      var flipped = mid > Math.PI / 2 && mid < Math.PI * 1.5;

      ctx.save();
      ctx.rotate(flipped ? mid + Math.PI : mid);
      ctx.textAlign = flipped ? 'left' : 'right';
      ctx.fillStyle = marked ? 'rgba(233,236,247,0.6)' : 'rgba(14,17,30,0.92)';
      ctx.font = '700 ' + fontSize + 'px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(fitText(ctx, this.slices[i].label, radius - clearance - 14), flipped ? -(radius - 12) : radius - 12, 0);
      ctx.restore();
    }

    /* Poros tengah */
    ctx.beginPath();
    ctx.arc(0, 0, hub, 0, TAU);
    ctx.fillStyle = '#0e1220';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();

    this.spriteKey = key;
  };

  Wheel.prototype.draw = function () {
    var ctx = this.ctx;
    var size = this.size;
    var cx = size / 2;
    var cy = size / 2;
    var radius = size / 2 - 8;

    ctx.clearRect(0, 0, size, size);

    if (!this.slices.length) {
      ctx.save();
      ctx.translate(cx, cy);
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
      ctx.restore();
    } else {
      this.buildSprite();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this.rotation);
      ctx.drawImage(this.sprite, -cx, -cy, size, size);
      ctx.restore();
    }

    /* Bingkai luar */
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 4, 0, TAU);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 6;
    ctx.stroke();

    if (this.drawPointer) {
      var wing = Math.max(9, size * 0.032);
      var depth = Math.max(18, size * 0.075);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx - wing, 1);
      ctx.lineTo(cx + wing, 1);
      ctx.lineTo(cx, depth);
      ctx.closePath();
      ctx.fillStyle = '#ffcc4d';
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      ctx.fill();
      ctx.restore();
    }
  };

  /* Indeks segmen yang berada tepat di bawah jarum untuk rotasi tertentu. */
  Wheel.prototype.indexAt = function (rotation) {
    var n = this.slices.length;
    if (!n) return -1;
    var seg = TAU / n;
    var angle = (POINTER_ANGLE - rotation) % TAU;
    if (angle < 0) angle += TAU;
    return Math.floor(angle / seg) % n;
  };

  /* ---------- Tahan untuk terus berputar ---------- */

  /* Posisi roda saat ditahan, sebagai rumus dari waktu — bukan hasil
     penjumlahan tiap frame. Dengan begitu layar peserta bisa menghitung posisi
     yang sama persis walau menyusul di tengah jalan. */
  function freeRotation(config, t) {
    if (t <= 0) return config.from;
    if (t < config.accelMs) return config.from + config.speed * t * t / (2 * config.accelMs);
    return config.from + config.speed * (t - config.accelMs / 2);
  }

  Wheel.prototype.startFreeSpin = function (options) {
    options = options || {};
    if (!this.slices.length) return null;

    var self = this;
    var config = {
      from: typeof options.from === 'number' ? options.from : this.rotation,
      speed: options.speed > 0 ? options.speed : FREE_SPEED,
      accelMs: options.accelMs >= 0 ? options.accelMs : FREE_ACCEL_MS
    };

    this.free = config;
    this.spinning = true;

    var offset = Math.max(0, options.elapsed || 0);
    var startTime = null;
    var lastBucket = this.tickBucket(config.from);

    global.requestAnimationFrame(function frame(now) {
      if (self.free !== config) return; // sudah dilepas atau diganti
      if (startTime === null) startTime = now - offset;

      self.rotation = freeRotation(config, now - startTime);
      self.draw();

      var bucket = self.tickBucket(self.rotation);
      if (bucket !== lastBucket) {
        lastBucket = bucket;
        self.onTick();
      }

      global.requestAnimationFrame(frame);
    });

    return config;
  };

  Wheel.prototype.isFreeSpinning = function () { return !!this.free; };

  /* Dengan 200 juring, tiap putaran melewati jarum 200 kali — kalau tiap
     lintasan dibunyikan, terdengar seperti dengung dan membebani audio. Bunyi
     dikelompokkan supaya lajunya tetap wajar berapa pun jumlah namanya. */
  Wheel.prototype.tickBucket = function (rotation) {
    var n = this.slices.length;
    if (!n) return -1;
    var stride = Math.max(1, Math.ceil(n / 24));
    return Math.floor(this.indexAt(rotation) / stride);
  };

  /* Rencana pengereman saat tahanan dilepas. Jarak tempuhnya dipilih supaya
     kecepatan awal perlambatan sama dengan kecepatan putar saat itu, jadi
     peralihannya tidak terasa tersendat. */
  Wheel.prototype.planLanding = function (durationMs) {
    var config = this.free;
    var n = this.slices.length;
    if (!config || !n) return null;

    var eligible = [];
    for (var i = 0; i < n; i++) {
      if (!this.slices[i].blocked) eligible.push(i);
    }
    if (!eligible.length) return null;

    var seg = TAU / n;
    var target = eligible[Math.floor(rand() * eligible.length) % eligible.length];
    var jitter = (rand() - 0.5) * seg * 0.7;
    var duration = Math.round(durationMs || (3000 + rand() * 900));
    var current = this.rotation;
    var minDelta = config.speed * duration / 4;

    var to = POINTER_ANGLE - (target * seg + seg / 2) + jitter;
    to += Math.ceil((current + minDelta - to) / TAU) * TAU;

    return { from: current, to: to, duration: duration };
  };

  /* Menyusun rencana putaran: rotasi awal, rotasi akhir, dan durasinya.
     Rencana ini dikirim juga ke layar peserta supaya roda di sana berputar
     persis sama, bahkan kalau pesannya telat sampai. */
  Wheel.prototype.planSpin = function () {
    var n = this.slices.length;
    if (this.spinning || n === 0) return null;

    var eligible = [];
    for (var i = 0; i < n; i++) {
      if (!this.slices[i].blocked) eligible.push(i);
    }
    if (!eligible.length) return null;

    var seg = TAU / n;
    var target = eligible[Math.floor(rand() * eligible.length) % eligible.length];
    var jitter = (rand() - 0.5) * seg * 0.7;      // supaya tidak selalu pas di tengah
    var turns = 5 + Math.floor(rand() * 3);
    var from = this.rotation;

    var to = POINTER_ANGLE - (target * seg + seg / 2) + jitter;
    to += Math.ceil((from + turns * TAU - to) / TAU) * TAU;

    return { from: from, to: to, duration: Math.round(4600 + rand() * 1300) };
  };

  /* Menjalankan sebuah rencana. `elapsedMs` > 0 berarti menyusul putaran yang
     sudah berjalan (dipakai layar peserta yang menerima rencananya belakangan). */
  Wheel.prototype.animateSpin = function (plan, elapsedMs) {
    var self = this;
    if (!plan || !this.slices.length) return Promise.resolve(null);

    var offset = Math.max(0, elapsedMs || 0);
    this.free = null; // hentikan mode tahan kalau sedang berjalan

    function settle() {
      self.rotation = ((plan.to % TAU) + TAU) % TAU;
      self.draw();
      self.spinning = false;
      var index = self.indexAt(self.rotation);
      return index < 0 ? null : { index: index, label: self.slices[index].label };
    }

    if (offset >= plan.duration) return Promise.resolve(settle());

    this.spinning = true;
    var lastBucket = this.tickBucket(plan.from);
    var startTime = null;

    return new Promise(function (resolve) {
      function frame(now) {
        if (startTime === null) startTime = now - offset;
        var progress = Math.min(1, (now - startTime) / plan.duration);

        self.rotation = plan.from + (plan.to - plan.from) * easeOutQuart(progress);
        self.draw();

        var bucket = self.tickBucket(self.rotation);
        if (bucket !== lastBucket) {
          lastBucket = bucket;
          self.onTick();
        }

        if (progress < 1) {
          global.requestAnimationFrame(frame);
          return;
        }

        resolve(settle());
      }

      global.requestAnimationFrame(frame);
    });
  };

  /* Memutar roda sendiri; mengembalikan Promise berisi { index, label }.
     Segmen yang di-blocked tetap tampil tapi tidak pernah jadi target. */
  Wheel.prototype.spin = function () {
    var plan = this.planSpin();
    if (!plan) return Promise.resolve(null);
    this.lastPlan = plan;
    return this.animateSpin(plan, 0);
  };

  Wheel.colorFor = colorFor;
  Wheel.palette = PALETTE;
  global.FWWheel = Wheel;
})(window);
