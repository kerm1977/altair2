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
    var viewMenu = $('view-menu'), statsOv = $('stats-overlay');
    var audio = S.audio, videoEl = S.videoEl, videoOv = S.videoOv;

    // deps comunes para overlays externos (lector, p2p)
    S.extDeps = function () {
        return {
            mount: S.root, urlFor: S.urlFor, store: window.MediaStore,
            toast: S.showToast, confirm: S.confirm, playP2P: S.playP2P,
            play: S.playAudio, audio: S.audio, reload: S.reload,
            onDeleted: S.reload, get items() { return S.items; }, sono: S
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

    // Comprimir archivos a ZIP (media/zip*.js) → colección «mis comprimidos»
    $('vm-zip').addEventListener('click', function () {
        viewMenu.hidden = true;
        if (window.TribalZipUI) TribalZipUI.open(S.extDeps());
        else S.showToast('Compresor no disponible');
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

    // ---------------------------------------------------- estadísticas ----
    // Página completa: tarjetas FUNCIONALES (toca Música → vas a la música),
    // almacenamiento legible y lista de archivos colapsable con filas limpias.
    var STAT_ICO = { audio: 'bi-music-note-beamed',
                     grab: 'bi-mic-fill', video: 'bi-camera-video-fill',
                     image: 'bi-image-fill', doc: 'bi-book-half',
                     other: 'bi-file-earmark' };

    // aterrizar en un tab de la barra: click + centrarlo horizontalmente
    function goTab(id, extra) {
        statsOv.hidden = true;
        var t = $(id);
        if (!t) return;
        t.click();
        try {
            t.scrollIntoView({ block: 'nearest', inline: 'center' });
        } catch (e) { t.scrollIntoView(false); }
        if (extra === 'grab') {
            var s = S.grid.querySelector(
                '.tribal-kind-sep[data-grp="grab"]');
            if (s) s.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
    }
    // filtros sin tab propio (documentos, otros): misma lógica que vm-doc
    function goFilter(kind) {
        statsOv.hidden = true;
        S.tabs.querySelectorAll('.tribal-tab').forEach(function (b) {
            b.classList.remove('active');
        });
        S.viewMode = 'items'; S.activeCol = null;
        S.filter = kind; S.page = 0; S.render();
    }
    function goFavs() {
        statsOv.hidden = true;
        S.tabs.querySelectorAll('.tribal-tab').forEach(function (b) {
            b.classList.remove('active');
        });
        S.viewMode = 'col'; S.activeCol = 'fav'; S.page = 0; S.render();
    }

    $('vm-stats').addEventListener('click', function () {
        viewMenu.hidden = true;
        var n = {}, sz = {}, total = 0, favs = 0;
        S.items.forEach(function (m) {
            var g = window.TribalSections ? window.TribalSections.grpOf(m)
                                          : m.kind;
            n[g] = (n[g] || 0) + 1;
            sz[g] = (sz[g] || 0) + (m.size || 0);
            total += m.size || 0;
            if (m.fav) favs++;
        });
        var cols = window.MediaStore.listCollections().length;
        // [grupo|null, ícono, etiqueta, destino, valor, subtexto]
        var CARDS = [
            ['audio', 'bi-music-note-beamed', 'Música',      'go:tab-audio',      n.audio || 0, sz.audio],
            ['grab',  'bi-mic-fill',          'Grabaciones', 'go:tab-audio+grab', n.grab || 0,  sz.grab],
            ['video', 'bi-camera-video-fill', 'Videos',      'go:tab-video',      n.video || 0, sz.video],
            ['image', 'bi-image-fill',        'Imágenes',    'go:tab-image',      n.image || 0, sz.image],
            ['doc',   'bi-book-half',         'Documentos',  'f:doc',             n.doc || 0,   sz.doc],
            ['other', 'bi-file-earmark',      'Otros',       'f:other',           n.other || 0, sz.other],
            [null,    'bi-heart-fill',        'Favoritos',   'fav',               favs,         0],
            [null,    'bi-collection-fill',   'Colecciones', 'go:tab-cols',       cols,         0],
            [null,    'bi-hdd-fill',          'Espacio',     'to:store',          S.fmtSize(total), 0]
        ];
        $('stats-cards').innerHTML = CARDS.map(function (c) {
            return '<button class="stats-card' +
                (!c[4] && c[4] !== '0 B' ? ' stats-zero' : '') +
                '" data-go="' + c[3] + '">' +
                '<i class="bi ' + c[1] + '"></i><b>' + c[4] + '</b>' +
                '<span>' + c[2] + '</span>' +
                (c[5] ? '<em>' + S.fmtSize(c[5]) + '</em>' : '') +
                '</button>';
        }).join('');

        var filesBox = $('stats-files'), storeBox = $('stats-store');
        storeBox.innerHTML = filesBox.innerHTML =
            '<p class="stats-loading">Leyendo almacenamiento…</p>';
        window.MediaStore.storageInfo().then(function (si) {
            var native = /Dispositivo/.test(si.mode);
            storeBox.innerHTML =
                '<div class="stats-storecard">' +
                    '<i class="bi ' + (native ? 'bi-phone-fill' : 'bi-globe2') +
                    '"></i><div class="stats-storeinfo"><b>' +
                    (native ? 'Teléfono' : 'Navegador') + '</b><span>' +
                    (native ? 'Carpeta privada de la app'
                            : 'Base interna del navegador') + '</span>' +
                    '<span class="stats-base">' + S.esc(si.base) + '</span>' +
                    '</div><b class="stats-totalsize">' +
                    S.fmtSize(total) + '</b></div>';
            $('stats-fcount').textContent =
                si.files.length + ' archivo(s)';
            statsAll = si.files; fq = ''; fpage = 0;
            var fqIn = $('stats-fq');
            if (fqIn) fqIn.value = '';
            renderStatsFiles();
        });
        statsOv.hidden = false;
    });

    // tocar una tarjeta ejecuta su destino (ver goTab/goFilter/goFavs)
    $('stats-cards').addEventListener('click', function (e) {
        var b = e.target.closest('[data-go]');
        if (!b) return;
        var go = b.dataset.go;
        if (go === 'to:store') {
            var st = $('stats-store');
            if (st) st.scrollIntoView({ block: 'start', behavior: 'smooth' });
            return;
        }
        if (go === 'fav') return goFavs();
        if (go.indexOf('f:') === 0) return goFilter(go.slice(2));
        var parts = go.slice(3).split('+');        // go:tab-audio[+grab]
        goTab(parts[0], parts[1]);
    });

    // --- lista de archivos del panel: agrupada por tipo, buscador en
    // vivo y paginación de 20 — nunca se amontona ---
    var statsAll = [], fq = '', fpage = 0, FPER = 20;
    var SGRP_ORD = ['audio', 'grab', 'video', 'image', 'doc', 'other'];
    var SGRP_LBL = { audio: 'Música', grab: 'Mis grabaciones',
                     video: 'Videos', image: 'Imágenes',
                     doc: 'Documentos', other: 'Otros' };
    function fileGrp(f) {
        return f.kind === 'audio' &&
               (f.vn || /^mi grabaci/i.test(f.name || ''))
            ? 'grab' : (f.kind || 'other');
    }
    function renderStatsFiles() {
        var box = $('stats-files'), pager = $('stats-fpager');
        var q = fq.trim().toLowerCase();
        var list = statsAll.filter(function (f) {
            return !q || (String(f.name) + ' ' + (f.path || ''))
                .toLowerCase().indexOf(q) >= 0;
        });
        list.sort(function (a, b) {
            var ga = SGRP_ORD.indexOf(fileGrp(a)),
                gb = SGRP_ORD.indexOf(fileGrp(b));
            if (ga !== gb) return ga - gb;
            return String(a.name).localeCompare(String(b.name), 'es',
                                                { sensitivity: 'base' });
        });
        var pages = Math.max(1, Math.ceil(list.length / FPER));
        if (fpage >= pages) fpage = pages - 1;
        if (fpage < 0) fpage = 0;
        var slice = list.slice(fpage * FPER, fpage * FPER + FPER);
        pager.hidden = list.length <= FPER;
        $('stats-fpage').textContent = (fpage + 1) + ' / ' + pages;
        var html = '', last = null;
        slice.forEach(function (f) {
            var g = fileGrp(f);
            if (g !== last) {
                html += '<div class="stats-fgrp">' + SGRP_LBL[g] + '</div>';
                last = g;
            }
            var builtin = /^builtin\//.test(f.path || '');
            html += '<div class="stats-file"><i class="bi ' +
                (STAT_ICO[g] || 'bi-file-earmark') + '"></i>' +
                '<div class="stats-finfo"><b>' + S.esc(f.name) +
                (builtin ? ' <span class="stats-btag">incluida</span>'
                         : '') +
                '</b><span>' + S.esc(f.path) + '</span></div>' +
                '<em>' + S.fmtSize(f.size) + '</em></div>';
        });
        box.innerHTML = html ||
            '<p class="stats-loading">' +
            (q ? 'Nada coincide con «' + S.esc(fq) + '»'
               : 'Aún no hay archivos') + '</p>';
    }
    $('stats-fq').addEventListener('input', function (e) {
        fq = e.target.value || '';
        fpage = 0;
        renderStatsFiles();
    });
    $('stats-fprev').addEventListener('click', function () {
        if (fpage > 0) { fpage--; renderStatsFiles(); }
    });
    $('stats-fnext').addEventListener('click', function () {
        fpage++;
        renderStatsFiles();
    });
    // long-press (~450 ms) sobre un archivo revela/oculta su ruta exacta
    (function () {
        var box = $('stats-files');
        var t = null, x = 0, y = 0;
        box.addEventListener('pointerdown', function (e) {
            var r = e.target.closest('.stats-file');
            x = e.clientX; y = e.clientY;
            clearTimeout(t); t = null;
            if (!r) return;
            t = setTimeout(function () {
                r.classList.toggle('showpath');
            }, 450);
        });
        box.addEventListener('pointerup', function () {
            clearTimeout(t); t = null;
        });
        box.addEventListener('pointercancel', function () {
            clearTimeout(t); t = null;
        });
        box.addEventListener('pointermove', function (e) {
            if (t && (Math.abs(e.clientX - x) > 10 ||
                      Math.abs(e.clientY - y) > 10)) {
                clearTimeout(t); t = null;
            }
        });
        box.addEventListener('contextmenu', function (e) {
            if (e.target.closest('.stats-file')) e.preventDefault();
        });
    })();

    // «Archivos guardados» → panel emergente con fondo difuminado
    var statsFov = $('stats-fov');
    $('stats-fopen').addEventListener('click', function () {
        statsFov.hidden = false;
    });
    $('stats-fx').addEventListener('click', function () {
        statsFov.hidden = true;
    });
    statsFov.addEventListener('click', function (e) {
        if (e.target === statsFov) statsFov.hidden = true;
    });

    // «Volver» cierra la página y aterriza en «Todo» — centrado en la barra
    $('stats-back').addEventListener('click', function () {
        statsFov.hidden = true;
        goTab('tab-all');
    });
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
