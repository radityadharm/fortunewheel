/* Perekat aplikasi: state, dua panel roda, modal pemenang, dan roda tersimpan. */
(function (global) {
  'use strict';

  var STATE_KEY = 'state';
  var SAVED_KEY = 'saved';
  var SETTINGS_KEY = 'settings';
  var MAX_NAMES = 300;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  /* ---------- State ---------- */

  var AFTER_WIN = ['keep', 'remove', 'block'];

  function emptyWheel(name) {
    return { name: name, items: [], history: [], afterWin: 'keep' };
  }

  function normalizeWheel(raw, fallbackName) {
    var data = emptyWheel(fallbackName);
    if (!raw || typeof raw !== 'object') return data;

    data.name = typeof raw.name === 'string' && raw.name.trim() ? raw.name : fallbackName;

    if (AFTER_WIN.indexOf(raw.afterWin) >= 0) data.afterWin = raw.afterWin;
    else if (raw.autoRemove) data.afterWin = 'remove'; // format lama

    if (Array.isArray(raw.items)) {
      data.items = raw.items
        .map(function (item) {
          if (typeof item === 'string') return { id: uid(), label: item, blocked: false, won: false };
          if (item && typeof item.label === 'string') {
            return { id: item.id || uid(), label: item.label, blocked: !!item.blocked, won: !!item.won };
          }
          return null;
        })
        .filter(Boolean)
        .slice(0, MAX_NAMES);
    }

    if (Array.isArray(raw.history)) {
      data.history = raw.history
        .filter(function (h) { return h && typeof h.label === 'string'; })
        .map(function (h) { return { label: h.label, at: h.at || Date.now() }; })
        .slice(0, 100);
    }

    return data;
  }

  var stored = FWStorage.read(STATE_KEY, null) || {};
  var state = {
    mode: stored.mode === 2 ? 2 : 1,
    wheels: [
      normalizeWheel((stored.wheels || [])[0], 'Roda 1'),
      normalizeWheel((stored.wheels || [])[1], 'Roda 2')
    ]
  };

  var saved = (FWStorage.read(SAVED_KEY, []) || [])
    .filter(function (item) { return item && typeof item.name === 'string' && Array.isArray(item.names); })
    .map(function (item) {
      item.blocked = Array.isArray(item.blocked) ? item.blocked.filter(function (n) { return typeof n === 'string'; }) : [];
      return item;
    });

  /* Nama-nama yang tidak ikut diundi disimpan terpisah supaya daftar `names`
     tetap terbaca apa adanya (juga oleh berkas ekspor versi lama). */
  function blockedListOf(data) {
    return data.items.filter(function (item) { return item.blocked; }).map(function (item) { return item.label; });
  }

  function eligibleCount(data) {
    return data.items.filter(function (item) { return !item.blocked; }).length;
  }

  var settings = FWStorage.read(SETTINGS_KEY, { sound: true }) || { sound: true };
  if (typeof settings.liveId !== 'string') settings.liveId = '';

  function persistState() {
    FWStorage.write(STATE_KEY, state);
    FWSync.publish('state');
    publishLive(false);
  }
  function persistSaved() { FWStorage.write(SAVED_KEY, saved); }
  function persistSettings() { FWStorage.write(SETTINGS_KEY, settings); }

  /* ---------- Siaran sesi langsung ----------
     Layar peserta di perangkat lain membaca sesi ini lewat database. Yang
     dikirim: isi kedua roda + peristiwa terakhir per roda (rencana putaran
     atau pemenang). Penulisan biasa ditunda sesaat supaya mengetik nama tidak
     memicu satu tulisan per ketukan; peristiwa putaran dikirim seketika. */

  var liveEvents = {};
  var liveSeq = 0;
  var liveTimer = null;
  var liveWarned = false;

  function liveActive() {
    return !!settings.liveId && FWCloud.canWrite() && FWCloud.isAdmin();
  }

  function liveSnapshot() {
    return {
      mode: state.mode,
      title: state.wheels.slice(0, state.mode).map(function (wheel) { return wheel.name; }).join(' & '),
      wheels: state.wheels.slice(0, state.mode).map(function (wheel) {
        return {
          name: wheel.name,
          items: wheel.items.map(function (item) {
            return { label: item.label, blocked: !!item.blocked, won: !!item.won };
          }),
          history: wheel.history.slice(0, 12)
        };
      }),
      events: liveEvents
    };
  }

  function sendLive() {
    if (!liveActive()) return;
    var id = settings.liveId;

    FWCloud.publishLive(id, liveSnapshot()).then(function (result) {
      if (result.ok) { liveWarned = false; return; }
      if (settings.liveId !== id) return;

      if (result.status === 401) {
        FWCloud.forgetCode();
        renderCloud();
        renderLive();
        toast('Kode admin ditolak — tautan peserta berhenti diperbarui.');
        return;
      }

      if (!liveWarned) {
        liveWarned = true;
        toast('Layar peserta gagal diperbarui. Periksa sambungan internet.');
      }
    });
  }

  function publishLive(immediate) {
    if (!liveActive()) return;

    if (immediate) {
      global.clearTimeout(liveTimer);
      liveTimer = null;
      sendLive();
      return;
    }

    if (liveTimer) return;
    liveTimer = global.setTimeout(function () {
      liveTimer = null;
      sendLive();
    }, 700);
  }

  function noteLiveEvent(index, event) {
    liveSeq += 1;
    event.seq = liveSeq;
    event.wheel = index;
    liveEvents[String(index)] = event;
    publishLive(true);
  }

  /* ---------- Utilitas nama ---------- */

  /* Pemisahnya hanya baris baru. Koma sengaja tidak dipakai karena banyak nama
     memerlukannya untuk gelar, mis. "Andi Wijaya, S.Kom., M.T.". */
  function parseNames(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map(function (part) { return part.trim().replace(/\s+/g, ' '); })
      .filter(function (part) { return part.length > 0; })
      .map(function (part) { return part.slice(0, 60); });
  }

  function addNames(data, names) {
    var seen = {};
    data.items.forEach(function (item) { seen[item.label.toLowerCase()] = true; });

    var added = 0;
    var skipped = 0;
    var full = false;

    names.forEach(function (name) {
      var key = name.toLowerCase();
      if (seen[key]) { skipped++; return; }
      if (data.items.length >= MAX_NAMES) { full = true; return; }
      seen[key] = true;
      data.items.push({ id: uid(), label: name, blocked: false, won: false });
      added++;
    });

    return { added: added, skipped: skipped, full: full };
  }

  /* ---------- Toast ---------- */

  var toastBox = $('#toasts');

  function toast(message) {
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    toastBox.appendChild(el);
    global.setTimeout(function () {
      el.style.transition = 'opacity .25s';
      el.style.opacity = '0';
      global.setTimeout(function () { el.remove(); }, 260);
    }, 2400);
  }

  /* ---------- Panel roda ---------- */

  var wheelsEl = $('#wheels');
  var template = $('#panel-tpl');
  var controllers = [];
  var activeIndex = 0;

  function buildPanel(index) {
    var data = state.wheels[index];
    var root = template.content.firstElementChild.cloneNode(true);
    var pick = function (role) { return root.querySelector('[data-role="' + role + '"]'); };

    var el = {
      root: root,
      title: pick('title'),
      count: pick('count'),
      stage: pick('stage'),
      canvas: pick('canvas'),
      spin: pick('spin'),
      spinText: pick('spin-text'),
      addForm: pick('add-form'),
      nameInput: pick('name-input'),
      bulkInput: pick('bulk-input'),
      bulkAdd: pick('bulk-add'),
      bulkReplace: pick('bulk-replace'),
      afterWin: pick('after-win'),
      searchBox: pick('search-box'),
      search: pick('search'),
      searchCount: pick('search-count'),
      blockedNote: pick('blocked-note'),
      blockedText: pick('blocked-text'),
      unblockAll: pick('unblock-all'),
      shuffle: pick('shuffle'),
      clear: pick('clear'),
      save: pick('save'),
      list: pick('list'),
      historyBox: pick('history-box'),
      history: pick('history'),
      clearHistory: pick('clear-history')
    };

    wheelsEl.appendChild(root);

    var wheel = new FWWheel(el.canvas, {
      onTick: function () { FWSound.tick(); },
      emptyText: 'Tambahkan nama dulu'
    });

    var ctrl = { index: index, el: el, wheel: wheel, data: data };

    /* -- judul -- */
    el.title.value = data.name;
    el.title.addEventListener('input', function () {
      data.name = el.title.value.slice(0, 40);
      persistState();
      renderSaveSources();
    });
    el.title.addEventListener('blur', function () {
      if (!data.name.trim()) {
        data.name = 'Roda ' + (index + 1);
        el.title.value = data.name;
        persistState();
        renderSaveSources();
      }
    });

    /* -- tambah nama -- */
    el.addForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var names = parseNames(el.nameInput.value);
      if (!names.length) return;
      var result = addNames(data, names);
      forgetWinner(ctrl);
      el.nameInput.value = '';
      el.nameInput.focus();
      reportAdd(result);
      renderPanel(ctrl);
      persistState();
    });

    el.bulkAdd.addEventListener('click', function () {
      var names = parseNames(el.bulkInput.value);
      if (!names.length) { toast('Tidak ada nama untuk ditambahkan.'); return; }
      var result = addNames(data, names);
      forgetWinner(ctrl);
      el.bulkInput.value = '';
      reportAdd(result);
      renderPanel(ctrl);
      persistState();
    });

    el.bulkReplace.addEventListener('click', function () {
      var names = parseNames(el.bulkInput.value);
      if (!names.length) { toast('Isi dulu daftar namanya.'); return; }
      if (data.items.length && !global.confirm('Ganti seluruh isi "' + data.name + '" dengan daftar baru?')) return;
      data.items = [];
      var result = addNames(data, names);
      forgetWinner(ctrl);
      el.bulkInput.value = '';
      reportAdd(result);
      renderPanel(ctrl);
      persistState();
    });

    /* -- opsi -- */
    el.afterWin.value = data.afterWin;
    el.afterWin.addEventListener('change', function () {
      data.afterWin = AFTER_WIN.indexOf(el.afterWin.value) >= 0 ? el.afterWin.value : 'keep';
      persistState();
    });

    el.shuffle.addEventListener('click', function () {
      if (wheel.spinning || data.items.length < 2) return;
      for (var i = data.items.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = data.items[i];
        data.items[i] = data.items[j];
        data.items[j] = tmp;
      }
      renderPanel(ctrl);
      persistState();
      toast('Urutan diacak.');
    });

    el.clear.addEventListener('click', function () {
      if (wheel.spinning || !data.items.length) return;
      if (!global.confirm('Kosongkan semua nama di "' + data.name + '"?')) return;
      data.items = [];
      forgetWinner(ctrl);
      renderPanel(ctrl);
      persistState();
    });

    el.save.addEventListener('click', function () {
      openDrawer(index);
    });

    el.search.addEventListener('input', function () { applySearch(ctrl); });
    el.search.addEventListener('search', function () { applySearch(ctrl); });

    el.unblockAll.addEventListener('click', function () {
      if (wheel.spinning) return;
      var count = data.items.length - eligibleCount(data);
      if (!count) return;

      data.items.forEach(function (item) { item.blocked = false; });
      renderPanel(ctrl);
      persistState();
      toast(count + ' nama ikut diundi lagi.');
    });

    el.clearHistory.addEventListener('click', function () {
      data.history = [];
      data.items.forEach(function (item) { item.won = false; }); // mahkotanya ikut hilang
      renderPanel(ctrl);
      persistState();
    });

    /* -- putar: tahan untuk berputar terus, lepas untuk mulai berhenti -- */
    el.spin.addEventListener('pointerdown', function (event) {
      if (event.button != null && event.button !== 0) return;
      if (el.spin.disabled) return;
      try { el.spin.setPointerCapture(event.pointerId); } catch (err) { /* tidak semua peramban perlu ini */ }
      beginHold(ctrl);
    });

    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (name) {
      el.spin.addEventListener(name, function () { endHold(ctrl); });
    });

    el.spin.addEventListener('contextmenu', function (event) { event.preventDefault(); });

    el.spin.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ' && event.code !== 'Space') return;
      event.preventDefault();
      if (event.repeat) return;
      beginHold(ctrl);
    });

    el.spin.addEventListener('keyup', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ' && event.code !== 'Space') return;
      event.preventDefault();
      endHold(ctrl);
    });

    el.spin.addEventListener('blur', function () { endHold(ctrl); });

    /* -- hapus nama dari daftar -- */
    el.list.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-id]');
      if (!button || wheel.spinning) return;

      var id = button.getAttribute('data-id');
      var action = button.getAttribute('data-action');

      if (action === 'block') {
        data.items.forEach(function (item) {
          if (item.id === id) item.blocked = !item.blocked;
        });
      } else {
        data.items = data.items.filter(function (item) { return item.id !== id; });
        forgetWinner(ctrl);
      }

      renderPanel(ctrl);
      persistState();
    });

    root.addEventListener('pointerdown', function () { setActive(index); });
    root.addEventListener('focusin', function () { setActive(index); });

    controllers.push(ctrl);
    renderPanel(ctrl);
    return ctrl;
  }

  /* Kartu pemenang menahan hasil terakhir tiap roda supaya pemenang roda 1 tidak
     hilang begitu roda 2 diputar. Hasil itu dilupakan kalau isi rodanya diubah
     sendiri oleh pengguna (tambah/hapus nama, kosongkan, muat roda lain). */
  function forgetWinner(ctrl) {
    ctrl.lastWinner = null;
  }

  /* Menyaring chip yang sudah ada, bukan membangun ulang daftarnya — dengan
     200 peserta, mengetik di kolom cari harus tetap ringan. */
  function applySearch(ctrl) {
    var query = (ctrl.el.search.value || '').trim().toLowerCase();
    var nodes = ctrl.el.list.children;
    var shown = 0;

    for (var i = 0; i < nodes.length; i++) {
      var label = nodes[i].getAttribute('data-label') || '';
      var match = !query || label.indexOf(query) >= 0;
      nodes[i].hidden = !match;
      if (match) shown++;
    }

    ctrl.el.searchCount.textContent = query
      ? shown + ' dari ' + nodes.length
      : '';
    ctrl.el.searchCount.hidden = !query;
    ctrl.el.list.setAttribute('data-empty-search', query && !shown ? 'true' : 'false');
  }

  function reportAdd(result) {
    if (result.full) {
      toast('Roda penuh, maksimal ' + MAX_NAMES + ' nama.');
    } else if (result.added && result.skipped) {
      toast(result.added + ' nama ditambahkan, ' + result.skipped + ' duplikat dilewati.');
    } else if (!result.added && result.skipped) {
      toast('Nama itu sudah ada di roda.');
    } else if (result.added > 1) {
      toast(result.added + ' nama ditambahkan.');
    }
  }

  function setActive(index) {
    activeIndex = index;
    controllers.forEach(function (ctrl, i) {
      ctrl.el.root.classList.toggle('is-active', state.mode === 2 && i === index);
    });
  }

  function renderPanel(ctrl) {
    var data = ctrl.data;
    var el = ctrl.el;
    var total = data.items.length;
    var blocked = total - eligibleCount(data);

    el.count.textContent = blocked ? total + ' nama · ' + blocked + ' tidak diundi' : total + ' nama';
    ctrl.wheel.setSlices(data.items.map(function (item) {
      return { label: item.label, blocked: item.blocked };
    }));

    el.spin.disabled = eligibleCount(data) === 0 || ctrl.wheel.spinning;

    el.blockedNote.hidden = blocked === 0;
    if (blocked) {
      el.blockedText.textContent = blocked === total
        ? 'Semua nama sedang tidak ikut diundi, jadi roda belum bisa diputar.'
        : blocked + ' nama tetap tampil di roda tapi tidak akan menang.';
    }

    /* Daftar nama hanya dibangun ulang kalau isinya benar-benar berubah —
       dengan 200 peserta, membangun ratusan elemen tiap render terasa tersendat
       tepat saat roda berhenti. */
    var listKey = total + ':' + data.items.map(function (item) {
      return item.id + (item.blocked ? '!' : '') + (item.won ? '*' : '');
    }).join(',');

    if (ctrl.listKey !== listKey) {
      ctrl.listKey = listKey;

      var shownBefore = ctrl.shownIds || {};
      var shownNow = {};

      el.list.textContent = '';
      data.items.forEach(function (item, i) {
        var li = document.createElement('li');
        var classes = [];
        if (!shownBefore[item.id]) classes.push('is-new');
        shownNow[item.id] = true;

        var dot = document.createElement('i');
        dot.className = 'swatch';
        dot.style.background = FWWheel.colorFor(i, total);

        var label = document.createElement('span');
        label.textContent = item.label;

        var block = document.createElement('button');
        block.type = 'button';
        block.className = 'chipbtn' + (item.blocked ? ' is-on' : '');
        block.setAttribute('data-id', item.id);
        block.setAttribute('data-action', 'block');
        block.title = item.blocked
          ? 'Ikutkan lagi dalam undian'
          : 'Tetap tampil di roda, tapi tidak bisa menang';
        block.setAttribute('aria-label', block.title);
        block.setAttribute('aria-pressed', String(!!item.blocked));
        block.textContent = '⊘';

        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'chipbtn';
        remove.setAttribute('data-id', item.id);
        remove.setAttribute('data-action', 'remove');
        remove.setAttribute('aria-label', 'Hapus ' + item.label);
        remove.textContent = '×';

        if (item.blocked) {
          classes.push('is-blocked');
          dot.style.background = '#39405e';
        }
        if (item.won) classes.push('is-won');

        li.className = classes.join(' ');
        li.setAttribute('data-label', item.label.toLowerCase());

        li.appendChild(dot);

        if (item.won) {
          var crown = document.createElement('i');
          crown.className = 'crown';
          crown.title = 'Sudah pernah menang';
          crown.textContent = '👑';
          li.appendChild(crown);
        }

        li.appendChild(label);
        li.appendChild(block);
        li.appendChild(remove);
        el.list.appendChild(li);
      });

      ctrl.shownIds = shownNow;
      applySearch(ctrl);
    }

    el.searchBox.hidden = total < 10;
    if (total < 10 && el.search.value) {
      el.search.value = '';
      applySearch(ctrl);
    }

    /* riwayat */
    el.historyBox.hidden = data.history.length === 0;
    el.history.textContent = '';
    data.history.forEach(function (entry, i) {
      var li = document.createElement('li');

      var idx = document.createElement('span');
      idx.className = 'idx';
      idx.textContent = '#' + (data.history.length - i);

      var name = document.createElement('b');
      name.textContent = entry.label;

      var time = document.createElement('time');
      var date = new Date(entry.at);
      time.dateTime = date.toISOString();
      time.textContent = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

      li.appendChild(idx);
      li.appendChild(name);
      li.appendChild(time);
      el.history.appendChild(li);
    });
  }

  /* ---------- Putar & pemenang ---------- */

  /* Menjalankan sebuah rencana putaran lalu mencatat hasilnya. Modal & confetti
     diurus pemanggil, supaya "Putar semua" bisa menunggu kedua roda selesai. */
  function launchSpin(ctrl, plan) {
    ctrl.el.spin.disabled = true;
    ctrl.el.spin.classList.add('is-spinning');
    ctrl.el.spinText.textContent = '...';

    /* Rencana putaran ikut dikirim supaya roda di layar peserta berputar sama
       persis, termasuk kalau pesannya baru sampai di tengah putaran. */
    FWSync.publish('spinning', {
      wheel: ctrl.index,
      wheelName: ctrl.data.name,
      plan: plan,
      startedAt: Date.now()
    });
    noteLiveEvent(ctrl.index, { type: 'spin', plan: plan });

    return ctrl.wheel.animateSpin(plan, 0).then(function (result) {
      ctrl.el.spin.classList.remove('is-spinning');
      ctrl.el.spinText.textContent = 'PUTAR';
      ctrl.el.spin.disabled = eligibleCount(ctrl.data) === 0;
      if (!result) return null;

      var item = ctrl.data.items[result.index];
      if (!item) return null;

      ctrl.data.history.unshift({ label: item.label, at: Date.now() });
      ctrl.data.history = ctrl.data.history.slice(0, 100);

      item.won = true; // mahkota di daftar peserta, terpisah dari status "tidak diundi"
      var entry = { ctrl: ctrl, item: item, removed: false, blocked: item.blocked };

      if (ctrl.data.afterWin === 'remove') {
        ctrl.data.items = ctrl.data.items.filter(function (row) { return row.id !== item.id; });
        entry.removed = true;
      } else if (ctrl.data.afterWin === 'block') {
        item.blocked = true;
        entry.blocked = true;
      }

      ctrl.lastWinner = entry;
      renderPanel(ctrl);
      persistState();
      FWSync.publish('winner', {
        wheel: ctrl.index,
        wheelName: ctrl.data.name,
        label: item.label
      });
      noteLiveEvent(ctrl.index, { type: 'winner', label: item.label });
      return entry;
    });
  }

  function runSpin(ctrl) {
    if (ctrl.wheel.spinning || eligibleCount(ctrl.data) === 0) return Promise.resolve(null);

    var plan = ctrl.wheel.planSpin();
    if (!plan) return Promise.resolve(null);

    return launchSpin(ctrl, plan);
  }

  /* Pemenang terakhir dari tiap roda yang sedang aktif, urut roda 1 lalu roda 2. */
  function activeWinners() {
    return controllers.slice(0, state.mode)
      .map(function (ctrl) { return ctrl.lastWinner; })
      .filter(Boolean);
  }

  /* Di mode dua roda, confetti dikurung di kolom rodanya masing-masing supaya
     perayaan roda kiri dan roda kanan terpisah jelas. */
  function celebrate(ctrl, amount) {
    FWConfetti.burstFrom(ctrl.el.stage, amount, state.mode === 2 ? ctrl.el.root : null);
  }

  function announceResult(result) {
    if (!result) return;
    FWSound.win();
    celebrate(result.ctrl, 150);
    showWinners(activeWinners(), result);
  }

  function spin(ctrl) {
    if (ctrl.wheel.spinning || eligibleCount(ctrl.data) === 0) return;

    setActive(ctrl.index);
    closeModal();
    FWConfetti.stop();

    runSpin(ctrl).then(announceResult);
  }

  /* ---------- Tahan untuk terus berputar ----------
     Tombol ditahan: roda berputar terus tanpa batas. Begitu dilepas, barulah
     pemenang diundi dan rodanya direm sampai berhenti di segmen itu. */

  function beginHold(ctrl) {
    if (ctrl.holding || ctrl.wheel.spinning || eligibleCount(ctrl.data) === 0) return;

    setActive(ctrl.index);
    closeModal();
    FWConfetti.stop();

    var config = ctrl.wheel.startFreeSpin();
    if (!config) return;

    ctrl.holding = true;
    ctrl.el.spin.classList.add('is-spinning');
    ctrl.el.spinText.textContent = 'LEPAS';

    FWSync.publish('holding', {
      wheel: ctrl.index,
      wheelName: ctrl.data.name,
      hold: config,
      startedAt: Date.now()
    });
    noteLiveEvent(ctrl.index, { type: 'hold', hold: config });
  }

  function endHold(ctrl) {
    if (!ctrl.holding) return;
    ctrl.holding = false;

    var plan = ctrl.wheel.planLanding();

    if (!plan) {
      ctrl.wheel.free = null;
      ctrl.wheel.spinning = false;
      ctrl.el.spin.classList.remove('is-spinning');
      ctrl.el.spinText.textContent = 'PUTAR';
      return;
    }

    launchSpin(ctrl, plan).then(announceResult);
  }

  function spinAll() {
    var ready = controllers.slice(0, state.mode).filter(function (ctrl) {
      return !ctrl.wheel.spinning && eligibleCount(ctrl.data) > 0;
    });
    if (!ready.length) return;

    closeModal();
    FWConfetti.stop();

    Promise.all(ready.map(runSpin)).then(function (results) {
      var winners = results.filter(Boolean);
      if (!winners.length) return;
      FWSound.win();
      winners.forEach(function (entry) { celebrate(entry.ctrl, 130); });
      showWinners(activeWinners(), winners[winners.length - 1]);
    });
  }

  /* ---------- Modal pemenang ---------- */

  var modal = $('#winner-modal');
  var modalSource = $('#winner-source');
  var modalSingle = $('#winner-single');
  var modalMulti = $('#winner-multi');
  var modalName = $('#winner-name');
  var modalNote = $('#winner-note');
  var btnRemove = $('#winner-remove');
  var btnBlock = $('#winner-block');
  var btnKeep = $('#winner-keep');
  var btnAgain = $('#winner-again');
  var current = [];
  var freshEntry = null;

  function showWinners(results, latest) {
    current = results;
    freshEntry = latest || null;
    modal.hidden = false;
    renderWinnerModal();
    (current.length > 1 ? btnKeep : btnRemove).focus();
  }

  /* Membuang / mengembalikan seorang pemenang dari rodanya. */
  function toggleWinner(entry) {
    var data = entry.ctrl.data;

    if (entry.removed) {
      data.items.push({ id: entry.item.id, label: entry.item.label, blocked: entry.blocked, won: !!entry.item.won });
      entry.removed = false;
      toast('"' + entry.item.label + '" dikembalikan ke roda.');
    } else {
      data.items = data.items.filter(function (row) { return row.id !== entry.item.id; });
      entry.removed = true;
      toast('"' + entry.item.label + '" dihapus dari roda.');
    }

    renderPanel(entry.ctrl);
    persistState();
    renderWinnerModal();
  }

  /* Menyetel pemenang agar tetap tampil di roda tapi tidak bisa menang lagi —
     untuk peserta yang sudah sering menang tapi sayang kalau namanya hilang. */
  function toggleBlocked(entry) {
    if (entry.removed) return;

    entry.blocked = !entry.blocked;
    entry.ctrl.data.items.forEach(function (row) {
      if (row.id === entry.item.id) row.blocked = entry.blocked;
    });

    toast(entry.blocked
      ? '"' + entry.item.label + '" tetap tampil tapi tidak ikut undian lagi.'
      : '"' + entry.item.label + '" ikut undian lagi.');

    renderPanel(entry.ctrl);
    persistState();
    renderWinnerModal();
  }

  function renderWinnerModal() {
    if (!current.length) return;
    var multi = current.length > 1;

    modalSingle.hidden = multi;
    modalMulti.hidden = !multi;
    btnRemove.hidden = multi;
    btnBlock.hidden = multi;

    if (multi) {
      modalSource.textContent = 'Hasil ' + current.length + ' roda';
      modalMulti.textContent = '';

      current.forEach(function (entry) {
        var li = document.createElement('li');

        var who = document.createElement('div');
        who.className = 'who';
        var source = document.createElement('small');
        source.textContent = entry.ctrl.data.name;
        if (entry === freshEntry) {
          li.className = 'is-fresh';
          source.textContent += ' · baru saja';
        }
        var name = document.createElement('b');
        name.textContent = entry.item.label;
        who.appendChild(source);
        who.appendChild(name);
        if (entry.removed || entry.blocked) {
          var tag = document.createElement('em');
          tag.textContent = entry.removed ? 'sudah dihapus dari roda' : 'tidak ikut undian lagi';
          who.appendChild(tag);
        }

        var actions = document.createElement('div');
        actions.className = 'winners__actions';

        actions.appendChild(button(
          entry.removed ? 'Kembalikan' : 'Hapus',
          entry.removed ? 'btn btn--small btn--ghost' : 'btn btn--small btn--danger',
          function () { toggleWinner(entry); }
        ));

        if (!entry.removed) {
          actions.appendChild(button(
            entry.blocked ? 'Ikutkan' : 'Tidak ikut',
            'btn btn--small' + (entry.blocked ? ' btn--ghost' : ''),
            function () { toggleBlocked(entry); }
          ));
        }

        li.appendChild(who);
        li.appendChild(actions);
        modalMulti.appendChild(li);
      });

      btnAgain.textContent = 'Putar semua lagi';
      btnAgain.disabled = current.every(function (entry) { return eligibleCount(entry.ctrl.data) === 0; });
      return;
    }

    var only = current[0];
    var left = eligibleCount(only.ctrl.data);

    modalSource.textContent = only.ctrl.data.name;
    modalName.textContent = only.item.label;

    if (only.removed) {
      btnRemove.textContent = 'Kembalikan ke roda';
      btnRemove.className = 'btn btn--ghost';
      btnBlock.hidden = true;
      modalNote.textContent = 'Sudah dihapus dari roda — tersisa ' + left + ' nama yang diundi.';
    } else {
      btnRemove.textContent = 'Hapus dari roda';
      btnRemove.className = 'btn btn--danger';
      btnBlock.hidden = false;
      btnBlock.textContent = only.blocked ? 'Ikutkan lagi' : 'Tidak ikut lagi';
      btnBlock.className = only.blocked ? 'btn btn--ghost' : 'btn';
      modalNote.textContent = only.blocked
        ? 'Namanya tetap tampil di roda, tapi tidak akan menang lagi. Tersisa ' + left + ' nama yang diundi.'
        : 'Hapus dari roda, atau biarkan namanya tampil tapi tidak ikut undian lagi. Ada ' + left + ' nama yang diundi.';
    }

    btnAgain.textContent = 'Putar lagi';
    btnAgain.disabled = left === 0;
  }

  btnRemove.addEventListener('click', function () {
    if (current.length === 1) toggleWinner(current[0]);
  });

  btnBlock.addEventListener('click', function () {
    if (current.length === 1) toggleBlocked(current[0]);
  });

  btnKeep.addEventListener('click', closeModal);

  btnAgain.addEventListener('click', function () {
    var targets = current.map(function (entry) { return entry.ctrl; });
    closeModal();
    if (targets.length > 1) spinAll();
    else if (targets.length === 1) spin(targets[0]);
  });

  modal.querySelector('[data-role="dismiss"]').addEventListener('click', closeModal);

  function closeModal() {
    modal.hidden = true;
    current = [];
  }

  /* ---------- Mode 1 / 2 roda ---------- */

  function applyMode() {
    wheelsEl.setAttribute('data-mode', String(state.mode));
    controllers.forEach(function (ctrl, i) {
      ctrl.el.root.hidden = i >= state.mode;
    });

    document.querySelectorAll('.segmented__btn').forEach(function (btn) {
      btn.classList.toggle('is-active', Number(btn.getAttribute('data-mode')) === state.mode);
    });

    $('#spin-all').hidden = state.mode !== 2;
    if (state.mode === 1) setActive(0);

    global.requestAnimationFrame(function () {
      controllers.forEach(function (ctrl) {
        if (!ctrl.el.root.hidden) ctrl.wheel.resize();
      });
    });

    renderSaveSources();
    renderSaved();
  }

  document.querySelectorAll('.segmented__btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.mode = Number(btn.getAttribute('data-mode')) === 2 ? 2 : 1;
      applyMode();
      persistState();
    });
  });

  $('#spin-all').addEventListener('click', spinAll);

  /* ---------- Roda tersimpan ---------- */

  var drawer = $('#drawer');
  var savedList = $('#saved-list');
  var savedEmpty = $('#saved-empty');
  var saveForm = $('#save-form');
  var saveSource = $('#save-source');
  var saveName = $('#save-name');

  var cloudBox = {
    dot: $('#cloud-dot'),
    status: $('#cloud-status'),
    note: $('#cloud-note'),
    form: $('#cloud-form'),
    code: $('#admin-code'),
    logout: $('#cloud-logout')
  };

  var cloudWheels = [];

  function openDrawer(sourceIndex) {
    drawer.hidden = false;
    renderSaveSources();
    if (typeof sourceIndex === 'number') saveSource.value = String(sourceIndex);
    var data = state.wheels[Number(saveSource.value) || 0];
    if (!saveName.value.trim()) saveName.value = data.name;
    renderSaved();
    refreshCloud();
    saveName.focus();
  }

  function closeDrawer() { drawer.hidden = true; }

  function renderSaveSources() {
    var previous = saveSource.value;
    saveSource.textContent = '';
    for (var i = 0; i < state.mode; i++) {
      var option = document.createElement('option');
      option.value = String(i);
      option.textContent = state.wheels[i].name + ' (' + state.wheels[i].items.length + ' nama)';
      saveSource.appendChild(option);
    }
    if (previous && Number(previous) < state.mode) saveSource.value = previous;
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /* ---------- Database ---------- */

  var CLOUD_ERRORS = {
    wrong_code: 'Kode admin salah.',
    no_code: 'Masuk dulu dengan kode admin.',
    admin_code_not_set: 'Server belum disetel kode adminnya, jadi database masih hanya-baca.',
    storage_not_configured: 'Database belum tersambung di server.',
    storage_unavailable: 'Database sedang tidak bisa dihubungi.',
    too_many_wheels: 'Database sudah penuh.',
    invalid_wheel: 'Isi roda tidak bisa disimpan (nama kosong atau terlalu panjang).',
    offline: 'Tidak ada sambungan ke server.'
  };

  function cloudMessage(result) {
    if (result.status === 401) {
      FWCloud.forgetCode();
      renderCloud();
      return 'Kode admin ditolak — silakan masuk lagi.';
    }
    return CLOUD_ERRORS[result.error] || 'Gagal menghubungi database.';
  }

  function refreshCloud() {
    return FWCloud.refresh().then(function (result) {
      cloudWheels = result.wheels;
      renderCloud();
      renderLive();
      renderSaved();
    });
  }

  function renderCloud() {
    var dot = cloudBox.dot;

    if (!FWCloud.isEnabled()) {
      dot.setAttribute('data-state', 'off');
      cloudBox.status.textContent = 'Tersimpan di browser ini saja';
      cloudBox.note.textContent = FWCloud.reason() === 'offline'
        ? 'Server tidak bisa dihubungi. Roda tetap aman tersimpan di browser ini.'
        : 'Database belum aktif. Pasang Upstash Redis di Vercel lalu isi env ADMIN_CODE agar roda bisa dipakai lintas perangkat.';
      cloudBox.form.hidden = true;
      cloudBox.logout.hidden = true;
      return;
    }

    if (!FWCloud.canWrite()) {
      dot.setAttribute('data-state', 'on');
      cloudBox.status.textContent = 'Database tersambung (hanya baca)';
      cloudBox.note.textContent = 'Env ADMIN_CODE belum disetel di server, jadi belum ada yang boleh menyimpan atau menghapus.';
      cloudBox.form.hidden = true;
      cloudBox.logout.hidden = true;
      return;
    }

    if (FWCloud.isAdmin()) {
      dot.setAttribute('data-state', 'admin');
      cloudBox.status.textContent = 'Masuk sebagai admin';
      cloudBox.note.textContent = 'Roda yang kamu simpan masuk ke database dan bisa dibuka dari perangkat lain.';
      cloudBox.form.hidden = true;
      cloudBox.logout.hidden = false;
      return;
    }

    dot.setAttribute('data-state', 'on');
    cloudBox.status.textContent = 'Database tersambung';
    cloudBox.note.textContent = 'Roda di database bisa dimuat siapa saja. Masukkan kode admin untuk menyimpan, menimpa, atau menghapus.';
    cloudBox.form.hidden = false;
    cloudBox.logout.hidden = true;
  }

  cloudBox.form.addEventListener('submit', function (event) {
    event.preventDefault();
    var code = cloudBox.code.value.trim();
    if (!code) return;

    FWCloud.verify(code).then(function (result) {
      cloudBox.code.value = '';
      renderLive();
      if (!result.ok) {
        /* Saat memverifikasi, 401 berarti kodenya memang salah — bukan sesi
           admin yang kedaluwarsa seperti pada penyimpanan. */
        toast(result.status === 401 ? 'Kode admin salah.' : cloudMessage(result));
        return;
      }
      toast('Berhasil masuk sebagai admin.');
      refreshCloud();
    });
  });

  /* ---------- Tautan layar peserta ---------- */

  var liveBox = {
    dot: $('#live-dot'),
    note: $('#live-note'),
    start: $('#live-start'),
    stop: $('#live-stop'),
    linkBox: $('#live-link-box'),
    link: $('#live-link'),
    open: $('#live-open'),
    copy: $('#live-copy')
  };

  function newSessionId() {
    var chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    var out = '';
    var buf = new Uint8Array(12);

    if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(buf);
    else for (var j = 0; j < buf.length; j++) buf[j] = Math.floor(Math.random() * 256);

    for (var i = 0; i < buf.length; i++) out += chars[buf[i] % chars.length];
    return out;
  }

  function liveUrl() {
    return new URL('slide.html?s=' + encodeURIComponent(settings.liveId), global.location.href).href;
  }

  function renderLive() {
    var canHost = FWCloud.canWrite() && FWCloud.isAdmin();
    var active = !!settings.liveId;

    liveBox.linkBox.hidden = !active;
    liveBox.stop.hidden = !active;
    liveBox.start.hidden = active || !canHost;

    if (active) {
      liveBox.link.value = liveUrl();
      liveBox.open.href = liveUrl();
    }

    if (active && canHost) {
      liveBox.dot.setAttribute('data-state', 'admin');
      liveBox.note.textContent = 'Tautan aktif. Siapa pun yang membukanya melihat roda ini berputar secara langsung, tanpa bisa mengubah apa pun.';
      return;
    }

    if (active) {
      liveBox.dot.setAttribute('data-state', 'on');
      liveBox.note.textContent = 'Tautan berhenti diperbarui karena kamu belum masuk sebagai admin di perangkat ini.';
      return;
    }

    liveBox.dot.setAttribute('data-state', 'off');

    if (!FWCloud.isEnabled()) {
      /* Sebutkan penyebabnya, bukan cuma "tidak bisa" — kalau tidak, orang
         mengira tautannya rusak padahal databasenya memang belum disetel. */
      var reason = FWCloud.reason();

      if (reason === 'offline') {
        liveBox.note.textContent = 'Server tidak bisa dihubungi. Layar peserta masih bisa dibuka di tab lain pada browser ini.';
      } else if (reason === 'no_api') {
        liveBox.note.textContent = 'Situs ini belum menjalankan bagian server (folder api/). Kalau dibuka langsung dari berkas atau hosting statis biasa, tautan lintas perangkat memang belum bisa dibuat.';
      } else {
        liveBox.note.textContent = 'Database belum tersambung, jadi tautan lintas perangkat belum bisa dibuat. Di Vercel: Storage → Marketplace → Upstash (Redis) → Connect to Project, lalu deploy ulang.';
      }
      return;
    }

    if (!FWCloud.canWrite()) {
      liveBox.note.textContent = 'Database tersambung, tapi env ADMIN_CODE belum diisi di Vercel — tanpa itu tidak ada yang boleh menyiarkan sesi.';
      return;
    }

    if (!FWCloud.isAdmin()) {
      liveBox.note.textContent = 'Masukkan kode admin di kotak Database di bawah, lalu tombol "Buat tautan peserta" akan muncul di sini.';
      return;
    }

    liveBox.note.textContent = 'Buat tautan agar layar peserta bisa dibuka di perangkat lain — misalnya laptop atau TV yang tersambung ke proyektor.';
  }

  liveBox.start.addEventListener('click', function () {
    settings.liveId = newSessionId();
    persistSettings();
    renderLive();
    publishLive(true);
    toast('Tautan peserta dibuat.');
  });

  liveBox.stop.addEventListener('click', function () {
    var id = settings.liveId;
    if (!global.confirm('Matikan tautan peserta? Layar yang sedang terbuka akan berhenti mengikuti.')) return;

    settings.liveId = '';
    persistSettings();
    renderLive();
    if (id) FWCloud.endLive(id);
    toast('Tautan peserta dimatikan.');
  });

  liveBox.copy.addEventListener('click', function () {
    var url = liveBox.link.value;

    function fallback() {
      liveBox.link.select();
      try { document.execCommand('copy'); } catch (err) { /* biarkan pengguna menyalin manual */ }
    }

    if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard.writeText(url).then(function () {
        toast('Tautan disalin.');
      }, function () {
        fallback();
        toast('Tautan dipilih — tekan Ctrl/Cmd + C.');
      });
      return;
    }

    fallback();
    toast('Tautan dipilih — tekan Ctrl/Cmd + C.');
  });

  cloudBox.logout.addEventListener('click', function () {
    FWCloud.forgetCode();
    renderCloud();
    renderLive();
    renderSaved();
    toast('Keluar dari mode admin.');
  });

  function canPush() {
    return FWCloud.canWrite() && FWCloud.isAdmin();
  }

  function pushToCloud(wheel, message) {
    if (!canPush()) return Promise.resolve(false);
    return FWCloud.save(wheel).then(function (result) {
      if (!result.ok) { toast(cloudMessage(result)); return false; }

      var found = false;
      cloudWheels = cloudWheels.map(function (row) {
        if (row.id === result.wheel.id) { found = true; return result.wheel; }
        return row;
      });
      if (!found) cloudWheels.unshift(result.wheel);

      renderSaved();
      if (message) toast(message);
      return true;
    });
  }

  /* ---------- Daftar gabungan (browser + database) ---------- */

  function mergedSaved() {
    var map = {};
    var order = [];

    saved.forEach(function (row) {
      map[row.id] = { data: row, source: 'local' };
      order.push(row.id);
    });

    cloudWheels.forEach(function (row) {
      var existing = map[row.id];
      if (existing) {
        var newer = (row.updatedAt || 0) >= (existing.data.updatedAt || 0) ? row : existing.data;
        map[row.id] = { data: newer, source: 'both' };
      } else {
        map[row.id] = { data: row, source: 'cloud' };
        order.push(row.id);
      }
    });

    return order.map(function (id) { return map[id]; }).sort(function (a, b) {
      return (b.data.updatedAt || 0) - (a.data.updatedAt || 0);
    });
  }

  function upsertLocal(wheel) {
    var found = false;
    saved = saved.map(function (row) {
      if (row.id === wheel.id) { found = true; return wheel; }
      return row;
    });
    if (!found) saved.unshift(wheel);
    persistSaved();
  }

  function findSavedByName(name) {
    var key = name.toLowerCase();
    return mergedSaved().filter(function (row) { return row.data.name.toLowerCase() === key; })[0];
  }

  function wheelFrom(source, id, name, createdAt) {
    return {
      id: id || uid(),
      name: name,
      names: source.items.map(function (item) { return item.label; }),
      blocked: blockedListOf(source),
      createdAt: createdAt || Date.now(),
      updatedAt: Date.now()
    };
  }

  function renderSaved() {
    var rows = mergedSaved();

    savedList.textContent = '';
    savedEmpty.hidden = rows.length > 0;

    rows.forEach(function (row) {
      var entry = row.data;
      var inCloud = row.source !== 'local';
      var li = document.createElement('li');

      var head = document.createElement('div');
      head.className = 'saved__title';

      var name = document.createElement('b');
      name.textContent = entry.name;

      var badge = document.createElement('span');
      badge.className = 'saved__badge';
      badge.setAttribute('data-source', row.source);
      badge.textContent = inCloud ? '☁ database' : 'browser ini';

      var meta = document.createElement('span');
      meta.className = 'saved__meta';
      var blockedCount = (entry.blocked || []).length;
      meta.textContent = entry.names.length + ' nama'
        + (blockedCount ? ' · ' + blockedCount + ' tidak diundi' : '')
        + ' · ' + formatDate(entry.updatedAt || entry.createdAt || Date.now());

      head.appendChild(name);
      head.appendChild(badge);
      head.appendChild(meta);

      var preview = document.createElement('p');
      preview.className = 'saved__preview';
      var shown = entry.names.slice(0, 6).join(', ');
      preview.textContent = entry.names.length > 6 ? shown + ' … +' + (entry.names.length - 6) + ' lagi' : (shown || '(kosong)');

      var actions = document.createElement('div');
      actions.className = 'saved__actions';

      for (var i = 0; i < state.mode; i++) {
        actions.appendChild(button(
          state.mode === 1 ? 'Muat' : 'Muat ke ' + state.wheels[i].name,
          i === 0 ? 'btn btn--small btn--primary' : 'btn btn--small',
          loadInto(entry, i)
        ));
      }

      if (!inCloud && canPush()) {
        actions.appendChild(button('Unggah', 'btn btn--small btn--ghost', function () {
          pushToCloud(entry, '"' + entry.name + '" diunggah ke database.');
        }));
      }

      if (!inCloud || canPush()) {
        actions.appendChild(button('Timpa', 'btn btn--small btn--ghost', function () {
          var source = state.wheels[Number(saveSource.value) || 0];
          if (!source.items.length) { toast('Roda sumbernya masih kosong.'); return; }
          if (!global.confirm('Timpa "' + entry.name + '" dengan isi ' + source.name + ' (' + source.items.length + ' nama)?')) return;

          var updated = wheelFrom(source, entry.id, entry.name, entry.createdAt);
          upsertLocal(updated);
          renderSaved();
          if (inCloud) pushToCloud(updated, '"' + entry.name + '" diperbarui di database.');
          else toast('"' + entry.name + '" diperbarui.');
        }));
      }

      actions.appendChild(button('Duplikat', 'btn btn--small btn--ghost', function () {
        saved.unshift({
          id: uid(),
          name: entry.name + ' (salinan)',
          names: entry.names.slice(),
          blocked: (entry.blocked || []).slice(),
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        persistSaved();
        renderSaved();
      }));

      if (!inCloud || canPush()) {
        actions.appendChild(button('Hapus', 'btn btn--small btn--ghost', function () {
          var where = inCloud ? ' dari database' : '';
          if (!global.confirm('Hapus roda tersimpan "' + entry.name + '"' + where + '?')) return;

          saved = saved.filter(function (item) { return item.id !== entry.id; });
          persistSaved();

          if (!inCloud) { renderSaved(); return; }

          FWCloud.remove(entry.id).then(function (result) {
            if (!result.ok) { toast(cloudMessage(result)); renderSaved(); return; }
            cloudWheels = cloudWheels.filter(function (item) { return item.id !== entry.id; });
            renderSaved();
            toast('"' + entry.name + '" dihapus dari database.');
          });
        }));
      }

      li.appendChild(head);
      li.appendChild(preview);
      li.appendChild(actions);
      savedList.appendChild(li);
    });
  }

  function button(text, className, handler) {
    var el = document.createElement('button');
    el.type = 'button';
    el.className = className;
    el.textContent = text;
    el.addEventListener('click', handler);
    return el;
  }

  function loadInto(entry, index) {
    return function () {
      var ctrl = controllers[index];
      if (ctrl.wheel.spinning) return;
      if (ctrl.data.items.length && !global.confirm('Ganti isi ' + ctrl.data.name + ' dengan "' + entry.name + '"?')) return;

      ctrl.data.name = entry.name;
      var blockedNames = {};
      (entry.blocked || []).forEach(function (label) { blockedNames[label.toLowerCase()] = true; });

      ctrl.data.items = entry.names.slice(0, MAX_NAMES).map(function (label) {
        return { id: uid(), label: label, blocked: !!blockedNames[label.toLowerCase()], won: false };
      });
      ctrl.data.history = [];
      forgetWinner(ctrl);
      ctrl.el.title.value = entry.name;

      renderPanel(ctrl);
      renderSaveSources();
      persistState();
      closeDrawer();
      toast('"' + entry.name + '" dimuat ke roda ' + (index + 1) + '.');
    };
  }

  saveForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var source = state.wheels[Number(saveSource.value) || 0];
    var name = saveName.value.trim() || source.name;

    if (!source.items.length) { toast('Roda ini masih kosong.'); return; }

    var existing = findSavedByName(name);
    if (existing && !global.confirm('"' + name + '" sudah ada. Timpa?')) return;

    var wheel = existing
      ? wheelFrom(source, existing.data.id, existing.data.name, existing.data.createdAt)
      : wheelFrom(source, null, name, null);

    upsertLocal(wheel);
    renderSaved();
    saveName.value = '';

    var wasInCloud = existing && existing.source !== 'local';
    if (canPush()) {
      pushToCloud(wheel, 'Roda "' + name + '" tersimpan di database.');
    } else {
      toast(wasInCloud
        ? 'Roda "' + name + '" tersimpan di browser ini (masuk sebagai admin untuk memperbarui database).'
        : 'Roda "' + name + '" tersimpan di browser ini.');
    }
  });

  saveSource.addEventListener('change', function () {
    var data = state.wheels[Number(saveSource.value) || 0];
    if (!saveName.value.trim()) saveName.value = data.name;
  });

  $('#open-drawer').addEventListener('click', function () { openDrawer(activeIndex); });

  $('#open-slide').addEventListener('click', function () {
    openDrawer(activeIndex);
    var box = $('#live-box');
    box.scrollIntoView({ block: 'nearest' });
    box.classList.remove('is-flash');
    void box.offsetWidth; // paksa animasinya mengulang
    box.classList.add('is-flash');
  });
  $('#close-drawer').addEventListener('click', closeDrawer);
  drawer.querySelector('[data-role="dismiss"]').addEventListener('click', closeDrawer);

  /* ---------- Ekspor / impor ---------- */

  $('#export-json').addEventListener('click', function () {
    var payload = {
      app: 'fortunewheel',
      version: 1,
      exportedAt: new Date().toISOString(),
      wheels: mergedSaved().map(function (row) { return row.data; })
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'fortune-wheels.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    global.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  $('#import-json').addEventListener('change', function (event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      var list;
      try {
        var parsed = JSON.parse(String(reader.result));
        list = Array.isArray(parsed) ? parsed : parsed.wheels;
      } catch (err) {
        toast('File JSON tidak bisa dibaca.');
        return;
      }

      if (!Array.isArray(list)) { toast('Format file tidak dikenali.'); return; }

      var imported = 0;
      list.forEach(function (row) {
        if (!row || !Array.isArray(row.names)) return;
        var names = row.names.filter(function (n) { return typeof n === 'string'; }).slice(0, MAX_NAMES);
        if (!names.length) return;
        saved.unshift({
          id: uid(),
          name: String(row.name || 'Roda impor').slice(0, 60),
          names: names,
          blocked: Array.isArray(row.blocked)
            ? row.blocked.filter(function (n) { return typeof n === 'string' && names.indexOf(n) >= 0; })
            : [],
          createdAt: row.createdAt || Date.now(),
          updatedAt: Date.now()
        });
        imported++;
      });

      persistSaved();
      renderSaved();
      toast(imported ? imported + ' roda diimpor.' : 'Tidak ada roda yang bisa diimpor.');
    };
    reader.readAsText(file);
    event.target.value = '';
  });

  /* ---------- Suara ---------- */

  var soundBtn = $('#sound-toggle');

  function applySound() {
    FWSound.setEnabled(settings.sound);
    soundBtn.setAttribute('aria-pressed', String(!!settings.sound));
    soundBtn.querySelector('[data-role="icon"]').textContent = settings.sound ? '🔊' : '🔇';
  }

  soundBtn.addEventListener('click', function () {
    settings.sound = !settings.sound;
    applySound();
    persistSettings();
  });

  /* ---------- Pintasan & resize ---------- */

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      if (!modal.hidden) closeModal();
      else if (!drawer.hidden) closeDrawer();
      return;
    }

    if (event.code !== 'Space') return;

    var tag = (event.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.target.isContentEditable) return;
    if (event.target.closest && event.target.closest('[data-role="spin"]')) return; // tombolnya punya penanganan sendiri
    if (!modal.hidden || !drawer.hidden) return;

    event.preventDefault();
    if (event.repeat) return;
    beginHold(controllers[Math.min(activeIndex, state.mode - 1)]);
  });

  document.addEventListener('keyup', function (event) {
    if (event.code !== 'Space') return;
    if (event.target.closest && event.target.closest('[data-role="spin"]')) return;
    endHold(controllers[Math.min(activeIndex, state.mode - 1)]);
  });

  /* Jaring pengaman: kalau jari/kursor dilepas di luar tombol atau tabnya
     berpindah, tahanan tetap dilepas supaya roda tidak berputar selamanya. */
  document.addEventListener('pointerup', function () {
    controllers.forEach(function (ctrl) { endHold(ctrl); });
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) controllers.forEach(function (ctrl) { endHold(ctrl); });
  });

  var resizeTimer = null;
  global.addEventListener('resize', function () {
    global.clearTimeout(resizeTimer);
    resizeTimer = global.setTimeout(function () {
      controllers.forEach(function (ctrl) {
        if (!ctrl.el.root.hidden) ctrl.wheel.resize();
      });
    }, 120);
  });

  /* ---------- Mulai ---------- */

  buildPanel(0);
  buildPanel(1);
  applyMode();
  applySound();
  refreshCloud();

  if (!FWStorage.isAvailable()) {
    $('#storage-note').textContent = 'Penyimpanan browser tidak aktif — data hanya bertahan selama tab ini terbuka.';
  } else {
    $('#storage-note').textContent = 'Data tersimpan otomatis di browser ini.';
  }
})(window);
