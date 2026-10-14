// ============================================================================
// ARCHIVO: media/store-extra.js
// RESPONSABILIDAD: extensiones de MediaStore relacionadas con salida de datos.
//   - storageInfo(): dónde viven los archivos (para el panel de estadísticas)
//   - share(): hoja nativa de Capacitor (WhatsApp, Bluetooth…) en APK,
//     Web Share API o descarga como respaldo en navegador
//   Extiende window.MediaStore — requiere media/store-io.js + media-store.js.
// ============================================================================
(function () {
    'use strict';
    var MS = window.MediaStore;
    var IO = window.SonoStoreIO;
    if (!MS || !IO) return;

    // Dónde quedan guardados los archivos (para el panel de estadísticas)
    MS.storageInfo = function () {
        return Promise.resolve({
            mode: IO.isNative() ? 'Dispositivo (Capacitor Filesystem)' : 'Navegador (IndexedDB)',
            base: IO.isNative() ? 'Datos de la app → ' + IO.DIR + '/' : IO.DB_NAME + ' → ' + IO.STORE,
            files: MS._index().map(function (m) {
                return {
                    name: m.name,
                    kind: m.kind,
                    path: m.path || m.builtin ||
                          'Base interna de la app',
                    size: m.size
                };
            })
        });
    };

    // Cuando ni el nombre ni la ruta traen extensión, derivarla del MIME —
    // sin ella Android/Windows recibe un "object" genérico sin tipo.
    var MIME_EXT = {
        'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/aac': '.aac',
        'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/ogg': '.ogg',
        'audio/flac': '.flac', 'audio/opus': '.opus', 'audio/webm': '.weba',
        'video/mp4': '.mp4', 'video/webm': '.webm', 'video/x-matroska': '.mkv',
        'video/quicktime': '.mov', 'video/3gpp': '.3gp', 'video/x-msvideo': '.avi',
        'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif',
        'image/webp': '.webp', 'image/bmp': '.bmp', 'image/svg+xml': '.svg',
        'application/pdf': '.pdf', 'application/epub+zip': '.epub',
        'text/plain': '.txt'
    };

    // Devuelve el nombre con extensión garantizada: primero la del propio
    // nombre, luego la de la ruta (path/builtin), por último la del MIME.
    function shareName(meta) {
        var fname = meta.name || 'archivo';
        if (/\.[a-z0-9]{2,5}$/i.test(fname)) return fname;
        var src = meta.path || meta.builtin || '';
        var ext = /(\.[a-z0-9]{2,5})$/i.exec(src);
        if (ext) return fname + ext[1];
        return fname + (MIME_EXT[meta.mime] || '');
    }

    // Compartir: hoja nativa (WhatsApp, Bluetooth…) o Web Share / descarga.
    // Cubre los 3 orígenes del blob: archivo en disco (meta.path), asset del
    // bundle (meta.builtin) y IndexedDB. Los builtin vienen sin extensión en
    // el nombre — se restaura desde la ruta para que la app destino sepa
    // qué tipo de archivo es.
    MS.share = function (meta) {
        var P = window.Capacitor && window.Capacitor.Plugins;
        var fname = shareName(meta);

        function shareUri(dir, path) {
            return P.Filesystem.getUri({ path: path, directory: dir })
                .then(function (r) {
                    return P.Share.share({ files: [r.uri], title: fname });
                });
        }

        // archivo ya en disco (subido / recibido) → su URI directo, sin
        // pasar por memoria; si la URI no cuaja, materializar en caché
        if (IO.isNative() && meta.path && !meta.builtin) {
            return shareUri('DATA', meta.path).catch(function () {
                return blobShare();
            });
        }

        // getURL resuelve los 3 orígenes (builtin → asset, nativo → uri,
        // web → blob:) y fetch lo materializa como blob
        var blobP = MS.getURL(meta).then(function (u) {
            if (!u) throw new Error('sin datos');
            return fetch(u).then(function (r) {
                if (!r.ok) throw new Error('http ' + r.status);
                return r.blob();
            });
        });

        function blobShare() {
            return blobP.then(function (blob) {
                if (IO.isNative()) {
                    // escribir en caché → content:// → hoja nativa de Android
                    return IO.nativeWriteCache(fname, blob).then(function (p) {
                        return shareUri('CACHE', p);
                    });
                }
                var f = new File([blob], fname,
                    { type: blob.type || meta.mime || '' });
                if (navigator.canShare && navigator.canShare({ files: [f] })) {
                    return navigator.share({ files: [f], title: fname });
                }
                // sin Web Share: descarga local
                var u = URL.createObjectURL(f);
                var a = document.createElement('a');
                a.href = u;
                a.download = f.name;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(function () { URL.revokeObjectURL(u); }, 5000);
            });
        }

        return blobShare();
    };

    // Compartir directo por Bluetooth: materializa el archivo en caché y
    // TribalNative.shareBluetooth abre ACTION_SEND al paquete BT de Android
    // (sin pasar por la hoja de compartir). En web o si el plugin no está,
    // cae a share() normal.
    MS.shareBluetooth = function (meta) {
        var P = window.Capacitor && window.Capacitor.Plugins;
        var TN = P && P.TribalNative;
        if (!IO.isNative() || !TN || !TN.shareBluetooth) {
            return MS.share(meta);
        }

        var fname = shareName(meta);

        return MS.getURL(meta).then(function (u) {
            if (!u) throw new Error('sin datos');
            return fetch(u).then(function (r) {
                if (!r.ok) throw new Error('http ' + r.status);
                return r.blob();
            });
        }).then(function (blob) {
            return IO.nativeWriteCache(fname, blob);
        }).then(function (p) {
            return TN.shareBluetooth({
                path: p, mime: meta.mime || '*/*', title: fname
            });
        });
    };
})();
