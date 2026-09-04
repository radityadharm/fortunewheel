'use strict';

/* API sesi langsung: moderator menyiarkan keadaan roda + rencana putaran,
 * halaman peserta membacanya dari perangkat mana pun.
 *
 *   GET  /api/live?s=<id>   terbuka  — dibaca layar peserta
 *   PUT  /api/live?s=<id>   perlu kode admin — hanya moderator yang menyiarkan
 *
 * Waktu mulai putaran distempel oleh server (bukan jam perangkat moderator),
 * dan GET ikut mengembalikan `now` dari jam yang sama, sehingga layar peserta
 * bisa menghitung sendiri sudah berapa lama putaran berjalan tanpa terganggu
 * selisih jam antar perangkat.
 */

var crypto = require('crypto');

var REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
var REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
var ADMIN_CODE = process.env.ADMIN_CODE || process.env.FW_ADMIN_CODE || '';
var PREFIX = process.env.FW_LIVE_PREFIX || 'fortunewheel:live:';
var TTL_SECONDS = 12 * 60 * 60; // sesi kedaluwarsa sendiri setelah 12 jam

var MAX_NAMES = 300;
var MAX_LABEL = 60;

function storageReady() { return !!(REDIS_URL && REDIS_TOKEN); }

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function redis(command) {
  return fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  }).then(function (response) {
    if (!response.ok) throw new Error('redis_http_' + response.status);
    return response.json();
  }).then(function (data) {
    if (data && data.error) throw new Error('redis_error');
    return data ? data.result : null;
  });
}

function codeMatches(given) {
  if (!ADMIN_CODE || typeof given !== 'string' || !given) return false;
  var a = Buffer.from(String(given));
  var b = Buffer.from(ADMIN_CODE);
  if (a.length !== b.length) {
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function isAdmin(req) {
  var header = req.headers['x-admin-code'];
  if (Array.isArray(header)) header = header[0];
  return codeMatches(header);
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try { return Promise.resolve(JSON.parse(req.body)); } catch (err) { return Promise.resolve(null); }
  }

  return new Promise(function (resolve) {
    var chunks = '';
    var tooBig = false;

    req.on('data', function (chunk) {
      if (tooBig) return;
      chunks += chunk;
      if (chunks.length > 400000) { tooBig = true; chunks = ''; }
    });
    req.on('end', function () {
      if (tooBig || !chunks) return resolve(null);
      try { resolve(JSON.parse(chunks)); } catch (err) { resolve(null); }
    });
    req.on('error', function () { resolve(null); });
  });
}

function sessionId(req) {
  var url = new URL(req.url, 'http://localhost');
  var id = url.searchParams.get('s') || '';
  return /^[A-Za-z0-9_-]{6,40}$/.test(id) ? id : null;
}

function cleanLabel(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').slice(0, MAX_LABEL);
}

function sanitizeEvent(input) {
  if (!input || typeof input !== 'object') return null;
  if (input.type !== 'spin' && input.type !== 'winner') return null;

  var event = {
    type: input.type,
    seq: Math.max(0, Math.floor(Number(input.seq) || 0)),
    wheel: Number(input.wheel) === 1 ? 1 : 0
  };

  if (input.type === 'spin') {
    var plan = input.plan || {};
    var from = Number(plan.from);
    var to = Number(plan.to);
    var duration = Number(plan.duration);
    if (!isFinite(from) || !isFinite(to) || !isFinite(duration)) return null;

    event.plan = {
      from: from,
      to: to,
      duration: Math.min(30000, Math.max(200, Math.round(duration)))
    };
    event.startedAt = Date.now(); // stempel jam server
  } else {
    event.label = cleanLabel(input.label);
    if (!event.label) return null;
    event.at = Date.now();
  }

  return event;
}

/* Hanya bentuk inilah yang boleh tersimpan sebagai sesi. */
function sanitizeSession(input, id) {
  if (!input || typeof input !== 'object') return null;

  var wheels = Array.isArray(input.wheels) ? input.wheels.slice(0, 2) : [];
  if (!wheels.length) return null;

  var clean = wheels.map(function (wheel, index) {
    wheel = wheel || {};
    var items = Array.isArray(wheel.items) ? wheel.items : [];

    return {
      name: String(wheel.name || 'Roda ' + (index + 1)).trim().slice(0, 40) || 'Roda ' + (index + 1),
      items: items.map(function (item) {
        var label = cleanLabel(item && item.label);
        return label ? { label: label, blocked: !!(item && item.blocked) } : null;
      }).filter(Boolean).slice(0, MAX_NAMES),
      history: (Array.isArray(wheel.history) ? wheel.history : []).slice(0, 12).map(function (row) {
        var label = cleanLabel(row && row.label);
        return label ? { label: label, at: Number(row && row.at) || Date.now() } : null;
      }).filter(Boolean)
    };
  });

  var events = {};
  ['0', '1'].forEach(function (key) {
    var event = sanitizeEvent(input.events && input.events[key]);
    if (event) events[key] = event;
  });

  return {
    id: id,
    mode: Number(input.mode) === 2 ? 2 : 1,
    title: String(input.title || '').trim().slice(0, 60),
    wheels: clean,
    events: events,
    updatedAt: Date.now()
  };
}

/* Peristiwa yang stempel waktunya sudah ada tidak boleh distempel ulang saat
   siaran berikutnya, supaya animasi di layar peserta tidak mengulang. */
function keepEventStamps(next, previous) {
  if (!previous || !previous.events) return next;

  ['0', '1'].forEach(function (key) {
    var fresh = next.events[key];
    var old = previous.events[key];
    if (!fresh || !old) return;
    if (fresh.seq !== old.seq) return;
    if (old.startedAt) fresh.startedAt = old.startedAt;
    if (old.at) fresh.at = old.at;
  });

  return next;
}

module.exports = async function handler(req, res) {
  try {
    var id = sessionId(req);
    if (!id) return json(res, 400, { error: 'invalid_session' });
    if (!storageReady()) return json(res, 503, { error: 'storage_not_configured' });

    if (req.method === 'GET') {
      var raw = await redis(['GET', PREFIX + id]);
      var session = null;
      try { session = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null; } catch (err) { session = null; }

      if (!session) return json(res, 404, { error: 'session_not_found', now: Date.now() });
      return json(res, 200, { ok: true, now: Date.now(), session: session });
    }

    if (req.method === 'PUT') {
      if (!ADMIN_CODE) return json(res, 503, { error: 'admin_code_not_set' });
      if (!isAdmin(req)) return json(res, 401, { error: 'wrong_code' });

      var body = await readBody(req);
      var session = sanitizeSession(body && body.session, id);
      if (!session) return json(res, 400, { error: 'invalid_session_data' });

      var previousRaw = await redis(['GET', PREFIX + id]);
      var previous = null;
      try { previous = previousRaw ? (typeof previousRaw === 'string' ? JSON.parse(previousRaw) : previousRaw) : null; } catch (err) { previous = null; }

      session = keepEventStamps(session, previous);

      await redis(['SET', PREFIX + id, JSON.stringify(session), 'EX', String(TTL_SECONDS)]);
      return json(res, 200, { ok: true, now: Date.now(), session: session });
    }

    if (req.method === 'DELETE') {
      if (!ADMIN_CODE) return json(res, 503, { error: 'admin_code_not_set' });
      if (!isAdmin(req)) return json(res, 401, { error: 'wrong_code' });
      await redis(['DEL', PREFIX + id]);
      return json(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, PUT, DELETE');
    return json(res, 405, { error: 'method_not_allowed' });
  } catch (err) {
    console.error('[api/live]', err && err.message ? err.message : err);
    return json(res, 502, { error: 'storage_unavailable' });
  }
};
