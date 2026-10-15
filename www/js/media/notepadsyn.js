// === media/notepadsyn.js (<= 200 líneas): Sinónimos online + local ===
// Extiende TribalNotepadWords.synonymsFor mezclando el diccionario local
// con la API pública Datamuse en español (v=es). Offline → solo local.
window.TribalNotepadSyn = (function () {
    'use strict';
    var W = window.TribalNotepadWords;
    if (!W) return {};
    var localFor = W.synonymsFor.bind(W);
    var cache = {};

    function sameCase(orig, rep) {
        if (!orig) return rep;
        if (orig === orig.toUpperCase() && orig.length > 1) return rep.toUpperCase();
        var c0 = orig.charAt(0);
        return (c0 === c0.toUpperCase() && c0 !== c0.toLowerCase())
            ? rep.charAt(0).toUpperCase() + rep.slice(1) : rep;
    }

    function remote(w) {
        var key = String(w || '').toLowerCase().trim();
        if (!key) return Promise.resolve([]);
        if (cache[key]) return Promise.resolve(cache[key]);
        if (navigator.onLine === false || !window.fetch) return Promise.resolve([]);
        var ctl = window.AbortController ? new AbortController() : null;
        var t = ctl ? setTimeout(function () { ctl.abort(); }, 4500) : null;
        return fetch('https://api.datamuse.com/words?rel_syn=' +
                encodeURIComponent(key) + '&v=es&max=30', { mode: 'cors' })
            .then(function (r) { return r.json(); })
            .then(function (arr) {
                if (t) clearTimeout(t);
                var out = [];
                (arr || []).forEach(function (x) {
                    var s = String(x && x.word || '').trim();
                    if (s && /^[A-Za-zÁÉÍÓÚáéíóúñÑüÜ'\- ]{2,}$/.test(s)) out.push(s);
                });
                cache[key] = out;
                return out;
            })
            .catch(function () {
                if (t) clearTimeout(t);
                cache[key] = [];
                return [];
            });
    }

    W.synonymsFor = function (word) {
        var clean = String(word || '')
            .replace(/[^A-Za-zÁÉÍÓÚáéíóúñÑüÜ]/g, '').trim();
        return localFor(word).then(function (local) {
            return remote(clean.toLowerCase()).then(function (rem) {
                var seen = {}, out = [];
                seen[clean.toLowerCase()] = 1;
                local.concat(rem.map(function (s) { return sameCase(clean, s); }))
                    .forEach(function (s) {
                        var k = s.toLowerCase();
                        if (!seen[k]) { seen[k] = 1; out.push(s); }
                    });
                return out.slice(0, 32);
            });
        });
    };
    return {};
})();
