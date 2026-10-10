// ============================================================================
// ARCHIVO: media/seed.js
// RESPONSABILIDAD: Sembrar la biblioteca con los medios empaquetados en el
//   bundle (www/builtin/). Lee builtin/manifest.json, crea la colección del
//   paquete si falta y registra cada archivo vía MediaStore.addBuiltin — sin
//   copiar blobs: se reproducen directo desde el asset (web y APK).
//   Corre una sola vez (flag en localStorage); si el usuario borra items,
//   no se re-siembran.
// ============================================================================
window.Sono.register('seed', function (S) {
    'use strict';

    var FLAG = 'tribu_builtin_seed_v1';
    var MANIFEST = 'builtin/manifest.json';
    var MediaStore = window.MediaStore;

    function seed() {
        return fetch(MANIFEST).then(function (r) {
            if (!r.ok) throw new Error('manifest ' + r.status);
            return r.json();
        }).then(function (mf) {
            var cols = MediaStore.listCollections();
            var col = cols.filter(function (c) { return c.name === mf.collection; })[0];
            var got = col ? Promise.resolve(col) : MediaStore.createCollection(mf.collection);
            return got.then(function (c) {
                var n = 0;
                (mf.files || []).forEach(function (f) {
                    var meta = MediaStore.addBuiltin({
                        path: 'builtin/' + f.name,
                        name: f.name.replace(/\.[^.]+$/, ''),
                        mime: f.mime,
                        size: f.size,
                        cols: [c.id]
                    });
                    if (meta) n++;
                });
                return n;
            });
        });
    }

    // Pedir permisos de medios en Android 13+ — sin esto, el sistema puede
    // negar el acceso a música/videos/fotos al subir archivos
    try {
        var C = window.Capacitor;
        if (C && C.isNativePlatform && C.isNativePlatform() &&
            C.Plugins && C.Plugins.Filesystem &&
            C.Plugins.Filesystem.checkPermissions) {
            C.Plugins.Filesystem.checkPermissions().then(function (p) {
                if (p && p.publicStorage !== 'granted') {
                    C.Plugins.Filesystem.requestPermissions().catch(function () {});
                }
            }).catch(function () {});
        }
    } catch (e) {}

    // Solo la primera vez; a partir de ahí el índice es del usuario
    if (!localStorage.getItem(FLAG)) {
        seed().then(function (n) {
            localStorage.setItem(FLAG, '1');
            if (n > 0) {
                S.reload();
                if (S.toast) S.toast(n + ' archivo(s) de la tribu cargados');
            }
        }).catch(function (e) {
            console.warn('seed:', e);
            localStorage.setItem(FLAG, '1'); // no reintentar en cada arranque
        });
    }
});
