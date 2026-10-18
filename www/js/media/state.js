// ============================================================================
// ARCHIVO: media/state.js — ANTI-CRASH · snapshot de estado de la app
// RESPONSABILIDAD:
//   - Mapa clave→valor JSON en localStorage («tribu_state_v2») con escritura
//     debounced; flush síncrono en visibilitychange/pagehide/beforeunload —
//     si la app muere, lo último ya quedó guardado.
//   - Herramienta abierta: opened(nombre, payload) / closed(nombre) guardan
//     qué pantalla estaba encima; reg(nombre, opener) + restoreTools()
//     la reabren al arrancar.
//   API: TribalState.{get,save,del,flush,opened,closed,reg,restoreTools}
// ============================================================================
window.TribalState = (function () {
    'use strict';
    var KEY = 'tribu_state_v2';
    var mem = null, timer = null;

    function load() {
        if (mem) return mem;
        try { mem = JSON.parse(localStorage.getItem(KEY) || '{}'); }
        catch (e) { mem = {}; }
        return mem;
    }
    function flush() {
        clearTimeout(timer); timer = null;
        try { localStorage.setItem(KEY, JSON.stringify(load())); } catch (e) {}
    }
    function soon() {
        if (timer) return;                      // ya hay un flush pendiente
        timer = setTimeout(flush, 300);
    }

    function get(k, def) {
        var v = load()[k];
        return v === undefined ? def : v;
    }
    function save(k, v) { load()[k] = v; soon(); }
    function del(k) { delete load()[k]; soon(); }

    // ---- qué herramienta estaba abierta (una a la vez, la última gana) ----
    var openers = {};
    function opened(name, payload) { save('tool', { n: name, p: payload || null }); }
    function closed(name) {
        var t = get('tool', null);
        if (t && t.n === name) del('tool');
    }
    function reg(name, fn) { openers[name] = fn; }
    function restoreTools() {
        var t = get('tool', null);
        if (t && openers[t.n]) {
            try { openers[t.n](t.p); } catch (e) {}
        }
    }

    // flush síncrono cuando la app se va — cubre cierre, minimizar y crash
    function armFlush() {
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) flush();
        });
        window.addEventListener('pagehide', flush);
        window.addEventListener('beforeunload', flush);
    }
    armFlush();

    return {
        get: get, save: save, del: del, flush: flush,
        opened: opened, closed: closed, reg: reg, restoreTools: restoreTools
    };
})();
