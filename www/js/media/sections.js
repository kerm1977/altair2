// === media/sections.js — agrupación por secciones con título =============
// Decide si la lista va por secciones y en qué orden:
//   · «Todo»: orden elegido por el usuario (secorder.js → S.secOrder)
//   · «Música»: subsecciones por ORIGEN — primero «musica de la tribu»,
//     luego tus colecciones, luego «notas de audio», «audio de whatsapp»,
//     «audio de facebook»… y al final «Música» sin origen conocido.
//     Una colección asignada a mano siempre manda sobre el origen.
//   · búsqueda global: orden fijo por tipo
// API: TribalSections.{grpOf,grpIn,label,apply} — apply devuelve {list,secs}
// =========================================================================
window.TribalSections = (function () {
    'use strict';
    var LBL = { audio: 'Música', grab: 'Mis grabaciones', video: 'Videos',
                image: 'Imágenes', doc: 'Libros y notas', other: 'Archivos' };
    var TRIBU = 'musica de la tribu';

    function isVN(m) {
        return (m.info && m.info.vn) || /^mi grabaci/i.test(m.name || '');
    }
    function grpOf(m) {
        return m.kind === 'audio' && isVN(m) ? 'grab' : m.kind;
    }

    // ---- subsección fina para la vista Música ---------------------------
    // prioridad: tu colección (no automática) > origen detectado > «Música»
    function userColOf(m) {
        if (!m.cols || !m.cols.length || !window.MediaStore) return null;
        var cols = window.MediaStore.listCollections();
        for (var i = 0; i < m.cols.length; i++) {
            var c = cols.filter(function (x) { return x.id === m.cols[i]; })[0];
            if (c && !c.auto) return c;
        }
        return null;
    }
    function audioGrp(m) {
        var c = userColOf(m);
        if (c) return 'col:' + c.id;
        var O = window.TribalOrigins;
        var k = O ? O.keyOf(m) : null;
        return k ? 'org:' + k : 'mus';
    }
    function grpIn(m, S) {
        if (S && S.viewMode === 'items' && S.filter === 'audio' &&
            !S.query && m.kind === 'audio') {
            return audioGrp(m);
        }
        return grpOf(m);
    }

    // orden de los grupos de audio: tribu(0) → tus colecciones(10+alfa)
    // → orígenes(20+) → «Música» genérico(90)
    function cmpAudioGrp(a, b) {
        function rk(g) {
            if (g === 'mus') return 90;
            if (g.indexOf('org:') === 0) {
                var O = window.TribalOrigins;
                return 20 + (O ? O.rankOf(g.slice(4)) : 0);
            }
            var c = colOf(g);
            return c && c.name.toLowerCase() === TRIBU ? 0 : 10;
        }
        var d = rk(a) - rk(b);
        if (d) return d;
        var ca = colOf(a), cb = colOf(b);
        var na = ca ? ca.name : label(a), nb = cb ? cb.name : label(b);
        return na.localeCompare(nb, 'es', { sensitivity: 'base' });
    }
    function colOf(g) {
        if (g.indexOf('col:') !== 0 || !window.MediaStore) return null;
        var id = g.slice(4);
        return window.MediaStore.listCollections()
            .filter(function (c) { return c.id === id; })[0] || null;
    }

    function label(g) {
        if (g === 'mus') return 'Música';
        if (g.indexOf('col:') === 0) {
            var c = colOf(g);
            return c ? c.name : 'Colección';
        }
        if (g.indexOf('org:') === 0) {
            var O = window.TribalOrigins;
            var n = O ? O.nameOf(g.slice(4)) : null;
            return n ? n.charAt(0).toUpperCase() + n.slice(1) : 'Música';
        }
        return LBL[g] || 'Archivos';
    }

    // ---- la vista Música: agrupa por subsección fina --------------------
    function applyAudio(list, S) {
        var groups = {}, keys = [];
        list.forEach(function (m) {
            var g = grpIn(m, S);
            if (!groups[g]) { groups[g] = []; keys.push(g); }
            groups[g].push(m);
        });
        keys.sort(cmpAudioGrp);
        var out = [];
        keys.forEach(function (g) { out = out.concat(groups[g]); });
        return { list: out, secs: keys };
    }

    function apply(list, S) {
        if (S.viewMode === 'items' && S.filter === 'audio' && !S.query)
            return applyAudio(list, S);

        var secOrder = null;
        if (S.query)
            secOrder = ['audio', 'grab', 'video', 'image', 'doc', 'other'];
        else if (S.viewMode === 'items' && S.filter === 'all')
            secOrder = S.secOrder ||
                ['image', 'audio', 'video', 'doc', 'other'];
        if (!secOrder) return { list: list, secs: null };

        var buckets = {};
        list.forEach(function (m) {
            var g = grpOf(m);
            (buckets[g] = buckets[g] || []).push(m);
        });
        var seq = [];
        secOrder.forEach(function (g) {
            seq.push(g);
            if (g === 'audio' && secOrder.indexOf('grab') === -1)
                seq.push('grab');              // grabaciones tras la música
        });
        var grouped = [];
        seq.forEach(function (g) {
            (buckets[g] || []).forEach(function (m) { grouped.push(m); });
            delete buckets[g];
        });
        Object.keys(buckets).forEach(function (g) {   // resto al final
            buckets[g].forEach(function (m) { grouped.push(m); });
        });
        return { list: grouped, secs: secOrder };
    }

    return { grpOf: grpOf, grpIn: grpIn, label: label, apply: apply };
})();
