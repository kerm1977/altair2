// === media/vnotesauto.js — Borrador automático del editor =================
// IndexedDB «tribal-vn»: cada cambio guarda voz (wav) + estado + pistas.
// Si el overlay se cierra o la app muere, al reabrir se restaura todo.
// API: TribalVAuto.save(id, pack) · load(id) → pack|null · clear(id)
// =========================================================================
window.TribalVAuto = (function () {
    'use strict';
    var db = null;
    function open() {
        return new Promise(function (res, rej) {
            if (db) return res(db);
            var r = indexedDB.open('tribal-vn', 1);
            r.onupgradeneeded = function () {
                r.result.createObjectStore('drafts');
            };
            r.onsuccess = function () { db = r.result; res(db); };
            r.onerror = function () { rej(r.error); };
        });
    }
    function req(mode, fn) {
        return open().then(function () {
            return new Promise(function (res, rej) {
                var rq = fn(db.transaction('drafts', mode).objectStore('drafts'));
                if (rq) { rq.onsuccess = function () { res(rq.result); };
                          rq.onerror = function () { rej(rq.error); }; }
                else res(null);
            });
        });
    }
    return {
        save: function (id, pack) {
            return req('readwrite', function (s) { return s.put(pack, id); })
                .catch(function () {});
        },
        load: function (id) {
            return req('readonly', function (s) { return s.get(id); })
                .then(function (p) { return p || null; })
                .catch(function () { return null; });
        },
        clear: function (id) {
            return req('readwrite', function (s) { return s.delete(id); })
                .catch(function () {});
        }
    };
})();
