// === media/sections.js — agrupación por secciones con título =============
// Decide si la lista va por secciones y en qué orden:
//   · «Todo»: orden elegido por el usuario (secorder.js → S.secOrder)
//   · «Música»: música y al final «Mis grabaciones» (info.vn / Mi grabación)
//   · búsqueda global: orden fijo por tipo
// API: TribalSections.{grpOf,label,apply} — apply devuelve {list,secs}
// =========================================================================
window.TribalSections = (function () {
    'use strict';
    var LBL = { audio: 'Música', grab: 'Mis grabaciones', video: 'Videos',
                image: 'Imágenes', doc: 'Libros y notas', other: 'Archivos' };

    function isVN(m) {
        return (m.info && m.info.vn) || /^mi grabaci/i.test(m.name || '');
    }
    function grpOf(m) {
        return m.kind === 'audio' && isVN(m) ? 'grab' : m.kind;
    }
    function grpIn(m) {
        return grpOf(m);
    }
    function label(g) {
        return LBL[g] || 'Archivos';
    }

    function apply(list, S) {
        var secOrder = null;
        if (S.query)
            secOrder = ['audio', 'grab', 'video', 'image', 'doc', 'other'];
        else if (S.viewMode === 'items' && S.filter === 'all')
            secOrder = S.secOrder ||
                ['image', 'audio', 'video', 'doc', 'other'];
        else if (S.viewMode === 'items' && S.filter === 'audio')
            secOrder = ['audio', 'grab'];
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
