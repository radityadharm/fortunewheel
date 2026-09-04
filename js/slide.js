/* Layar peserta.
 *
 * Dua sumber data:
 *   - tanpa ?s=   : mengikuti halaman roda di tab lain pada browser yang sama
 *                   (localStorage + siaran FWSync)
 *   - dengan ?s=  : mengikuti sesi di database, jadi bisa dibuka di perangkat
 *                   lain. Halaman ini murni penonton — tidak pernah menulis.
 *
 * Roda di sini ikut berputar sungguhan: moderator mengirim rencana putaran
 * (rotasi awal, rotasi akhir, durasi) dan halaman ini menjalankannya. Kalau
 * rencananya baru sampai di tengah putaran, animasinya menyusul dari posisi
 * yang seharusnya, bukan mengulang dari awal.
 */
(function (global) {
  'use strict';

  var STATE_KEY = 'state';
  var ANNOUNCE_MS = 7000;
  var POLL_MS = 1200;

  var params = new URLSearchParams(global.location.search);
  var sessionId = (params.get('s') || '').trim();
  var remote = /^[A-Za-z0-9_-]{6,40}$/.test(sessionId);

  var $ = function (sel) { return document.querySelector(sel); };

  var boardsEl = $('#slide-boards');
  var template = $('#board-tpl');
  var titleEl = $('#slide-title');
  var subEl = $('#slide-sub');
  var statusEl = $('#slide-status');
  var statusText = $('#slide-status-text');
  var hintEl = $('#slide-hint');
  var recentBox = $('#slide-recent');
  var recentList = $('#slide-recent-list');
  var announce = $('#announce');
  var bands = Array.prototype.map.call(announce.querySelectorAll('.announce__band'), function (el) {
    return {
      root: el,
      source: el.querySelector('[data-role="source"]'),
      name: el.querySelector('[data-role="name"]'),
      timer: null
    };
  });

  var boards = [];
  var snapshot = null;
  var pendingSnapshot = null;
  var animating = 0;
  var seenSeq = { '0': 0, '1': 0 };
  var highlight = {};
  var statusTimer = null;
  var waitingEl = null;

  /* ---------- Bentuk data yang sama untuk kedua sumber ---------- */

  function normalize(raw) {
    if (!raw || !Array.isArray(raw.wheels) || !raw.wheels.length) return null;

    var mode = Number(raw.mode) === 2 ? 2 : 1;

    return {
      mode: mode,
      wheels: raw.wheels.slice(0, mode).map(function (wheel, i) {
        wheel = wheel || {};
        return {
          name: typeof wheel.name === 'string' && wheel.name ? wheel.name : 'Roda ' + (i + 1),
          items: (Array.isArray(wheel.items) ? wheel.items : []).filter(function (item) {
            return item && typeof item.label === 'string';
          }).map(function (item) {
            return { label: item.label, blocked: !!item.blocked, won: !!item.won };
          }),
          history: Array.isArray(wheel.history) ? wheel.history : []
        };
      })
    };
  }

  function setStatus(mode, text) {
    statusEl.setAttribute('data-state', mode);
    statusText.textContent = text;
  }

  function showWaiting(title, detail) {
    boards.forEach(function (board) { board.root.remove(); });
    boards = [];
    snapshot = null;

    if (!waitingEl) {
      waitingEl = document.createElement('div');
      waitingEl.className = 'waiting';
      waitingEl.innerHTML = '<div><h2></h2><p></p></div>';
      boardsEl.appendChild(waitingEl);
    }

    waitingEl.querySelector('h2').textContent = title;
    waitingEl.querySelector('p').textContent = detail;
  }

  function clearWaiting() {
    if (!waitingEl) return;
    waitingEl.remove();
    waitingEl = null;
  }

  /* ---------- Papan ---------- */

  function ensureBoards(count) {
    while (boards.length > count) {
      boards.pop().root.remove();
    }

    while (boards.length < count) {
      var root = template.content.firstElementChild.cloneNode(true);
      boardsEl.appendChild(root);

      var canvas = root.querySelector('[data-role="canvas"]');
      var board = {
        root: root,
        wheelBox: root.querySelector('[data-role="wheel"]'),
        name: root.querySelector('[data-role="name"]'),
        count: root.querySelector('[data-role="count"]'),
        names: root.querySelector('[data-role="names"]'),
        namesBox: root.querySelector('[data-role="names-box"]'),
        wheel: new FWWheel(canvas, {
          fitParent: true,
          drawPointer: true,
          markBlocked: false, // penandaan "tidak diundi" hanya di halaman moderasi
          emptyText: 'Menunggu peserta'
        })
      };

      boards.push(board);
    }
  }

  function applySnapshot(next) {
    if (!next) return;

    /* Jangan mengubah isi roda saat animasinya masih berjalan — nanti
       segmennya bergeser di tengah putaran. */
    if (busy()) {
      pendingSnapshot = next;
      return;
    }

    clearWaiting();
    snapshot = next;
    boardsEl.setAttribute('data-mode', String(next.mode));
    ensureBoards(next.wheels.length);

    var totalNames = 0;
    var totalBlocked = 0;

    next.wheels.forEach(function (wheel, index) {
      var board = boards[index];
      totalNames += wheel.items.length;
      totalBlocked += wheel.items.filter(function (item) { return item.won; }).length;

      var sudahMenang = wheel.items.filter(function (item) { return item.won; }).length;

      board.name.textContent = wheel.name;
      board.count.textContent = sudahMenang
        ? wheel.items.length + ' peserta · ' + sudahMenang + ' sudah menang'
        : wheel.items.length + ' peserta';

      board.wheel.setSlices(wheel.items);
      board.wheel.resize();

      /* Daftar hanya dibangun ulang kalau isinya berubah. Kalau tidak, tiap
         penarikan data (tiap ~1,2 detik) akan mengulang animasi gulungannya
         dari awal sehingga terlihat mandek. */
      var itemsKey = wheel.items.map(function (item) {
        return (item.won ? '*' : '') + item.label;
      }).join('|') + '#' + (highlight[String(index)] || '');

      if (board.itemsKey === itemsKey) return;
      board.itemsKey = itemsKey;

      /* Semua nama tampil sama rata di layar peserta — yang sudah menang
         ditandai mahkota, dan status "tidak diundi" sengaja tidak terlihat. */
      board.names.textContent = '';
      wheel.items.forEach(function (item, i) {
        var li = document.createElement('li');
        var classes = [];

        var dot = document.createElement('i');
        dot.className = 'swatch';
        dot.style.background = FWWheel.colorFor(i, wheel.items.length);

        var label = document.createElement('span');
        label.className = 'label';
        label.textContent = item.label;

        li.appendChild(dot);

        if (item.won) {
          classes.push('is-won');
          var crown = document.createElement('i');
          crown.className = 'crown';
          crown.textContent = '👑';
          li.appendChild(crown);
        }

        if (highlight[String(index)] === item.label) classes.push('is-winner');
        li.className = classes.join(' ');

        li.appendChild(label);
        board.names.appendChild(li);
      });

      setupRoll(board);
    });

    titleEl.textContent = next.wheels.map(function (wheel) { return wheel.name; }).join(' & ');
    subEl.textContent = totalBlocked
      ? totalNames + ' peserta · ' + totalBlocked + ' sudah menang'
      : totalNames + ' peserta siap diundi';

    renderRecent(next.wheels);
    hintEl.hidden = true;
  }

  function busy() {
    if (animating > 0) return true;
    for (var i = 0; i < boards.length; i++) {
      if (boards[i].wheel.isFreeSpinning()) return true;
    }
    return false;
  }

  /* Kalau nama peserta lebih banyak dari ruang yang ada, daftarnya digulung
     terus-menerus. Isinya digandakan supaya perulangannya mulus: menggeser
     setengah tinggi track sama dengan kembali ke posisi semula. */
  var ROLL_SPEED = 26; // piksel per detik

  function setupRoll(board) {
    var track = board.names;
    var box = board.namesBox;

    track.classList.remove('is-rolling');
    track.style.removeProperty('--roll-duration');

    // buang salinan lama sebelum mengukur ulang
    var clones = track.querySelectorAll('[data-clone="true"]');
    for (var i = 0; i < clones.length; i++) clones[i].remove();

    if (!box || reduceMotion()) return;

    global.requestAnimationFrame(function () {
      var isi = track.scrollHeight;
      var ruang = box.clientHeight;
      if (!isi || isi <= ruang + 4) return; // masih muat, tidak perlu bergulir

      var asli = Array.prototype.slice.call(track.children);
      asli.forEach(function (node) {
        var salinan = node.cloneNode(true);
        salinan.setAttribute('data-clone', 'true');
        salinan.setAttribute('aria-hidden', 'true');
        track.appendChild(salinan);
      });

      track.style.setProperty('--roll-duration', Math.round(isi / ROLL_SPEED) + 's');
      track.classList.add('is-rolling');
    });
  }

  function reduceMotion() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function pauseRoll(index, paused) {
    var board = boards[index];
    if (board) board.names.classList.toggle('is-paused', !!paused);
  }

  function flushPending() {
    if (busy() || !pendingSnapshot) return;
    var next = pendingSnapshot;
    pendingSnapshot = null;
    applySnapshot(next);
  }

  function renderRecent(wheels) {
    var rows = [];

    wheels.forEach(function (wheel) {
      (wheel.history || []).slice(0, 6).forEach(function (entry) {
        if (entry && typeof entry.label === 'string') {
          rows.push({ wheel: wheel.name, label: entry.label, at: entry.at || 0 });
        }
      });
    });

    rows.sort(function (a, b) { return b.at - a.at; });
    rows = rows.slice(0, 8);

    recentBox.hidden = rows.length === 0;
    recentList.textContent = '';

    rows.forEach(function (row) {
      var li = document.createElement('li');
      if (wheels.length > 1) {
        var tag = document.createElement('small');
        tag.textContent = row.wheel;
        li.appendChild(tag);
      }
      li.appendChild(document.createTextNode(row.label));
      recentList.appendChild(li);
    });
  }

  /* ---------- Putaran & pengumuman ---------- */

  function spinBoard(index, plan, elapsed) {
    var board = boards[index];
    if (!board || !plan) return;

    hideBand(index);
    delete highlight[String(index)];
    board.animating = true;
    animating++;
    setStatus('spinning', 'Sedang mengundi' + (snapshot ? ' — ' + snapshot.wheels[index].name : '') + '…');

    board.wheel.animateSpin(plan, elapsed).then(function () {
      board.animating = false;
      animating = Math.max(0, animating - 1);
      if (animating === 0) setStatus('live', 'Terhubung');
      flushPending();
    });
  }

  /* Moderator sedang menahan tombolnya: roda di sini ikut berputar terus,
     memakai rumus dan waktu mulai yang sama supaya posisinya sejalan. */
  function holdBoard(index, hold, elapsed) {
    var board = boards[index];
    if (!board || !hold) return;

    hideBand(index);
    delete highlight[String(index)];
    board.wheel.startFreeSpin({
      from: hold.from,
      speed: hold.speed,
      accelMs: hold.accelMs,
      elapsed: elapsed
    });

    setStatus('spinning', 'Sedang mengundi' + (snapshot ? ' — ' + snapshot.wheels[index].name : '') + '…');
  }

  function bandVisible() {
    for (var i = 0; i < bands.length; i++) {
      if (!bands[i].root.hidden) return true;
    }
    return false;
  }

  function hideBand(index) {
    var band = bands[index];
    if (!band) return;

    global.clearTimeout(band.timer);
    band.timer = null;
    band.root.hidden = true;
    pauseRoll(index, false);
    announce.hidden = !bandVisible();
  }

  /* Pita pengumuman ditempatkan tepat di atas papan rodanya. Dengan dua roda
     yang ditumpuk, pita atas dan pita bawah berdiri sendiri — masing-masing
     dengan confetti sendiri — jadi dua pemenang bisa keluar bersamaan. */
  function placeBand(index) {
    var band = bands[index];
    var board = boards[index];
    if (!band) return;

    var kotak = board && boards.length > 1 ? board.root.getBoundingClientRect() : null;

    if (kotak && kotak.height > 0) {
      band.root.style.top = kotak.top + 'px';
      band.root.style.left = kotak.left + 'px';
      band.root.style.width = kotak.width + 'px';
      band.root.style.height = kotak.height + 'px';
      band.root.style.setProperty('--announce-size', Math.round(kotak.height * 0.3) + 'px');
    } else {
      band.root.style.top = '0';
      band.root.style.left = '0';
      band.root.style.width = '100%';
      band.root.style.height = '100%';
      band.root.style.setProperty('--announce-size', '11vw');
    }
  }

  function announceWinner(index, label) {
    var band = bands[index];
    var board = boards[index];
    if (!band) return;

    highlight[String(index)] = label;
    if (snapshot) applySnapshot(snapshot); // supaya pemenang tersorot di daftar

    band.source.textContent = snapshot && snapshot.wheels[index] ? snapshot.wheels[index].name : '';
    band.name.textContent = label;

    placeBand(index);
    band.root.hidden = false;
    announce.hidden = false;
    pauseRoll(index, true);

    /* Confetti dikurung di kotak papan yang menang dan diberi tanda supaya
       perayaan roda lain tidak ikut terhapus. Semburannya dari dua sudut bawah
       pita agar membingkai namanya, bukan menumpuk di satu sisi. */
    var tag = 'papan' + index;

    if (board && boards.length > 1) {
      var kotak = board.root.getBoundingClientRect();
      var batas = { x0: kotak.left, x1: kotak.right, y0: kotak.top, y1: kotak.bottom };

      FWConfetti.burst(kotak.left + kotak.width * 0.12, kotak.bottom - 6, 85, batas, tag);
      FWConfetti.burst(kotak.right - kotak.width * 0.12, kotak.bottom - 6, 85, batas, tag);
    } else {
      FWConfetti.burst(global.innerWidth * 0.1, global.innerHeight * 0.98, 110, null, tag);
      FWConfetti.burst(global.innerWidth * 0.9, global.innerHeight * 0.98, 110, null, tag);
    }

    setStatus('live', 'Pemenang keluar');

    global.clearTimeout(band.timer);
    band.timer = global.setTimeout(function () { hideBand(index); }, ANNOUNCE_MS);
  }

  /* Menunggu roda papan ini berhenti dulu — papan lain tidak ikut ditunggu,
     supaya pemenang roda pertama tidak tertahan oleh roda kedua yang masih
     berputar. */
  function queueWinner(index, label) {
    var board = boards[index];
    if (board && (board.animating || board.wheel.isFreeSpinning())) {
      global.setTimeout(function () { queueWinner(index, label); }, 200);
      return;
    }
    announceWinner(index, label);
  }

  bands.forEach(function (band, index) {
    band.root.addEventListener('click', function () { hideBand(index); });
  });

  /* ---------- Sumber 1: tab lain di browser yang sama ---------- */

  function startLocalMode() {
    function readLocal() {
      applySnapshot(normalize(FWStorage.read(STATE_KEY, null)));
      if (!snapshot && !pendingSnapshot) {
        showWaiting('Belum ada data roda', 'Buka halaman roda di tab lain pada browser ini, lalu tambahkan nama peserta.');
        setStatus('idle', 'Menunggu');
      } else if (animating === 0) {
        setStatus('live', 'Terhubung');
      }
    }

    FWSync.subscribe(function (message) {
      if (message.type === 'state') { readLocal(); return; }

      if (message.type === 'holding') {
        readLocal();
        holdBoard(
          Number(message.wheel) || 0,
          message.hold,
          message.startedAt ? Date.now() - message.startedAt : 0
        );
        return;
      }

      if (message.type === 'spinning') {
        readLocal();
        var elapsed = message.startedAt ? Date.now() - message.startedAt : 0;
        spinBoard(Number(message.wheel) || 0, message.plan, elapsed);
        return;
      }

      if (message.type === 'winner') {
        queueWinner(Number(message.wheel) || 0, message.label);
      }
    });

    global.addEventListener('storage', function (event) {
      if (event.key === 'fortunewheel.v1.state') readLocal();
    });

    global.addEventListener('focus', readLocal);
    readLocal();
  }

  /* ---------- Sumber 2: sesi di database ---------- */

  function startRemoteMode() {
    hintEl.hidden = true;
    var failures = 0;

    function poll() {
      global.fetch('api/live?s=' + encodeURIComponent(sessionId), { cache: 'no-store' })
        .then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (data) {
            return { status: response.status, data: data };
          });
        })
        .catch(function () { return { status: 0, data: {} }; })
        .then(function (result) {
          if (result.status === 200 && result.data.session) {
            failures = 0;
            handleSession(result.data.session, result.data.now || Date.now());
          } else if (result.status === 404) {
            failures = 0;
            showWaiting('Menunggu moderator', 'Sesi ini belum dimulai atau sudah ditutup. Halaman akan menyambung sendiri begitu undian dibuka.');
            setStatus('idle', 'Menunggu sesi');
          } else {
            failures++;
            if (failures > 2) setStatus('idle', 'Sambungan terputus');
          }
        });
    }

    var firstLoad = true;
    var lastCounter = 0;

    function handleSession(session, serverNow) {
      /* Pencacah sesi hanya bertambah. Kalau ia mundur, berarti sesinya sudah
         diganti atau kedaluwarsa — samakan lagi dari awal daripada menunggu
         nomor yang tidak akan pernah datang. */
      var counter = Number(session.seq) || 0;
      if (counter < lastCounter) {
        seenSeq = { '0': 0, '1': 0 };
        firstLoad = true;
      }
      lastCounter = counter;

      applySnapshot(normalize(session));
      if (animating === 0 && announce.hidden) setStatus('live', 'Terhubung');

      var events = session.events || {};

      /* Layar yang baru dibuka tidak mengulang peristiwa lama — penonton yang
         baru bergabung tidak perlu melihat pengumuman undian yang sudah lewat,
         cukup keadaan terkini. */
      if (firstLoad) {
        firstLoad = false;
        ['0', '1'].forEach(function (key) {
          if (events[key] && events[key].seq) seenSeq[key] = events[key].seq;
        });
        return;
      }

      ['0', '1'].forEach(function (key) {
        var event = events[key];
        if (!event || !(event.seq > seenSeq[key])) return;
        seenSeq[key] = event.seq;

        var index = Number(key);
        if (event.type === 'hold' && event.hold) {
          holdBoard(index, event.hold, Math.max(0, serverNow - (event.startedAt || serverNow)));
        } else if (event.type === 'spin' && event.plan) {
          var elapsed = Math.max(0, serverNow - (event.startedAt || serverNow));
          spinBoard(index, event.plan, elapsed);
        } else if (event.type === 'winner') {
          queueWinner(index, event.label);
        }
      });
    }

    poll();

    /* Tab yang tersembunyi tetap ikut, tapi jauh lebih jarang — cukup untuk
       menyusul keadaan saat dibuka lagi tanpa memboroskan kuota database. */
    var ticks = 0;
    global.setInterval(function () {
      ticks++;
      if (document.hidden && ticks % 4 !== 0) return;
      poll();
    }, POLL_MS);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) poll();
    });
  }

  /* ---------- Mulai ---------- */

  var resizeTimer = null;
  global.addEventListener('resize', function () {
    global.clearTimeout(resizeTimer);
    resizeTimer = global.setTimeout(function () {
      boards.forEach(function (board, i) {
        board.wheel.resize();
        setupRoll(board);
        if (!bands[i] || bands[i].root.hidden) return;
        placeBand(i);
      });
    }, 150);
  });

  if (remote) startRemoteMode();
  else startLocalMode();
})(window);
