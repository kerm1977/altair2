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
            play: S.playAudio, audio: S.audio, reload: S.reload,
            onDeleted: S.reload, items: S.items, sono: S
        };
    };

    // abrir un libro con el lector (pdf/txt/epub)
    S.openReader = function (m) {
        if (window.TribalReader) TribalReader.open(m, S.extDeps());
        else S.showToast('Lector no disponible');
    };

    // P2P: enganchar store+toast desde el registro — así los avisos
    // (añadido/descargado/error) funcionan aunque el panel no esté abierto
    if (window.TribalP2P) TribalP2P.bind(window.MediaStore, S.showToast);

    // Chat Bluetooth local (media/btchat*.js) — sobre Libros
    $('vm-btchat').addEventListener('click', function () {
        viewMenu.hidden = true;
        if (window.TribalBtChat) TribalBtChat.open(S.extDeps());
        else S.showToast('Chat Bluetooth no disponible');
    });

    // Libros: filtro que antes era un tab — ahora vive aquí, sobre P2P
    $('vm-doc').addEventListener('click', function () {
        viewMenu.hidden = true;
        S.tabs.querySelectorAll('.tribal-tab').forEach(function (b) {
            b.classList.remove('active');
        });
        S.viewMode = 'items';
        S.activeCol = null;
        S.filter = 'doc';
        S.page = 0;
        S.render();
    });

    // Notas de audio: grabador tipo podcast (media/vnotes*.js)
    $('vm-vnotes').addEventListener('click', function () {
        viewMenu.hidden = true;
        if (!window.TribalVNotes) return S.showToast('Notas no disponible');
        window.TribalVNotes.open(S.extDeps());
    });

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

    // solicitar permisos: diálogo nativo + pantalla de ajustes de la app
    $('vm-perms').addEventListener('click', function () {
        viewMenu.hidden = true;
        var C = window.Capacitor;
        var P = C && C.Plugins;
        if (!P) return S.showToast('Solo disponible en el APK');
        // 1) diálogo de permisos de medios (Android 13+)
        if (P.Filesystem && P.Filesystem.requestPermissions) {
            P.Filesystem.requestPermissions().catch(function () {});
        }
        // 1b) diálogo de permisos Bluetooth + notificaciones
        if (P.TribalBt && P.TribalBt.ensurePerms) {
            P.TribalBt.ensurePerms().catch(function () {});
        }
        // 2) abrir "Información de la app" para activar todo manualmente
        if (P.TribalNative && P.TribalNative.openAppSettings) {
            P.TribalNative.openAppSettings().catch(function () {});
        }
        S.showToast('Activa los permisos en Ajustes de TRIBALs');
    });

    // revocar permisos: abre Ajustes de la app (revocar es siempre manual)
    // y reinicia el registro → el próximo arranque pide todo otra vez
    $('vm-revoke').addEventListener('click', function () {
        viewMenu.hidden = true;
        var C = window.Capacitor;
        var P = C && C.Plugins;
        if (!P) return S.showToast('Solo disponible en el APK');
        if (P.TribalNative) {
            if (P.TribalNative.resetPermFlag)
                P.TribalNative.resetPermFlag().catch(function () {});
            P.TribalNative.openAppSettings().catch(function () {});
        }
        S.showToast('Desactiva ahí los permisos — TRIBALs los pedirá de nuevo al abrir');
    });

    // backdrop con blur: se sincroniza solo con el hidden del menú,
    // cierre quien lo cierre (view-more, sort, batch, tocar fuera)
    var vmBd = $('view-menu-bd');
    if (vmBd && window.MutationObserver) {
        new MutationObserver(function () { vmBd.hidden = viewMenu.hidden; })
            .observe(viewMenu, { attributes: true, attributeFilter: ['hidden'] });
        vmBd.addEventListener('click', function () { viewMenu.hidden = true; });
    }
    $('view-more').addEventListener('click', function (e) {
        e.stopPropagation();
        viewMenu.hidden = !viewMenu.hidden;
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
                    TribalP2P.add(e.url);
                }
            });
        }
    }
});
