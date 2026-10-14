// ============================================================================
// ARCHIVO: media/filemgr.js
// RESPONSABILIDAD: administrador de archivos UNIVERSAL de TRIBALs.
//   - Carpetas personales: TRIBALs, Documentos, Descargas, Imágenes,
//     Cámara, Música, Videos, Grabaciones, Tonos y raíz externa —
//     vía Capacitor Filesystem, nunca el picker del sistema
//   - Búsqueda en vivo dentro de la carpeta + orden por
//     nombre/fecha/tamaño asc-desc (persistido en tribu_fm_sort)
//   - Filtros por tipo: Todo · Imágenes · Videos · Música · Libros ·
//     Magnets · Otros — filas con tamaño y fecha
//   - Vista lista o cuadrícula con THUMBNAILS reales
//   - Vista detalle: img/video/audio en grande; pdf/epub/txt se abren
//     con el LECTOR TRIBAL (meta sintético + urlFor directo)
//   - ⋮ por elemento → hoja de acciones: Ver · Leer · Compartir ·
//     Importar · Renombrar · Eliminar (doble confirmación — borrado
//     permanente del dispositivo) · Nueva carpeta en la barra
//   - Selección: long-press (~450 ms) → Todos/Ninguno/Abrir/Importar
//   - API TribalFiles.pick({kinds,title}) → Promise<metas[]>
// ============================================================================
window.TribalFiles = (function () {
    'use strict';

    var ov = null;            // overlay
    var cur = null;           // { dir, path, label }
    var entries = [];         // filas crudas {name, dir, size, mtime}
    var filter = 'all';
    var view = 'list';        // 'list' | 'grid'
    var selMode = false;
    var sel = {};             // path → true
    var pick = null;          // { kinds:[], title, resolve, single }
    var S = null;             // contexto Sono (toast, reload, extDeps)
    var query = '';           // búsqueda en vivo dentro de la carpeta
    var sortBy = 'name';      // 'name' | 'date' | 'size'
    var sortAsc = true;
    var sheetEntry = null;    // entrada del action-sheet
    var LP_MS = 450;
    try {
        var so = JSON.parse(localStorage.getItem('tribu_fm_sort') || 'null');
        if (so && so.by) { sortBy = so.by; sortAsc = !!so.asc; }
    } catch (e0) {}

    // raíces = carpetas personales del teléfono (EXTERNAL_STORAGE público)
    var ROOTS = [
        { label: 'TRIBALs',       icon: 'bi-boombox-fill',            dir: 'DATA',             path: '' },
        { label: 'Documentos',    icon: 'bi-file-earmark-text-fill',  dir: 'DOCUMENTS',        path: '' },
        { label: 'Descargas',     icon: 'bi-download',                dir: 'EXTERNAL_STORAGE', path: 'Download' },
        { label: 'Imágenes',      icon: 'bi-images',                  dir: 'EXTERNAL_STORAGE', path: 'Pictures' },
        { label: 'Cámara',        icon: 'bi-camera-fill',             dir: 'EXTERNAL_STORAGE', path: 'DCIM' },
        { label: 'Música',        icon: 'bi-music-note-beamed',       dir: 'EXTERNAL_STORAGE', path: 'Music' },
        { label: 'Videos',        icon: 'bi-camera-video-fill',       dir: 'EXTERNAL_STORAGE', path: 'Movies' },
        { label: 'Grabaciones',   icon: 'bi-mic-fill',                dir: 'EXTERNAL_STORAGE', path: 'Recordings' },
        { label: 'Tonos',         icon: 'bi-bell-fill',               dir: 'EXTERNAL_STORAGE', path: 'Ringtones' },
        { label: 'Almacenamiento', icon: 'bi-hdd-fill',               dir: 'EXTERNAL_STORAGE', path: '' }
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
        var raw = String(b64 || '');
        if (raw.indexOf(',') >= 0) raw = raw.split(',')[1];
        var bin = atob(raw.replace(/\s+/g, ''));
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
        if (/^(mp3|mpga|mp2|mpa|m4a|m4b|m4r|aac|ogg|oga|opus|spx|wav|wave|flac|weba|wma|amr|3ga|aiff?|aifc|mka|caf|alac|ape|wv|midi?)$/.test(e)) return 'audio';
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
    function saveSort() {
        try {
            localStorage.setItem('tribu_fm_sort',
                JSON.stringify({ by: sortBy, asc: sortAsc }));
        } catch (e) {}
    }

    // url servible por el WebView para un archivo del dispositivo/app
    function entryUrl(e) {
        return fs().getUri({ path: join(cur.path, e.name), directory: cur.dir })
            .then(function (r) {
                return window.Capacitor.convertFileSrc(r.uri);
            });
    }

    function filtered() {
        var q = query.trim().toLowerCase();
        var list = entries.filter(function (e) {
            if (pick && !e.dir && pick.kinds &&
                pick.kinds.indexOf(kindOf(e.name)) < 0) return false;
            if (filter !== 'all' && !e.dir &&
                kindOf(e.name) !== filter) return false;
            if (q && e.name.toLowerCase().indexOf(q) < 0) return false;
            return true;
        });
        list.sort(function (a, b) {
            if (a.dir !== b.dir) return a.dir ? -1 : 1;   // carpetas arriba
            var r = sortBy === 'size' ? (a.size || 0) - (b.size || 0)
                  : sortBy === 'date' ? (a.mtime || 0) - (b.mtime || 0)
                  : a.name.localeCompare(b.name);
            return sortAsc ? r : -r;
        });
        return list;
    }
    function fmtDate(ms) {
        if (!ms) return '';
        var d = new Date(ms);
        function z(n) { return n < 10 ? '0' + n : '' + n; }
        return z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' +
               String(d.getFullYear()).slice(2);
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
        '<div class="lk-body fm-body">' +
            '<div class="fm-roots" id="fm-roots">' +
                ROOTS.map(function (r, i) {
                    return '<button class="tribal-btn tribal-btn-xs fm-root"' +
                        ' data-root="' + i + '"><i class="bi ' + r.icon +
                        '"></i><span>' + esc(r.label) + '</span></button>';
                }).join('') +
            '</div>' +
            '<div class="fm-bar">' +
                '<input type="search" class="fm-q" id="fm-q"' +
                    ' placeholder="Buscar aquí…" autocomplete="off">' +
                '<select class="fm-sort" id="fm-sort" title="Ordenar">' +
                    '<option value="name">Nombre</option>' +
                    '<option value="date">Fecha</option>' +
                    '<option value="size">Tamaño</option>' +
                '</select>' +
                '<button class="tribal-btn tribal-btn-xs" id="fm-dir"' +
                    ' title="Ascendente / descendente">' +
                    '<i class="bi bi-sort-alpha-down"></i></button>' +
                '<button class="tribal-btn tribal-btn-xs" id="fm-syspick"' +
                    ' title="Selector del sistema Android"><i class="bi bi-phone"></i></button>' +
                '<button class="tribal-btn tribal-btn-xs" id="fm-mkdir"' +
                    ' title="Nueva carpeta"><i class="bi bi-folder-plus"></i></button>' +
                '<button class="tribal-btn tribal-btn-xs" id="fm-view"' +
                    ' title="Cambiar vista"><i class="bi bi-grid-3x3-gap"></i></button>' +
            '</div>' +
            '<div class="fm-roots fm-filters" id="fm-filters">' +
                FILTERS.map(function (f) {
                    return '<button class="tribal-btn tribal-btn-xs fm-f"' +
                        (f[0] === 'all' ? ' fm-on' : '') +
                        ' data-f="' + f[0] + '">' + f[1] + '</button>';
                }).join('') +
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
        '<div class="fm-sheet" id="fm-sheet" hidden>' +
            '<div class="fm-sheet-card" id="fm-sheet-card"></div>' +
        '</div>' +
        '<div class="fm-sheet fm-promptov" id="fm-prompt" hidden>' +
            '<div class="fm-sheet-card fm-prompt-card">' +
                '<strong id="fm-prompt-title">Renombrar</strong>' +
                '<input type="text" id="fm-prompt-in" autocomplete="off">' +
                '<div class="fm-sheet-row">' +
                    '<button class="tribal-btn" id="fm-prompt-cancel">Cancelar</button>' +
                    '<button class="tribal-btn primary" id="fm-prompt-ok">' +
                        'Aceptar</button>' +
                '</div>' +
            '</div>' +
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
        ov.querySelector('#fm-dir i').className =
            'bi ' + (sortAsc ? 'bi-sort-alpha-down' : 'bi-sort-alpha-up');
        ov.querySelector('#fm-sort').value = sortBy;
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
            : (pick ? 'Toca para elegir — long-press abre la vista detalle'
              : list.length + ' elemento(s)' +
                (query ? ' · filtrando «' + query + '»' : ''));
        if (view === 'list') {
            ls.hidden = false; gr.hidden = true;
            ls.innerHTML = list.map(function (e, i) {
                var p = join(cur.path, e.name);
                var on = sel[p];
                var multi = selMode || !!pick;
                var meta = (e.dir ? fmtDate(e.mtime)
                          : (hsize(e.size) + (e.mtime ? ' · ' +
                             fmtDate(e.mtime) : '')));
                return '<li class="tribal-batch-li fm-li' + (on ? ' fm-on' : '') +
                    '" data-i="' + i + '">' +
                    (multi
                        ? '<i class="ms-check bi ' +
                          (on ? 'bi-check-square-fill' : 'bi-square') + '"></i>'
                        : '') +
                    '<i class="bi ' + ICONS[e.dir ? 'dir' : kindOf(e.name)] +
                        ' fm-ico' + (e.dir ? ' fm-dir' : '') + '"></i>' +
                    '<span class="fm-name">' + esc(e.name) + '</span>' +
                    '<span class="fm-size">' + meta + '</span>' +
                    (e.dir ? '' :
                        '<button class="tribal-ctrl fm-eye" data-eye="' + i +
                        '" title="Ver"><i class="bi bi-eye"></i></button>') +
                    (multi ? '' :
                        '<button class="tribal-ctrl fm-act" data-act="' + i +
                        '" title="Opciones">' +
                        '<i class="bi bi-three-dots-vertical"></i></button>') +
                    '</li>';
            }).join('') || '<div class="tribal-empty-mini"><p>' +
                (query ? 'Nada coincide con «' + esc(query) + '»'
                 : filter === 'all' ? 'Carpeta vacía'
                 : 'Nada de este tipo aquí') + '</p></div>';
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
                    ' fm-ck"></i>'
                 : '<button class="tribal-ctrl fm-act fm-actg" data-act="' + i +
                   '" title="Opciones">' +
                   '<i class="bi bi-three-dots-vertical"></i></button>') +
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
                        ? { name: f, dir: false, size: null, mtime: 0 }
                        : { name: f.name,
                            dir: f.type === 'directory',
                            size: f.size, mtime: f.mtime || 0 };
                }).filter(function (e) {
                    return e.name && e.name.charAt(0) !== '.';
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
        var canRead = /^(pdf|epub|txt)$/i
            .test(String(e.name).split('.').pop());
        foot.innerHTML =
            '<span class="fm-det-name">' + esc(e.name) + '</span>' +
            '<span class="fm-det-size">' + hsize(e.size) + '</span>' +
            (canRead
                ? '<button class="tribal-btn" id="fm-det-read">' +
                  '<i class="bi bi-book"></i> Leer</button>'
                : '') +
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
        var rd = foot.querySelector('#fm-det-read');
        if (rd) rd.addEventListener('click', function () {
            det.hidden = true;
            openDoc(e);
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
    function readEntryFile(dir, relPath, fname) {
        var IO = window.SonoStoreIO;
        var mime = (IO && IO.mimeFromName) ? IO.mimeFromName(fname, '') : '';
        return fs().getUri({ path: relPath, directory: dir })
            .then(function (r) {
                var u = window.Capacitor.convertFileSrc(r.uri);
                return fetch(u).then(function (res) {
                    if (!res.ok) throw new Error('http ' + res.status);
                    return res.blob();
                });
            }).then(function (blob) {
                return new File([blob], fname, { type: mime || blob.type || '' });
            }).catch(function () {
                return fs().readFile({ path: relPath, directory: dir }).then(function (r) {
                    return new File([b64ToBlob(r.data, mime)], fname, { type: mime });
                });
            });
    }
    function importOne(e) {
        var p = join(cur.path, e.name);
        return readEntryFile(cur.dir, p, e.name)
            .then(function (f) {
                return window.TribalDup.guard(f, S).then(function (f2) {
                    return f2 ? window.MediaStore.add(f2) : null;
                });
            }).then(function (m) {
                if (!m) return null;   // usuario canceló el duplicado
                toast('«' + e.name + '» importado a la tribu');
                if (S && S.reload) S.reload();
                return m;
            }).catch(function (err) {
                toast('No se pudo importar «' + e.name + '»: ' +
                    String(err && err.message || err));
                return null;
            });
    }
    function importPaths(paths, done) {
        var metas = [], fail = 0;
        var seq = Promise.resolve();
        paths.forEach(function (p, i) {
            var fname = p.split('/').pop();
            seq = seq.then(function () {
                ov.querySelector('#fm-status').textContent =
                    'Importando ' + (i + 1) + '/' + paths.length + '…';
                return readEntryFile(cur.dir, p, fname);
            }).then(function (f) {
                return window.TribalDup.guard(f, S).then(function (f2) {
                    return f2 ? window.MediaStore.add(f2) : null;
                });
            }).then(function (m) { if (m) metas.push(m); })
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

    // ----------------------------------------------------- operaciones FS -
    function refresh() { nav({ dir: cur.dir, label: cur.label }, cur.path); }

    // mini-prompt propio (renombrar / nueva carpeta)
    function askText(title, initial, cb) {
        var pr = ov.querySelector('#fm-prompt');
        ov.querySelector('#fm-prompt-title').textContent = title;
        var inp = ov.querySelector('#fm-prompt-in');
        inp.value = initial || '';
        pr.hidden = false;
        inp.focus(); inp.select();
        function done(ok) {
            pr.hidden = true;
            ov.querySelector('#fm-prompt-ok').onclick =
                ov.querySelector('#fm-prompt-cancel').onclick = null;
            inp.onkeydown = null;
            if (ok) cb(inp.value.trim());
        }
        ov.querySelector('#fm-prompt-ok').onclick = function () { done(true); };
        ov.querySelector('#fm-prompt-cancel').onclick = function () { done(false); };
        inp.onkeydown = function (ev) {
            if (ev.key === 'Enter') done(true);
            if (ev.key === 'Escape') done(false);
        };
    }

    // hoja de acciones por archivo/carpeta
    function openSheet(i) {
        var list = filtered();
        var e = list[i];
        if (!e) return;
        sheetEntry = e;
        var card = ov.querySelector('#fm-sheet-card');
        var acts = [];
        if (e.dir) {
            acts = [
                ['open', 'bi-folder2-open', 'Abrir'],
                ['rename', 'bi-pencil', 'Renombrar'],
                ['del', 'bi-trash3', 'Eliminar']
            ];
        } else {
            var k = kindOf(e.name);
            acts = [['view', 'bi-eye', 'Ver']];
            if (/^(pdf|epub|txt)$/i.test(e.name.split('.').pop()))
                acts.push(['read', 'bi-book-half', 'Abrir con el lector']);
            acts.push(['share', 'bi-share', 'Compartir'],
                      ['import', 'bi-box-arrow-in-down', 'Importar a la tribu'],
                      ['rename', 'bi-pencil', 'Renombrar'],
                      ['del', 'bi-trash3', 'Eliminar']);
            if (k === 'magnet') acts.splice(1, 0,
                ['open', 'bi-magnet-fill', 'Abrir enlace']);
        }
        card.innerHTML =
            '<div class="fm-sheet-name"><i class="bi ' +
            ICONS[e.dir ? 'dir' : kindOf(e.name)] +
            (e.dir ? ' fm-dir' : '') + '"></i>' + esc(e.name) + '</div>' +
            acts.map(function (a) {
                return '<button class="fm-actbtn" data-do="' + a[0] + '">' +
                    '<i class="bi ' + a[1] + '"></i>' + a[2] + '</button>';
            }).join('') +
            '<button class="fm-actbtn fm-cancel" data-do="x">' +
                '<i class="bi bi-x-lg"></i>Cancelar</button>';
        ov.querySelector('#fm-sheet').hidden = false;
    }

    function doSheet(act) {
        var e = sheetEntry;
        sheetEntry = null;
        ov.querySelector('#fm-sheet').hidden = true;
        if (!e || act === 'x') return;
        var p = join(cur.path, e.name);
        if (act === 'open' || act === 'view') {
            if (e.dir) return nav({ dir: cur.dir, label: cur.label }, p);
            var k = kindOf(e.name);
            if (act === 'open') return openMagnetOrImport(e);
            if (k === 'image' || k === 'video' || k === 'audio')
                return showDetail(e);
            return openMagnetOrImport(e);
        }
        if (act === 'read') return openDoc(e);
        if (act === 'import') return importOne(e);
        if (act === 'share') {
            return fs().getUri({ path: p, directory: cur.dir })
                .then(function (r) {
                    return window.Capacitor.Plugins.Share.share(
                        { title: e.name, url: r.uri });
                }).catch(function (err) {
                    toast('No se pudo compartir: ' +
                        String(err && err.message || err));
                });
        }
        if (act === 'rename') {
            return askText('Renombrar «' + e.name + '»', e.name,
                function (nn) {
                    if (!nn || nn === e.name) return;
                    if (/[\\/:*?"<>|]/.test(nn))
                        return toast('El nombre tiene caracteres inválidos');
                    fs().rename({
                        from: p, to: join(cur.path, nn),
                        directory: cur.dir, toDirectory: cur.dir
                    }).then(function () {
                        delete sel[p];
                        toast('Renombrado a «' + nn + '»');
                        refresh();
                    }).catch(function (err) {
                        toast('No se pudo renombrar: ' +
                            String(err && err.message || err));
                    });
                });
        }
        if (act === 'del') {
            var extra = e.dir ? ' y todo su contenido' : '';
            return S.confirm('Eliminar',
                '¿Borrar «' + e.name + '»' + extra + '?', 'Eliminar',
                function () {
                    S.confirm('Última advertencia',
                        'Se borra permanentemente del teléfono. ' +
                        'No se puede deshacer.', 'Sí, borrar',
                        function () {
                            var pr = e.dir
                                ? fs().rmdir({ path: p, directory: cur.dir,
                                               recursive: true })
                                : fs().deleteFile({ path: p,
                                                    directory: cur.dir });
                            pr.then(function () {
                                delete sel[p];
                                toast('«' + e.name + '» eliminado');
                                refresh();
                            }).catch(function (err) {
                                toast('No se pudo eliminar: ' +
                                    String(err && err.message || err));
                            });
                        });
                });
        }
    }

    function newFolder() {
        askText('Nueva carpeta en «' + (cur.label + '/' + (cur.path || '')) +
            '»', '', function (nn) {
                if (!nn) return;
                if (/[\\/:*?"<>|]/.test(nn))
                    return toast('Nombre inválido');
                fs().mkdir({ path: join(cur.path, nn), directory: cur.dir,
                             recursive: true })
                    .then(function () {
                        toast('Carpeta «' + nn + '» creada');
                        refresh();
                    }).catch(function (err) {
                        toast('No se pudo crear: ' +
                            String(err && err.message || err));
                    });
            });
    }

    // abrir pdf/epub/txt del dispositivo con el lector tribal —
    // meta sintético + urlFor directo al archivo (sin importarlo)
    function openDoc(e) {
        var p = join(cur.path, e.name);
        entryUrl(e).then(function (u) {
            if (!window.TribalReader)
                return toast('El lector no está disponible');
            var meta = { id: 'fm:' + p, name: e.name };
            window.TribalReader.open(meta, {
                mount: document.body,
                urlFor: function (m, cb) { cb(u); },
                store: {
                    share: function () {
                        return fs().getUri({ path: p, directory: cur.dir })
                            .then(function (r) {
                                return window.Capacitor.Plugins.Share.share(
                                    { title: e.name, url: r.uri });
                            });
                    },
                    remove: function () {
                        return fs().deleteFile({ path: p,
                                                 directory: cur.dir })
                            .then(refresh);
                    }
                },
                toast: toast,
                confirm: S.confirm,
                onDeleted: refresh
            });
        }).catch(function (err) {
            toast('No se pudo abrir: ' + String(err && err.message || err));
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
        ov.querySelector('#fm-q').addEventListener('input', function (e) {
            query = e.target.value || '';
            renderList();
        });
        ov.querySelector('#fm-sort').addEventListener('change', function (e) {
            sortBy = e.target.value;
            saveSort(); renderList();
        });
        ov.querySelector('#fm-dir').addEventListener('click', function () {
            sortAsc = !sortAsc;
            saveSort(); renderList();
        });
        ov.querySelector('#fm-mkdir').addEventListener('click', newFolder);
        var sysBtn = ov.querySelector('#fm-syspick');
        if (sysBtn) sysBtn.addEventListener('click', function () {
            var fn = pick && pick.resolve;
            close();
            if (fn) fn([]);
            if (S && S.input) S.input.click();
        });
        // hoja de acciones: tocar fuera cierra, data-do ejecuta
        ov.querySelector('#fm-sheet').addEventListener('click', function (e) {
            if (e.target === ov.querySelector('#fm-sheet')) {
                ov.querySelector('#fm-sheet').hidden = true;
                sheetEntry = null;
                return;
            }
            var b = e.target.closest('.fm-actbtn');
            if (b) doSheet(b.dataset.do);
        });
        ov.querySelector('#fm-prompt').addEventListener('click', function (e) {
            if (e.target === ov.querySelector('#fm-prompt'))
                ov.querySelector('#fm-prompt-cancel').click();
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
                var act = e.target.closest && e.target.closest('.fm-act');
                if (act) { openSheet(+act.dataset.act); return; }
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
        query = ''; sheetEntry = null;
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
