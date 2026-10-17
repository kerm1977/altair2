// ============================================================================
// ARCHIVO: media/cleanlist.js
// RESPONSABILIDAD: lista paginada (20/página) para REVISAR los hallazgos de
//   una categoría del limpiador antes de borrar. Cada fila puede desmarcarse
//   — el desmarcado queda en TribalCleanData.state.excluded[cat].
//   API: window.TribalCleanList.open(cat, items, deps)
// ============================================================================
window.TribalCleanList = (function () {
    'use strict';

    var D = window.TribalCleanData;
    var ov = null, page = 0, perPage = 20;
    var items = [], cat = null, deps = null;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function close() {
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = null; items = []; page = 0;
    }

    function isOff(path) {
        return !!(D.state.excluded[cat.id] && D.state.excluded[cat.id][path]);
    }

    function paint() {
        var list = ov.querySelector('#cln-list');
        var total = items.length;
        var pages = Math.max(1, Math.ceil(total / perPage));
        if (page >= pages) page = pages - 1;
        var slice = items.slice(page * perPage, page * perPage + perPage);

        list.innerHTML = slice.map(function (it) {
            var off = isOff(it.path);
            return '<label class="cln-row' + (off ? ' off' : '') + '">' +
                '<input type="checkbox" data-p="' + esc(it.path) + '"' +
                (off ? '' : ' checked') + '>' +
                '<span class="cln-row-t">' +
                    '<b>' + esc(it.name || it.path.split('/').pop()) + '</b>' +
                    '<i>' + esc(it.path) + '</i>' +
                '</span>' +
                '<em>' + D.fmt(it.size) + '</em>' +
            '</label>';
        }).join('') || '<p class="cln-empty">Nada que revisar aquí.</p>';

        ov.querySelector('#cln-page').textContent =
            'Página ' + (page + 1) + ' / ' + pages + ' · ' + total + ' elementos';
        ov.querySelector('#cln-prev').disabled = page <= 0;
        ov.querySelector('#cln-next').disabled = page >= pages - 1;
    }

    function open(catDef, found, d) {
        close();
        cat = catDef; deps = d; items = found || []; page = 0;
        ov = document.createElement('div');
        ov.className = 'tribal-overlay cln-list-ov';
        ov.innerHTML =
            '<div class="tribal-dialog cln-list-dialog">' +
                '<h4>' + cat.icon + ' ' + esc(cat.name) + '</h4>' +
                '<p class="cln-hint">Desmarca lo que NO quieras borrar.</p>' +
                '<div class="cln-list" id="cln-list"></div>' +
                '<div class="cln-pager">' +
                    '<button class="tribal-btn" id="cln-prev">◀</button>' +
                    '<span id="cln-page"></span>' +
                    '<button class="tribal-btn" id="cln-next">▶</button>' +
                '</div>' +
                '<div class="tribal-dialog-actions">' +
                    '<button class="tribal-btn primary" id="cln-ok">Listo</button>' +
                '</div>' +
            '</div>';
        (deps.mount || document.body).appendChild(ov);
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
        ov.querySelector('#cln-ok').addEventListener('click', close);
        ov.querySelector('#cln-prev').addEventListener('click', function () {
            if (page > 0) { page--; paint(); }
        });
        ov.querySelector('#cln-next').addEventListener('click', function () {
            page++; paint();
        });
        ov.querySelector('#cln-list').addEventListener('change', function (e) {
            var cb = e.target.closest('input[type=checkbox][data-p]');
            if (!cb) return;
            var ex = D.state.excluded[cat.id];
            if (cb.checked) delete ex[cb.dataset.p]; else ex[cb.dataset.p] = 1;
            cb.closest('.cln-row').classList.toggle('off', !cb.checked);
        });
        paint();
    }

    return { open: open, close: close };
})();
