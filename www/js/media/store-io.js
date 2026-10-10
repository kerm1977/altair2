// ============================================================================
// ARCHIVO: media/store-io.js
// RESPONSABILIDAD: Backends de persistencia de TRIBALs (solo E/S de blobs).
//   - Nativo (APK): @capacitor/filesystem en Directory.Data / tribu_media/
//   - Web (preview): IndexedDB
//   El índice de metadatos y colecciones lo maneja media-store.js (localStorage).
//   API: window.SonoStoreIO.{isNative,kindFromMime,DIR,idbGet,idbPut,idbDel,
//         nativeWrite,nativeWriteArt,nativeDelete,nativeURL}
// ============================================================================
window.SonoStoreIO = (function () {
    'use strict';

    var DIR = 'tribu_media';
    var DB_NAME = 'tribu-media-db';
    var STORE = 'files';

    // ------------------------------------------------------------------------
    // Detección de plataforma
    // ------------------------------------------------------------------------
    function isNative() {
        try {
            return !!(window.Capacitor &&
                      window.Capacitor.isNativePlatform &&
                      window.Capacitor.isNativePlatform() &&
                      window.Capacitor.Plugins &&
                      window.Capacitor.Plugins.Filesystem);
        } catch (e) { return false; }
    }

    function kindFromMime(mime, name) {
        mime = mime || '';
        if (mime === 'application/pdf' || mime === 'application/epub+zip' ||
            mime === 'text/plain') return 'doc';
        if (mime.indexOf('audio/') === 0) return 'audio';
        if (mime.indexOf('video/') === 0) return 'video';
        if (mime.indexOf('image/') === 0) return 'image';
        var ext = (name || '').split('.').pop().toLowerCase();
        if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'].indexOf(ext) >= 0) return 'audio';
        if (['mp4', 'webm', 'mkv', 'mov', 'avi', '3gp'].indexOf(ext) >= 0) return 'video';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic'].indexOf(ext) >= 0) return 'image';
        if (['pdf', 'epub', 'txt', 'mobi'].indexOf(ext) >= 0) return 'doc';
        return 'other';
    }

    // ------------------------------------------------------------------------
    // IndexedDB (modo web)
    // ------------------------------------------------------------------------
    function openDB() {
        return new Promise(function (resolve, reject) {
            var req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = function (e) {
                e.target.result.createObjectStore(STORE, { keyPath: 'id' });
            };
            req.onsuccess = function (e) { resolve(e.target.result); };
            req.onerror = function (e) { reject(e.target.error); };
        });
    }

    function idbPut(id, blob) {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).put({ id: id, blob: blob });
                tx.oncomplete = function () { db.close(); resolve(); };
                tx.onerror = function (e) { db.close(); reject(e.target.error); };
            });
        });
    }

    function idbGet(id) {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE, 'readonly');
                var req = tx.objectStore(STORE).get(id);
                req.onsuccess = function () { db.close(); resolve(req.result ? req.result.blob : null); };
                req.onerror = function (e) { db.close(); reject(e.target.error); };
            });
        });
    }

    function idbDel(id) {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).delete(id);
                tx.oncomplete = function () { db.close(); resolve(); };
                tx.onerror = function (e) { db.close(); reject(e.target.error); };
            });
        });
    }

    // ------------------------------------------------------------------------
    // Filesystem (modo nativo)
    // ------------------------------------------------------------------------
    function fileToBase64(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () {
                var result = reader.result || '';
                resolve(result.indexOf(',') >= 0 ? result.split(',')[1] : result);
            };
            reader.onerror = function () { reject(reader.error); };
            reader.readAsDataURL(file);
        });
    }

    function fsPlugin() {
        return window.Capacitor.Plugins.Filesystem;
    }

    // El enum Directory NO viene en el proxy del plugin → usar el string 'DATA'
    function fsDir() {
        var FS = fsPlugin();
        return (FS.Directory && FS.Directory.Data) || 'DATA';
    }

    // writeFile universal: primero intenta el Blob DIRECTO (Filesystem v6 lo
    // transmite al lado nativo por stream — sin convertir a base64; una foto
    // de galería de 10 MB en base64 reventaba el bridge JS↔Java). Si la
    // versión del plugin no acepta Blob, cae al base64 clásico.
    function writeAny(FS, path, blob, dir) {
        var p;
        try {
            p = FS.writeFile({
                path: path, data: blob, directory: dir, recursive: true
            });
        } catch (e) { p = null; }
        return Promise.resolve(p).catch(function () {
            return fileToBase64(blob).then(function (base64) {
                return FS.writeFile({
                    path: path, data: base64, directory: dir, recursive: true
                });
            });
        });
    }

    // Escritura por bloques: un archivo grande (video de cientos de MB) en una
    // sola llamada writeFile se serializa entero en base64 y revienta el
    // puente JS↔Java. Bloques de 4 MB + appendFile mantienen la memoria baja
    // y reportan progreso real (0..1).
    var CHUNK = 4 * 1024 * 1024;

    function writeChunked(FS, path, file, dir, onProgress) {
        var off = 0, total = file.size || 1;
        function step() {
            var end = Math.min(off + CHUNK, total);
            return fileToBase64(file.slice(off, end)).then(function (b64) {
                var call = off === 0
                    ? FS.writeFile({ path: path, data: b64, directory: dir,
                                     recursive: true })
                    : FS.appendFile({ path: path, data: b64, directory: dir });
                return Promise.resolve(call).then(function () {
                    off = end;
                    if (onProgress) onProgress(off / total);
                    if (off < total) return step();
                });
            });
        }
        return step();
    }

    function nativeWrite(id, file, onProgress) {
        var FS = fsPlugin();
        var safe = (file.name || 'archivo').replace(/[^\w.\-]+/g, '_');
        var path = DIR + '/' + id + '_' + safe;
        var dir = fsDir();
        var canChunk = FS.appendFile && file.size > CHUNK &&
                       typeof file.slice === 'function';
        var w = canChunk
            ? writeChunked(FS, path, file, dir, onProgress)
            : writeAny(FS, path, file, dir).then(function () {
                if (onProgress) onProgress(1);
            });
        return w.then(function () { return path; });
    }

    function nativeWriteArt(id, blob) {
        var FS = fsPlugin();
        var path = DIR + '/art_' + id + '.jpg';
        return writeAny(FS, path, blob, fsDir()).then(function () { return path; });
    }

    // materializa un blob en caché (para compartir por content://) → ruta
    function nativeWriteCache(name, blob) {
        var FS = fsPlugin();
        var path = 'tribu_share/' + String(name || 'archivo').replace(/[^\w.\-]+/g, '_');
        return writeAny(FS, path, blob, 'CACHE').then(function () { return path; });
    }

    function nativeDelete(path) {
        var FS = fsPlugin();
        return FS.deleteFile({ path: path, directory: fsDir() })
            .catch(function () { /* si ya no existe, ignorar */ });
    }

    function nativeURL(path) {
        var FS = fsPlugin();
        return FS.getUri({ path: path, directory: fsDir() }).then(function (res) {
            return window.Capacitor.convertFileSrc(res.uri);
        });
    }

    return {
        isNative: isNative,
        kindFromMime: kindFromMime,
        DIR: DIR,
        DB_NAME: DB_NAME,
        STORE: STORE,
        idbGet: idbGet,
        idbPut: idbPut,
        idbDel: idbDel,
        nativeWrite: nativeWrite,
        nativeWriteArt: nativeWriteArt,
        nativeWriteCache: nativeWriteCache,
        nativeDelete: nativeDelete,
        nativeURL: nativeURL
    };
})();
