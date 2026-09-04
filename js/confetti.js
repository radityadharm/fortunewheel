/* Confetti di atas satu canvas layar penuh. */
(function (global) {
  'use strict';

  var canvas = null;
  var ctx = null;
  var particles = [];
  var raf = null;
  var dpr = 1;

  var COLORS = ['#ffcc4d', '#ff5c8a', '#7b6bff', '#4fd18b', '#3fc7d4', '#ffffff', '#ff9f45'];

  function init() {
    if (ctx) return ctx;
    canvas = document.getElementById('confetti');
    if (!canvas) return null;
    ctx = canvas.getContext('2d');
    resize();
    global.addEventListener('resize', resize);
    return ctx;
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(global.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(global.innerWidth * dpr);
    canvas.height = Math.floor(global.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function makeParticle(x, y, angle, speed, bounds) {
    return {
      bounds: bounds || null,
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 6 + Math.random() * 7,
      h: 9 + Math.random() * 9,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.34,
      wobble: Math.random() * Math.PI * 2,
      round: Math.random() < 0.28,
      life: 0,
      ttl: 150 + Math.random() * 90
    };
  }

  /* Ledakan dari satu titik + hujan dari atas.
     `bounds` = { x0, x1 } membatasi confetti pada satu kolom saja, dipakai saat
     mode dua roda supaya perayaan roda kiri dan roda kanan tidak bercampur. */
  function burst(x, y, amount, bounds) {
    if (!init()) return;

    var count = amount || 130;
    var left = bounds ? bounds.x0 : 0;
    var right = bounds ? bounds.x1 : global.innerWidth;
    var top = bounds && typeof bounds.y0 === 'number' ? bounds.y0 : 0;
    var spread = bounds ? Math.PI * 1.25 : Math.PI * 1.65;
    var i;

    for (i = 0; i < count; i++) {
      var angle = -Math.PI / 2 + (Math.random() - 0.5) * spread;
      var speed = 5 + Math.random() * 12;
      particles.push(makeParticle(x, y, angle, speed, bounds));
    }

    var rain = Math.round(count * 0.45);
    for (i = 0; i < rain; i++) {
      var p = makeParticle(left + Math.random() * (right - left), top - 20 - Math.random() * 160, Math.PI / 2, 1 + Math.random() * 2, bounds);
      p.ttl = 220 + Math.random() * 90;
      particles.push(p);
    }

    if (particles.length > 900) particles = particles.slice(-900);
    if (!raf) raf = global.requestAnimationFrame(loop);
  }

  function loop() {
    var h = global.innerHeight;
    ctx.clearRect(0, 0, global.innerWidth, h);

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];

      p.life++;
      p.wobble += 0.1;
      p.vy += 0.22;                 // gravitasi
      p.vx *= 0.988;                // hambatan udara
      p.vy *= 0.992;
      p.x += p.vx + Math.sin(p.wobble) * 0.7;
      p.y += p.vy;
      p.rot += p.vrot;

      var floor = p.bounds && typeof p.bounds.y1 === 'number' ? p.bounds.y1 : h;
      if (p.life > p.ttl || p.y > floor + 60) {
        particles.splice(i, 1);
        continue;
      }

      var fade = p.life > p.ttl - 40 ? (p.ttl - p.life) / 40 : 1;
      ctx.save();
      if (p.bounds) {
        var by0 = typeof p.bounds.y0 === 'number' ? p.bounds.y0 : 0;
        var by1 = typeof p.bounds.y1 === 'number' ? p.bounds.y1 : h;
        ctx.beginPath();
        ctx.rect(p.bounds.x0, by0, p.bounds.x1 - p.bounds.x0, by1 - by0);
        ctx.clip();
      }
      ctx.globalAlpha = Math.max(0, fade);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.ellipse(0, 0, p.w / 2, p.w / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.wobble * 0.6)));
      }
      ctx.restore();
    }

    if (particles.length) {
      raf = global.requestAnimationFrame(loop);
    } else {
      ctx.clearRect(0, 0, global.innerWidth, h);
      raf = null;
    }
  }

  function stop() {
    particles = [];
    if (raf) {
      global.cancelAnimationFrame(raf);
      raf = null;
    }
    if (ctx) ctx.clearRect(0, 0, global.innerWidth, global.innerHeight);
  }

  /* Ledakan dari tengah sebuah elemen (mis. roda pemenang).
     `columnEl` opsional: bila diisi, confetti dikurung di dalam lebar elemen itu. */
  function burstFrom(el, amount, columnEl) {
    var x = global.innerWidth / 2;
    var y = global.innerHeight / 2;

    if (el && el.getBoundingClientRect) {
      var r = el.getBoundingClientRect();
      if (r.width || r.height) {
        x = r.left + r.width / 2;
        y = r.top + r.height / 2;
      }
    }

    var bounds = null;
    if (columnEl && columnEl.getBoundingClientRect) {
      var c = columnEl.getBoundingClientRect();
      if (c.width > 0) bounds = { x0: c.left, x1: c.right };
    }

    burst(x, y, amount, bounds);
  }

  /* Seperti burstFrom, tapi confetti dikurung pada seluruh kotak elemen —
     dipakai layar peserta agar perayaan roda atas dan roda bawah terpisah. */
  function burstIn(originEl, boxEl, amount) {
    if (!init()) return;

    var x = global.innerWidth / 2;
    var y = global.innerHeight / 2;

    if (originEl && originEl.getBoundingClientRect) {
      var r = originEl.getBoundingClientRect();
      if (r.width || r.height) {
        x = r.left + r.width / 2;
        y = r.top + r.height / 2;
      }
    }

    var bounds = null;
    if (boxEl && boxEl.getBoundingClientRect) {
      var b = boxEl.getBoundingClientRect();
      if (b.width > 0 && b.height > 0) {
        bounds = { x0: b.left, x1: b.right, y0: b.top, y1: b.bottom };
      }
    }

    burst(x, y, amount, bounds);
  }

  global.FWConfetti = { burst: burst, burstFrom: burstFrom, burstIn: burstIn, stop: stop };
})(window);
