// ============================================================================
// ARCHIVO: media/cleandup.js
// RESPONSABILIDAD: vista de duplicados del limpiador.
//   Cada grupo muestra las copias con radio «conservar» (por defecto la
//   primera = la más antigua); el resto se marca para borrar. La cabecera
//   muestra el espacio recuperable en vivo.
//   API: window.TribalCleanDup.open(deps, groups, onDone)
// ============================================================================
window.TribalCleanDup = (function () {
    'use strict';

    var D = window.TribalCleanData;
    var ov = null, deps = null, groups = [], onDone = null;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function close() {
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = null; groups = [];
    }

    // rutas marcadas para borrar = todas menos la elegida como «conservar»
    function toDelete() {
        var out = [];
        groups.forEach(function (g, gi) {
            var keep = ov.querySelector('input[name="keep' + gi + '"]:checked');
            var ki = keep ? +keep.value : 0;
            g.paths.forEach(function (p, pi) { if (pi !== ki) out.push(p); });
        });
        return out;
    }

    function refreshBar() {
        var paths = toDelete();
        var bytes = 0;
        var byPath = {};
        groups.forEach(function (g) {
            g.paths.forEach(function (p) { byPath[p] = g.size; });
        });
        paths.forEach(function (p) { bytes += byPath[p] || 0; });
        ov.querySelector('#cdup-free').textContent =
            paths.length + ' copias marcadas — ' + D.fmt(bytes) + ' recuperables';
        ov.querySelector('#cdup-del').disabled = !paths.length;
    }

    function paint() {
        var host = ov.querySelector('#cdup-groups');
        host.innerHTML = groups.map(function (g, gi) {
            var rows = g.paths.map(function (p, pi) {
                return '<label class="cdup-row">' +
                    '<input type="radio" name="keep' + gi + '" value="' + pi + '"' +
                    (pi === 0 ? ' checked' : '') + '>' +
                    '<span class="cdup-p">' + esc(p) + '</span>' +
                    (pi === 0 ? '<em class="cdup-tag">original</em>' : '') +
                '</label>';
            }).join('');
            return '<div class="cdup-group">' +
                '<div class="cdup-head"><b>' +
                    esc(g.paths[0].split('/').pop()) + '</b>' +
                    '<span>' + D.fmt(g.size) + ' × ' + g.paths.length + '</span>' +
                '</div>' + rows + '</div>';
        }).join('') || '<p class="cln-empty">Sin duplicados detectados.</p>';
        refreshBar();
    }

    function open(d, found, cb) {
        close();
        deps = d; groups = found || []; onDone = cb;
        ov = document.createElement('div');
        ov.className = 'tribal-overlay cln-list-ov';
        ov.innerHTML =
            '<div class="tribal-dialog cln-list-dialog cln-dup-dialog">' +
                '<h4>👯 Duplicados encontrados</h4>' +
                '<p class="cln-hint">Elige cuál conservar en cada grupo — ' +
                    'las demás copias se marcan para borrar.</p>' +
                '<div class="cln-list" id="cdup-groups"></div>' +
                '<div class="cdup-bar"><span id="cdup-free"></span></div>' +
                '<div class="tribal-dialog-actions">' +
                    '<button class="tribal-btn" id="cdup-close">Cerrar</button>' +
                    '<button class="tribal-btn danger" id="cdup-del">' +
                        '🗑 Borrar marcadas</button>' +
                '</div>' +
            '</div>';
        (deps.mount || document.body).appendChild(ov);
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
        ov.querySelector('#cdup-close').addEventListener('click', close);
        ov.querySelector('#cdup-groups').addEventListener('change', refreshBar);
        ov.querySelector('#cdup-del').addEventListener('click', function () {
            var paths = toDelete();
            if (!paths.length) return;
            var toast = deps.toast || function () {};
            deps.confirm('Borrar duplicados',
                'Se eliminarán ' + paths.length + ' copias para siempre. ' +
                'La copia marcada «conservar» de cada grupo queda intacta.',
                'Borrar', function () {
                    var btn = ov.querySelector('#cdup-del');
                    btn.disabled = true; btn.textContent = 'Borrando…';
                    D.del(paths).then(function (r) {
                        toast('🔥 ' + D.fmt(r.freed) + ' liberados (' +
                              r.deleted + ' borrados' +
                              (r.failed ? ', ' + r.failed + ' fallaron' : '') + ')');
                        close();
                        if (onDone) onDone(paths);
                    });
                });
        });
        paint();
    }

    return { open: open, close: close };
})();
