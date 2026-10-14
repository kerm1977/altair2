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

    // 📄 archivos: en la APK el administrador UNIVERSAL propio (con
    // thumbnails y multi-selección) — el picker del sistema solo en web
    function pickFiles() {
        if (window.TribalFiles && window.TribalFiles.native()) {
            window.TribalFiles.pick(S, { title: 'Subir a la tribu' })
                .then(function (metas) {
                    if (metas && metas.length)
                        S.showToast(metas.length + ' archivo(s) en la tribu');
                });
        } else {
            S.input.click();
        }
    }

    // tocar el sol: cerrado → abre el óvalo; ya abierto → sube archivos
    // (el sol también cumple la función de subir, no solo expandir)
    S.fab.addEventListener('click', function (e) {
        e.stopPropagation();
        if (expanded) {
            setOpen(false);
            pickFiles();
        } else {
            setOpen(true);
        }
    });
    document.addEventListener('click', function (e) {
        if (expanded && !wrap.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') setOpen(false);
    });

    // 📄 archivos: administrador propio (APK) / selector web
    $('fab-file').addEventListener('click', function () {
        setOpen(false);
        pickFiles();
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
        if (S.uploadProgress) S.uploadProgress(0, files.length, 0, files[0].name);
        var metas = [];
        var done = 0;
        var chain = Promise.resolve();
        files.forEach(function (f) {
            chain = chain.then(function () {
                if (S.uploadProgress) S.uploadProgress(done, files.length, 0, f.name);
                return window.TribalDup.guard(f, S).then(function (f2) {
                    if (!f2) { done++; return null; }
                    return window.MediaStore.add(f2, null, function (fr) {
                        if (S.uploadProgress) S.uploadProgress(done, files.length, fr, f2.name);
                    });
                }).then(function (m) {
                    if (m) metas.push(m);
                    done++;
                });
            }).catch(function () { done++; });
        });
        chain.then(function () {
            if (S.uploadDone) S.uploadDone();
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
