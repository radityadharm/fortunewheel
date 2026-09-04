'use strict';

/* API roda tersimpan — berjalan sebagai Serverless Function di Vercel.
 *
 * Penyimpanan: satu hash Redis (Upstash) berisi id -> JSON roda.
 * Membaca terbuka untuk siapa saja (halaman roda & layar peserta butuh itu),
 * sedangkan menulis dan menghapus wajib menyertakan kode admin.
 *
 * Env yang dibaca (dua penamaan, tergantung integrasi yang dipakai):
 *   KV_REST_API_URL / UPSTASH_REDIS_REST_URL
 *   KV_REST_API_TOKEN / UPSTASH_REDIS_REST_TOKEN
 *   ADMIN_CODE (atau FW_ADMIN_CODE)
 * Tanpa ADMIN_CODE, API sengaja jadi hanya-baca supaya database tidak
 * pernah terbuka untuk umum karena lupa disetel.
 */

var crypto = require('crypto');

var REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
var REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
var ADMIN_CODE = process.env.ADMIN_CODE || process.env.FW_ADMIN_CODE || '';
var HASH_KEY = process.env.FW_REDIS_KEY || 'fortunewheel:wheels';

var MAX_NAMES = 300;
var MAX_LABEL = 60;
var MAX_WHEEL_NAME = 60;
var MAX_WHEELS = 200;

function storageReady() {
  return !!(REDIS_URL && REDIS_TOKEN);
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/* Perintah Redis lewat REST API Upstash: body berupa array ["HSET", key, ...]. */
function redis(command) {
  return fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + REDIS_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  }).then(function (response) {
    if (!response.ok) throw new Error('redis_http_' + response.status);
    return response.json();
  }).then(function (data) {
    if (data && data.error) throw new Error('redis_error');
    return data ? data.result : null;
  });
}

/* Bandingkan kode admin tanpa membocorkan panjang lewat waktu eksekusi. */
function codeMatches(given) {
  if (!ADMIN_CODE || typeof given !== 'string' || !given) return false;
  var a = Buffer.from(String(given));
  var b = Buffer.from(ADMIN_CODE);
  if (a.length !== b.length) {
    crypto.timingSafeEqual(b, b); // tetap lakukan kerja yang sama
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
      if (chunks.length > 200000) { tooBig = true; chunks = ''; }
    });

    req.on('end', function () {
      if (tooBig || !chunks) return resolve(null);
      try { resolve(JSON.parse(chunks)); } catch (err) { resolve(null); }
    });

    req.on('error', function () { resolve(null); });
  });
}

function cleanLabel(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').slice(0, MAX_LABEL);
}

/* Bentuk roda yang boleh masuk database — apa pun selain ini ditolak. */
function sanitizeWheel(input) {
  if (!input || typeof input !== 'object') return null;

  var id = String(input.id || '').slice(0, 40);
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(id)) return null;

  var name = String(input.name || '').trim().slice(0, MAX_WHEEL_NAME);
  if (!name) return null;

  if (!Array.isArray(input.names)) return null;
  var names = input.names.map(cleanLabel).filter(Boolean).slice(0, MAX_NAMES);
  if (!names.length) return null;

  var blockedInput = Array.isArray(input.blocked) ? input.blocked : [];
  var blocked = blockedInput.map(cleanLabel).filter(function (label) {
    return names.indexOf(label) >= 0;
  }).slice(0, MAX_NAMES);

  return {
    id: id,
    name: name,
    names: names,
    blocked: blocked,
    createdAt: Number(input.createdAt) || Date.now(),
    updatedAt: Date.now()
  };
}

function parseStored(value) {
  try {
    var parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && parsed.id ? parsed : null;
  } catch (err) {
    return null;
  }
}

/* HGETALL mengembalikan [field, value, field, value, ...]. */
function listWheels() {
  return redis(['HGETALL', HASH_KEY]).then(function (result) {
    var wheels = [];
    if (Array.isArray(result)) {
      for (var i = 1; i < result.length; i += 2) {
        var wheel = parseStored(result[i]);
        if (wheel) wheels.push(wheel);
      }
    } else if (result && typeof result === 'object') {
      Object.keys(result).forEach(function (key) {
        var wheel = parseStored(result[key]);
        if (wheel) wheels.push(wheel);
      });
    }

    wheels.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    return wheels;
  });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      if (!storageReady()) {
        return json(res, 200, { enabled: false, canWrite: false, reason: 'storage_not_configured', wheels: [] });
      }

      var wheels = await listWheels();
      return json(res, 200, {
        enabled: true,
        canWrite: !!ADMIN_CODE,
        reason: ADMIN_CODE ? null : 'admin_code_not_set',
        wheels: wheels
      });
    }

    /* Cek kode admin tanpa mengubah apa pun. */
    if (req.method === 'POST') {
      var body = await readBody(req);
      if (!ADMIN_CODE) return json(res, 503, { error: 'admin_code_not_set' });
      if (!codeMatches(body && body.code)) return json(res, 401, { error: 'wrong_code' });
      return json(res, 200, { ok: true });
    }

    if (req.method === 'PUT') {
      if (!storageReady()) return json(res, 503, { error: 'storage_not_configured' });
      if (!ADMIN_CODE) return json(res, 503, { error: 'admin_code_not_set' });
      if (!isAdmin(req)) return json(res, 401, { error: 'wrong_code' });

      var payload = await readBody(req);
      var wheel = sanitizeWheel(payload && payload.wheel);
      if (!wheel) return json(res, 400, { error: 'invalid_wheel' });

      var existing = await redis(['HEXISTS', HASH_KEY, wheel.id]);
      if (!Number(existing)) {
        var count = Number(await redis(['HLEN', HASH_KEY])) || 0;
        if (count >= MAX_WHEELS) return json(res, 409, { error: 'too_many_wheels', limit: MAX_WHEELS });
      }

      await redis(['HSET', HASH_KEY, wheel.id, JSON.stringify(wheel)]);
      return json(res, 200, { ok: true, wheel: wheel });
    }

    if (req.method === 'DELETE') {
      if (!storageReady()) return json(res, 503, { error: 'storage_not_configured' });
      if (!ADMIN_CODE) return json(res, 503, { error: 'admin_code_not_set' });
      if (!isAdmin(req)) return json(res, 401, { error: 'wrong_code' });

      var url = new URL(req.url, 'http://localhost');
      var id = url.searchParams.get('id') || '';
      if (!/^[A-Za-z0-9_-]{4,40}$/.test(id)) return json(res, 400, { error: 'invalid_id' });

      await redis(['HDEL', HASH_KEY, id]);
      return json(res, 200, { ok: true, id: id });
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return json(res, 405, { error: 'method_not_allowed' });
  } catch (err) {
    console.error('[api/wheels]', err && err.message ? err.message : err);
    return json(res, 502, { error: 'storage_unavailable' });
  }
};
