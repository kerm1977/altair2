// ============================================================================
// ARCHIVO: media/filemgr.js
// RESPONSABILIDAD: administrador de archivos UNIVERSAL de TRIBALs.
//   - Navega el almacenamiento de la app (files/) y del dispositivo
//     (Documentos, Descargas, DCIM, raíz externa) vía Capacitor Filesystem —
//     nunca abre el administrador/picker del sistema
//   - Filtros por tipo: Todo · Imágenes · Videos · Música · Libros · Magnets
//   - Vista lista o cuadrícula con THUMBNAILS reales (getUri + convertFileSrc)
//   - Vista detalle: tocar un archivo lo abre en grande (img/video/audio)
//   - Selección: long-press (~450 ms) activa el selector — Todos/Ninguno +
//     Importar + Abrir; un .magnet/.txt con enlace abre el panel P2P
//   - API TribalFiles.pick({kinds,title}) → Promise<metas[]> para que el FAB,
//     el slideshow, el chat… elijan archivos sin el picker del celular
// ============================================================================
window.TribalFiles = (function () {
    'use strict';

    var ov = null;            // overlay
    var cur = null;           // { dir, path, label }
    var entries = [];         // filas crudas {name, dir, size}
    var filter = 'all';
    var view = 'list';        // 'list' | 'grid'
    var selMode = false;
    var sel = {};             // path → true
    var pick = null;          // { kinds:[], title, resolve, single }
    var S = null;             // contexto Sono (toast, reload, extDeps)
    var LP_MS = 450;

    var ROOTS = [
        { label: 'TRIBALs',        dir: 'DATA',             path: '' },
        { label: 'Documentos',     dir: 'DOCUMENTS',        path: '' },
        { label: 'Descargas',      dir: 'EXTERNAL_STORAGE', path: 'Download' },
        { label: 'Fotos',          dir: 'EXTERNAL_STORAGE', path: 'DCIM' },
        { label: 'Almacenamiento', dir: 'EXTERNAL_STORAGE', path: '' }
    ];
    var FILTERS = [
        ['all', 'Todo'], ['image', 'Imágenes'], ['video', 'Videos'],
        ['audio', 'Música'], ['doc', 'Libros'], ['magnet', 'Magnets'],
        ['other', 'Otros']
    ];

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
    function fs() {
        try {
            var C = window.Capacitor;
            if (C && C.isNativePlatform && C.isNativePlatform() &&
                C.Plugins && C.Plugins.Filesystem) {
                return C.Plugins.Filesystem;
            }
        } catch (e) {}
        return null;
    }
    function native() { return !!fs(); }
    function b64ToBlob(b64, mime) {
        var bin = atob(b64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Blob([bytes], { type: mime || '' });
    }
    function b64ToText(b64) {
        try {
            return new TextDecoder().decode(
                Uint8Array.from(atob(b64), function (c) {
                    return c.charCodeAt(0);
                }));
        } catch (e) { return ''; }
    }
    function kindOf(name) {
        var e = String(name).split('.').pop().toLowerCase();
        if (/^(mp3|m4a|aac|ogg|opus|wav|flac|wma)$/.test(e)) return 'audio';
        if (/^(mp4|mkv|webm|mov|avi|m4v|3gp)$/.test(e)) return 'video';
        if (/^(jpe?g|png|webp|gif|bmp|heic|avif|svg)$/.test(e)) return 'image';
        if (/^(pdf|epub|txt|mobi|azw3?|fb2|md)$/.test(e)) return 'doc';
        if (/^(magnet|torrent)$/.test(e)) return 'magnet';
        return 'other';
    }
    var ICONS = { audio: 'bi-music-note-beamed', video: 'bi-camera-video-fill',
        image: 'bi-image-fill', doc: 'bi-book-half',
        magnet: 'bi-magnet-fill', other: 'bi-file-earmark', dir: 'bi-folder-fill' };
    function hsize(n) {
        if (!n && n !== 0) return '';
        var u = ['B', 'KB', 'MB', 'GB'], i = 0;
        while (n >= 1024 && i < 3) { n /= 1024; i++; }
        return (i ? n.toFixed(1) : n) + ' ' + u[i];
    }
    function join(base, name) { return base ? base + '/' + name : name; }
    function toast(m) { if (S && S.showToast) S.showToast(m); }

    // url servible por el WebView para un archivo del dispositivo/app
    function entryUrl(e) {
        return fs().getUri({ path: join(cur.path, e.name), directory: cur.dir })
            .then(function (r) {
                return window.Capacitor.convertFileSrc(r.uri);
            });
    }

    function filtered() {
        return entries.filter(function (e) {
            if (pick && !e.dir && pick.kinds &&
                pick.kinds.indexOf(kindOf(e.name)) < 0) return false;
            if (filter === 'all') return true;
            if (e.dir) return true;                       // carpetas siempre
            return kindOf(e.name) === filter;
        });
    }

    // ------------------------------------------------------------ render ---
    function html() {
        return '<div class="tribal-p2p tribal-links">' +
        '<div class="tribal-p2p-head">' +
            '<button class="tribal-ctrl lk-back" id="fm-close" title="Volver">' +
                '<i class="bi bi-arrow-left"></i><span>Volver</span></button>' +
            '<i class="bi bi-folder2-open"></i>' +
            '<strong id="fm-title">Administrador de archivos</strong>' +
        '</div>' +
        '<div class="lk-body">' +
            '<div class="fm-roots" id="fm-roots">' +
                ROOTS.map(function (r, i) {
                    return '<button class="tribal-btn tribal-btn-xs fm-root"' +
                        ' data-root="' + i + '">' + esc(r.label) + '</button>';
                }).join('') +
            '</div>' +
            '<div class="fm-bar">' +
                '<div class="fm-roots fm-filters" id="fm-filters">' +
                    FILTERS.map(function (f) {
                        return '<button class="tribal-btn tribal-btn-xs fm-f"' +
                            (f[0] === 'all' ? ' fm-on' : '') +
                            ' data-f="' + f[0] + '">' + f[1] + '</button>';
                    }).join('') +
                '</div>' +
                '<button class="tribal-btn tribal-btn-xs" id="fm-view"' +
                    ' title="Cambiar vista"><i class="bi bi-grid-3x3-gap"></i></button>' +
            '</div>' +
            '<div class="fm-crumb" id="fm-crumb"></div>' +
            '<div class="tribal-batch-tools" id="fm-tools" hidden>' +
                '<button class="tribal-btn tribal-btn-xs" id="fm-all">Todos</button>' +
                '<button class="tribal-btn tribal-btn-xs" id="fm-none">Ninguno</button>' +
                '<span class="tribal-flex"></span>' +
                '<button class="tribal-btn tribal-btn-xs" id="fm-open">Abrir</button>' +
                '<button class="tribal-btn primary tribal-btn-xs" id="fm-import">' +
                    'Importar</button>' +
                '<button class="tribal-btn tribal-btn-xs" id="fm-selexit">Salir</button>' +
            '</div>' +
            '<div class="tribal-batch-tools" id="fm-picktools" hidden>' +
                '<button class="tribal-btn tribal-btn-xs" id="fm-pall">Todos</button>' +
                '<button class="tribal-btn tribal-btn-xs" id="fm-pnone">Ninguno</button>' +
                '<span class="tribal-flex"></span>' +
                '<button class="tribal-btn primary" id="fm-accept">Aceptar</button>' +
            '</div>' +
            '<p class="tribal-batch-preview" id="fm-status"></p>' +
            '<ol class="tribal-batch-ol" id="fm-list"></ol>' +
            '<div class="fm-grid" id="fm-grid" hidden></div>' +
        '</div>' +
        '<div class="fm-detail" id="fm-detail" hidden>' +
            '<button class="tribal-ctrl fm-det-x" id="fm-det-x">' +
                '<i class="bi bi-x-lg"></i></button>' +
            '<div class="fm-det-body" id="fm-det-body"></div>' +
            '<div class="fm-det-foot" id="fm-det-foot"></div>' +
        '</div>' +
        '</div>';
    }

    function renderChips() {
        ov.querySelector('#fm-filters').querySelectorAll('.fm-f')
            .forEach(function (b) {
                b.classList.toggle('fm-on', b.dataset.f === filter);
            });
        ov.querySelector('#fm-view i').className =
            'bi ' + (view === 'grid' ? 'bi-list-ul' : 'bi-grid-3x3-gap');
        var multi = selMode || !!pick;
        ov.querySelector('#fm-tools').hidden = !selMode;
        ov.querySelector('#fm-picktools').hidden = !pick;
        if (pick) {
            var n = Object.keys(sel).length;
            ov.querySelector('#fm-accept').textContent =
                'Aceptar' + (n ? ' (' + n + ')' : '');
        }
    }

    function renderList() {
        var list = filtered();
        var ls = ov.querySelector('#fm-list');
        var gr = ov.querySelector('#fm-grid');
        renderChips();
        var n = Object.keys(sel).length;
        ov.querySelector('#fm-status').textContent =
            selMode ? n + ' seleccionado(s) — toca filas para marcar'
            : (pick ? 'Toca para elegir — long-press abre la vista detalle' : '');
        if (view === 'list') {
            ls.hidden = false; gr.hidden = true;
            ls.innerHTML = list.map(function (e, i) {
                var p = join(cur.path, e.name);
                var on = sel[p];
                var multi = selMode || !!pick;
                return '<li class="tribal-batch-li fm-li' + (on ? ' fm-on' : '') +
                    '" data-i="' + i + '">' +
                    (multi
                        ? '<i class="ms-check bi ' +
                          (on ? 'bi-check-square-fill' : 'bi-square') + '"></i>'
                        : '') +
                    '<i class="bi ' + ICONS[e.dir ? 'dir' : kindOf(e.name)] +
                        ' fm-ico' + (e.dir ? ' fm-dir' : '') + '"></i>' +
                    '<span class="fm-name">' + esc(e.name) + '</span>' +
                    '<span class="fm-size">' +
                        (e.dir ? '' : hsize(e.size)) + '</span>' +
                    (e.dir ? '' :
                        '<button class="tribal-ctrl fm-eye" data-eye="' + i +
                        '" title="Ver"><i class="bi bi-eye"></i></button>') +
                    '</li>';
            }).join('') || '<div class="tribal-empty-mini"><p>' +
                (filter === 'all' ? 'Carpeta vacía' : 'Nada de este tipo aquí') +
                '</p></div>';
            return;
        }
        // ---- vista cuadrícula con thumbnails reales ----
        ls.hidden = true; gr.hidden = false;
        var multi = selMode || !!pick;
        gr.innerHTML = list.map(function (e, i) {
            var p = join(cur.path, e.name);
            var on = sel[p];
            var k = e.dir ? 'dir' : kindOf(e.name);
            var thumb = (!e.dir && (k === 'image' || k === 'video'))
                ? '<div class="fm-thumb" data-p="' + esc(p) +
                  '" data-k="' + k + '"></div>'
                : '<div class="fm-thumb fm-icoBig"><i class="bi ' +
                  ICONS[k] + (e.dir ? ' fm-dir' : '') + '"></i></div>';
            return '<div class="fm-cell' + (on ? ' fm-on' : '') +
                '" data-i="' + i + '">' +
                (multi ? '<i class="ms-check bi ' +
                    (on ? 'bi-check-square-fill' : 'bi-square') +
                    ' fm-ck"></i>' : '') +
                thumb +
                '<span class="fm-cname">' + esc(e.name) + '</span></div>';
        }).join('') || '<div class="tribal-empty-mini"><p>Carpeta vacía</p></div>';
        loadThumbs();
    }

    // thumbnails perezosos: getUri → convertFileSrc → <img>/<video>
    function loadThumbs() {
        ov.querySelectorAll('.fm-thumb[data-p]').forEach(function (el) {
            if (el._loaded) return;
            el._loaded = true;
            var k = el.dataset.k;
            fs().getUri({ path: el.dataset.p, directory: cur.dir })
                .then(function (r) {
                    var u = window.Capacitor.convertFileSrc(r.uri);
                    el.innerHTML = k === 'image'
                        ? '<img src="' + u + '" loading="lazy" alt="">'
                        : '<video src="' + u + '" muted preload="metadata"></video>';
                }).catch(function () {
                    el.innerHTML = '<i class="bi ' + ICONS[k] + '"></i>';
                    el.classList.add('fm-icoBig');
                });
        });
    }

    function renderCrumb() {
        var parts = cur.path ? cur.path.split('/') : [];
        var h = '<button class="fm-cb" data-p="">' + esc(cur.label) + '</button>';
        var acc = '';
        parts.forEach(function (p) {
            acc = join(acc, p);
            h += '<span class="fm-sep">/</span>' +
                '<button class="fm-cb" data-p="' + esc(acc) + '">' +
                esc(p) + '</button>';
        });
        ov.querySelector('#fm-crumb').innerHTML = h;
    }

    function nav(root, path) {
        cur = { dir: root.dir, path: path || '', label: root.label };
        ov.querySelector('#fm-list').innerHTML =
            '<div class="tribal-empty-mini"><p>Leyendo…</p></div>';
        ov.querySelector('#fm-grid').innerHTML = '';
        renderCrumb();
        fs().readdir({ path: cur.path || '.', directory: cur.dir })
            .then(function (res) {
                var list = (res && res.files) || [];
                entries = list.map(function (f) {
                    return typeof f === 'string'
                        ? { name: f, dir: false, size: null }
                        : { name: f.name,
                            dir: f.type === 'directory',
                            size: f.size };
                }).filter(function (e) {
                    return e.name && e.name.charAt(0) !== '.';
                }).sort(function (a, b) {
                    if (a.dir !== b.dir) return a.dir ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });
                renderList();
            }).catch(function (e) {
                entries = [];
                ov.querySelector('#fm-list').innerHTML =
                    '<div class="tribal-empty-mini"><p>No se pudo leer «' +
                    esc(cur.path || cur.label) + '» — ' +
                    esc(String(e && e.message || e)) +
                    '. Revisa los permisos.</p></div>';
            });
    }

    // ------------------------------------------------------- vista detalle -
    function showDetail(e) {
        if (e.dir) return;
        var det = ov.querySelector('#fm-detail');
        var body = ov.querySelector('#fm-det-body');
        var foot = ov.querySelector('#fm-det-foot');
        var p = join(cur.path, e.name);
        var k = kindOf(e.name);
        det.hidden = false;
        body.innerHTML = '<p class="fm-det-msg">Cargando…</p>';
        foot.innerHTML =
            '<span class="fm-det-name">' + esc(e.name) + '</span>' +
            '<span class="fm-det-size">' + hsize(e.size) + '</span>' +
            (pick
                ? '<button class="tribal-btn primary" id="fm-det-sel">' +
                  (sel[p] ? 'Quitar' : 'Elegir') + '</button>'
                : '<button class="tribal-btn primary" id="fm-det-imp">' +
                  'Importar a la tribu</button>');
        entryUrl(e).then(function (u) {
            if (k === 'image') {
                body.innerHTML = '<img class="fm-det-media" src="' + u + '" alt="">';
            } else if (k === 'video') {
                body.innerHTML = '<video class="fm-det-media" src="' + u +
                    '" controls autoplay muted></video>';
            } else if (k === 'audio') {
                body.innerHTML = '<i class="bi ' + ICONS.audio +
                    ' fm-det-ico"></i><audio src="' + u +
                    '" controls autoplay style="width:100%"></audio>';
            } else {
                body.innerHTML = '<i class="bi ' + ICONS[k] +
                    ' fm-det-ico"></i>';
            }
        }).catch(function () {
            body.innerHTML = '<i class="bi ' + ICONS[k] + ' fm-det-ico"></i>';
        });
        var btn = foot.querySelector('#fm-det-sel') ||
                  foot.querySelector('#fm-det-imp');
        btn.addEventListener('click', function () {
            if (pick) {
                if (sel[p]) delete sel[p]; else sel[p] = true;
                renderList();
                foot.querySelector('#fm-det-sel').textContent =
                    sel[p] ? 'Quitar' : 'Elegir';
            } else {
                det.hidden = true;
                importOne(e);
            }
        });
    }

    // ------------------------------------------------------------ acciones -
    function extractMagnet(txt) {
        var m = String(txt || '').match(/magnet:\?[^\s"'<>]+/i);
        return m ? m[0] : null;
    }
    function openMagnetOrImport(e) {
        var p = join(cur.path, e.name);
        var k = kindOf(e.name);
        if (k === 'magnet' || /\.(txt|md|magnet)$/i.test(e.name)) {
            return fs().readFile({ path: p, directory: cur.dir })
                .then(function (r) {
                    var mag = extractMagnet(b64ToText(r.data));
                    if (mag) {
                        window.TribalP2P.add(mag);
                        var fn = pick && pick.resolve;
                        close();
                        if (fn) fn([]);
                        if (S && S.extDeps) window.TribalP2PUI.open(S.extDeps());
                        return;
                    }
                    if (k === 'magnet')
                        return toast('El archivo no traía un magnet');
                    importOne(e);
                }).catch(function (err) {
                    toast('No se pudo leer: ' +
                        String(err && err.message || err));
                });
        }
        return importOne(e);
    }
    function importOne(e) {
        var p = join(cur.path, e.name);
        return fs().readFile({ path: p, directory: cur.dir })
            .then(function (r) {
                var f = new File([b64ToBlob(r.data)], e.name);
                return window.MediaStore.add(f);
            }).then(function () {
                toast('«' + e.name + '» importado a la tribu');
                if (S && S.reload) S.reload();
            }).catch(function (err) {
                toast('No se pudo importar «' + e.name + '»: ' +
                    String(err && err.message || err));
            });
    }
    function importPaths(paths, done) {
        var metas = [], fail = 0;
        var seq = Promise.resolve();
        paths.forEach(function (p, i) {
            seq = seq.then(function () {
                ov.querySelector('#fm-status').textContent =
                    'Importando ' + (i + 1) + '/' + paths.length + '…';
                return fs().readFile({ path: p, directory: cur.dir });
            }).then(function (r) {
                return window.MediaStore.add(
                    new File([b64ToBlob(r.data)], p.split('/').pop()));
            }).then(function (m) { metas.push(m); })
              .catch(function () { fail++; });
        });
        return seq.then(function () { done(metas, fail); });
    }
    function importSelected() {
        var paths = Object.keys(sel);
        if (!paths.length) return toast('Nada seleccionado');
        importPaths(paths, function (metas, fail) {
            selMode = false; sel = {};
            renderList();
            toast(metas.length + ' importado(s)' +
                (fail ? ' · ' + fail + ' fallaron' : ''));
            if (S && S.reload) S.reload();
        });
    }
    function openSelected() {
        var paths = Object.keys(sel);
        if (paths.length !== 1)
            return toast('Marca un solo archivo para abrir');
        var e = entries.filter(function (x) {
            return join(cur.path, x.name) === paths[0];
        })[0];
        if (!e || e.dir) return toast('Eso es una carpeta');
        openMagnetOrImport(e);
    }
    function acceptPick() {
        var paths = Object.keys(sel);
        if (!paths.length) return toast('Marca al menos un archivo');
        importPaths(paths, function (metas, fail) {
            var res = metas;
            var fn = pick.resolve;
            close();
            if (S && S.reload) S.reload();
            fn(res);
        });
    }

    // ------------------------------------------------------------ gestos ---
    function activateSel(i) {
        var list = filtered();
        var e = list[i];
        if (!e) return;
        if (!pick) selMode = true;
        sel[join(cur.path, e.name)] = true;
        renderList();
    }
    function onTap(i) {
        var list = filtered();
        var e = list[i];
        if (!e) return;
        if (selMode || pick) {
            var p = join(cur.path, e.name);
            if (e.dir && !sel[p]) return nav(
                { dir: cur.dir, label: cur.label }, p);   // carpetas navegan
            if (e.dir) return;
            if (pick && pick.single) {
                sel = {}; sel[p] = true; renderList();
                return acceptPick();
            }
            if (sel[p]) delete sel[p]; else sel[p] = true;
            renderList();
            return;
        }
        if (e.dir) return nav(
            { dir: cur.dir, label: cur.label }, join(cur.path, e.name));
        var k = kindOf(e.name);
        if (k === 'image' || k === 'video' || k === 'audio')
            return showDetail(e);
        openMagnetOrImport(e);
    }

    // ------------------------------------------------------------ cableado -
    function wire() {
        ov.querySelector('#fm-close').addEventListener('click', function () {
            var fn = pick && pick.resolve;
            close();
            if (fn) fn([]);
        });
        ov.addEventListener('click', function (e) {
            if (e.target === ov) {
                var fn = pick && pick.resolve;
                close();
                if (fn) fn([]);
            }
        });
        ov.querySelector('#fm-det-x').addEventListener('click', function () {
            var det = ov.querySelector('#fm-detail');
            det.querySelectorAll('video,audio').forEach(function (m) {
                m.pause();
            });
            det.hidden = true;
        });
        ov.querySelector('#fm-roots').addEventListener('click', function (e) {
            var b = e.target.closest('.fm-root');
            if (b) nav(ROOTS[+b.dataset.root]);
        });
        ov.querySelector('#fm-filters').addEventListener('click', function (e) {
            var b = e.target.closest('.fm-f');
            if (!b) return;
            filter = b.dataset.f;
            renderList();
        });
        ov.querySelector('#fm-view').addEventListener('click', function () {
            view = view === 'grid' ? 'list' : 'grid';
            renderList();
        });
        ov.querySelector('#fm-crumb').addEventListener('click', function (e) {
            var b = e.target.closest('.fm-cb');
            if (b) nav({ dir: cur.dir, label: cur.label }, b.dataset.p);
        });
        ov.querySelector('#fm-all').addEventListener('click', function () {
            filtered().forEach(function (e) {
                if (!e.dir) sel[join(cur.path, e.name)] = true;
            });
            renderList();
        });
        ov.querySelector('#fm-none').addEventListener('click', function () {
            sel = {};
            renderList();
        });
        ov.querySelector('#fm-selexit').addEventListener('click', function () {
            selMode = false; sel = {};
            renderList();
        });
        ov.querySelector('#fm-import').addEventListener('click', importSelected);
        ov.querySelector('#fm-open').addEventListener('click', openSelected);
        ov.querySelector('#fm-pall').addEventListener('click', function () {
            filtered().forEach(function (e) {
                if (!e.dir) sel[join(cur.path, e.name)] = true;
            });
            renderList();
        });
        ov.querySelector('#fm-pnone').addEventListener('click', function () {
            sel = {};
            renderList();
        });
        ov.querySelector('#fm-accept').addEventListener('click', acceptPick);

        // tap corto: abrir/marcar · long-press: selector o detalle
        ['fm-list', 'fm-grid'].forEach(function (id) {
            var list = ov.querySelector('#' + id);
            var lpT = null, lpI = -1, lpOk = false, lpX = 0, lpY = 0;
            function itemOf(t) {
                var li = t && t.closest &&
                    t.closest('.fm-li,.fm-cell');
                return li ? +li.dataset.i : -1;
            }
            list.addEventListener('pointerdown', function (e) {
                lpI = itemOf(e.target); lpOk = false;
                lpX = e.clientX; lpY = e.clientY;
                if (lpI < 0) return;
                lpT = setTimeout(function () {
                    lpOk = true;
                    var en = filtered()[lpI];
                    // en modo elegir: long-press = vista detalle;
                    // en explorar: long-press = selector
                    if (pick && en && !en.dir) showDetail(en);
                    else activateSel(lpI);
                }, LP_MS);
            });
            list.addEventListener('pointerup', function (e) {
                clearTimeout(lpT); lpT = null;
                var i = itemOf(e.target);
                var eye = e.target.closest && e.target.closest('.fm-eye');
                if (eye) { showDetail(filtered()[+eye.dataset.eye]); return; }
                if (i >= 0 && i === lpI && !lpOk) onTap(i);
                lpI = -1;
            });
            list.addEventListener('pointercancel', function () {
                clearTimeout(lpT); lpI = -1;
            });
            list.addEventListener('pointermove', function (e) {
                if (lpT && (Math.abs(e.clientX - lpX) > 10 ||
                            Math.abs(e.clientY - lpY) > 10)) {
                    clearTimeout(lpT); lpT = null;
                }
            });
            list.addEventListener('contextmenu', function (e) {
                var i = itemOf(e.target);
                if (i >= 0) { e.preventDefault(); if (!lpOk) activateSel(i); }
            });
        });
    }

    function close() {
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = null; entries = []; sel = {}; selMode = false;
        filter = 'all'; view = 'list'; pick = null; cur = null;
    }

    function open(sono, opts) {
        S = sono;
        if (!fs()) {
            toast('El administrador de archivos solo funciona en el APK');
            if (opts && opts.resolve) opts.resolve([]);
            return null;
        }
        if (ov) close();
        pick = opts || null;
        if (pick && pick.kinds && pick.kinds.length === 1)
            filter = pick.kinds[0];
        ov = document.createElement('div');
        ov.className = 'tribal-overlay tribal-p2p-ov';
        ov.innerHTML = html();
        (S.root || document.body).appendChild(ov);
        if (pick && pick.title)
            ov.querySelector('#fm-title').textContent = pick.title;
        else if (pick)
            ov.querySelector('#fm-title').textContent = 'Elegir archivos';
        wire();
        nav(ROOTS[0]);
        return ov;
    }

    return {
        native: native,
        open: open,
        close: close,
        // elige archivos con el administrador propio — sin picker del sistema.
        // opts: { kinds:['image'|'video'|…], title, single }
        // → Promise<metas[]> (los importados a la tribu; [] si canceló)
        pick: function (sono, opts) {
            opts = opts || {};
            return new Promise(function (resolve) {
                opts.resolve = resolve;
                open(sono, opts);
            });
        }
    };
})();

// entrada del menú ⋮ → administrador universal (modo explorar)
window.Sono.register('filemgr', function (S) {
    'use strict';
    var $ = S.$;
    $('vm-files').addEventListener('click', function () {
        $('view-menu').hidden = true;
        window.TribalFiles.open(S, null);
    });
});
