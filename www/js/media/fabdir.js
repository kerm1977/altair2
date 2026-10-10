// ============================================================================
// ARCHIVO: media/fabdir.js
// RESPONSABILIDAD: FAB de subida expandible.
//   - El botón redondo con el aro girando se expande en óvalo al tocarlo
//     (o al pasar el mouse) mostrando: 📁 Carpeta | ☀ | 📄 Archivos
//   - 📄 Archivos → selector de archivos normal (media-input)
//   - 📁 Carpeta → selector de carpetas (webkitdirectory): todos los
//     archivos suben a la tribu y se crea una COLECCIÓN con el nombre
//     exacto de la carpeta que los contiene a todos (mezcla de tipos)
// ============================================================================
window.Sono.register('fabdir', function (S) {
    'use strict';
    var $ = S.$;
    var wrap = $('media-fab-wrap');
    var dirInput = $('media-dir-input');
    var expanded = false;

    function setOpen(on) {
        expanded = !!on;
        wrap.classList.toggle('open', expanded);
    }

    // tocar el sol → óvalo; tocar fuera / Escape → se cierra
    S.fab.addEventListener('click', function (e) {
        e.stopPropagation();
        setOpen(!expanded);
    });
    document.addEventListener('click', function (e) {
        if (expanded && !wrap.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') setOpen(false);
    });

    // 📄 archivos: el selector de siempre
    $('fab-file').addEventListener('click', function () {
        setOpen(false);
        S.input.click();
    });

    // 📁 carpeta: selector de directorio → colección automática
    $('fab-dir').addEventListener('click', function () {
        setOpen(false);
        dirInput.click();
    });

    dirInput.addEventListener('change', function () {
        var files = Array.prototype.slice.call(dirInput.files || []);
        dirInput.value = '';
        if (!files.length) return;

        // nombre exacto de la carpeta raíz elegida
        var rel = files[0].webkitRelativePath || '';
        var colName = rel.split('/')[0] ||
                      'Carpeta ' + new Date().toLocaleDateString('es');

        S.showToast('Subiendo carpeta «' + colName + '» · ' + files.length + ' archivo(s)…');
        var metas = [];
        var chain = Promise.resolve();
        files.forEach(function (f) {
            chain = chain.then(function () {
                return window.MediaStore.add(f).then(function (m) {
                    if (m) metas.push(m);
                });
            }).catch(function () {});
        });
        chain.then(function () {
            if (!metas.length) {
                S.showToast('No se pudo subir la carpeta');
                S.reload();
                return;
            }
            window.MediaStore.createCollection(colName).then(function (col) {
                var c2 = Promise.resolve();
                metas.forEach(function (m) {
                    c2 = c2.then(function () {
                        return window.MediaStore.toggleInCollection(m.id, col.id);
                    }).catch(function () {});
                });
                return c2.then(function () { return col; });
            }).then(function (col) {
                S.showToast('Colección «' + (col ? col.name : colName) + '» creada con ' +
                            metas.length + ' archivo(s)');
                // llevar directo a la vista de colecciones para verla
                S.viewMode = 'cols';
                S.activeCol = null;
                S.page = 0;
                S.reload();
            });
        });
    });
});
