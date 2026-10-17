// ============================================================================
// ARCHIVO: media/scanio.js
// RESPONSABILIDAD: puente nativo del escáner + «abrir en la ruta».
//   - openLocation(path): carpeta contenedora en el gestor del sistema;
//     si ningún gestor responde, la ruta se copia al portapapeles.
//   - exists(path): el archivo sigue vivo en el dispositivo.
//   API: window.TribalScanIO.{plug,openLocation,exists}
// ============================================================================
window.TribalScanIO = (function () {
    'use strict';

    function plug() {
        var P = window.Capacitor && window.Capacitor.Plugins;
        return (P && P.TribalScan) || null;
    }

    function copyPath(path) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(path)
                .then(function () { return 'copy'; })
                .catch(function () { return 'fail'; });
        }
        return Promise.resolve('fail');
    }

    // Promise<'open'|'copy'|'fail'> — el caller decide el toast
    function openLocation(path) {
        var P = plug();
        if (!P || !P.openLocation) return copyPath(path);
        return P.openLocation({ path: path }).then(function (r) {
            return (r && r.opened) ? 'open' : copyPath(path);
        }).catch(function () { return copyPath(path); });
    }

    function exists(path) {
        var P = plug();
        if (!P || !P.exists) return Promise.resolve(true);
        return P.exists({ path: path })
            .then(function (r) { return !!(r && r.exists); })
            .catch(function () { return true; });
    }

    return { plug: plug, openLocation: openLocation, exists: exists };
})();
