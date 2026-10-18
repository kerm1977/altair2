// === media/zipui.js — Administrador «Comprimir» ============================
// Selector multi-archivo de la tribu → nombre + formato + contraseña
// opcional → TribalZip.build → guarda en la tribu y lo mete a la
// colección «mis comprimidos». API: TribalZipUI.open(deps)
// ============================================================================
window.TribalZipUI = (function () {
    'use strict';
    var ov, deps, sel = {};
    var FILTERS = [['all', 'Todo'], ['audio', 'Audio'], ['video', 'Video'],
                   ['image', 'Imágenes'], ['doc', 'Libros y notas'], ['other', 'Otros']];
    function esc(s) {
        var E = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
        return String(s || '').replace(/[&<>"]/g, function (c) { return E[c]; });
    }
    function kindOf(m) {
        if (m.kind) return m.kind === 'file' ? 'other' : m.kind;
        var n = (m.name || '').toLowerCase();
        if (/\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba|wma|amr|aiff?)$/.test(n)) return 'audio';
        if (/\.(mp4|mkv|webm|avi|mov|3gp|m4v)$/.test(n)) return 'video';
        if (/\.(png|jpe?g|gif|webp|bmp|svg|heic|avif)$/.test(n)) return 'image';
        if (/\.(pdf|epub|txt|mobi|docx?|md)$/.test(n)) return 'doc';
        return 'other';
    }
    var ICONS = { audio: 'bi-music-note-beamed', video: 'bi-film',
                  image: 'bi-image', doc: 'bi-book-half',
                  other: 'bi-file-earmark', file: 'bi-file-earmark' };
    function list(f) {
        var box = ov.querySelector('#zp-list');
        var items = (deps.items || []).filter(function (m) {
            return f === 'all' || kindOf(m) === f; }).slice(0, 200);
        box.innerHTML = items.length ? items.map(function (m) {
            var k = kindOf(m);
            return '<label class="zp-row"><input type="checkbox" data-id="' +
                m.id + '"' + (sel[m.id] ? ' checked' : '') + '>' +
                '<i class="bi ' + ICONS[k] + '"></i>' +
                '<span>' + esc(m.name) + '</span></label>';
        }).join('') : '<p class="vn-empty">Nada aquí todavía</p>';
    }
    function selected() {
        return (deps.items || []).filter(function (m) { return sel[m.id]; });
    }
    function compress() {
        var items = selected(), st = ov.querySelector('#zp-st');
        if (!items.length) { st.textContent = 'Elige al menos un archivo'; return; }
        var name = ov.querySelector('#zp-name').value.trim() || 'comprimido';
        var pw = ov.querySelector('#zp-pw').value;
        var files = [], i = 0;
        st.textContent = 'Leyendo archivos…';
        (function next() {
            if (i >= items.length) return make();
            var m = items[i++];
            deps.urlFor(m, function (u) {
                if (!u) return next();
                fetch(u).then(function (r) { return r.blob(); })
                    .then(function (b) {
                        files.push({ name: m.name, blob: b,
                                     mtime: m.addedAt || Date.now() });
                        next();
                    }).catch(function () { next(); });
            });
        })();
        function make() {
            if (!files.length) { st.textContent = 'No se pudo leer nada'; return; }
            st.textContent = 'Comprimiendo…';
            window.TribalZip.build(files, { password: pw || null },
                function (p) {
                    st.textContent = 'Comprimiendo ' +
                        Math.round(p * 100) + '%…';
                }).then(function (blob) {
                    var f = new File([blob], name + '.zip',
                                     { type: 'application/zip' });
                    return deps.store.add(f);
                }).then(function (m) {
                    return misComprimidos().then(function (col) {
                        if (col && m && deps.store.toggleInCollection)
                            deps.store.toggleInCollection(m.id, col.id);
                        if (deps.reload) deps.reload();
                        deps.toast('«' + name + '.zip» en «mis comprimidos»');
                        sel = {}; list(ov.querySelector('.zp-f.on').dataset.f);
                        st.textContent = '';
                    });
                }).catch(function (e) {
                    st.textContent = 'Error: ' + (e && e.message || e); });
        }
    }
    function misComprimidos() {
        var cols = deps.store.listCollections ?
            deps.store.listCollections() : Promise.resolve([]);
        return Promise.resolve(cols).then(function (arr) {
            var c = (arr || []).filter(function (x) {
                return /^mis comprimidos$/i.test(x.name); })[0];
            return c ? c : deps.store.createCollection('mis comprimidos');
        });
    }
    function open(d) {
        deps = d; sel = {};
        if (window.TribalState) TribalState.opened('zip');
        if (ov) ov.parentNode.removeChild(ov);
        ov = document.createElement('div');
        ov.className = 'tribal-overlay lk-overlay vn-overlay zp-overlay';
        ov.innerHTML = '<div class="lk-panel vn-panel"><div class="lk-head">' +
            '<h3><i class="bi bi-file-zip"></i> Comprimir</h3>' +
            '<button class="lk-x" id="zp-x"><i class="bi bi-x-lg"></i></button></div>' +
            '<div class="lk-body zp-body"><div class="zp-filters">' +
            FILTERS.map(function (f, i) {
                return '<button class="zp-f' + (i ? '' : ' on') + '" data-f="' +
                    f[0] + '">' + f[1] + '</button>'; }).join('') + '</div>' +
            '<div id="zp-list" class="zp-list"></div>' +
            '<div class="zp-form"><label><i class="bi bi-tag"></i>' +
            '<input id="zp-name" placeholder="nombre del zip" value="mis archivos"></label>' +
            '<label><i class="bi bi-key"></i>' +
            '<input id="zp-pw" type="password" placeholder="contraseña (opcional)"></label>' +
            '<button id="zp-go"><i class="bi bi-file-zip"></i> Comprimir a ZIP</button></div>' +
            '<p class="zp-hint">El .zip se guarda en la colección ' +
            '«mis comprimidos» — se puede compartir por WhatsApp, correo, etc.</p>' +
            '<div id="zp-st" class="vn-state"></div></div></div>';
        (deps.mount || document.body).appendChild(ov);
        ov.querySelector('#zp-x').addEventListener('click', function () {
            ov.parentNode.removeChild(ov); ov = null; if (window.TribalState) TribalState.closed('zip'); });
        ov.addEventListener('click', function (e) {
            if (e.target === ov) { ov.parentNode.removeChild(ov); ov = null; if (window.TribalState) TribalState.closed('zip'); } });
        ov.querySelector('.zp-filters').addEventListener('click', function (e) {
            var b = e.target.closest('.zp-f'); if (!b) return;
            ov.querySelectorAll('.zp-f').forEach(function (x) {
                x.classList.toggle('on', x === b); });
            list(b.dataset.f);
        });
        ov.querySelector('#zp-list').addEventListener('change', function (e) {
            var c = e.target.closest('input[data-id]'); if (!c) return;
            if (c.checked) sel[c.dataset.id] = 1; else delete sel[c.dataset.id];
        });
        ov.querySelector('#zp-go').addEventListener('click', compress);
        list('all');
    }
    return { open: open };
})();
