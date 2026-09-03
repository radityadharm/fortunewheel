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

  function makeParticle(x, y, angle, speed) {
    return {
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

  /* Ledakan dari satu titik + hujan dari atas layar. */
  function burst(x, y, amount) {
    if (!init()) return;

    var count = amount || 130;
    var i;

    for (i = 0; i < count; i++) {
      var angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.65;
      var speed = 5 + Math.random() * 12;
      particles.push(makeParticle(x, y, angle, speed));
    }

    var rain = Math.round(count * 0.45);
    for (i = 0; i < rain; i++) {
      var p = makeParticle(Math.random() * global.innerWidth, -20 - Math.random() * 160, Math.PI / 2, 1 + Math.random() * 2);
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

      if (p.life > p.ttl || p.y > h + 60) {
        particles.splice(i, 1);
        continue;
      }

      var fade = p.life > p.ttl - 40 ? (p.ttl - p.life) / 40 : 1;
      ctx.save();
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

  /* Ledakan dari tengah sebuah elemen (mis. roda pemenang). */
  function burstFrom(el, amount) {
    var x = global.innerWidth / 2;
    var y = global.innerHeight / 2;
    if (el && el.getBoundingClientRect) {
      var r = el.getBoundingClientRect();
      if (r.width || r.height) {
        x = r.left + r.width / 2;
        y = r.top + r.height / 2;
      }
    }
    burst(x, y, amount);
  }

  global.FWConfetti = { burst: burst, burstFrom: burstFrom, stop: stop };
})(window);
