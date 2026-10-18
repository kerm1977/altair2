// ============================================================================
// ARCHIVO: media/colassign.js
// RESPONSABILIDAD: diálogo «Colecciones» para asignar archivos.
//   - Acepta UN id o un ARRAY de ids (selección múltiple → envío en lote).
//   - Check por colección: lleno = todos la tienen, guion = algunos,
//     vacío = ninguno. Tocar agrega a todos o quita a todos.
//   - «Nueva» crea colección desde el mismo diálogo; 🗑 elimina.
//   API: TribalColAssign.attach(S) — define S.openColAssign(idOrIds) y
//        cablea cols-overlay (#cols-list, #cols-new, #cols-ok).
// ============================================================================
window.TribalColAssign = (function () {
    'use strict';

    function attach(S) {
        var $ = S.$;

        function renderColList() {
            var ids = S.colAssignIds || [];
            var cols = window.MediaStore.listCollections();
            if (!cols.length) {
                S.colsList.innerHTML = '<p class="tmeta-empty">Aún no hay ' +
                    'colecciones. Crea una con «Nueva».</p>';
                return;
            }
            window.MediaStore.list().then(function (list) {
                var metas = list.filter(function (x) {
                    return ids.indexOf(x.id) >= 0;
                });
                if (!metas.length) { S.colsOv.hidden = true; return; }
                S.colsList.innerHTML = cols.map(function (c) {
                    // cuántos de los seleccionados ya están en esta colección
                    var n = metas.filter(function (m) {
                        return m.cols && m.cols.indexOf(c.id) >= 0;
                    }).length;
                    var ic = n === metas.length ? 'bi-check-circle-fill'
                           : n > 0 ? 'bi-dash-circle' : 'bi-circle';
                    return '<div class="tribal-col-row">' +
                        '<button class="tribal-col-check' + (n ? ' on' : '') +
                            '" data-col="' + c.id + '">' +
                            '<i class="bi ' + ic + '"></i>' +
                            '<span>' + S.esc(c.name) + '</span>' +
                        '</button>' +
                        '<button class="tribal-col-del" data-del="' + c.id +
                            '" title="Eliminar colección">' +
                            '<i class="bi bi-trash3"></i></button>' +
                    '</div>';
                }).join('');
            });
        }

        S.openColAssign = function (idOrIds) {
            S.colAssignIds = (idOrIds instanceof Array)
                ? idOrIds.slice() : [idOrIds];
            S.colAssignId = S.colAssignIds[0] || null;
            var p = S.colsOv.querySelector('p');
            if (p) p.textContent = S.colAssignIds.length > 1
                ? 'Elige dónde viven estos ' + S.colAssignIds.length +
                  ' archivos. Toca para marcar o quitar.'
                : 'Elige dónde vive este archivo. Toca para marcar o quitar.';
            renderColList();
            S.colsOv.hidden = false;
        };

        S.colsList.addEventListener('click', function (e) {
            var del = e.target.closest('[data-del]');
            if (del) {
                var cName = window.MediaStore.listCollections()
                    .filter(function (x) { return x.id === del.dataset.del; })[0];
                S.confirm('Eliminar colección',
                    '¿Borrar «' + (cName ? cName.name : 'esta colección') +
                        '»? Los archivos siguen en la tribu.',
                    'Eliminar', function () {
                    window.MediaStore.deleteCollection(del.dataset.del)
                        .then(function () {
                            S.showToast('Colección eliminada');
                            S.reload();
                            renderColList();
                        });
                });
                return;
            }
            var chk = e.target.closest('[data-col]');
            if (!chk) return;
            var colId = chk.dataset.col;
            var ids = S.colAssignIds || [];
            var btn = chk.querySelector('i');
            // si todos la tienen → quitar a todos; si no → agregar a todos
            var allOn = btn && btn.classList.contains('bi-check-circle-fill');
            window.MediaStore.setInCollections(ids, colId, !allOn)
                .then(function () {
                    renderColList();
                    S.reload();
                    if (ids.length > 1) {
                        var nm = chk.querySelector('span');
                        S.showToast(ids.length + ' archivos ' +
                            (allOn ? 'salieron de' : '→') +
                            ' «' + (nm ? nm.textContent : '') + '»');
                    }
                });
        });

        function closeOv() {
            S.colsOv.hidden = true;
            S.colAssignIds = null;
            S.colAssignId = null;
        }
        $('cols-ok').addEventListener('click', closeOv);
        $('cols-new').addEventListener('click', function () {
            S.openNewCol('create');
        });
        S.colsOv.addEventListener('click', function (e) {
            if (e.target === S.colsOv) closeOv();
        });
    }

    return { attach: attach };
})();
