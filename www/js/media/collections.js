// ============================================================================
// ARCHIVO: media/collections.js
// RESPONSABILIDAD: colecciones (carpetas) y favoritos de TRIBALs.
//   - Vista de carpetas (filas) + migaja "← Colecciones"
//   - Crear / renombrar colección (diálogo newcol)
//   - Asignar archivos a colecciones (diálogo cols-overlay)
//   - Clics del grid en modo 'cols': abrir / renombrar / eliminar carpeta
//   Exporta en S: renderCollections, openNewCol, openColAssign
// ============================================================================
window.Sono.register('collections', function (S) {
    'use strict';
    var $ = S.$;
    var newcolMode = 'create', newcolTarget = null; // 'create' | 'rename'

    // ------------------------------------------------- vista colecciones
    S.renderCollections = function () {
        S.crumb.hidden = true;
        S.grid.classList.add('tribal-grid-rows');
        S.grid.classList.remove('tribal-shelf');
        $('media-pager').hidden = true;
        S.empty.classList.add('d-none');
        S.gridWrap.classList.remove('d-none');

        var favs = S.items.filter(function (m) { return m.fav; }).length;
        var html =
            '<div class="tribal-collection" data-open="fav">' +
                '<i class="bi bi-heart-fill col-ic fav"></i>' +
                '<div class="col-info"><p>Favoritos</p><span>' + favs + ' archivo(s)</span></div>' +
                '<i class="bi bi-chevron-right"></i>' +
            '</div>';

        var cols = window.MediaStore.listCollections().slice();
        if (S.sortMode === 'za') {
            cols.sort(function (a, b) {
                return b.name.localeCompare(a.name, 'es', { sensitivity: 'base' });
            });
        } else {
            cols.sort(function (a, b) {
                return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
            });
        }
        cols.forEach(function (c) {
            if (S.query && c.name.toLowerCase().indexOf(S.query) === -1) return;
            var n = S.items.filter(function (m) {
                return m.cols && m.cols.indexOf(c.id) >= 0;
            }).length;
            html +=
                '<div class="tribal-collection" data-open="' + c.id + '">' +
                    '<i class="bi bi-folder-fill col-ic"></i>' +
                    '<div class="col-info"><p>' + S.esc(c.name) + '</p><span>' +
                        n + ' archivo(s)</span></div>' +
                    '<button class="tribal-col-tool" data-col-ren="' + c.id + '" title="Renombrar">' +
                        '<i class="bi bi-pencil"></i></button>' +
                    '<button class="tribal-col-tool danger" data-col-del="' + c.id + '" title="Eliminar">' +
                        '<i class="bi bi-trash3"></i></button>' +
                '</div>';
        });

        html +=
            '<div class="tribal-collection tribal-collection-new" id="col-new-card">' +
                '<i class="bi bi-plus-lg col-ic"></i>' +
                '<div class="col-info"><p>Nueva colección</p><span>Crea una carpeta tribal</span></div>' +
            '</div>';

        S.grid.innerHTML = html;
    };

    $('crumb-back').addEventListener('click', function () {
        S.viewMode = 'cols';
        S.activeCol = null;
        S.render();
    });

    // ------------------------------------------- crear / renombrar colección
    S.openNewCol = function (mode, col) {
        newcolMode = (mode === 'rename') ? 'rename' : 'create';
        newcolTarget = col || null;
        S.newcolOv.querySelector('h4').textContent =
            newcolMode === 'rename' ? 'Renombrar colección' : 'Nueva colección';
        $('newcol-ok').textContent = newcolMode === 'rename' ? 'Guardar' : 'Crear';
        S.newcolInput.value = col ? col.name : '';
        S.newcolOv.hidden = false;
        setTimeout(function () { S.newcolInput.focus(); }, 60);
    };
    $('newcol-cancel').addEventListener('click', function () { S.newcolOv.hidden = true; });
    $('newcol-ok').addEventListener('click', function () {
        var name = S.newcolInput.value.trim();
        if (!name) return;
        var p = newcolMode === 'rename' && newcolTarget
            ? window.MediaStore.renameCollection(newcolTarget.id, name)
            : window.MediaStore.createCollection(name);
        p.then(function () {
            S.newcolOv.hidden = true;
            S.showToast(newcolMode === 'rename'
                ? 'Colección renombrada' : 'Colección «' + name + '» creada');
            S.render();
        });
    });
    S.newcolInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') $('newcol-ok').click();
        if (e.key === 'Escape') S.newcolOv.hidden = true;
    });

    // ------------------------------------------- diálogo asignar colección
    // la lógica vive en colassign.js (acepta 1 id o un array → envío en lote)
    if (window.TribalColAssign) window.TribalColAssign.attach(S);

    // -------------------------------------- clics del grid en modo carpetas
    S.grid.addEventListener('click', function (e) {
        if (S.viewMode !== 'cols') return;
        var delC = e.target.closest('[data-col-del]');
        if (delC) {
            e.stopPropagation();
            var col2 = window.MediaStore.listCollections().filter(function (c) {
                return c.id === delC.dataset.colDel;
            })[0];
            S.confirm('Eliminar colección',
                '¿Borrar «' + (col2 ? col2.name : 'esta colección') + '»? Los archivos siguen en la tribu.',
                'Eliminar', function () {
                window.MediaStore.deleteCollection(delC.dataset.colDel).then(function () {
                    S.showToast('Colección eliminada (los archivos siguen en la tribu)');
                    S.render();
                });
            });
            return;
        }
        var renC = e.target.closest('[data-col-ren]');
        if (renC) {
            e.stopPropagation();
            var col = window.MediaStore.listCollections().filter(function (c) {
                return c.id === renC.dataset.colRen;
            })[0];
            if (col) S.openNewCol('rename', col);
            return;
        }
        if (e.target.closest('#col-new-card')) { S.openNewCol('create'); return; }
        var colCard = e.target.closest('[data-open]');
        if (colCard) {
            S.activeCol = colCard.dataset.open;
            S.viewMode = 'col';
            S.page = 0;
            S.render();
        }
    });
});
