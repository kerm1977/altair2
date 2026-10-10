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

    function nativeWrite(id, file) {
        var FS = fsPlugin();
        var safe = (file.name || 'archivo').replace(/[^\w.\-]+/g, '_');
        var path = DIR + '/' + id + '_' + safe;
        return fileToBase64(file).then(function (base64) {
            return FS.writeFile({
                path: path,
                data: base64,
                directory: FS.Directory.Data,
                recursive: true
            }).then(function () { return path; });
        });
    }

    function nativeWriteArt(id, blob) {
        var FS = fsPlugin();
        var path = DIR + '/art_' + id + '.jpg';
        return fileToBase64(blob).then(function (base64) {
            return FS.writeFile({
                path: path,
                data: base64,
                directory: FS.Directory.Data,
                recursive: true
            }).then(function () { return path; });
        });
    }

    function nativeDelete(path) {
        var FS = fsPlugin();
        return FS.deleteFile({ path: path, directory: FS.Directory.Data })
            .catch(function () { /* si ya no existe, ignorar */ });
    }

    function nativeURL(path) {
        var FS = fsPlugin();
        return FS.getUri({ path: path, directory: FS.Directory.Data }).then(function (res) {
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
        nativeDelete: nativeDelete,
        nativeURL: nativeURL
    };
})();
