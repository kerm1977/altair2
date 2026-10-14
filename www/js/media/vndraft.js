// === media/vndraft.js — borrador persistente de notas de audio ===========
// Los segmentos de audio se guardan como blobs en IndexedDB
// (SonoStoreIO.idb*) — cada trozo en su propia ranura porque juntar webm de
// sesiones distintas corrompe el contenedor — y la ficha en localStorage.
// LIVE = lo grabado en esta sesión · PREV0..7 = trozos ya restaurados.
// Una grabación en curso sobrevive a cuelgues, cambio de app o recarga.
// API: TribalVDraft.{meta,save,load,clear}
// =========================================================================
window.TribalVDraft = (function () {
    'use strict';
    var KEY = 'tribu_vn_draft', LIVE = '__vn_live__', PREV = '__vn_prev_';
    var MAXP = 8;
    function io() { return window.SonoStoreIO || null; }

    function meta() {
        try {
            var r = localStorage.getItem(KEY);
            return r ? JSON.parse(r) : null;
        } catch (e) { return null; }
    }
    function setMeta(m) {
        try {
            if (m) localStorage.setItem(KEY, JSON.stringify(m));
            else localStorage.removeItem(KEY);
        } catch (e) {}
    }

    // blob = parte grabada ahora · prevBlobs = trozos anteriores en orden
    function save(blob, m, prevBlobs) {
        if (!io() || !blob) return Promise.resolve();
        m = m || {};
        var prev = (prevBlobs || []).filter(Boolean).slice(0, MAXP);
        m.ts = Date.now(); m.prev = prev.length;
        var chain = Promise.resolve();
        prev.forEach(function (b, i) {
            chain = chain.then(function () { return io().idbPut(PREV + i, b); });
        });
        return chain.then(function () { return io().idbPut(LIVE, blob); })
            .then(function () { setMeta(m); })
            .catch(function () {});
    }

    // → {live, prev:[blob…], meta} | null
    function load() {
        var m = meta();
        if (!m || !io()) return Promise.resolve(null);
        return io().idbGet(LIVE).then(function (live) {
            if (!live) { clear(); return null; }
            var parts = [], chain = Promise.resolve();
            for (var i = 0; i < (m.prev || 0); i++) (function (i) {
                chain = chain.then(function () {
                    return io().idbGet(PREV + i).then(function (b) {
                        if (b) parts[i] = b;
                    });
                });
            })(i);
            return chain.then(function () {
                return { live: live, prev: parts.filter(Boolean), meta: m };
            });
        }).catch(function () { return null; });
    }

    function clear() {
        setMeta(null);
        if (!io()) return;
        try {
            io().idbDel(LIVE);
            for (var i = 0; i < MAXP; i++) io().idbDel(PREV + i);
        } catch (e) {}
    }

    return { meta: meta, save: save, load: load, clear: clear };
})();
