/* Klien database roda tersimpan. Semua fungsi mengembalikan Promise dan tidak
   pernah melempar — kalau API tidak ada (dibuka lewat file://, belum dideploy,
   atau env belum disetel), aplikasi tetap jalan dengan penyimpanan browser. */
(function (global) {
  'use strict';

  var ENDPOINT = 'api/wheels';
  var CODE_KEY = 'admincode';

  var state = {
    checked: false,
    enabled: false,      // database tersambung
    canWrite: false,     // kode admin sudah disetel di server
    reason: null
  };

  function storedCode() {
    return FWStorage.read(CODE_KEY, '') || '';
  }

  function request(method, options) {
    options = options || {};
    var init = { method: method, headers: {} };

    if (options.body) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    if (options.withCode) {
      var code = options.code || storedCode();
      if (!code) return Promise.resolve({ ok: false, status: 401, data: { error: 'no_code' } });
      init.headers['x-admin-code'] = code;
    }

    var url = ENDPOINT + (options.query || '');

    return global.fetch(url, init).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        return { ok: response.ok, status: response.status, data: data || {} };
      });
    }).catch(function () {
      return { ok: false, status: 0, data: { error: 'offline' } };
    });
  }

  /* Menanyakan status database sekaligus mengambil daftar rodanya. */
  function refresh() {
    return request('GET').then(function (result) {
      state.checked = true;

      if (!result.ok || typeof result.data.enabled !== 'boolean') {
        state.enabled = false;
        state.canWrite = false;
        state.reason = result.status === 0 ? 'offline' : 'no_api';
        return { wheels: [] };
      }

      state.enabled = result.data.enabled;
      state.canWrite = !!result.data.canWrite;
      state.reason = result.data.reason || null;
      return { wheels: Array.isArray(result.data.wheels) ? result.data.wheels : [] };
    });
  }

  function verify(code) {
    return request('POST', { body: { code: code } }).then(function (result) {
      if (result.ok && result.data.ok) {
        FWStorage.write(CODE_KEY, code);
        return { ok: true };
      }
      return { ok: false, status: result.status, error: result.data.error || 'wrong_code' };
    });
  }

  function save(wheel) {
    return request('PUT', { withCode: true, body: { wheel: wheel } }).then(function (result) {
      if (result.ok && result.data.ok) return { ok: true, wheel: result.data.wheel };
      return { ok: false, status: result.status, error: result.data.error || 'failed' };
    });
  }

  function remove(id) {
    return request('DELETE', { withCode: true, query: '?id=' + encodeURIComponent(id) }).then(function (result) {
      if (result.ok && result.data.ok) return { ok: true };
      return { ok: false, status: result.status, error: result.data.error || 'failed' };
    });
  }

  /* ---------- Sesi langsung untuk layar peserta ---------- */

  function liveQuery(id) { return '?s=' + encodeURIComponent(id); }

  function publishLive(id, session) {
    return global.fetch('api/live' + liveQuery(id), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-code': storedCode()
      },
      body: JSON.stringify({ session: session })
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (response.ok && data.ok) return { ok: true, session: data.session };
        return { ok: false, status: response.status, error: data.error || 'failed' };
      });
    }).catch(function () {
      return { ok: false, status: 0, error: 'offline' };
    });
  }

  function endLive(id) {
    return global.fetch('api/live' + liveQuery(id), {
      method: 'DELETE',
      headers: { 'x-admin-code': storedCode() }
    }).then(function (response) {
      return { ok: response.ok };
    }).catch(function () {
      return { ok: false };
    });
  }

  global.FWCloud = {
    publishLive: publishLive,
    endLive: endLive,
    refresh: refresh,
    verify: verify,
    save: save,
    remove: remove,
    isEnabled: function () { return state.enabled; },
    canWrite: function () { return state.enabled && state.canWrite; },
    isAdmin: function () { return !!storedCode(); },
    reason: function () { return state.reason; },
    forgetCode: function () { FWStorage.write(CODE_KEY, ''); }
  };
})(window);
