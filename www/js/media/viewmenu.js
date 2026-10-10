// ============================================================================
// ARCHIVO: media/viewmenu.js
// RESPONSABILIDAD: menú ⋮ general de la fila de filtros.
//   - Estadísticas (conteo, espacio, ubicación y ruta de cada archivo)
//   - Slideshow de fotos (media-slideshow.js)
//   - Nueva colección · Deshacer último cambio (nombres/colecciones)
//   - P2P Torrents (media/p2p*.js) · Lector de libros (media/reader.js)
// ============================================================================
window.Sono.register('viewmenu', function (S) {
    'use strict';
    var $ = S.$;
    var viewMenu = $('view-menu'), statsOv = $('stats-overlay'), statsRows = $('stats-rows');
    var audio = S.audio, videoEl = S.videoEl, videoOv = S.videoOv;

    // deps comunes para overlays externos (lector, p2p)
    S.extDeps = function () {
        return {
            mount: S.root, urlFor: S.urlFor, store: window.MediaStore,
            toast: S.showToast, confirm: S.confirm, playP2P: S.playP2P,
            play: S.playAudio, audio: S.audio,
            onDeleted: S.reload, items: S.items
        };
    };

    // abrir un libro con el lector (pdf/txt/epub)
    S.openReader = function (m) {
        if (window.TribalReader) TribalReader.open(m, S.extDeps());
        else S.showToast('Lector no disponible');
    };

    // P2P torrents
    $('vm-p2p').addEventListener('click', function () {
        viewMenu.hidden = true;
        if (window.TribalP2PUI) TribalP2PUI.open(S.extDeps());
        else S.showToast('Módulo P2P no disponible');
    });

    // libretilla de enlaces
    $('vm-links').addEventListener('click', function () {
        viewMenu.hidden = true;
        if (window.TribalLinks) TribalLinks.open(S.extDeps());
        else S.showToast('Libretilla no disponible');
    });

    $('view-more').addEventListener('click', function (e) {
        e.stopPropagation();
        viewMenu.hidden = !viewMenu.hidden;
        if (viewMenu.hidden) return;
        var rw = S.root.getBoundingClientRect();
        var ar = e.currentTarget.getBoundingClientRect();
        viewMenu.style.top = (ar.bottom - rw.top + 6) + 'px';
        viewMenu.style.left = Math.max(8, ar.right - rw.left - viewMenu.offsetWidth) + 'px';
    });
    document.addEventListener('click', function (e) {
        if (!viewMenu.hidden && !viewMenu.contains(e.target) &&
            e.target.id !== 'view-more' && !e.target.closest('#view-more')) {
            viewMenu.hidden = true;
        }
    });

    $('vm-newcol').addEventListener('click', function () {
        viewMenu.hidden = true;
        S.openNewCol('create');
    });

    // deshacer: último rename de archivo/colección o colección eliminada
    $('vm-undo').addEventListener('click', function () {
        viewMenu.hidden = true;
        if (!window.MediaStore.canUndo || !window.MediaStore.canUndo()) {
            return S.showToast('Nada que deshacer');
        }
        window.MediaStore.undo().then(function () {
            S.showToast('Cambio revertido');
            S.reload();
        });
    });

    $('vm-slide').addEventListener('click', function () {
        viewMenu.hidden = true;
        window.TribalSlide.open({
            mount: S.root,
            images: S.items.filter(function (m) { return m.kind === 'image'; }),
            audios: S.items.filter(function (m) { return m.kind === 'audio'; }),
            urlFor: S.urlFor,
            store: window.MediaStore,
            toast: S.showToast,
            onBeforeStart: function () {
                // el slideshow con música tiene prioridad sobre el player
                audio.pause();
                if (!videoOv.hidden) S.closeVideo(); else videoEl.pause();
            }
        });
    });

    $('vm-stats').addEventListener('click', function () {
        viewMenu.hidden = true;
        var n = { audio: 0, video: 0, image: 0, other: 0 }, size = 0, favs = 0;
        S.items.forEach(function (m) {
            n[m.kind] = (n[m.kind] || 0) + 1;
            size += m.size || 0;
            if (m.fav) favs++;
        });
        var cols = window.MediaStore.listCollections().length;
        var rowHtml = function (k, v) {
            return '<div class="tmeta-row"><span>' + S.esc(k) + '</span><b>' + S.esc(v) + '</b></div>';
        };
        statsRows.innerHTML =
            rowHtml('Música', n.audio) + rowHtml('Videos', n.video) +
            rowHtml('Fotos', n.image) + (n.other ? rowHtml('Otros', n.other) : '') +
            rowHtml('Favoritos', favs) + rowHtml('Colecciones', cols) +
            rowHtml('Espacio usado', S.fmtSize(size));
        window.MediaStore.storageInfo().then(function (si) {
            statsRows.innerHTML +=
                rowHtml('Almacenamiento', si.mode) +
                rowHtml('Ubicación', si.base) +
                '<div class="stats-files">' +
                    si.files.map(function (f) {
                        return '<p><b>' + S.esc(f.name) + '</b><span>' +
                            S.esc(f.path) + ' · ' + S.fmtSize(f.size) + '</span></p>';
                    }).join('') +
                '</div>';
        });
        statsOv.hidden = false;
    });
    $('stats-ok').addEventListener('click', function () { statsOv.hidden = true; });
    statsOv.addEventListener('click', function (e) {
        if (e.target === statsOv) statsOv.hidden = true;
    });

    // rehidratar la cola P2P al arrancar: los torrents sobreviven a cierres,
    // crashes y apagados (localStorage tribu_p2p). Los pausados quedan pausados.
    if (window.TribalP2P) {
        TribalP2P.bind(window.MediaStore, S.showToast);
        setTimeout(function () {
            try {
                var saved = JSON.parse(localStorage.getItem('tribu_p2p') || '{}');
                if (saved.jobs && saved.jobs.length) TribalP2P.restore();
            } catch (e) {}
        }, 1500);
        // abrir enlaces magnet: lanzados desde otra app/navegador
        var P = window.Capacitor && window.Capacitor.Plugins;
        if (P && P.App && P.App.addListener) {
            P.App.addListener('appUrlOpen', function (e) {
                if (e && e.url && e.url.indexOf('magnet:') === 0) {
                    if (TribalP2P.add(e.url)) S.showToast('Magnet añadido — descargando');
                }
            });
        }
    }
});
