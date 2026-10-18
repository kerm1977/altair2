// ============================================================================
// ARCHIVO: media/dllog.js — registro persistente de descargas
// RESPONSABILIDAD: historial en localStorage (tribu_dl_log_v1) con lo que el
// descargador ha bajado — nombre, ruta real, tamaño, url origen, tipo
// (v=video / a=audio), estado (ok / fail / run), metaId en la biblioteca.
// Sobrevive cierres (anti-crash): al abrir, lo que quedó "run" se marca
// interrumpido porque el proceso nativo murió con la app.
// API: TribalDlLog.list() / add(e) / update(id,patch) / remove(id)
//      / find(id) / markDead()
// ============================================================================
window.TribalDlLog = (function () {
    'use strict';
    var KEY = 'tribu_dl_log_v1', MAX = 300;

    function load() {
        try {
            var a = JSON.parse(localStorage.getItem(KEY) || '[]');
            return Array.isArray(a) ? a : [];
        } catch (e) { return []; }
    }
    function save(a) {
        try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, MAX))); }
        catch (e) {}
    }

    return {
        list: load,

        add: function (e) {
            var a = load();
            e.id = 'dl' + Date.now().toString(36) + '_' +
                   Math.floor(Math.random() * 999);
            e.ts = Date.now();
            a.unshift(e);            // más reciente primero
            save(a);
            return e;
        },

        update: function (id, patch) {
            var a = load(), hit = false;
            a.forEach(function (e) {
                if (e.id === id) {
                    for (var k in patch) e[k] = patch[k];
                    hit = true;
                }
            });
            if (hit) save(a);
        },

        find: function (id) {
            var a = load(), out = null;
            a.forEach(function (e) { if (e.id === id) out = e; });
            return out;
        },

        remove: function (id) {
            save(load().filter(function (e) { return e.id !== id; }));
        },

        // lo que quedó "descargando" murió con el proceso → interrumpida
        markDead: function () {
            var a = load(), dirty = false;
            a.forEach(function (e) {
                if (e.status === 'run') {
                    e.status = 'fail';
                    e.err = 'interrumpida al cerrar la app';
                    dirty = true;
                }
            });
            if (dirty) save(a);
        }
    };
})();
