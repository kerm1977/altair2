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
                image: 'Imágenes', doc: 'Documentos', other: 'Archivos',
                p2p: 'Descargados por torrents' };

    function isVN(m) {
        return (m.info && m.info.vn) || /^mi grabaci/i.test(m.name || '');
    }
    function isP2P(m) { return !!(m.info && m.info.p2p); }
    // grupo puro por tipo (estadísticas, buscador): no separa torrents
    function grpOf(m) {
        return m.kind === 'audio' && isVN(m) ? 'grab' : m.kind;
    }
    // grupo visible en la lista: lo sembrado/descargado por torrent va
    // a su propia sección — «Descargados por torrents» en Todo, y
    // «Videos por torrents», «Música por torrents»… dentro de cada tab
    function grpIn(m, S) {
        if (!isP2P(m)) return grpOf(m);
        if (S && !S.query && S.viewMode === 'items' &&
            S.filter && S.filter !== 'all')
            return m.kind + '-p2p';
        return 'p2p';
    }
    function label(g) {
        if (/-p2p$/.test(g))
            return (LBL[g.slice(0, -4)] || 'Archivos') + ' por torrents';
        return LBL[g] || 'Archivos';
    }

    function apply(list, S) {
        var secOrder = null;
        if (S.query)
            secOrder = ['audio', 'grab', 'video', 'image', 'doc', 'other', 'p2p'];
        else if (S.viewMode === 'items' && S.filter === 'all')
            secOrder = (S.secOrder ||
                ['image', 'audio', 'video', 'doc', 'other']).concat(['p2p']);
        else if (S.viewMode === 'items' && S.filter === 'audio')
            secOrder = list.some(isP2P) ? ['audio', 'grab', 'audio-p2p']
                                        : ['audio', 'grab'];
        else if (S.viewMode === 'items' && S.filter &&
                 list.some(isP2P))
            secOrder = [S.filter, S.filter + '-p2p'];
        if (!secOrder) return { list: list, secs: null };

        var buckets = {};
        list.forEach(function (m) {
            var g = grpIn(m, S);
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
