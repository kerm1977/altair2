// ============================================================================
// ARCHIVO: media/render.js
// RESPONSABILIDAD: renderizado de la biblioteca (cuadrícula de tarjetas,
//   filtros por tipo/búsqueda/colección, thumbnails diferidas) + subida de
//   archivos (botón +) + limpieza de objectURLs al salir de la vista SPA.
// ============================================================================
window.Sono.register('render', function (S) {
    'use strict';
    var $ = S.$;

    S.filtered = function () {
        return S.items.filter(function (m) {
            if (m.info && m.info.isProxy) return false; // proxies: internos
            if (S.viewMode === 'col') {
                if (S.activeCol === 'fav') { if (!m.fav) return false; }
                else if (!m.cols || m.cols.indexOf(S.activeCol) === -1) return false;
            }
            // con búsqueda activa el buscador es GLOBAL: ignora el tab de tipo
            if (!S.query && S.filter !== 'all' && m.kind !== S.filter) return false;
            if (S.query && m.name.toLowerCase().indexOf(S.query) === -1) return false;
            return true;
        });
    };

    // lista filtrada + orden aplicado (S.sortList lo define media/sort.js)
    S.filteredSorted = function () {
        var list = S.filtered();
        return S.sortList ? S.sortList(list) : list;
    };

    S.collectionName = function (id) {
        var c = window.MediaStore.listCollections().filter(function (x) {
            return x.id === id;
        })[0];
        return c ? c.name : '';
    };

    S.byId = function (id) {
        for (var i = 0; i < S.items.length; i++) if (S.items[i].id === id) return S.items[i];
        return null;
    };

    // proxy de un video (vista previa fluida en 4K/pesados)
    S.findProxy = function (id) {
        return S.items.filter(function (x) {
            return x.info && x.info.proxyOf === id;
        })[0] || null;
    };

    S.reload = function () {
        window.MediaStore.list().then(function (list) {
            S.items = list;
            S.render();
        });
    };

    S.render = function () {
        if (S.viewMode === 'cols') { S.renderCollections(); return; }

        if (S.viewMode === 'col') {
            S.crumb.hidden = false;
            S.crumbName.textContent = S.activeCol === 'fav'
                ? 'Favoritos' : (S.collectionName(S.activeCol) || 'Colección');
        } else {
            S.crumb.hidden = true;
        }
        S.grid.classList.remove('tribal-grid-rows');

        var list = S.filteredSorted();
        S.grid.innerHTML = '';
        S.empty.classList.toggle('d-none', list.length > 0);
        S.gridWrap.classList.toggle('d-none', list.length === 0);

        // búsqueda global: agrupar por tipo (música, videos, fotos, libros…)
        if (S.query) {
            var order = ['audio', 'video', 'image', 'doc', 'other'];
            var grouped = [];
            order.forEach(function (k) {
                list.forEach(function (m) { if (m.kind === k) grouped.push(m); });
            });
            list = grouped;
        }

        // paginación: 30 archivos por página
        var PAGE = 30;
        S.page = S.page || 0;
        var totalPages = Math.max(1, Math.ceil(list.length / PAGE));
        S.totalPages = totalPages;
        if (S.page >= totalPages) S.page = totalPages - 1;
        var pager = $('media-pager');
        pager.hidden = totalPages < 2;
        $('pager-info').textContent =
            'Pág ' + (S.page + 1) + '/' + totalPages + ' · ' + list.length + ' archivo(s)';
        $('pager-prev').disabled = S.page === 0;
        $('pager-next').disabled = S.page >= totalPages - 1;
        var pageList = list.slice(S.page * PAGE, S.page * PAGE + PAGE);

        var KIND_PLURAL = { audio: 'Audios', video: 'Videos', image: 'Fotos',
                            doc: 'Libros', other: 'Archivos' };
        var lastKind = null;
        pageList.forEach(function (m, i) {
            // separador naranja al cambiar de tipo (solo en búsqueda global)
            if (S.query && m.kind !== lastKind) {
                lastKind = m.kind;
                var sep = document.createElement('div');
                sep.className = 'tribal-kind-sep';
                sep.innerHTML = '<i></i><span>' +
                    (KIND_PLURAL[m.kind] || 'Archivos') + '</span><i></i>';
                S.grid.appendChild(sep);
            }
            var card = document.createElement('div');
            card.className = 'tribal-card' +
                (S.msMode && S.msSel && S.msSel[m.id] ? ' ms-on' : '');
            card.style.animationDelay = Math.min(i * 30, 300) + 'ms';
            card.dataset.id = m.id;
            // checkbox de selección múltiple (solo en modo selección)
            var msCk = S.msMode
                ? '<i class="ms-check bi ' +
                  (S.msSel && S.msSel[m.id] ? 'bi-check-square-fill' : 'bi-square') +
                  '"></i>' : '';

            var playing = (m.kind === 'audio' && S.audio.dataset.current === m.id && !S.audio.paused)
                ? '<i class="bi bi-broadcast tribal-playing-badge"></i>' : '';
            if (m.fav) playing += '<i class="bi bi-heart-fill tribal-fav-badge"></i>';

            var art = m.info && (m.info.hasArt || m.info.artUrl);
            var inner;
            if (m.kind === 'doc') {
                // libro: tarjeta normal + portada extraída o guardada
                inner = '<div class="tribal-thumb"><img alt="" data-bookcover="' + m.id + '">' +
                    '<i class="bi ' + S.KIND_ICON[m.kind] + ' kind-icon"></i>' + playing + '</div>';
            } else if (m.kind === 'image' || art) {
                inner = '<div class="tribal-thumb"><img alt="" data-thumb="' + m.id + '" data-art="' + (art ? 1 : 0) + '">' + playing + '</div>';
            } else if (m.kind === 'video') {
                inner = '<div class="tribal-thumb" data-videothumb="' + m.id + '">' +
                        '<i class="bi bi-camera-video-fill kind-icon"></i>' + playing + '</div>';
            } else {
                inner = '<div class="tribal-thumb audio"><i class="bi ' + S.KIND_ICON[m.kind] + ' kind-icon"></i>' + playing + '</div>';
            }

            var metaTxt = ((m.info && m.info.artista) || '') +
                (m.info && m.info.artista ? ' · ' : '') + S.fmtSize(m.size);
            if (S.sortMode === 'col') {
                var cn = S.colNames(m);
                if (cn) metaTxt = cn + ' · ' + metaTxt;
            }
            card.innerHTML =
                msCk + inner +
                '<span class="tribal-kind-badge ' + m.kind + '">' + S.KIND_LABEL[m.kind] + '</span>' +
                '<div class="tribal-card-body">' +
                    '<div style="flex:1;min-width:0">' +
                        '<p class="tribal-card-name">' + S.esc(m.name) + '</p>' +
                        '<span class="tribal-card-meta">' + S.esc(metaTxt) + '</span>' +
                    '</div>' +
                    '<button class="tribal-card-menu" data-menu="' + m.id + '" aria-label="Opciones">' +
                        '<i class="bi bi-three-dots-vertical"></i>' +
                    '</button>' +
                '</div>';

            S.grid.appendChild(card);
        });

        // thumbnails diferidas
        S.grid.querySelectorAll('img[data-bookcover]').forEach(function (img) {
            var meta = S.byId(img.dataset.bookcover);
            if (!meta) return;
            if (window.TribalShelf) window.TribalShelf.coverFor(meta, img, S.urlFor);
        });
        S.grid.querySelectorAll('img[data-thumb]').forEach(function (img) {
            var meta = S.byId(img.dataset.thumb);
            if (!meta) return;
            if (img.dataset.art === '1') {
                window.MediaStore.getArtURL(meta).then(function (u) { if (u) img.src = u; });
            } else {
                S.urlFor(meta, function (u) { if (u) img.src = u; });
            }
        });
        S.grid.querySelectorAll('[data-videothumb]').forEach(function (el) {
            var meta = S.byId(el.dataset.videothumb);
            if (!meta) return;
            S.urlFor(meta, function (u) {
                if (!u) return;
                S.videoThumb(u, function (data) {
                    if (!data || !el.isConnected) return;
                    var img = document.createElement('img');
                    img.src = data; img.alt = '';
                    el.insertBefore(img, el.firstChild);
                    el.querySelector('.kind-icon').style.display = 'none';
                });
            });
        });
    };

    // ------------------------------------------------------------------ upload
    // (el FAB lo controla fabdir.js: óvalo archivo/carpeta)
    S.input.addEventListener('change', function () {
        var files = Array.prototype.slice.call(S.input.files || []);
        S.input.value = '';
        if (!files.length) return;

        S.showToast('Encendiendo ' + files.length + ' archivo(s)…');
        var chain = Promise.resolve();
        var ok = 0;
        files.forEach(function (f) {
            chain = chain.then(function () {
                return window.MediaStore.add(f).then(function () { ok++; });
            }).catch(function () {});
        });
        chain.then(function () {
            S.showToast(ok + ' archivo(s) guardados en la tribu');
            S.reload();
        });
    });

    // ------------------------------------------------------------------ ui
    S.tabs.addEventListener('click', function (e) {
        var btn = e.target.closest('.tribal-tab');
        if (!btn) return;
        S.tabs.querySelectorAll('.tribal-tab').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        if (btn.id === 'tab-cols') {
            S.viewMode = 'cols';
            S.activeCol = null;
        } else {
            S.viewMode = 'items';
            S.activeCol = null;
            S.filter = btn.dataset.filter;
        }
        S.page = 0;
        S.render();
    });
    S.search.addEventListener('input', function () {
        S.query = S.search.value.trim().toLowerCase();
        S.page = 0;
        // búsqueda global: salir de la vista de carpetas si estaba activa
        if (S.query && S.viewMode === 'cols') S.viewMode = 'items';
        S.render();
    });

    // paginación
    $('pager-prev').addEventListener('click', function () {
        if (S.page > 0) { S.page--; S.render(); }
    });
    $('pager-next').addEventListener('click', function () {
        S.page++; S.render();
    });

    // swipe horizontal sobre la cuadrícula = cambiar de página
    // (swipe ← siguiente · swipe → anterior), aplica a todos los filtros
    var swX = 0, swY = 0, swOn = false;
    S.grid.addEventListener('touchstart', function (e) {
        if (e.touches.length === 1) {
            swX = e.touches[0].clientX; swY = e.touches[0].clientY;
            swOn = true;
        }
    }, { passive: true });
    S.grid.addEventListener('touchend', function (e) {
        if (!swOn) return;
        swOn = false;
        var dx = e.changedTouches[0].clientX - swX;
        var dy = e.changedTouches[0].clientY - swY;
        if (Math.abs(dx) < 70 || Math.abs(dy) > 45) return;
        if (S.viewMode === 'cols') return;
        if (dx < 0 && S.page < (S.totalPages || 1) - 1) {
            S.page++; S.render();
        } else if (dx > 0 && S.page > 0) {
            S.page--; S.render();
        }
    }, { passive: true });

    // limpieza al salir de la vista dentro del SPA
    window.addEventListener('hashchange', function onLeave() {
        if (!document.getElementById('tribal-root')) {
            S.audio.pause();
            if (window.TribalSlide) window.TribalSlide.close();
            window.removeEventListener('hashchange', onLeave);
            Object.keys(S.urlCache).forEach(function (k) {
                try { URL.revokeObjectURL(S.urlCache[k]); } catch (e) {}
            });
            S.urlCache = {};
        }
    });
});
