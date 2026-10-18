// ============================================================================
// ARCHIVO: media/dlgrab.js — descargador de internet (página completa)
// RESPONSABILIDAD: pega enlace/playlist y baja MP4/MP3 con yt-dlp nativo.
// Cola secuencial + historial persistente (TribalDlLog) paginado de a 20;
// «Mis descargas» muestra la carpeta real y borra con 3 confirmaciones.
// API: TribalDlGrab.open(deps) / close()
// ============================================================================
window.TribalDlGrab = (function () {
    'use strict';
    var ov = null, deps = {}, listener = null, tickT = null;
    var queue = [], running = null, dir = '';
    var pct = -1, lastLine = '', page = 0, review = false;
    var el = function (s) { return ov ? ov.querySelector(s) : null; };

    function plug() { return window.Capacitor &&
        Capacitor.Plugins && Capacitor.Plugins.TribalDl; }
    function toast(t) { (deps.toast || function () {})(t); }
    function say(t) { var s = el('.dg-status'); if (s) s.textContent = t; }
    function bar(p) { var f = el('.dg-fill');
        if (f) f.style.width = Math.max(0, Math.min(100, p)) + '%'; }
    function mimeOf(n) { return window.TribalDlList.mimeOf(n); }
    function refresh() {
        window.TribalDlList.render(el('.dg-list'), {
            queue: queue, running: running, pct: pct, line: lastLine,
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

    // heartbeat: si el motor no emite líneas (init lento), el estado sigue vivo
    function startTick(t0) {
        stopTick();
        tickT = setInterval(function () {
            if (!running) return stopTick();
            var s = Math.floor((Date.now() - t0) / 1000);
            say(lastLine || ('preparando motor yt-dlp… ' + s + 's'));
            refresh();
        }, 1000);
    }
    function stopTick() { if (tickT) { clearInterval(tickT); tickT = null; } }

    function grab(audio) {
        var url = (el('.dg-url').value || '').trim();
        var bad = !url || !/^https?:\/\//i.test(url);
        if (bad) return say(url ? 'Eso no parece un enlace — usa http(s)'
                                : 'Pega primero el enlace del video o playlist');
        queue.push({ url: url, audio: audio, playlist: el('.dg-pl').checked });
        el('.dg-url').value = '';
        say('en cola — ' + (queue.length + (running ? 1 : 0)) + ' trabajo(s)');
        refresh(); pump();
    }

    function pump() {
        if (running || !queue.length) return;
        running = queue.shift(); pct = -1; lastLine = ''; bar(0);
        runJob(running);
    }

    function runJob(job) {
        var p = plug();
        if (!p) return finish(null,
            '✖ la descarga corre solo en el APK instalado');
        startTick(Date.now());
        try {
            p.dlStart({ url: job.url, audio: job.audio,
                        playlist: job.playlist }).then(function (r) {
                var files = (r && r.files && r.files.length) ? r.files
                    : (r && r.path ? [r] : []);
                files.forEach(function (f) {
                    try {
                        MediaStore.addRefs([{ path: f.path, name: f.name,
                            size: f.size, mime: mimeOf(f.name),
                            mtime: Date.now() }]);
                    } catch (e) {}
                    var m = metaOf(f.path);
                    TribalDlLog.add({ name: f.name, path: f.path,
                        size: f.size, url: job.url,
                        kind: job.audio ? 'a' : 'v', status: 'ok',
                        metaId: m ? m.id : null });
                });
                finish(files.length ? files.length +
                    ' archivo(s) en «descargas»' : null,
                    files.length ? null : '✖ yt-dlp no dejó archivo');
            }).catch(function (e) {
                TribalDlLog.add({ name: job.url, url: job.url,
                    kind: job.audio ? 'a' : 'v', status: 'fail',
                    err: String((e && e.message) || e).slice(0, 140) });
                finish(null, '✖ ' + String((e && e.message) || e)
                    .slice(0, 140));
            });
        } catch (e) { finish(null, '✖ ' + String(e)); }
    }

    function finish(ok, err) {
        stopTick(); running = null;
        if (ok) { bar(100); say('✔ ' + ok); toast('⬇ descarga lista'); }
        else say(err || '');
        if (deps.reload) deps.reload();
        refresh(); pump();
    }

    // borrado real (tras los 3 pasos de dllist): archivo + registro
    function doDelete(id) {
        var e = TribalDlLog.find(id);
        if (e && e.path && plug()) {
            plug().dlDelete({ path: e.path }).catch(function () {});
        }
        if (e && e.metaId) {
            MediaStore.remove(e.metaId).then(function () {
                if (deps.reload) deps.reload();
            });
        }
        TribalDlLog.remove(id);
        toast('descarga eliminada');
        refresh();
    }

    function close() {
        stopTick();
        if (listener && listener.remove) { listener.remove(); listener = null; }
        if (running && plug()) { try { plug().dlCancel(); } catch (e) {} }
        queue = []; running = null;
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = null;
        if (window.TribalState) TribalState.closed('dl');
    }

    function open(d) {
        close();
        deps = d || {};
        if (window.TribalState) TribalState.opened('dl');
        try { TribalDlLog.markDead(); } catch (e) {}
        ov = document.createElement('div');
        ov.className = 'tribal-dl';
        ov.innerHTML = TribalDlList.pageHtml();
        (deps.mount || document.body).appendChild(ov);
        // el ‹ se conecta ANTES que todo lo demás — si algo falla abajo,
        // la página igual se puede cerrar y no queda una pantalla muerta
        el('.dg-x').addEventListener('click', close);
        try {
            if (plug()) {
                plug().addListener('dlProgress', function (p) {
                    if (p.pct >= 0) { pct = p.pct; bar(pct); }
                    if (p.line) { lastLine = p.line; say(p.line.slice(0, 120)); }
                    refresh();
                }).then(function (h) { listener = h; });
                plug().dlDir().then(function (r) { dir = r.dir || ''; });
            }
            el('.dg-vid').addEventListener('click',
                function () { grab(false); });
            el('.dg-aud').addEventListener('click',
                function () { grab(true); });
            el('.dg-rev').addEventListener('click', function () {
                review = !review; page = 0; refresh();
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
                if (del) TribalDlList.del3(del, doDelete, refresh);
            });
            refresh();
            if (!plug()) say('⚠ disponible solo en el APK instalado');
        } catch (e) { say('✖ ' + String(e)); }
    }

    return { open: open, close: close };
})();
