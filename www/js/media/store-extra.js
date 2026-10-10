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
                    path: m.path || (m.id + '  (blob en IndexedDB)'),
                    size: m.size
                };
            })
        });
    };

    // Compartir: hoja nativa (WhatsApp, Bluetooth…) o Web Share / descarga
    MS.share = function (meta) {
        if (IO.isNative() && meta.path) {
            var P = window.Capacitor.Plugins;
            return P.Filesystem.getUri({ path: meta.path, directory: 'DATA' })
                .then(function (r) {
                    return P.Share.share({ files: [r.uri], title: meta.name });
                });
        }
        return IO.idbGet(meta.id).then(function (blob) {
            if (!blob) throw new Error('sin datos');
            var f = new File([blob], meta.name || 'archivo',
                { type: blob.type || meta.mime || '' });
            if (navigator.canShare && navigator.canShare({ files: [f] })) {
                return navigator.share({ files: [f], title: meta.name });
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
    };
})();
