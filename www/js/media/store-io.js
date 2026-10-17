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

    var EXT_MIME = {
        mp3: 'audio/mpeg', mpga: 'audio/mpeg', mp2: 'audio/mpeg', mpa: 'audio/mpeg',
        m4a: 'audio/mp4', m4b: 'audio/mp4', m4p: 'audio/mp4', m4r: 'audio/mp4',
        aac: 'audio/aac', wav: 'audio/wav', wave: 'audio/wav',
        ogg: 'audio/ogg', oga: 'audio/ogg', spx: 'audio/ogg',
        opus: 'audio/opus', flac: 'audio/flac', weba: 'audio/webm',
        wma: 'audio/x-ms-wma', amr: 'audio/amr', '3ga': 'audio/3gpp',
        aiff: 'audio/aiff', aif: 'audio/aiff', aifc: 'audio/aiff',
        mka: 'audio/x-matroska', caf: 'audio/x-caf', alac: 'audio/mp4',
        ape: 'audio/x-ape', wv: 'audio/x-wavpack',
        mid: 'audio/midi', midi: 'audio/midi', kar: 'audio/midi',
        mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm',
        mkv: 'video/x-matroska', mov: 'video/quicktime', avi: 'video/x-msvideo',
        '3gp': 'video/3gpp',
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
        svg: 'image/svg+xml', heic: 'image/heic', avif: 'image/avif',
        pdf: 'application/pdf', epub: 'application/epub+zip', txt: 'text/plain'
    };

    var AUDIO_EXTS = [
        'mp3', 'mpga', 'mp2', 'mpa', 'm4a', 'm4b', 'm4p', 'm4r',
        'aac', 'wav', 'wave', 'ogg', 'oga', 'opus', 'spx', 'flac',
        'weba', 'wma', 'amr', '3ga', 'aiff', 'aif', 'aifc', 'mka',
        'caf', 'alac', 'ape', 'wv', 'mid', 'midi', 'kar', 'pcm', 'au', 'ra'
    ];

    function mimeFromName(name, fallback) {
        var f = String(fallback || '').trim().toLowerCase();
        if (f && f !== 'application/octet-stream' && f !== 'binary/octet-stream') {
            if (f === 'application/ogg' || f === 'application/x-ogg') return 'audio/ogg';
            if (f === 'audio/mp3' || f === 'audio/mpeg3' || f === 'audio/x-mp3') return 'audio/mpeg';
            if (f === 'audio/x-m4a') return 'audio/mp4';
            if (f === 'audio/x-wav') return 'audio/wav';
            if (f === 'audio/x-flac') return 'audio/flac';
            return f;
        }
        var ext = String(name || '').split('.').pop().toLowerCase();
        return EXT_MIME[ext] || f || '';
    }

    function kindFromMime(mime, name) {
        var ext = String(name || '').split('.').pop().toLowerCase();
        if (AUDIO_EXTS.indexOf(ext) >= 0) return 'audio';
        mime = mimeFromName(name, mime);
        if (mime === 'application/pdf' || mime === 'application/epub+zip' ||
            mime === 'text/plain') return 'doc';
        if (mime.indexOf('audio/') === 0) return 'audio';
        if (mime.indexOf('video/') === 0) return 'video';
        if (mime.indexOf('image/') === 0) return 'image';
        if (['mp4', 'webm', 'mkv', 'mov', 'avi', '3gp', 'm4v'].indexOf(ext) >= 0) return 'video';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'avif'].indexOf(ext) >= 0) return 'image';
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

    // writeFile seguro en el bridge nativo de Capacitor (que exige base64 String)
    function writeAny(FS, path, blob, dir) {
        return fileToBase64(blob).then(function (base64) {
            return FS.writeFile({
                path: path, data: base64, directory: dir, recursive: true
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

    // URL servible por el WebView para una ruta ABSOLUTA fuera de la app
    // (archivos referenciados por el escáner — no viven en Directory.Data)
    function nativeFileURL(absPath) {
        return window.Capacitor.convertFileSrc('file://' + absPath);
    }

    // Lee un archivo por ruta absoluta (referencia del escáner) → Blob
    function nativeReadAbs(absPath, mime) {
        var FS = fsPlugin();
        return FS.readFile({ path: 'file://' + absPath }).then(function (r) {
            var bin = atob(r.data);
            var bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return new Blob([bytes], { type: mime || '' });
        });
    }

    return {
        isNative: isNative,
        kindFromMime: kindFromMime,
        mimeFromName: mimeFromName,
        fileToBase64: fileToBase64,
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
        nativeURL: nativeURL,
        nativeFileURL: nativeFileURL,
        nativeReadAbs: nativeReadAbs
    };
})();
