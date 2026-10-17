// ============================================================================
// ARCHIVO: media/cleandata.js
// RESPONSABILIDAD: estado y puente nativo del Limpiador tribal.
//   - catálogo de categorías, resultados del análisis y selección
//   - wrappers de Capacitor.Plugins.TribalClean
//   API: window.TribalCleanData.{cats,state,plug,fmt,scan,dups,del,clearOwn}
// ============================================================================
window.TribalCleanData = (function () {
    'use strict';

    // categorías analizables — icono, nombre y por qué es seguro revisarlas
    var CATS = [
        { id: 'tmp',     icon: '🧹', name: 'Temporales y registros',
          desc: '.tmp, .log, .bak, .old, thumbs.db, LOST.DIR…' },
        { id: 'partial', icon: '⏸️', name: 'Descargas incompletas',
          desc: '.crdownload, .partial, .part — nunca terminaron' },
        { id: 'empty',   icon: '◻️', name: 'Archivos y carpetas vacíos',
          desc: '0 bytes — no contienen nada' },
        { id: 'apk',     icon: '📦', name: 'Instaladores olvidados',
          desc: '.apk de apps ya instaladas o descargadas' },
        { id: 'corrupt', icon: '⚠️', name: 'Archivos dañados o falsos',
          desc: 'la firma interna no coincide con su extensión' }
    ];

    var state = {
        found: { tmp: [], partial: [], empty: [], apk: [], corrupt: [] },
        excluded: {},          // paths desmarcados manualmente en «Ver»
        cacheBytes: 0,         // caché propia + cookies del WebView
        dupGroups: [],         // grupos de duplicados (cleandup.js)
        info: null             // {total, free, cacheBytes}
    };
    CATS.forEach(function (c) { state.excluded[c.id] = {}; });

    function plug() {
        var P = window.Capacitor && window.Capacitor.Plugins;
        return (P && P.TribalClean) || null;
    }

    function fmt(bytes) {
        bytes = +bytes || 0;
        if (bytes < 1024) return bytes + ' B';
        var u = ['KB', 'MB', 'GB', 'TB'], i = -1;
        do { bytes /= 1024; i++; } while (bytes >= 1024 && i < u.length - 1);
        return bytes.toFixed(bytes >= 100 ? 0 : 1) + ' ' + u[i];
    }

    function storageInfo() {
        var P = plug();
        if (!P) return Promise.resolve(null);
        return P.storageInfo().then(function (r) {
            state.info = r;
            state.cacheBytes = r.cacheBytes || 0;
            return r;
        });
    }

    function scan(onProg) {
        var P = plug();
        if (!P || !P.scan) return Promise.reject(new Error('sin plugin'));
        var h = P.addListener('cleanProgress', function (p) {
            if (p.phase === 'junk' && onProg) onProg(p);
        });
        return P.scan({ checkCorrupt: true }).then(function (r) {
            (h && h.then ? h : Promise.resolve(h)).then(function (hh) {
                try { hh.remove(); } catch (e) {}
            });
            CATS.forEach(function (c) { state.found[c.id] = []; });
            ((r && r.items) || []).forEach(function (it) {
                if (state.found[it.cat]) state.found[it.cat].push(it);
            });
            return r;
        });
    }

    function dups(onProg) {
        var P = plug();
        if (!P || !P.duplicates) return Promise.reject(new Error('sin plugin'));
        var h = P.addListener('cleanProgress', function (p) {
            if (p.phase === 'dup' && onProg) onProg(p);
        });
        return P.duplicates({ minSize: 300 * 1024, maxGroups: 400 })
            .then(function (r) {
                (h && h.then ? h : Promise.resolve(h)).then(function (hh) {
                    try { hh.remove(); } catch (e) {}
                });
                state.dupGroups = (r && r.groups) || [];
                return r;
            });
    }

    // borrado en bloques de 400 — el puente JS↔Java no traga listas enormes
    function del(paths, onProg) {
        var P = plug();
        var res = { deleted: 0, failed: 0, freed: 0 };
        if (!P || !P.deleteFiles || !paths.length) return Promise.resolve(res);
        var h = P.addListener('cleanProgress', function (p) {
            if (p.phase === 'del' && onProg) onProg(p);
        });
        var i = 0;
        function chunk() {
            if (i >= paths.length) return Promise.resolve(res);
            return P.deleteFiles({ paths: paths.slice(i, i + 400) })
                .then(function (r) {
                    res.deleted += r.deleted || 0;
                    res.failed += r.failed || 0;
                    res.freed += r.freed || 0;
                    i += 400;
                    return chunk();
                });
        }
        return chunk().then(function (r) {
            (h && h.then ? h : Promise.resolve(h)).then(function (hh) {
                try { hh.remove(); } catch (e) {}
            });
            return r;
        });
    }

    function clearOwn() {
        var P = plug();
        if (!P || !P.clearOwn) return Promise.resolve({ freed: 0 });
        return P.clearOwn();
    }

    function cancel() {
        var P = plug();
        if (P && P.cancel) return P.cancel();
        return Promise.resolve();
    }

    // rutas elegidas de una categoría = encontradas − excluidas a mano
    function picked(catId) {
        var ex = state.excluded[catId] || {};
        return (state.found[catId] || [])
            .filter(function (it) { return !ex[it.path]; });
    }

    return {
        cats: CATS, state: state, plug: plug, fmt: fmt,
        storageInfo: storageInfo, scan: scan, dups: dups,
        del: del, clearOwn: clearOwn, cancel: cancel, picked: picked
    };
})();
