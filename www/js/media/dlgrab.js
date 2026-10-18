// ============================================================================
// ARCHIVO: media/dlgrab.js — descargador de internet (página completa)
// RESPONSABILIDAD: pega enlace/playlist y baja MP4/MP3 con yt-dlp nativo.
// La cola y la ejecución viven en dljob.js; el historial en dllog.js y el
// render de lista/consola/borrado en dllist.js. «Mis descargas» muestra la
// carpeta real; «consola» expone cada línea cruda del motor; «⟳ actualizar
// motor» baja el yt-dlp más reciente (los sitios cambian y el viejo da 403).
// API: TribalDlGrab.open(deps) / close()
// ============================================================================
window.TribalDlGrab = (function () {
    'use strict';
    var ov = null, deps = {}, listener = null;
    var page = 0, review = false, dir = '';
    var el = function (s) { return ov ? ov.querySelector(s) : null; };

    function plug() { return window.Capacitor &&
        Capacitor.Plugins && Capacitor.Plugins.TribalDl; }
    function toast(t) { (deps.toast || function () {})(t); }
    function say(t) { var s = el('.dg-status'); if (s) s.textContent = t; }
    function bar(p) { var f = el('.dg-fill');
        if (f) f.style.width = Math.max(0, Math.min(100, p)) + '%'; }
    function log(t, cls) {
        window.TribalDlList.logWrite(el('.dg-console'), t, cls);
    }
    function refresh() {
        var J = window.TribalDlJob;
        window.TribalDlList.render(el('.dg-list'), {
            queue: J.queue(), running: J.running(),
            pct: J.pct(), line: J.line(),
            items: window.TribalDlLog.list(), page: page,
            review: review, dir: review ? dir : ''
        });
        var rb = el('.dg-rev');
        if (rb) rb.classList.toggle('on', review);
    }
    function metaOf(path) {
        var idx = (window.MediaStore && MediaStore._index)
            ? MediaStore._index() : [], m = null;
        idx.forEach(function (x) { if (x.path === path) m = x; });
        return m;
    }

    // reproductor inline EN PRIMER PLANO dentro de la página — el visor
    // tribal monta en S.root (z-index menor) y quedaba tapado por la
    // página de descargas (se oía pero no se veía)
    function playInline(m) {
        var old = el('.dg-play');
        if (old) old.parentNode.removeChild(old);
        deps.urlFor(m, function (url) {
            if (!url || !ov) return say('no pude leer el archivo');
            var p = document.createElement('div');
            p.className = 'dg-play';
            p.innerHTML =
                '<button class="dg-play-x">‹</button>' +
                '<div class="dg-play-name">' + (m.name || '') + '</div>' +
                '<video class="dg-play-v" controls autoplay playsinline' +
                ' src="' + url + '"></video>';
            ov.appendChild(p);
            var v = p.querySelector('video');
            v.addEventListener('error', function () {
                say('✖ el archivo no se pudo reproducir');
            });
            p.querySelector('.dg-play-x').addEventListener('click',
                function () {
                    v.pause(); v.removeAttribute('src'); v.load();
                    p.parentNode.removeChild(p);
                });
        });
    }

    // tocar una descarga terminada la reproduce en el reproductor inline
    function openEntry(id) {
        var e = window.TribalDlLog.find(id);
        if (!e || e.status !== 'ok') return;
        var idx = MediaStore._index ? MediaStore._index() : [];
        var m = null;
        idx.forEach(function (x) {
            if (x.id === e.metaId || (e.path && x.path === e.path)) m = x;
        });
        if (!m) return say('ya no está en la biblioteca');
        if (m.kind === 'video' || m.kind === 'audio') playInline(m);
        else if (deps.sono && deps.sono.openItem) deps.sono.openItem(m);
        else say('no sé cómo abrir este tipo de archivo');
    }

    function grab(audio) {
        var url = (el('.dg-url').value || '').trim();
        var bad = !url || !/^https?:\/\//i.test(url);
        if (bad) return say(url ? 'Eso no parece un enlace — usa http(s)'
                                : 'Pega primero el enlace del video o playlist');
        var pl = el('.dg-pl').checked;
        log('▶ ' + url + '  [' + (audio ? 'audio mp3' : 'video mp4') +
            (pl ? ' · playlist' : '') + ']');
        window.TribalDlJob.enqueue({ url: url, audio: audio, playlist: pl });
        el('.dg-url').value = '';
        refresh();
    }

    // borrado real tras los 3 pasos (la máquina de pasos vive en dllist.js)
    function doDelete(id) {
        TribalDlList.delExec(id, { plug: plug, toast: toast,
            reload: deps.reload, repaint: refresh });
    }

    // «⟳ actualizar motor»: yt-dlp se desactualiza y los sitios empiezan a
    // fallar (403 etc.) — la librería baja el binario nuevo en caliente
    function updateEngine() {
        var p = plug();
        if (!p) return say('⚠ solo en el APK instalado');
        el('.dg-console').hidden = false;
        el('.dg-conbtn').textContent = '▾ consola';
        say('actualizando yt-dlp…'); log('⟳ updateYoutubeDL (stable)…');
        p.dlUpdate({ channel: 'stable' }).then(function (r) {
            var st = (r && r.status) || '?';
            log('motor: ' + st);
            say(st === 'DONE' ? '✔ motor actualizado'
                              : 'motor ya al día (' + st + ')');
        }).catch(function (e) {
            var m = String((e && e.message) || e);
            log('✖ update: ' + m, 'err'); say('✖ no se pudo actualizar');
        });
    }

    function close() {
        if (listener && listener.remove) { listener.remove(); listener = null; }
        if (window.TribalDlJob) TribalDlJob.cancel();
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = null;
        if (window.TribalState) TribalState.closed('dl');
    }

    function open(d) {
        close();
        deps = d || {};
        if (window.TribalState) TribalState.opened('dl');
        try { TribalDlLog.markDead(); } catch (e) {}
        TribalDlJob.init({ plug: plug, say: say, log: log, bar: bar,
            toast: toast, refresh: refresh, reload: deps.reload,
            store: window.MediaStore, mimeOf: TribalDlList.mimeOf,
            metaOf: metaOf });
        ov = document.createElement('div');
        ov.className = 'tribal-dl';
        ov.innerHTML = TribalDlList.pageHtml();
        (deps.mount || document.body).appendChild(ov);
        // el ‹ se conecta ANTES que todo lo demás — si algo falla abajo,
        // la página igual se puede cerrar y no queda una pantalla muerta
        el('.dg-x').addEventListener('click', close);
        try {
            if (plug()) {
                // addListener devuelve el handle DIRECTO en este Capacitor
                // (no promesa — un .then() aquí mataba open() entero)
                var h = plug().addListener('dlProgress',
                    window.TribalDlJob.onProg);
                if (h && h.then) h.then(function (x) { listener = x; });
                else listener = h;
                plug().dlDir().then(function (r) { dir = r.dir || ''; });
            }
            el('.dg-vid').addEventListener('click',
                function () { grab(false); });
            el('.dg-aud').addEventListener('click',
                function () { grab(true); });
            el('.dg-rev').addEventListener('click', function () {
                review = !review; page = 0; refresh();
            });
            el('.dg-upd').addEventListener('click', updateEngine);
            el('.dg-conbtn').addEventListener('click', function () {
                var c = el('.dg-console');
                c.hidden = !c.hidden;
                el('.dg-conbtn').textContent =
                    (c.hidden ? '▸' : '▾') + ' consola';
            });
            el('.dg-paste').addEventListener('click', function () {
                if (navigator.clipboard && navigator.clipboard.readText) {
                    navigator.clipboard.readText().then(function (t) {
                        if (t) el('.dg-url').value = t.trim();
                    }).catch(function () {});
                }
            });
            el('.dg-list').addEventListener('click', function (e) {
                var pg = e.target.closest('.dg-pg');
                if (pg) {
                    page += +pg.getAttribute('data-pg'); refresh(); return;
                }
                var del = e.target.closest('.dg-del');
                if (del) { TribalDlList.del3(del, doDelete, refresh); return; }
                var row = e.target.closest('.dg-row[data-id]');
                if (row) openEntry(row.getAttribute('data-id'));
            });
            refresh();
            if (!plug()) say('⚠ disponible solo en el APK instalado');
        } catch (e) { say('✖ ' + String(e)); }
    }

    return { open: open, close: close };
})();
