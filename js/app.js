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

  function emptyWheel(name) {
    return { name: name, items: [], history: [], autoRemove: false };
  }

  function normalizeWheel(raw, fallbackName) {
    var data = emptyWheel(fallbackName);
    if (!raw || typeof raw !== 'object') return data;

    data.name = typeof raw.name === 'string' && raw.name.trim() ? raw.name : fallbackName;
    data.autoRemove = !!raw.autoRemove;

    if (Array.isArray(raw.items)) {
      data.items = raw.items
        .map(function (item) {
          if (typeof item === 'string') return { id: uid(), label: item };
          if (item && typeof item.label === 'string') return { id: item.id || uid(), label: item.label };
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

  var saved = (FWStorage.read(SAVED_KEY, []) || []).filter(function (item) {
    return item && typeof item.name === 'string' && Array.isArray(item.names);
  });

  var settings = FWStorage.read(SETTINGS_KEY, { sound: true }) || { sound: true };

  function persistState() { FWStorage.write(STATE_KEY, state); }
  function persistSaved() { FWStorage.write(SAVED_KEY, saved); }
  function persistSettings() { FWStorage.write(SETTINGS_KEY, settings); }

  /* ---------- Utilitas nama ---------- */

  function parseNames(text) {
    return String(text || '')
      .split(/[\n,;\t]+/)
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
      data.items.push({ id: uid(), label: name });
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
      autoRemove: pick('auto-remove'),
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
      el.bulkInput.value = '';
      reportAdd(result);
      renderPanel(ctrl);
      persistState();
    });

    /* -- opsi -- */
    el.autoRemove.checked = data.autoRemove;
    el.autoRemove.addEventListener('change', function () {
      data.autoRemove = el.autoRemove.checked;
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
      renderPanel(ctrl);
      persistState();
    });

    el.save.addEventListener('click', function () {
      openDrawer(index);
    });

    el.clearHistory.addEventListener('click', function () {
      data.history = [];
      renderPanel(ctrl);
      persistState();
    });

    /* -- putar -- */
    el.spin.addEventListener('click', function () { spin(ctrl); });

    /* -- hapus nama dari daftar -- */
    el.list.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-id]');
      if (!button || wheel.spinning) return;
      var id = button.getAttribute('data-id');
      data.items = data.items.filter(function (item) { return item.id !== id; });
      renderPanel(ctrl);
      persistState();
    });

    root.addEventListener('pointerdown', function () { setActive(index); });
    root.addEventListener('focusin', function () { setActive(index); });

    controllers.push(ctrl);
    renderPanel(ctrl);
    return ctrl;
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

    el.count.textContent = total + ' nama';
    ctrl.wheel.setLabels(data.items.map(function (item) { return item.label; }));

    el.spin.disabled = total === 0 || ctrl.wheel.spinning;

    /* daftar nama */
    el.list.textContent = '';
    data.items.forEach(function (item, i) {
      var li = document.createElement('li');

      var dot = document.createElement('i');
      dot.className = 'swatch';
      dot.style.background = FWWheel.colorFor(i, total);

      var label = document.createElement('span');
      label.textContent = item.label;

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.setAttribute('data-id', item.id);
      remove.setAttribute('aria-label', 'Hapus ' + item.label);
      remove.textContent = '×';

      li.appendChild(dot);
      li.appendChild(label);
      li.appendChild(remove);
      el.list.appendChild(li);
    });

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

  /* Memutar satu roda dan mencatat hasilnya. Modal & confetti diurus pemanggil,
     supaya "Putar semua" bisa menunggu kedua roda selesai dulu. */
  function runSpin(ctrl) {
    if (ctrl.wheel.spinning || !ctrl.data.items.length) return Promise.resolve(null);

    ctrl.el.spin.disabled = true;
    ctrl.el.spin.classList.add('is-spinning');
    ctrl.el.spinText.textContent = '...';

    return ctrl.wheel.spin().then(function (result) {
      ctrl.el.spin.classList.remove('is-spinning');
      ctrl.el.spinText.textContent = 'PUTAR';
      ctrl.el.spin.disabled = ctrl.data.items.length === 0;
      if (!result) return null;

      var item = ctrl.data.items[result.index];
      if (!item) return null;

      ctrl.data.history.unshift({ label: item.label, at: Date.now() });
      ctrl.data.history = ctrl.data.history.slice(0, 100);

      var removed = false;
      if (ctrl.data.autoRemove) {
        ctrl.data.items = ctrl.data.items.filter(function (entry) { return entry.id !== item.id; });
        removed = true;
      }

      renderPanel(ctrl);
      persistState();
      return { ctrl: ctrl, item: item, removed: removed };
    });
  }

  function spin(ctrl) {
    if (ctrl.wheel.spinning || !ctrl.data.items.length) return;

    setActive(ctrl.index);
    closeModal();
    FWConfetti.stop();

    runSpin(ctrl).then(function (result) {
      if (!result) return;
      FWSound.win();
      FWConfetti.burstFrom(ctrl.el.stage, 150);
      showWinners([result]);
    });
  }

  function spinAll() {
    var ready = controllers.slice(0, state.mode).filter(function (ctrl) {
      return !ctrl.wheel.spinning && ctrl.data.items.length > 0;
    });
    if (!ready.length) return;

    closeModal();
    FWConfetti.stop();

    Promise.all(ready.map(runSpin)).then(function (results) {
      var winners = results.filter(Boolean);
      if (!winners.length) return;
      FWSound.win();
      FWConfetti.burst(global.innerWidth / 2, global.innerHeight * 0.55, 170);
      showWinners(winners);
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
  var btnKeep = $('#winner-keep');
  var btnAgain = $('#winner-again');
  var current = [];

  function showWinners(results) {
    current = results;
    modal.hidden = false;
    renderWinnerModal();
    (current.length > 1 ? btnKeep : btnRemove).focus();
  }

  /* Membuang / mengembalikan seorang pemenang dari rodanya. */
  function toggleWinner(entry) {
    var data = entry.ctrl.data;

    if (entry.removed) {
      data.items.push({ id: entry.item.id, label: entry.item.label });
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

  function renderWinnerModal() {
    if (!current.length) return;
    var multi = current.length > 1;

    modalSingle.hidden = multi;
    modalMulti.hidden = !multi;
    btnRemove.hidden = multi;

    if (multi) {
      modalSource.textContent = 'Hasil ' + current.length + ' roda';
      modalMulti.textContent = '';

      current.forEach(function (entry) {
        var li = document.createElement('li');

        var who = document.createElement('div');
        who.className = 'who';
        var source = document.createElement('small');
        source.textContent = entry.ctrl.data.name;
        var name = document.createElement('b');
        name.textContent = entry.item.label;
        who.appendChild(source);
        who.appendChild(name);

        var action = button(
          entry.removed ? 'Kembalikan' : 'Hapus',
          entry.removed ? 'btn btn--small btn--ghost' : 'btn btn--small btn--danger',
          function () { toggleWinner(entry); }
        );

        li.appendChild(who);
        li.appendChild(action);
        modalMulti.appendChild(li);
      });

      btnAgain.textContent = 'Putar semua lagi';
      btnAgain.disabled = current.every(function (entry) { return entry.ctrl.data.items.length === 0; });
      return;
    }

    var only = current[0];
    var left = only.ctrl.data.items.length;

    modalSource.textContent = only.ctrl.data.name;
    modalName.textContent = only.item.label;

    if (only.removed) {
      btnRemove.textContent = 'Kembalikan ke roda';
      btnRemove.className = 'btn btn--ghost';
      modalNote.textContent = 'Sudah dihapus dari roda — sisa ' + left + ' nama.';
    } else {
      btnRemove.textContent = 'Hapus dari roda';
      btnRemove.className = 'btn btn--danger';
      modalNote.textContent = 'Hapus agar tidak menang dua kali. Sekarang ada ' + left + ' nama.';
    }

    btnAgain.textContent = 'Putar lagi';
    btnAgain.disabled = left === 0;
  }

  btnRemove.addEventListener('click', function () {
    if (current.length === 1) toggleWinner(current[0]);
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

  function openDrawer(sourceIndex) {
    drawer.hidden = false;
    renderSaveSources();
    if (typeof sourceIndex === 'number') saveSource.value = String(sourceIndex);
    var data = state.wheels[Number(saveSource.value) || 0];
    if (!saveName.value.trim()) saveName.value = data.name;
    renderSaved();
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

  function renderSaved() {
    savedList.textContent = '';
    savedEmpty.hidden = saved.length > 0;

    saved.forEach(function (entry) {
      var li = document.createElement('li');

      var head = document.createElement('div');
      head.className = 'saved__title';
      var name = document.createElement('b');
      name.textContent = entry.name;
      var meta = document.createElement('span');
      meta.className = 'saved__meta';
      meta.textContent = entry.names.length + ' nama · ' + formatDate(entry.updatedAt || entry.createdAt || Date.now());
      head.appendChild(name);
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

      actions.appendChild(button('Timpa', 'btn btn--small btn--ghost', function () {
        var source = state.wheels[Number(saveSource.value) || 0];
        if (!global.confirm('Timpa "' + entry.name + '" dengan isi ' + source.name + ' (' + source.items.length + ' nama)?')) return;
        entry.names = source.items.map(function (item) { return item.label; });
        entry.updatedAt = Date.now();
        persistSaved();
        renderSaved();
        toast('"' + entry.name + '" diperbarui.');
      }));

      actions.appendChild(button('Duplikat', 'btn btn--small btn--ghost', function () {
        saved.unshift({
          id: uid(),
          name: entry.name + ' (salinan)',
          names: entry.names.slice(),
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        persistSaved();
        renderSaved();
      }));

      actions.appendChild(button('Hapus', 'btn btn--small btn--ghost', function () {
        if (!global.confirm('Hapus roda tersimpan "' + entry.name + '"?')) return;
        saved = saved.filter(function (row) { return row.id !== entry.id; });
        persistSaved();
        renderSaved();
      }));

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
      ctrl.data.items = entry.names.slice(0, MAX_NAMES).map(function (label) { return { id: uid(), label: label }; });
      ctrl.data.history = [];
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

    var existing = saved.filter(function (row) { return row.name.toLowerCase() === name.toLowerCase(); })[0];
    if (existing && !global.confirm('"' + name + '" sudah ada. Timpa?')) return;

    if (existing) {
      existing.names = source.items.map(function (item) { return item.label; });
      existing.updatedAt = Date.now();
    } else {
      saved.unshift({
        id: uid(),
        name: name,
        names: source.items.map(function (item) { return item.label; }),
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    persistSaved();
    renderSaved();
    saveName.value = '';
    toast('Roda "' + name + '" tersimpan.');
  });

  saveSource.addEventListener('change', function () {
    var data = state.wheels[Number(saveSource.value) || 0];
    if (!saveName.value.trim()) saveName.value = data.name;
  });

  $('#open-drawer').addEventListener('click', function () { openDrawer(activeIndex); });
  $('#close-drawer').addEventListener('click', closeDrawer);
  drawer.querySelector('[data-role="dismiss"]').addEventListener('click', closeDrawer);

  /* ---------- Ekspor / impor ---------- */

  $('#export-json').addEventListener('click', function () {
    var payload = { app: 'fortunewheel', version: 1, exportedAt: new Date().toISOString(), wheels: saved };
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

    if (event.code !== 'Space' || event.repeat) return;

    var tag = (event.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.target.isContentEditable) return;
    if (!modal.hidden || !drawer.hidden) return;

    event.preventDefault();
    spin(controllers[Math.min(activeIndex, state.mode - 1)]);
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

  if (!FWStorage.isAvailable()) {
    $('#storage-note').textContent = 'Penyimpanan browser tidak aktif — data hanya bertahan selama tab ini terbuka.';
  } else {
    $('#storage-note').textContent = 'Data tersimpan otomatis di browser ini.';
  }
})(window);
