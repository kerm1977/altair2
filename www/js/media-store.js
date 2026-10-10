// ============================================================================
// ARCHIVO: media-store.js
// RESPONSABILIDAD: API pública de persistencia de TRIBALs.
//   - Índice de metadatos y colecciones: localStorage (offline-first)
//   - Blobs de archivos: delegados a SonoStoreIO (media/store-io.js)
//   - Historial de deshacer: renombrar archivo/colección y borrar colección
// API: window.MediaStore (misma fachada de siempre + undo/canUndo)
// ============================================================================
window.MediaStore = (function () {
    'use strict';

    var IO = window.SonoStoreIO;
    var INDEX_KEY = 'tribu_media_index_v1';
    var COLS_KEY = 'tribu_media_cols_v1';
    var DIR = IO.DIR;

    function isNative() { return IO.isNative(); }
    function kindFromMime(mime, name) { return IO.kindFromMime(mime, name); }

    // ------------------------------------------------------------------------
    // Índice de metadatos (localStorage)
    // ------------------------------------------------------------------------
    function getIndex() {
        try {
            var raw = localStorage.getItem(INDEX_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    function saveIndex(list) {
        localStorage.setItem(INDEX_KEY, JSON.stringify(list));
    }

    // ------------------------------------------------------------------------
    // Colecciones (carpetas) — también en localStorage, offline-first
    // ------------------------------------------------------------------------
    function getCols() {
        try {
            var raw = localStorage.getItem(COLS_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    function saveCols(list) {
        localStorage.setItem(COLS_KEY, JSON.stringify(list));
    }

    function findMeta(index, id) {
        return index.filter(function (m) { return m.id === id; })[0] || null;
    }

    // ------------------------------------------------------------------------
    // Historial de deshacer (última operación sobre nombres/colecciones)
    // ------------------------------------------------------------------------
    var undoStack = [];

    function pushUndo(entry) {
        undoStack.push(entry);
        if (undoStack.length > 20) undoStack.shift();
    }

    function canUndo() { return undoStack.length > 0; }

    function undo() {
        var e = undoStack.pop();
        if (!e) return Promise.resolve(null);
        if (e.type === 'rename-file') {
            var idx = getIndex();
            var m = findMeta(idx, e.id);
            if (m) { m.name = e.before; saveIndex(idx); }
            return Promise.resolve(m);
        }
        if (e.type === 'rename-col') {
            var cols = getCols();
            var c = cols.filter(function (x) { return x.id === e.id; })[0];
            if (c) { c.name = e.before; saveCols(cols); }
            return Promise.resolve(c);
        }
        if (e.type === 'delete-col') {
            var list = getCols();
            list.push(e.col); saveCols(list);
            var idx2 = getIndex();
            idx2.forEach(function (meta) {
                if (e.memberIds.indexOf(meta.id) >= 0) {
                    meta.cols = meta.cols || [];
                    if (meta.cols.indexOf(e.col.id) < 0) meta.cols.push(e.col.id);
                }
            });
            saveIndex(idx2);
            return Promise.resolve(e.col);
        }
        return Promise.resolve(null);
    }

    // ------------------------------------------------------------------------
    // API pública
    // ------------------------------------------------------------------------
    return {
        isNative: isNative,
        kindFromMime: kindFromMime,
        canUndo: canUndo,
        undo: undo,

        list: function () {
            return Promise.resolve(
                getIndex().sort(function (a, b) { return b.addedAt - a.addedAt; })
            );
        },

        add: function (file, customName, onProgress) {
            var id = 'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
            var meta = {
                id: id,
                name: customName || file.name || 'archivo',
                mime: file.type || '',
                kind: kindFromMime(file.type, file.name),
                size: file.size || 0,
                addedAt: Date.now(),
                path: null
            };

            var persist = isNative()
                ? IO.nativeWrite(id, file, onProgress).then(function (path) { meta.path = path; })
                : IO.idbPut(id, file);

            return persist.then(function () {
                var index = getIndex();
                index.push(meta);
                saveIndex(index);
                return meta;
            });
        },

        // Registra un archivo empaquetado dentro del bundle (www/builtin/) sin
        // copiar el blob: getURL lo sirve directo desde el asset. Devuelve el
        // meta creado o null si ya estaba indexado.
        addBuiltin: function (info) {
            var index = getIndex();
            if (index.some(function (m) { return m.builtin === info.path; })) return null;
            var meta = {
                id: 'b_' + info.path.replace(/[^a-z0-9]+/gi, '_').slice(0, 60),
                name: info.name,
                mime: info.mime || '',
                kind: kindFromMime(info.mime, info.name),
                size: info.size || 0,
                addedAt: info.addedAt || Date.now(),
                path: null,
                builtin: info.path
            };
            if (info.cols && info.cols.length) meta.cols = info.cols.slice();
            index.push(meta);
            saveIndex(index);
            return meta;
        },

        rename: function (id, newName) {
            var index = getIndex();
            var meta = index.filter(function (m) { return m.id === id; })[0];
            if (!meta) return Promise.resolve(null);
            pushUndo({ type: 'rename-file', id: id, before: meta.name });
            meta.name = newName;
            saveIndex(index);
            return Promise.resolve(meta);
        },

        remove: function (id) {
            var index = getIndex();
            var meta = index.filter(function (m) { return m.id === id; })[0];
            saveIndex(index.filter(function (m) { return m.id !== id; }));
            if (!meta) return Promise.resolve();
            // builtin: el blob vive en el bundle, solo limpiar la carátula guardada
            var pend = meta.builtin
                ? (isNative() ? IO.nativeDelete(DIR + '/art_' + id + '.jpg') : IO.idbDel(id + '_art'))
                : (isNative()
                    ? Promise.all([IO.nativeDelete(meta.path), IO.nativeDelete(DIR + '/art_' + id + '.jpg')])
                    : Promise.all([IO.idbDel(id), IO.idbDel(id + '_art')]));
            return pend.then(function () {});
        },

        // Sobrescribe el blob de un archivo existente (p. ej. re-editar una
        // imagen ya editada) sin crear un item nuevo
        replaceData: function (id, file) {
            var index = getIndex();
            var meta = findMeta(index, id);
            if (!meta) return Promise.resolve(null);
            function apply() {
                meta.name = file.name || meta.name;
                meta.mime = file.type || meta.mime;
                meta.size = file.size || meta.size;
                meta.builtin = null; // el dato ahora vive en el store, no en el bundle
                saveIndex(index);
                return meta;
            }
            if (isNative()) {
                var old = meta.path;
                return IO.nativeWrite(id, file).then(function (p) {
                    meta.path = p;
                    apply();
                    return IO.nativeDelete(old).then(function () { return meta; });
                });
            }
            return IO.idbPut(id, file).then(apply);
        },

        // Metadatos (título, artista, álbum, carátula remota, etc.)
        updateInfo: function (id, patch) {
            var index = getIndex();
            var meta = index.filter(function (m) { return m.id === id; })[0];
            if (!meta) return Promise.resolve(null);
            meta.info = meta.info || {};
            Object.keys(patch || {}).forEach(function (k) { meta.info[k] = patch[k]; });
            saveIndex(index);
            return Promise.resolve(meta);
        },

        // Guarda una carátula local para el archivo (blob imagen)
        saveArtwork: function (id, blob) {
            var self = this;
            var persist = isNative()
                ? IO.nativeWriteArt(id, blob).then(function (p) { return self.updateInfo(id, { artPath: p, hasArt: true }); })
                : IO.idbPut(id + '_art', blob).then(function () { return self.updateInfo(id, { hasArt: true }); });
            return persist.then(function (meta) { return meta || true; });
        },

        // URL de la carátula (local o remota), null si no hay
        getArtURL: function (meta) {
            if (!meta || !meta.info) return Promise.resolve(null);
            if (meta.info.hasArt) {
                if (isNative()) return IO.nativeURL(meta.info.artPath);
                return IO.idbGet(meta.id + '_art').then(function (b) {
                    return b ? URL.createObjectURL(b) : null;
                });
            }
            return Promise.resolve(meta.info.artUrl || null);
        },

        // -------------------- Colecciones y favoritos --------------------
        listCollections: function () {
            return getCols();
        },

        createCollection: function (name) {
            var c = {
                id: 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
                name: String(name || 'Colección').trim(),
                createdAt: Date.now()
            };
            var cols = getCols();
            cols.push(c);
            saveCols(cols);
            return Promise.resolve(c);
        },

        renameCollection: function (id, name) {
            var cols = getCols();
            var c = cols.filter(function (x) { return x.id === id; })[0];
            if (!c) return Promise.resolve(null);
            pushUndo({ type: 'rename-col', id: id, before: c.name });
            c.name = String(name || '').trim() || c.name;
            saveCols(cols);
            return Promise.resolve(c);
        },

        deleteCollection: function (id) {
            var cols = getCols();
            var col = cols.filter(function (x) { return x.id === id; })[0];
            var memberIds = getIndex()
                .filter(function (m) { return m.cols && m.cols.indexOf(id) >= 0; })
                .map(function (m) { return m.id; });
            if (col) pushUndo({ type: 'delete-col', col: col, memberIds: memberIds });
            saveCols(cols.filter(function (x) { return x.id !== id; }));
            var index = getIndex();
            index.forEach(function (m) {
                if (m.cols) m.cols = m.cols.filter(function (x) { return x !== id; });
            });
            saveIndex(index);
            return Promise.resolve();
        },

        // Marca / desmarca un archivo dentro de una colección
        toggleInCollection: function (id, colId) {
            var index = getIndex();
            var meta = findMeta(index, id);
            if (!meta) return Promise.resolve(null);
            meta.cols = meta.cols || [];
            var i = meta.cols.indexOf(colId);
            if (i >= 0) meta.cols.splice(i, 1); else meta.cols.push(colId);
            saveIndex(index);
            return Promise.resolve(meta);
        },

        toggleFavorite: function (id) {
            var index = getIndex();
            var meta = findMeta(index, id);
            if (!meta) return Promise.resolve(null);
            meta.fav = !meta.fav;
            saveIndex(index);
            return Promise.resolve(meta);
        },

        getURL: function (meta) {
            // builtin: servir el asset empaquetado (mismo origen en web y APK)
            if (meta && meta.builtin) {
                return Promise.resolve(
                    meta.builtin.split('/').map(encodeURIComponent).join('/')
                );
            }
            if (isNative()) {
                return IO.nativeURL(meta.path);
            }
            return IO.idbGet(meta.id).then(function (blob) {
                return blob ? URL.createObjectURL(blob) : null;
            });
        },

        // consumo interno de media/store-extra.js
        _index: getIndex
    };
})();
