// ============================================================================
// ARCHIVO: media/filemgr.js
// RESPONSABILIDAD: administrador de archivos interno de TRIBALs.
//   - Navega el almacenamiento de la app (files/) y carpetas del dispositivo
//     (Documentos, Descargas, DCIM, raíz externa) vía Capacitor Filesystem
//   - Tap en carpeta: entra · tap en archivo: si es magnet abre el panel P2P,
//     si no lo importa a la tribu
//   - Long-press (~450 ms) sobre una fila activa el selector (checks por fila,
//     «Todos» / «Ninguno») y la barra con contador + Importar + Abrir
//   - En la preview web (sin Filesystem nativo) muestra aviso
// ============================================================================
window.Sono.register('filemgr', function (S) {
    'use strict';
    var $ = S.$;

    var ov = null;            // overlay
    var cur = null;           // { dir, path, label }
    var entries = [];         // filas actuales {name, dir, size}
    var selMode = false;
    var sel = {};             // path → true
    var LP_MS = 450;

    var ROOTS = [
        { label: 'TRIBALs',       dir: 'DATA',             path: '' },
        { label: 'Documentos',    dir: 'DOCUMENTS',        path: '' },
        { label: 'Descargas',     dir: 'EXTERNAL_STORAGE', path: 'Download' },
        { label: 'Fotos',         dir: 'EXTERNAL_STORAGE', path: 'DCIM' },
        { label: 'Almacenamiento', dir: 'EXTERNAL_STORAGE', path: '' }
    ];

    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

    // ------------------------------------------------------------ render ---
    function html() {
        return '<div class="tribal-p2p tribal-links">' +
        '<div class="tribal-p2p-head">' +
            '<button class="tribal-ctrl lk-back" id="fm-close" title="Volver">' +
                '<i class="bi bi-arrow-left"></i><span>Volver</span></button>' +
            '<i class="bi bi-folder2-open"></i>' +
            '<strong>Administrador de archivos</strong>' +
        '</div>' +
        '<div class="lk-body">' +
            '<div class="fm-roots" id="fm-roots">' +
                ROOTS.map(function (r, i) {
                    return '<button class="tribal-btn tribal-btn-xs fm-root"' +
                        ' data-root="' + i + '">' + esc(r.label) + '</button>';
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
            '<p class="tribal-batch-preview" id="fm-status"></p>' +
            '<ol class="tribal-batch-ol" id="fm-list"></ol>' +
        '</div></div>';
    }

    function renderList() {
        var box = ov.querySelector('#fm-list');
        ov.querySelector('#fm-tools').hidden = !selMode;
        var n = Object.keys(sel).length;
        ov.querySelector('#fm-status').textContent = selMode
            ? n + ' seleccionado(s) — toca filas para marcar' : '';
        box.innerHTML = entries.map(function (e, i) {
            var p = join(cur.path, e.name);
            var on = sel[p];
            return '<li class="tribal-batch-li fm-li' + (on ? ' fm-on' : '') +
                '" data-i="' + i + '">' +
                (selMode
                    ? '<i class="ms-check bi ' +
                      (on ? 'bi-check-square-fill' : 'bi-square') + '"></i>'
                    : '') +
                '<i class="bi ' + ICONS[e.dir ? 'dir' : kindOf(e.name)] +
                    ' fm-ico' + (e.dir ? ' fm-dir' : '') + '"></i>' +
                '<span class="fm-name">' + esc(e.name) + '</span>' +
                '<span class="fm-size">' +
                    (e.dir ? '' : hsize(e.size)) + '</span></li>';
        }).join('') || '<div class="tribal-empty-mini"><p>Carpeta vacía</p></div>';
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
        selMode = false; sel = {};
        ov.querySelector('#fm-list').innerHTML =
            '<div class="tribal-empty-mini"><p>Leyendo…</p></div>';
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
                ov.querySelector('#fm-status').textContent = '';
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
                        close();
                        window.TribalP2PUI.open(S.extDeps());
                        return;
                    }
                    if (k === 'magnet')
                        return S.showToast('El archivo no traía un magnet');
                    importOne(e).then(function () {});
                }).catch(function (err) {
                    S.showToast('No se pudo leer: ' +
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
                S.showToast('«' + e.name + '» importado a la tribu');
                S.reload();
            }).catch(function (err) {
                S.showToast('No se pudo importar «' + e.name + '»: ' +
                    String(err && err.message || err));
            });
    }
    function importSelected() {
        var paths = Object.keys(sel);
        if (!paths.length) return S.showToast('Nada seleccionado');
        var names = paths.map(function (p) { return p.split('/').pop(); });
        var seq = Promise.resolve(), n = 0, fail = 0;
        paths.forEach(function (p, i) {
            seq = seq.then(function () {
                ov.querySelector('#fm-status').textContent =
                    'Importando ' + (i + 1) + '/' + paths.length + '…';
                return fs().readFile({ path: p, directory: cur.dir });
            }).then(function (r) {
                return window.MediaStore.add(
                    new File([b64ToBlob(r.data)], names[i]));
            }).then(function () { n++; })
              .catch(function () { fail++; });
        });
        seq.then(function () {
            selMode = false; sel = {};
            renderList();
            S.showToast(n + ' importado(s)' + (fail ? ' · ' + fail + ' fallaron' : ''));
            S.reload();
        });
    }
    function openSelected() {
        var paths = Object.keys(sel);
        if (paths.length !== 1)
            return S.showToast('Marca un solo archivo para abrir');
        var e = entries.filter(function (x) {
            return join(cur.path, x.name) === paths[0];
        })[0];
        if (!e || e.dir) return S.showToast('Eso es una carpeta');
        openMagnetOrImport(e);
    }

    // ------------------------------------------------------------ cableado -
    function activateSel(i) {
        selMode = true;
        sel[join(cur.path, entries[i].name)] = true;
        renderList();
    }
    function onTap(i) {
        var e = entries[i];
        if (selMode) {
            var p = join(cur.path, e.name);
            if (sel[p]) delete sel[p]; else sel[p] = true;
            renderList();
            return;
        }
        if (e.dir) return nav({ dir: cur.dir, label: cur.label }, join(cur.path, e.name));
        openMagnetOrImport(e);
    }

    function wire() {
        ov.querySelector('#fm-close').addEventListener('click', close);
        ov.addEventListener('click', function (e) {
            if (e.target === ov) close();
        });
        ov.querySelector('#fm-roots').addEventListener('click', function (e) {
            var b = e.target.closest('.fm-root');
            if (b) nav(ROOTS[+b.dataset.root]);
        });
        ov.querySelector('#fm-crumb').addEventListener('click', function (e) {
            var b = e.target.closest('.fm-cb');
            if (b) nav({ dir: cur.dir, label: cur.label }, b.dataset.p);
        });
        ov.querySelector('#fm-all').addEventListener('click', function () {
            entries.forEach(function (e) {
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

        // tap corto: abrir/marcar · long-press: entra al selector
        var list = ov.querySelector('#fm-list');
        var lpT = null, lpI = -1, lpOk = false;
        function itemOf(t) {
            var li = t && t.closest && t.closest('.fm-li');
            return li ? +li.dataset.i : -1;
        }
        list.addEventListener('pointerdown', function (e) {
            lpI = itemOf(e.target); lpOk = false;
            if (lpI < 0) return;
            lpT = setTimeout(function () { lpOk = true; activateSel(lpI); }, LP_MS);
        });
        list.addEventListener('pointerup', function (e) {
            clearTimeout(lpT);
            var i = itemOf(e.target);
            if (i >= 0 && i === lpI && !lpOk) onTap(i);
            lpI = -1;
        });
        list.addEventListener('pointercancel', function () {
            clearTimeout(lpT); lpI = -1;
        });
        list.addEventListener('pointermove', function (e) {
            if (lpT && (Math.abs(e.movementX) > 8 || Math.abs(e.movementY) > 8)) {
                clearTimeout(lpT); lpT = null;
            }
        });
        list.addEventListener('contextmenu', function (e) {
            var i = itemOf(e.target);
            if (i >= 0) { e.preventDefault(); if (!lpOk) activateSel(i); }
        });
    }

    function close() {
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = null; entries = []; sel = {}; selMode = false;
    }

    $('vm-files').addEventListener('click', function () {
        $('view-menu').hidden = true;
        if (!fs()) {
            return S.showToast('El administrador de archivos solo funciona en el APK');
        }
        if (ov) close();
        ov = document.createElement('div');
        ov.className = 'tribal-overlay tribal-p2p-ov';
        ov.innerHTML = html();
        (S.root || document.body).appendChild(ov);
        wire();
        nav(ROOTS[0]);
    });
});
