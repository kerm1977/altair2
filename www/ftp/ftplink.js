// ftplink.js — lógica de la interfaz tribal del servidor LAN
// Corre en el navegador del OTRO equipo: lista /api/list, descarga /dl,
// sube archivos con POST /up?n=… y refresca cuando la app los indexa.
(function () {
    'use strict';
    var list = document.getElementById('list');
    var zone = document.getElementById('zone');
    var fileIn = document.getElementById('file');
    var prog = document.getElementById('prog');
    var progBar = document.getElementById('progbar');
    var progTxt = document.getElementById('progtxt');

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function sz(b) {
        b = Number(b) || 0;
        if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
        if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
        return b + ' B';
    }
    function ico(k) {
        return { audio: '♪', video: '▶', image: '❀', doc: '✎' }[k] || '◈';
    }

    function load() {
        fetch('/api/list').then(function (r) { return r.json(); })
            .then(function (items) {
                if (!items || !items.length) {
                    list.innerHTML = '<p class="tp-empty">La tribu está vacía — sube el primer archivo arriba.</p>';
                    return;
                }
                list.innerHTML = items.map(function (it) {
                    return '<div class="tp-card"><div class="tp-card-top">' +
                        '<span class="tp-ico">' + ico(it.k) + '</span>' +
                        '<div class="tp-info"><b>' + esc(it.n) + '</b>' +
                        '<small>' + esc(it.k || 'archivo') + ' · ' + sz(it.s) + '</small></div></div>' +
                        '<hr class="tp-hr"><div class="tp-acts">' +
                        '<a class="tp-btn" href="/dl?p=' + encodeURIComponent(it.p) +
                        '&n=' + encodeURIComponent(it.n) + '" download>⬇ Descargar</a>' +
                        '</div></div>';
                }).join('');
            }).catch(function () {
                list.innerHTML = '<p class="tp-empty">No se pudo leer el catálogo — ¿sigue abierta la app en el teléfono?</p>';
            });
    }

    function upOne(f, onDone) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/up?n=' + encodeURIComponent(f.name || 'archivo'));
        prog.hidden = false;
        progTxt.textContent = 'Subiendo «' + f.name + '»…';
        xhr.upload.onprogress = function (e) {
            if (e.lengthComputable) progBar.style.width = Math.round(e.loaded / e.total * 100) + '%';
        };
        xhr.onload = function () { progBar.style.width = '100%'; onDone(xhr.status === 200); };
        xhr.onerror = function () { onDone(false); };
        xhr.send(f);
    }

    function upAll(files) {
        var arr = Array.prototype.slice.call(files || []), i = 0, ok = 0;
        if (!arr.length) return;
        (function next() {
            if (i >= arr.length) {
                progTxt.textContent = '✓ ' + ok + ' archivo(s) recibidos por la tribu';
                setTimeout(function () { prog.hidden = true; progBar.style.width = '0'; }, 2500);
                setTimeout(load, 1200);   // la app tarda un momento en indexarlos
                return;
            }
            upOne(arr[i++], function (good) { if (good) ok++; next(); });
        })();
    }

    zone.addEventListener('click', function () { fileIn.click(); });
    fileIn.addEventListener('change', function () { upAll(fileIn.files); fileIn.value = ''; });
    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', function () { zone.classList.remove('over'); });
    zone.addEventListener('drop', function (e) {
        e.preventDefault(); zone.classList.remove('over');
        upAll(e.dataTransfer.files);
    });

    load();
})();
