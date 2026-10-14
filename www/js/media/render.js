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
        return window.MediaStore.list().then(function (list) {
            S.items = list;
            S.render();
        });
    };

    // ------------------------------------------------------ vista de lista --
    // Compacta: una fila por archivo (play, nombre, duración, ⋮). Persiste en
    // localStorage; pensada para música/videos — otros tipos salen con su
    // icono de tipo en vez del botón de play.
    try { S.listMode = localStorage.getItem('tribu_listmode') === '1'; }
    catch (e) { S.listMode = false; }
    var durProbe = {};

    function syncListBtn() {
        var b = $('view-switch');
        if (!b) return;
        b.classList.toggle('on', !!S.listMode);
        b.setAttribute('aria-pressed', S.listMode ? 'true' : 'false');
    }

    // sondeo perezoso de duración: se lee el metadata del medio una vez y
    // queda guardada en info.dur para no repetirla
    function probeDur(m, el) {
        if (durProbe[m.id]) return;
        durProbe[m.id] = 1;
        S.urlFor(m, function (u) {
            if (!u || !el.isConnected) return;
            var v = document.createElement(
                m.kind === 'video' ? 'video' : 'audio');
            v.preload = 'metadata';
            v.src = u;
            var done = function () { v.removeAttribute('src'); v.load(); };
            v.addEventListener('loadedmetadata', function () {
                var d = Math.round(v.duration || 0);
                done();
                // duración no finita (webm/opus sin header) → decodificar
                if (!isFinite(d) || d <= 0) return deepDur(m, el);
                if (el.isConnected) el.textContent = S.fmtTime(d);
                window.MediaStore.updateInfo(m.id, { dur: d }).then(function () {
                    m.info = m.info || {}; m.info.dur = d;
                });
            });
            v.addEventListener('error', done);
        });
    }
    // fallback: el contenedor no trae duración → decodificar el audio entero
    // una sola vez (AudioBuffer.duration siempre es exacta)
    function deepDur(m, el) {
        if (!window.TribalVDSP) return;
        S.urlFor(m, function (u) {
            if (!u) return;
            fetch(u).then(function (r) { return r.blob(); })
                .then(window.TribalVDSP.decode)
                .then(function (buf) {
                    var d = Math.round(buf.duration || 0);
                    if (!d) return;
                    if (el.isConnected) el.textContent = S.fmtTime(d);
                    window.MediaStore.updateInfo(m.id, { dur: d })
                        .then(function () {
                            m.info = m.info || {}; m.info.dur = d;
                        });
                }).catch(function () {});
        });
    }

    // sondeo solo cuando la fila se asoma al scroll (la lista puede ser larga)
    var durIO = ('IntersectionObserver' in window)
        ? new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (!en.isIntersecting) return;
                durIO.unobserve(en.target);
                var meta = S.byId(en.target.dataset.dur);
                if (meta && !(meta.info && isFinite(meta.info.dur) &&
                              meta.info.dur > 0)) probeDur(meta, en.target);
            });
        }, { root: S.gridWrap, rootMargin: '300px' })
        : null;

    // iconos play/pause de las filas según el audio actual
    function syncRowPlay() {
        S.grid.querySelectorAll('.tr-row-play').forEach(function (b) {
            var on = S.audio.dataset.current === b.dataset.play &&
                     !S.audio.paused;
            b.classList.toggle('playing', on);
            var i = b.querySelector('i');
            if (i) i.className = 'bi ' + (on ? 'bi-pause-fill' : 'bi-play-fill');
        });
    }
    S.audio.addEventListener('play', syncRowPlay);
    S.audio.addEventListener('pause', syncRowPlay);

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
        syncListBtn();

        var list = S.filteredSorted();
        S.grid.innerHTML = '';
        S.empty.classList.toggle('d-none', list.length > 0);
        S.gridWrap.classList.toggle('d-none', list.length === 0);

        // secciones por tipo: búsqueda global · «Todo» (orden elegido en el
        // botón junto al trigger) · «Música» (grabaciones aparte al final)
        var SEC = window.TribalSections;
        var grpOf = SEC ? SEC.grpOf : function (m) { return m.kind; };
        var sec = SEC ? SEC.apply(list, S) : { list: list, secs: null };
        list = sec.list;
        var secOrder = sec.secs;

        // vista de lista: todo en una sola página — sin paginación
        var listView = !!S.listMode;
        S.grid.classList.toggle('list-mode', listView);

        // paginación: 30 archivos por página (solo vista de tarjetas)
        var PAGE = 30;
        S.page = S.page || 0;
        var totalPages = listView ? 1 : Math.max(1, Math.ceil(list.length / PAGE));
        S.totalPages = totalPages;
        if (S.page >= totalPages) S.page = totalPages - 1;
        var pager = $('media-pager');
        pager.hidden = totalPages < 2;
        $('pager-info').textContent =
            'Pág ' + (S.page + 1) + '/' + totalPages + ' · ' + list.length + ' archivo(s)';
        $('pager-prev').disabled = S.page === 0;
        $('pager-next').disabled = S.page >= totalPages - 1;
        var pageList = listView ? list
            : list.slice(S.page * PAGE, S.page * PAGE + PAGE);

        var lastKind = null;
        pageList.forEach(function (m, i) {
            // separador centrado con hr al cambiar de sección
            if (secOrder) {
                var gk = grpOf(m);
                if (gk !== lastKind) {
                    lastKind = gk;
                    var sep = document.createElement('div');
                    sep.className = 'tribal-kind-sep';
                    sep.innerHTML = '<i></i><span>' +
                        (SEC ? SEC.label(gk) : 'Archivos') + '</span><i></i>';
                    S.grid.appendChild(sep);
                }
            }

            // ---------- fila compacta (vista de lista) ----------
            if (listView) {
                var row = document.createElement('div');
                row.className = 'tribal-row' +
                    (S.msMode && S.msSel && S.msSel[m.id] ? ' ms-on' : '');
                row.dataset.id = m.id;
                var msCkR = S.msMode
                    ? '<i class="ms-check bi ' +
                      (S.msSel && S.msSel[m.id] ? 'bi-check-square-fill'
                                                : 'bi-square') + '"></i>' : '';
                var isAV = m.kind === 'audio' || m.kind === 'video';
                var left = isAV
                    ? '<button class="tr-row-play" data-play="' + m.id + '"' +
                      ' title="Reproducir"><i class="bi bi-play-fill"></i></button>'
                    : '<span class="tr-row-kind"><i class="bi ' +
                      S.KIND_ICON[m.kind] + '"></i></span>';
                var side = isAV
                    ? '<span class="tr-row-dur" data-dur="' + m.id + '">' +
                      ((m.info && isFinite(m.info.dur) && m.info.dur)
                        ? S.fmtTime(m.info.dur) : '—') +
                      '</span>'
                    : '<span class="tr-row-dur">' + S.fmtSize(m.size) + '</span>';
                row.innerHTML =
                    msCkR + left +
                    '<span class="tr-row-name">' +
                        S.esc((m.info && m.info.titulo) || m.name) + '</span>' +
                    (m.fav ? '<i class="bi bi-heart-fill tr-row-fav"></i>' : '') +
                    side +
                    '<button class="tr-row-menu" data-menu="' + m.id + '"' +
                        ' aria-label="Opciones">' +
                        '<i class="bi bi-three-dots-vertical"></i></button>';
                S.grid.appendChild(row);
                return; // siguiente item
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

        // duraciones diferidas en vista de lista (solo audio/video)
        if (listView) {
            if (durIO) durIO.disconnect();
            S.grid.querySelectorAll('[data-dur]').forEach(function (el) {
                var meta = S.byId(el.dataset.dur);
                if (!meta || (meta.info && meta.info.dur)) return;
                if (durIO) durIO.observe(el); else probeDur(meta, el);
            });
            syncRowPlay();
        }

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

    // ---------------------------------------------------- barra de subida --
    var upBar = $('upload-prog'), upFill = $('upload-prog-fill'),
        upPct = $('upload-prog-pct'), upLbl = $('upload-prog-label');

    // done = archivos ya terminados, frac = 0..1 del archivo actual
    S.uploadProgress = function (done, total, frac, name) {
        if (!upBar) return;
        var pct = Math.round(((done + (frac || 0)) / total) * 100);
        upBar.hidden = false;
        upLbl.textContent = 'Subiendo ' + Math.min(done + 1, total) + '/' +
            total + (name ? ' · ' + String(name).slice(0, 26) : '');
        upFill.style.width = pct + '%';
        upPct.textContent = pct + '%';
    };
    S.uploadDone = function () {
        if (upBar) upBar.hidden = true;
    };

    // ------------------------------------------------------------------ upload
    // (el FAB lo controla fabdir.js: óvalo archivo/carpeta)
    S.input.addEventListener('change', function () {
        var files = Array.prototype.slice.call(S.input.files || []);
        S.input.value = '';
        if (!files.length) return;

        S.showToast('Encendiendo ' + files.length + ' archivo(s)…');
        S.uploadProgress(0, files.length, 0, files[0].name);
        var chain = Promise.resolve();
        var ok = 0, lastErr = null, done = 0;
        files.forEach(function (f) {
            chain = chain.then(function () {
                S.uploadProgress(done, files.length, 0, f.name);
                // anti-duplicados: mismo nombre → doble confirm + «-2, -3…»
                return window.TribalDup.guard(f, S).then(function (f2) {
                    if (!f2) { done++; return; }   // usuario canceló
                    return window.MediaStore.add(f2, null, function (fr) {
                        S.uploadProgress(done, files.length, fr, f2.name);
                    }).then(function () { ok++; done++; });
                });
            }).catch(function (e) { lastErr = e; done++; });
        });
        chain.then(function () {
            S.uploadDone();
            var msg = ok + ' archivo(s) guardados en la tribu';
            if (ok < files.length && lastErr) {
                var e = lastErr;
                msg += ' · error: ' + ((e && (e.message || e.code)) || String(e)).slice(0, 80);
            }
            S.showToast(msg);
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

    // trigger vista tarjetas/lista (perilla deslizante bajo la línea naranja)
    $('view-switch').addEventListener('click', function () {
        S.listMode = !S.listMode;
        try { localStorage.setItem('tribu_listmode', S.listMode ? '1' : '0'); }
        catch (e2) {}
        syncListBtn();
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
