// ============================================================================
// ARCHIVO: media/cover.js
// RESPONSABILIDAD: carátulas de tarjetas de TRIBALs (música, videos, libros).
//   - Long-press (~550ms) sobre el centro de una tarjeta → selector de carátula
//   - Opciones: imagen de la tribu · buscar en internet (Open Library para
//     libros, iTunes para música/videos) · quitar carátula
//   - Guarda como 'art' del item via MediaStore.saveArtwork
//   API: TribalCover.attach(grid, S) / .open(meta, S)
// ============================================================================
window.TribalCover = (function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // blob de un archivo de la tribu (nativo: Filesystem; web: blob url)
    function b64toBlob(b64, mime) {
        var bin = atob(b64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Blob([bytes], { type: mime || 'image/jpeg' });
    }
    function blobOf(m, S) {
        if (window.MediaStore.isNative()) {
            // ref del escáner: ruta absoluta fuera del sandbox de la app —
            // readFile con URI file:// y, si el bridge no la acepta, por la
            // URL servida (convertFileSrc) igual que en web
            if (m.ref) {
                return window.SonoStoreIO.nativeReadAbs(m.path, m.mime)
                    .catch(function () {
                        return fetch(window.SonoStoreIO.nativeFileURL(m.path))
                            .then(function (r) {
                                if (!r.ok) throw new Error('http ' + r.status);
                                return r.blob();
                            });
                    });
            }
            var FS = window.Capacitor.Plugins.Filesystem;
            var dir = (FS.Directory && FS.Directory.Data) || 'DATA';
            return FS.readFile({ path: m.path, directory: dir })
                .then(function (r) { return b64toBlob(r.data, m.mime); });
        }
        return new Promise(function (res, rej) {
            S.urlFor(m, function (u) {
                if (!u) return rej(new Error('sin url'));
                fetch(u).then(function (r) { return r.blob(); }).then(res, rej);
            });
        });
    }
    // el store devuelve el meta ya parcheado; lo copio al objeto vivo
    function applyInfo(meta, m2, fallback) {
        if (m2 && m2.info) meta.info = m2.info;
        else if (fallback) { meta.info = meta.info || {}; fallback(meta.info); }
    }

    // ---- picker overlay ------------------------------------------------------
    function open(meta, S) {
        var ov = document.createElement('div');
        ov.className = 'tribal-overlay tribal-cover-ov';
        ov.innerHTML =
            '<div class="tribal-dialog tribal-cover-dlg">' +
                '<h4><i class="bi bi-image"></i> Carátula</h4>' +
                '<div class="tr-cover-search">' +
                    '<input id="tc-q" type="text" value="' +
                        esc(meta.name.replace(/\.[^.]+$/, '')) + '">' +
                    '<button class="tribal-btn tribal-btn-icon" id="tc-go">' +
                        '<i class="bi bi-search"></i></button></div>' +
                '<div class="tr-cover-grid" id="tc-grid"></div>' +
                '<p class="ie-hint">o una imagen de la tribu:</p>' +
                '<div class="tr-cover-grid" id="tc-lib"></div>' +
                '<div class="ie-row">' +
                    '<button class="tribal-btn tribal-btn-xs" id="tc-dev">' +
                        '<i class="bi bi-folder2-open"></i> Del dispositivo (GIF)</button>' +
                    '<button class="tribal-btn tribal-btn-xs tr-danger" id="tc-del">' +
                        '<i class="bi bi-trash3"></i> Quitar carátula</button>' +
                    '<button class="tribal-btn tribal-btn-xs" id="tc-close">Cerrar</button>' +
                '</div></div>';
        (S.root || document.body).appendChild(ov);
        var kill = function () { ov.remove(); };
        ov.querySelector('#tc-close').addEventListener('click', kill);
        ov.addEventListener('click', function (e) { if (e.target === ov) kill(); });
        // imagen o GIF animado elegido del dispositivo (media/coverdev.js)
        var dev = ov.querySelector('#tc-dev');
        if (dev) dev.addEventListener('click', function () {
            if (!window.TribalCoverDev) return S.showToast('Selector no disponible');
            window.TribalCoverDev.pick(function (f) {
                if (!f) return;
                window.MediaStore.saveArtwork(meta.id, f).then(function (m2) {
                    applyInfo(meta, m2);
                    S.showToast('Carátula puesta' +
                        (f.type === 'image/gif' ? ' (GIF animado)' : ''));
                    kill();
                    S.render();
                }).catch(function () {
                    S.showToast('No se pudo usar ese archivo');
                });
            });
        });
        ov.querySelector('#tc-del').addEventListener('click', function () {
            S.confirm('Quitar carátula', '¿Quitar la carátula de «' +
                meta.name + '»?', 'Quitar', function () {
                window.MediaStore.updateInfo(meta.id, { hasArt: false, artUrl: '' })
                    .then(function (m2) {
                        applyInfo(meta, m2, function (i) {
                            i.hasArt = false; i.artUrl = '';
                        });
                        S.showToast('Carátula quitada');
                        kill();
                        S.render();
                    });
            });
        });
        // imágenes de la tribu como carátula
        var lib = ov.querySelector('#tc-lib');
        var imgs = (S.items || []).filter(function (m) { return m.kind === 'image'; });
        lib.innerHTML = imgs.length ? '' : '<p class="tribal-p2p-err">Sin fotos</p>';
        imgs.slice(0, 24).forEach(function (m) {
            var el = document.createElement('img');
            el.className = 'tr-cover-pick';
            el.dataset.libid = m.id;
            S.urlFor(m, function (u) { if (u) el.src = u; });
            lib.appendChild(el);
        });
        lib.addEventListener('click', function (e) {
            var im = e.target.closest('[data-libid]');
            if (!im) return;
            var m = S.byId(im.dataset.libid);
            if (!m) return;
            blobOf(m, S).then(function (b) {
                return window.MediaStore.saveArtwork(meta.id, b);
            }).then(function (m2) {
                applyInfo(meta, m2);
                S.showToast('Carátula puesta');
                kill();
                S.render();
            }).catch(function () {
                S.showToast('No se pudo usar esa imagen');
            });
        });
        // búsqueda online: Open Library (libros) / iTunes (música y video)
        var grid = ov.querySelector('#tc-grid');
        function putImg(url) {
            fetch(url).then(function (r) { return r.blob(); })
                .then(function (b) {
                    return window.MediaStore.saveArtwork(meta.id, b);
                }).then(function (m2) {
                    applyInfo(meta, m2);
                    S.showToast('Carátula descargada');
                    kill();
                    S.render();
                }).catch(function () { S.showToast('No se pudo descargar'); });
        }
        function doSearch() {
            var q = ov.querySelector('#tc-q').value.trim();
            if (!q) return;
            grid.innerHTML = '<p class="tribal-p2p-err">Buscando…</p>';
            if (meta.kind === 'doc') {
                fetch('https://openlibrary.org/search.json?title=' +
                      encodeURIComponent(q) + '&limit=8&fields=cover_i,title')
                    .then(function (r) { return r.json(); })
                    .then(function (d) {
                        var docs = (d.docs || []).filter(function (x) { return x.cover_i; });
                        grid.innerHTML = docs.length ? docs.map(function (x) {
                            return '<img class="tr-cover-pick" loading="lazy" src="' +
                                'https://covers.openlibrary.org/b/id/' + x.cover_i +
                                '-M.jpg" data-cov="https://covers.openlibrary.org/b/id/' +
                                x.cover_i + '-L.jpg">';
                        }).join('') : '<p class="tribal-p2p-err">Sin portadas</p>';
                    }).catch(function () {
                        grid.innerHTML = '<p class="tribal-p2p-err">Sin conexión</p>';
                    });
            } else {
                fetch('https://itunes.apple.com/search?term=' +
                      encodeURIComponent(q) + '&entity=album&limit=12')
                    .then(function (r) { return r.json(); })
                    .then(function (d) {
                        var rs = (d.results || []).filter(function (x) {
                            return x.artworkUrl100;
                        });
                        grid.innerHTML = rs.length ? rs.map(function (x) {
                            var big = x.artworkUrl100.replace('100x100', '600x600');
                            return '<img class="tr-cover-pick" loading="lazy" src="' +
                                x.artworkUrl100 + '" data-cov="' + big + '">';
                        }).join('') : '<p class="tribal-p2p-err">Sin portadas</p>';
                    }).catch(function () {
                        grid.innerHTML = '<p class="tribal-p2p-err">Sin conexión</p>';
                    });
            }
        }
        ov.querySelector('#tc-go').addEventListener('click', doSearch);
        ov.querySelector('#tc-q').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') doSearch();
        });
        grid.addEventListener('click', function (e) {
            var im = e.target.closest('[data-cov]');
            if (im) putImg(im.dataset.cov);
        });
        doSearch();
    }

    // ---- long-press sobre tarjetas -------------------------------------------
    function attach(grid, S) {
        var timer = null, sx = 0, sy = 0;
        grid.addEventListener('pointerdown', function (e) {
            var card = e.target.closest('.tribal-card, .tribal-row');
            if (!card) return;
            var m = S.byId(card.dataset.id);
            if (!m) return;
            // en modo selección: long-press → menú contextual de la selección
            // (carátula en lote) en vez del selector de carátula individual
            if (S.msMode) {
                sx = e.clientX; sy = e.clientY;
                timer = setTimeout(function () {
                    timer = null;
                    S._lpBlock = true;
                    if (S.msLongPress) S.msLongPress();
                }, 550);
                return;
            }
            // imágenes ya muestran la foto; el resto lleva carátula
            if (m.kind === 'image') return;
            sx = e.clientX; sy = e.clientY;
            timer = setTimeout(function () {
                timer = null;
                S._lpBlock = true;
                if (m.info && m.info.noteId && window.TribalNotepad &&
                    window.TribalNotepad.openContextMenuForNoteId) {
                    window.TribalNotepad.openContextMenuForNoteId(
                        m.info.noteId, S.extDeps ? S.extDeps() : { mount: S.root, store: window.MediaStore, toast: S.showToast, confirm: S.confirm, reload: S.reload, items: S.items });
                    return;
                }
                open(m, S);
            }, 550);
        });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
            grid.addEventListener(ev, function () {
                clearTimeout(timer);
                timer = null;
            });
        });
        grid.addEventListener('pointermove', function (e) {
            if (timer && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) {
                clearTimeout(timer);
                timer = null;
            }
        });
    }

    return { attach: attach, open: open };
})();
