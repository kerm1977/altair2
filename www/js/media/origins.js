// ============================================================================
// ARCHIVO: media/origins.js
// RESPONSABILIDAD: procedencia de cada audio — de dónde vino el archivo.
//   · keyOf(meta)  → 'vn' | 'wa' | 'fb' | 'ms' | 'tg' | 'ig' | 'dl' | 'tribu'
//   · nameOf(k)    → nombre visible («notas de audio», «audio de whatsapp»…)
//   · sync(items)  → crea las colecciones automáticas que hagan falta y mete
//                    cada audio en la suya (una sola vez por archivo: queda
//                    marcado en meta.origin). Devuelve true si tocó el índice.
//   Detección: grabaciones → info.vn; música semilla → builtin; audio de apps
//   → la RUTA REAL del archivo escaneado (meta.ref + meta.path). Un archivo
//   subido por el selector no trae carpeta de origen → queda en «Música».
// ============================================================================
window.TribalOrigins = (function () {
    'use strict';

    // orden fijo de las secciones de origen en la vista Música
    var ORIGINS = [
        { k: 'vn',    name: 'notas de audio' },
        { k: 'wa',    name: 'audio de whatsapp' },
        { k: 'fb',    name: 'audio de facebook' },
        { k: 'ms',    name: 'audio de messenger' },
        { k: 'tg',    name: 'audio de telegram' },
        { k: 'ig',    name: 'audio de instagram' },
        { k: 'dl',    name: 'descargas' }
    ];
    var TRIBU = 'musica de la tribu';

    function isVN(m) {
        return (m.info && m.info.vn) || /^mi grabaci/i.test(m.name || '');
    }

    // clasifica por ruta real (solo refs del escáner la tienen)
    function pathKey(p) {
        p = String(p || '').toLowerCase();
        if (/whatsapp/.test(p)) return 'wa';       // WhatsApp y Business
        if (/facebook|com\.facebook|fb_temp/.test(p)) return 'fb';
        if (/messenger/.test(p)) return 'ms';
        if (/telegram/.test(p)) return 'tg';
        if (/instagram/.test(p)) return 'ig';
        if (/download|descarga|tribu_dl/.test(p)) return 'dl';
        return null;
    }

    function keyOf(m) {
        if (!m || m.kind !== 'audio') return null;
        if (isVN(m)) return 'vn';
        if (m.builtin) return 'tribu';
        // descarga adoptada: vive en tribu_media como archivo propio —
        // el flag meta.dl la mantiene agrupada en «descargas»
        if (m.dl) return 'dl';
        return pathKey(m.ref ? m.path : null);
    }

    function nameOf(k) {
        if (k === 'tribu') return TRIBU;
        var o = ORIGINS.filter(function (x) { return x.k === k; })[0];
        return o ? o.name : 'Música';
    }

    function rankOf(k) {
        if (k === 'tribu') return 0;
        for (var i = 0; i < ORIGINS.length; i++)
            if (ORIGINS[i].k === k) return i + 1;
        return 99;
    }

    // colección automática del origen (id fijo org_<k> → idempotente)
    function ensureCol(k) {
        var name = nameOf(k);
        var cols = window.MediaStore.listCollections();
        var c = cols.filter(function (x) {
            return x.id === 'org_' + k || x.name.toLowerCase() === name;
        })[0];
        if (c) return c;
        c = {
            id: 'org_' + k,
            name: name,
            auto: true,
            createdAt: Date.now()
        };
        cols.push(c);
        window.MediaStore.saveCollections(cols);
        return c;
    }

    // etiqueta una sola vez cada audio con su colección de origen
    function sync(items) {
        var MS = window.MediaStore;
        if (!MS || !MS.applyOrigins) return Promise.resolve(false);
        var entries = [];
        (items || []).forEach(function (m) {
            if (m.kind !== 'audio' || m.origin) return;
            var k = keyOf(m);
            if (!k) { entries.push({ id: m.id, origin: 'x' }); return; }
            var col = ensureCol(k);
            entries.push({ id: m.id, origin: k, colId: col.id });
        });
        if (!entries.length) return Promise.resolve(false);
        return MS.applyOrigins(entries).then(function () { return true; });
    }

    return {
        keyOf: keyOf, nameOf: nameOf, rankOf: rankOf, sync: sync,
        isAutoCol: function (c) { return !!(c && c.auto); }
    };
})();
