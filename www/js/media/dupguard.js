// === media/dupguard.js — anti-duplicados al importar =======================
// Si el archivo entrante ya existe por nombre (y más aún si coincide el
// tamaño) pide DOBLE confirmación y lo guarda renombrado «nombre-2.ext»,
// «nombre-3.ext»… — nunca pisa ni borra el existente.
// API: TribalDup.guard(file, S) → Promise<File|null>   (null = cancelado)
// ============================================================================
window.TribalDup = (function () {
    'use strict';
    function sameName(items, name) {
        var n = String(name || '').toLowerCase();
        return (items || []).filter(function (m) {
            return String(m.name || '').toLowerCase() === n; });
    }
    function uniqueName(items, name) {
        var mm = /^(.*?)(\.[^.]+)?$/.exec(name || 'archivo'),
            stem = mm[1], ext = mm[2] || '';
        var taken = {};
        (items || []).forEach(function (x) {
            taken[String(x.name || '').toLowerCase()] = 1; });
        var i = 2, cand;
        do { cand = stem + '-' + i + ext; i++; }
        while (taken[cand.toLowerCase()]);
        return cand;
    }
    function guard(file, S) {
        var items = S.items || [];
        var dup = sameName(items, file.name || 'archivo');
        if (!dup.length) return Promise.resolve(file);
        var newName = uniqueName(items, file.name);
        var sameSize = dup.some(function (m) { return m.size === file.size; });
        return new Promise(function (rs) {
            S.confirm('Posible duplicado',
                '«' + file.name + '» ya existe en la tribu' +
                (sameSize ? ' con el mismo tamaño — parece el mismo' : '') +
                '. ¿Guardarlo aparte como «' + newName + '»?',
                'Duplicar', function () {
                S.confirm('Última confirmación',
                    '«' + file.name + '» se agregará como «' + newName +
                    '» sin borrar el anterior. ¿Seguro?',
                    'Sí, agregar',
                    function () {
                        rs(new File([file], newName, { type: file.type }));
                    },
                    function () { rs(null); });
            }, function () { rs(null); });
        });
    }
    return { guard: guard, sameName: sameName, uniqueName: uniqueName };
})();
