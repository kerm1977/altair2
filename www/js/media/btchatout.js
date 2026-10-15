// === media/btchatout.js (<=200): buzón de salida persistente del chat BT ===
// Mensajes enviados sin peer conectado quedan aquí (IndexedDB propio,
// 'tribu_btchat_outbox' → store 'q') hasta que alguien se conecta:
// el chat los drena en orden al abrirse la conexión. Cada entrada:
// { id (mismo id del mensaje), pkt (paquete crudo a enviar), ts }.
// API: window.TribalBtOutbox.{all,put,del,count}
window.TribalBtOutbox = (function () {
    'use strict';
    var DB = 'tribu_btchat_outbox', ST = 'q', db_ = null;

    function open(cb) {
        if (db_) return cb(db_);
        try {
            var rq = indexedDB.open(DB, 1);
            rq.onupgradeneeded = function () {
                rq.result.createObjectStore(ST, { keyPath: 'id' }); };
            rq.onsuccess = function () { db_ = rq.result; cb(db_); };
            rq.onerror = function () { cb(null); };
        } catch (e) { cb(null); }
    }

    function all(cb) {
        open(function (d) {
            if (!d) return cb([]);
            try {
                var rq = d.transaction(ST).objectStore(ST).getAll();
                rq.onsuccess = function () {
                    var a = rq.result || [];
                    a.sort(function (x, y) { return x.ts - y.ts; });
                    cb(a); };
                rq.onerror = function () { cb([]); };
            } catch (e) { cb([]); }
        });
    }

    function put(e) {
        if (!e || !e.id) return;
        open(function (d) {
            if (!d) return;
            try { d.transaction(ST, 'readwrite').objectStore(ST).put(e); }
            catch (err) {}
        });
    }

    function del(id) {
        open(function (d) {
            if (!d) return;
            try { d.transaction(ST, 'readwrite').objectStore(ST).delete(id); }
            catch (err) {}
        });
    }

    function count(cb) {
        open(function (d) {
            if (!d) return cb(0);
            try {
                var rq = d.transaction(ST).objectStore(ST).count();
                rq.onsuccess = function () { cb(rq.result || 0); };
                rq.onerror = function () { cb(0); };
            } catch (e) { cb(0); }
        });
    }

    return { all: all, put: put, del: del, count: count };
})();
