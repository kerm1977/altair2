// ============================================================================
// ARCHIVO: media/btchatdb.js
// RESPONSABILIDAD: historial persistente del chat BT en IndexedDB
//   ('tribu_btchat_db' → store 'msgs', keyPath 'id'). Cada mensaje se graba
//   al enviarse/recibirse; del borra uno; clear vacía todo. También exporta
//   la conversación a .json (nativo → caché + hoja de compartir;
//   web → descarga) e importa respaldos .json (dedup por id).
// API: window.TribalBtDb.{load,put,del,clear,exportJson,importJson}
// ============================================================================
window.TribalBtDb = (function () {
    'use strict';
    var DB = 'tribu_btchat_db', ST = 'msgs';
    var db_ = null;

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
    // devuelve el historial ordenado por tiempo
    function load(cb) {
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
    function put(m) {
        if (!m || !m.id) return;
        open(function (d) {
            if (!d) return;
            try { d.transaction(ST, 'readwrite').objectStore(ST).put(m); }
            catch (e) {}
        });
    }
    function del(id) {
        open(function (d) {
            if (!d) return;
            try { d.transaction(ST, 'readwrite').objectStore(ST).delete(id); }
            catch (e) {}
        });
    }
    function clear() {
        open(function (d) {
            if (!d) return;
            try { d.transaction(ST, 'readwrite').objectStore(ST).clear(); }
            catch (e) {}
        });
    }
    // exporta la conversación a un .json: nativo → caché + Share; web → descarga
    function exportJson(msgs, toast) {
        var data = JSON.stringify({
            app: 'TRIBALs', kind: 'btchat-export',
            exportedAt: new Date().toISOString(), msgs: msgs || []
        }, null, 1);
        var fname = 'tribu-chat-' + Date.now().toString(36) + '.json';
        var blob = new Blob([data], { type: 'application/json' });
        var P = window.Capacitor && window.Capacitor.Plugins;
        var IO = window.SonoStoreIO;
        if (P && P.Share && P.Filesystem && IO && IO.isNative() &&
            IO.nativeWriteCache) {
            IO.nativeWriteCache(fname, blob).then(function (p) {
                return P.Filesystem.getUri({ path: p, directory: 'CACHE' });
            }).then(function (r) {
                return P.Share.share({ files: [r.uri], title: fname });
            }).catch(function () { if (toast) toast('No se pudo exportar'); });
        } else {
            var u = URL.createObjectURL(blob), a = document.createElement('a');
            a.href = u; a.download = fname;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(u); }, 5000);
        }
    }
    // importa un respaldo .json: graba cada mensaje (dedup por id — reimportar
    // no duplica) y devuelve cb(historialCompletoOrdenado, nImportados) o
    // cb(null, 'motivo') si el archivo no sirve
    function importJson(cb) {
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.json,application/json';
        inp.onchange = function () {
            var f = inp.files && inp.files[0];
            if (!f) return;
            var r = new FileReader();
            r.onload = function () {
                var j; try { j = JSON.parse(r.result); }
                catch (e) { return cb(null, 'El archivo no es JSON válido'); }
                var arr = (j && j.msgs instanceof Array) ? j.msgs
                        : (j instanceof Array) ? j : null;
                if (!arr) return cb(null, 'No es un respaldo de chat TRIBALs');
                var ok = 0;
                arr.forEach(function (m) {
                    if (m && m.id && m.k) { put(m); ok++; } });
                load(function (all) { cb(all, ok); });
            };
            r.onerror = function () { cb(null, 'No se pudo leer el archivo'); };
            r.readAsText(f);
        };
        inp.click();
    }
    return { load: load, put: put, del: del, clear: clear,
             exportJson: exportJson, importJson: importJson };
})();
