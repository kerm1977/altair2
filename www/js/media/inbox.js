// ============================================================================
// ARCHIVO: media/inbox.js
// RESPONSABILIDAD: Bandeja de entrada de TRIBALs.
//   MainActivity (Java) copia los archivos recibidos por "Abrir con" /
//   "Compartir" a files/tribu_inbox/ y dispara el evento 'tribalInbox'.
//   Aquí se drena esa carpeta: cada archivo se importa con MediaStore.add
//   (queda guardado dentro de TRIBALs) y se borra de la bandeja.
// ============================================================================
window.Sono.register('inbox', function (S) {
    'use strict';

    var DIR = 'tribu_inbox';
    var MediaStore = window.MediaStore;

    function fs() {
        try {
            var C = window.Capacitor;
            if (C && C.isNativePlatform && C.isNativePlatform() &&
                C.Plugins && C.Plugins.Filesystem) {
                return C.Plugins.Filesystem;
            }
        } catch (e) {}
        return null;
    }

    // el enum Directory no viaja por el proxy → fallback al string 'DATA'
    function fsDirData(FS) {
        return (FS.Directory && FS.Directory.Data) || 'DATA';
    }

    function b64ToBlob(b64) {
        var bin = atob(b64);
        var len = bin.length;
        var bytes = new Uint8Array(len);
        for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
        return new Blob(bytes);
    }

    function drain() {
        var FS = fs();
        if (!FS) return Promise.resolve(0);
        return FS.readdir({ path: DIR, directory: fsDirData(FS) })
            .then(function (res) {
                var list = (res && res.files) || [];
                var names = list.map(function (f) {
                    return typeof f === 'string' ? f : f.name;
                });
                var n = 0;
                var chain = Promise.resolve();
                names.forEach(function (name) {
                    chain = chain.then(function () {
                        return FS.readFile({
                                path: DIR + '/' + name,
                                directory: fsDirData(FS)
                            })
                            .then(function (r) {
                                var file = new File([b64ToBlob(r.data)], name);
                                return MediaStore.add(file);
                            })
                            .then(function () {
                                n++;
                                return FS.deleteFile({
                                    path: DIR + '/' + name,
                                    directory: fsDirData(FS)
                                }).catch(function () {});
                            })
                            .catch(function () {});
                    });
                });
                return chain.then(function () { return n; });
            })
            .catch(function () { return 0; });
    }

    function done(n) {
        if (n > 0) {
            S.reload();
            S.showToast(n + ' archivo(s) recibido(s) en la tribu');
        }
    }

    // en caliente: MainActivity avisa cuando entra algo nuevo
    window.addEventListener('tribalInbox', function () { drain().then(done); });
    // en frío: recoge lo que quedó copiado antes de abrir la app
    drain().then(done);
});
