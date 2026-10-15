// ftplink.js — interfaz tribal del servidor LAN (navegador del otro equipo)
// Secciones por tipo como la app · subir multi-archivo/carpeta con progreso
// · eliminar con confirmación de 3 pasos · carpetas favoritas por navegador.
(function () {
    'use strict';
    var $id = function (x) { return document.getElementById(x); };
    var list = $id('list'), zone = $id('zone'), fileIn = $id('file'), favbar = $id('favbar'),
        prog = $id('prog'), progBar = $id('progbar'), progTxt = $id('progtxt'), modal = $id('tpdel');
    var CHIP_KEY = 'tp_favdirs';

    function esc(s) { return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function sz(b) { b = Number(b) || 0;
        if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' GB';
        if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
        if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
        return b + ' B'; }
    var ICO = { audio: '♪', video: '▶', image: '❀', doc: '✎', other: '◈' };
    var GROUPS = [
        ['audio', '♪ Música'], ['video', '▶ Videos'], ['image', '❀ Imágenes'],
        ['doc', '✎ Documentos'], ['other', '◈ Otros']];

    /* ---- carpetas reales del equipo: Documentos/Imágenes/Música/Videos ----
       En Chrome/Edge de escritorio se abre la carpeta REAL (startIn).
       En otros navegadores cae al selector con filtro de tipo. */
    var BASE_CHIPS = [
        { n: '📄 Documentos', si: 'documents', a: '.pdf,.doc,.docx,.txt,.epub,.xls,.xlsx,.ppt,.pptx' },
        { n: '🖼 Imágenes', si: 'pictures', a: 'image/*' },
        { n: '♪ Música', si: 'music', a: 'audio/*' },
        { n: '▶ Videos', si: 'videos', a: 'video/*' },
        { n: '⬇ Descargas', si: 'downloads' },
        { n: '📂 Carpeta completa', d: 1 }];
    function favDirs() {
        try { return BASE_CHIPS.concat(JSON.parse(localStorage.getItem(CHIP_KEY) || '[]')); }
        catch (e) { return BASE_CHIPS.slice(); }
    }
    function saveCustom(arr) {
        try { localStorage.setItem(CHIP_KEY, JSON.stringify(arr)); } catch (e) {} }
    function paintFavs() {
        favbar.innerHTML = favDirs().map(function (c, ix) {
            var isC = ix >= BASE_CHIPS.length;
            return '<button class="tp-chip" data-fi="' + ix + '">' + esc(c.n) +
                (isC ? ' <span class="x" data-del="' + (ix - BASE_CHIPS.length) + '" title="Quitar acceso">✕</span>' : '') +
                '</button>';
        }).join('') + '<button class="tp-chip add" data-fi="new">＋ Crear acceso</button>';
    }
    function walkDir(dh, acc, done) {          // recorre una carpeta entera
        acc = acc || [];
        var it = dh.values();
        (function step() {
            it.next().then(function (r) {
                if (r.done) return done(acc);
                var h = r.value;
                if (h.kind === 'file') h.getFile().then(function (f) { acc.push(f); step(); }).catch(step);
                else walkDir(h, acc, function () { step(); });
            }).catch(function () { done(acc); });
        })();
    }
    function pickChip(c) {
        if (c.d) {                             // carpeta completa del equipo
            if (window.showDirectoryPicker) {
                window.showDirectoryPicker().then(function (dh) {
                    walkDir(dh, [], function (files) { upAll(files); });
                }).catch(function () {});
                return;
            }
            fileIn.removeAttribute('accept'); fileIn.setAttribute('webkitdirectory', '');
            fileIn.click(); return;
        }
        if (window.showOpenFilePicker && c.si) {   // abre la carpeta real de la PC
            window.showOpenFilePicker({ multiple: true, startIn: c.si })
                .then(function (hs) {
                    Promise.all(hs.map(function (h) { return h.getFile(); })).then(upAll);
                }).catch(function () {});
            return;
        }
        fileIn.removeAttribute('webkitdirectory');
        if (c.a) fileIn.setAttribute('accept', c.a); else fileIn.removeAttribute('accept');
        fileIn.click();
    }
    favbar.addEventListener('click', function (e) {
        var x = e.target.closest('[data-del]');
        if (x) { var arr = []; try { arr = JSON.parse(localStorage.getItem(CHIP_KEY) || '[]'); } catch (er) {}
            arr.splice(Number(x.getAttribute('data-del')), 1); saveCustom(arr); paintFavs(); return; }
        var b = e.target.closest('[data-fi]'); if (!b) return;
        var fi = b.getAttribute('data-fi');
        if (fi === 'new') {
            var n = window.prompt('Nombre del acceso directo (ej: Trabajo, Fotos del viaje):', '');
            if (!n) return;
            var t = window.prompt('¿Qué abre? (documentos / imagenes / musica / videos / descargas / carpeta / todo):', 'todo') || 'todo';
            var c = { n: n };
            if (/carpeta/.test(t)) c.d = 1;
            else if (/imagen/.test(t)) { c.si = 'pictures'; c.a = 'image/*'; }
            else if (/musica|audio/.test(t)) { c.si = 'music'; c.a = 'audio/*'; }
            else if (/video/.test(t)) { c.si = 'videos'; c.a = 'video/*'; }
            else if (/doc/.test(t)) { c.si = 'documents'; c.a = '.pdf,.doc,.docx,.txt,.epub,.xls,.xlsx,.ppt,.pptx'; }
            else if (/descarga/.test(t)) c.si = 'downloads';
            var arr2 = []; try { arr2 = JSON.parse(localStorage.getItem(CHIP_KEY) || '[]'); } catch (e2) {}
            arr2.push(c); saveCustom(arr2); paintFavs(); pickChip(c); return;
        }
        pickChip(favDirs()[Number(fi)]);
    });

    /* ---------------- lista con secciones por tipo ---------------- */
    function load() {
        fetch('/api/list').then(function (r) { return r.json(); })
            .then(function (data) {
                var items = (data && data.items) || [];
                var srv = document.getElementById('tp-srv');
                if (srv && data && data.name) srv.textContent = data.name + ' · tribu de archivos';
                if (!items.length) {
                    list.innerHTML = '<p class="tp-empty">La tribu está vacía — sube el primer archivo arriba.</p>';
                    return;
                }
                var html = '';
                GROUPS.forEach(function (g) {
                    var gk = g[0], rows = items.filter(function (it) {
                        return (it.k || 'other') === gk || (gk === 'other' && !ICO[it.k]); });
                    if (!rows.length) return;
                    html += '<div class="tp-sep"><span>' + g[1] + '</span></div>' + rows.map(function (it) {
                        var del = it.ro ? '<span class="tp-btag">incluida</span>'
                            : '<button class="tp-btn danger" data-deli="' + esc(it.i) + '" data-deln="' + esc(it.n) + '">🗑</button>';
                        return '<div class="tp-card"><div class="tp-card-top">' +
                            '<span class="tp-ico">' + (ICO[it.k] || '◈') + '</span>' +
                            '<div class="tp-info"><b>' + esc(it.n) + '</b>' +
                            '<small>' + esc(it.k || 'archivo') + ' · ' + sz(it.s) + '</small></div></div>' +
                            '<hr class="tp-hr"><div class="tp-acts">' +
                            '<a class="tp-btn" href="/dl?p=' + encodeURIComponent(it.p) +
                            '&n=' + encodeURIComponent(it.n) + '" download>⬇ Descargar</a>' + del +
                            '</div></div>';
                    }).join('');
                });
                list.innerHTML = html;
            }).catch(function () {
                list.innerHTML = '<p class="tp-empty">No se pudo leer el catálogo — ¿sigue abierta la app en el teléfono?</p>';
            });
    }

    /* ---------------- eliminar: modal de 3 pasos ---------------- */
    var delId = '', delName = '', delStep = 0;
    var T1 = document.getElementById('tpdel-t1'), T2 = document.getElementById('tpdel-t2'),
        NO = document.getElementById('tpdel-no'), YES = document.getElementById('tpdel-yes');
    var STEPS = [
        { t1: '¿Eliminar este archivo?', t2: '«%s» — paso 1 de 3', y: 'Continuar →' },
        { t1: 'Se borrará del dispositivo', t2: 'No solo sale de la lista — el archivo se elimina del teléfono. Paso 2 de 3', y: 'Sí, continuar →' },
        { t1: '⚠ Último paso — sin retorno', t2: '«%s» se eliminará definitivamente. ¿Estás realmente seguro?', y: '🗑 Eliminar para siempre' }];
    function openDel(id, name) { delId = id; delName = name; delStep = 0; paintDel(); modal.hidden = false; }
    function paintDel() { var s = STEPS[delStep];
        T1.innerHTML = '<b>' + s.t1 + '</b>';
        T2.textContent = s.t2.replace('%s', delName);
        YES.innerHTML = s.y;
        YES.className = 'tp-btn ' + (delStep === 2 ? 'danger' : ''); }
    NO.onclick = function () { modal.hidden = true; };
    YES.onclick = function () {
        delStep++;
        if (delStep < 3) return paintDel();
        modal.hidden = true;
        fetch('/del?i=' + encodeURIComponent(delId), { method: 'POST' })
            .then(function () { prog.hidden = false; progBar.style.width = '100%';
                progTxt.textContent = '🗑 «' + delName + '» eliminado de la tribu';
                setTimeout(function () { prog.hidden = true; progBar.style.width = '0'; }, 2200);
                setTimeout(load, 1000); })
            .catch(function () {});
    };
    list.addEventListener('click', function (e) {
        var b = e.target.closest('[data-deli]');
        if (b) openDel(b.getAttribute('data-deli'), b.getAttribute('data-deln'));
    });

    /* ---------------- subida multi-archivo con progreso ---------------- */
    function upOne(f, ix, total, onDone) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/up?n=' + encodeURIComponent(f.name || 'archivo'));
        prog.hidden = false;
        progTxt.textContent = 'Archivo ' + ix + '/' + total + ' — «' + f.name + '» (' + sz(f.size) + ')';
        xhr.upload.onprogress = function (e) {
            if (e.lengthComputable) progBar.style.width = Math.round(e.loaded / e.total * 100) + '%'; };
        xhr.onload = function () { progBar.style.width = '100%'; onDone(xhr.status === 200); };
        xhr.onerror = function () { onDone(false); };
        xhr.send(f);
    }
    function upAll(files) {
        var arr = Array.prototype.slice.call(files || []), i = 0, ok = 0;
        if (!arr.length) return;
        (function next() {
            if (i >= arr.length) {
                progTxt.textContent = '✓ ' + ok + ' de ' + arr.length + ' archivo(s) recibidos por la tribu';
                setTimeout(function () { prog.hidden = true; progBar.style.width = '0'; }, 2600);
                setTimeout(load, 1400);   // la app tarda un momento en indexarlos
                return; }
            upOne(arr[i], ++i, arr.length, function (good) { if (good) ok++; next(); });
        })();
    }
    zone.addEventListener('click', function () { pickChip({}); });
    fileIn.addEventListener('change', function () { upAll(fileIn.files); fileIn.value = ''; });
    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', function () { zone.classList.remove('over'); });
    zone.addEventListener('drop', function (e) { e.preventDefault(); zone.classList.remove('over'); upAll(e.dataTransfer.files); });

    paintFavs(); load(); setInterval(load, 20000);   // refresco suave: la tribu cambia
})();
