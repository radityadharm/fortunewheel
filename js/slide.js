/* Halaman slide peserta: membaca state roda dari localStorage dan mengikuti
   siaran dari halaman roda (tab lain) untuk mengumumkan pemenang. */
(function (global) {
  'use strict';

  var STATE_KEY = 'state';
  var ANNOUNCE_MS = 7000;

  var PALETTE = [
    '#ff5c8a', '#ffb648', '#ffe15c', '#4fd18b',
    '#3fc7d4', '#5b8cff', '#a06bff', '#ff77c8'
  ];

  function colorFor(index, total) {
    var slot = index % PALETTE.length;
    if (total > 1 && index === total - 1 && slot === 0) slot = 1;
    return PALETTE[slot];
  }

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
  var announceSource = $('#announce-source');
  var announceName = $('#announce-name');

  var announceTimer = null;
  var statusTimer = null;
  var highlight = { wheel: -1, label: null };

  function readState() {
    var raw = FWStorage.read(STATE_KEY, null);
    if (!raw || !Array.isArray(raw.wheels)) return null;

    return {
      mode: raw.mode === 2 ? 2 : 1,
      wheels: raw.wheels.map(function (wheel, i) {
        wheel = wheel || {};
        return {
          name: typeof wheel.name === 'string' && wheel.name ? wheel.name : 'Roda ' + (i + 1),
          items: Array.isArray(wheel.items) ? wheel.items.filter(function (item) {
            return item && typeof item.label === 'string';
          }) : [],
          history: Array.isArray(wheel.history) ? wheel.history : []
        };
      })
    };
  }

  function setStatus(state, text) {
    statusEl.setAttribute('data-state', state);
    statusText.textContent = text;
  }

  function render() {
    var state = readState();

    if (!state) {
      boardsEl.textContent = '';
      subEl.textContent = 'Belum ada data roda di browser ini.';
      setStatus('idle', 'Menunggu');
      return;
    }

    hintEl.hidden = true;
    boardsEl.textContent = '';
    boardsEl.setAttribute('data-mode', String(state.mode));

    var wheels = state.wheels.slice(0, state.mode);
    var totalNames = 0;
    var totalBlocked = 0;

    wheels.forEach(function (wheel, index) {
      var root = template.content.firstElementChild.cloneNode(true);
      var name = root.querySelector('[data-role="name"]');
      var count = root.querySelector('[data-role="count"]');
      var list = root.querySelector('[data-role="names"]');
      var blocked = wheel.items.filter(function (item) { return item.blocked; }).length;

      totalNames += wheel.items.length;
      totalBlocked += blocked;

      name.textContent = wheel.name;
      count.textContent = blocked
        ? wheel.items.length + ' nama · ' + blocked + ' tidak diundi'
        : wheel.items.length + ' nama';

      wheel.items.forEach(function (item, i) {
        var li = document.createElement('li');
        var classes = [];

        var dot = document.createElement('i');
        dot.className = 'swatch';
        dot.style.background = item.blocked ? '#39405e' : colorFor(i, wheel.items.length);

        var label = document.createElement('span');
        label.className = 'label';
        label.textContent = item.label;

        if (item.blocked) classes.push('is-blocked');
        if (highlight.wheel === index && highlight.label === item.label) classes.push('is-winner');
        li.className = classes.join(' ');

        li.appendChild(dot);
        li.appendChild(label);
        list.appendChild(li);
      });

      boardsEl.appendChild(root);
    });

    titleEl.textContent = state.mode === 2
      ? wheels[0].name + ' & ' + wheels[1].name
      : wheels[0].name;

    subEl.textContent = totalBlocked
      ? totalNames + ' peserta · ' + totalBlocked + ' tidak ikut diundi'
      : totalNames + ' peserta siap diundi';

    renderRecent(wheels);
    if (statusEl.getAttribute('data-state') !== 'spinning') setStatus('live', 'Terhubung');
  }

  function renderRecent(wheels) {
    var rows = [];
    wheels.forEach(function (wheel) {
      wheel.history.slice(0, 6).forEach(function (entry) {
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

  function showAnnounce(message) {
    highlight = { wheel: message.wheel, label: message.label };
    render();

    announceSource.textContent = message.wheelName || '';
    announceName.textContent = message.label;
    announce.hidden = false;

    /* Dua semburan dari sudut bawah supaya confetti membingkai nama, bukan
       menutupinya seperti kalau meledak dari tengah layar. */
    FWConfetti.burst(global.innerWidth * 0.1, global.innerHeight * 0.98, 110);
    FWConfetti.burst(global.innerWidth * 0.9, global.innerHeight * 0.98, 110);
    setStatus('live', 'Pemenang keluar');

    global.clearTimeout(announceTimer);
    announceTimer = global.setTimeout(function () {
      announce.hidden = true;
    }, ANNOUNCE_MS);
  }

  announce.addEventListener('click', function () {
    global.clearTimeout(announceTimer);
    announce.hidden = true;
  });

  FWSync.subscribe(function (message) {
    if (message.type === 'state') {
      render();
      return;
    }

    if (message.type === 'spinning') {
      announce.hidden = true;
      highlight = { wheel: -1, label: null };
      render();
      setStatus('spinning', 'Sedang mengundi' + (message.wheelName ? ' — ' + message.wheelName : '') + '…');
      global.clearTimeout(statusTimer);
      statusTimer = global.setTimeout(function () {
        if (statusEl.getAttribute('data-state') === 'spinning') setStatus('live', 'Terhubung');
      }, 20000);
      return;
    }

    if (message.type === 'winner') {
      global.clearTimeout(statusTimer);
      showAnnounce(message);
    }
  });

  /* Kalau halaman roda dibuka di jendela lain yang menulis langsung ke
     localStorage tanpa siaran (mis. browser lawas), tetap ikut menyegarkan. */
  global.addEventListener('storage', function (event) {
    if (event.key === 'fortunewheel.v1.state') render();
  });

  global.addEventListener('focus', render);
  render();
})(window);
