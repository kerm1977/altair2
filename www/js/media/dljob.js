// ============================================================================
// ARCHIVO: media/dljob.js — motor de la cola de descargas
// RESPONSABILIDAD: cola secuencial de trabajos yt-dlp: enqueue → pump → run
// → finish. Emite por ctx: say (línea de estado), log (consola), bar
// (progreso), refresh (repintar lista), reload (biblioteca), toast, plug,
// store, mimeOf, metaOf. Heartbeat por segundo mientras el motor no emite
// líneas (init lento desempaquetando python+ffmpeg).
// API: TribalDlJob.init(ctx) / enqueue(job) / onProg(p) / cancel()
//      queue() / running() / pct() / line()
// ============================================================================
window.TribalDlJob = (function () {
    'use strict';
    var ctx = {};
    var queue = [], running = null, tickT = null;
    var pct = -1, lastLine = '';

    function init(c) { ctx = c || {}; }
    function say(t) { if (ctx.say) ctx.say(t); }
    function log(t, cl) { if (ctx.log) ctx.log(t, cl); }
    function bar(p) { if (ctx.bar) ctx.bar(p); }
    function repaint() { if (ctx.refresh) ctx.refresh(); }

    // heartbeat: si el motor no emite líneas (init lento), el estado sigue vivo
    function startTick(t0) {
        stopTick();
        tickT = setInterval(function () {
            if (!running) return stopTick();
            var s = Math.floor((Date.now() - t0) / 1000);
            say(lastLine || ('preparando motor yt-dlp… ' + s + 's'));
            repaint();
        }, 1000);
    }
    function stopTick() { if (tickT) { clearInterval(tickT); tickT = null; } }

    // cada línea cruda de yt-dlp → barra + estado + consola
    function onProg(p) {
        if (p.pct >= 0) { pct = p.pct; bar(pct); }
        if (p.line) {
            lastLine = p.line;
            say(p.line.slice(0, 120));
            log(p.line);
        }
        repaint();
    }

    function enqueue(job) {
        queue.push(job);
        say('en cola — ' + (queue.length + (running ? 1 : 0)) +
            ' trabajo(s)');
        repaint(); pump();
    }

    function pump() {
        if (running || !queue.length) return;
        running = queue.shift(); pct = -1; lastLine = ''; bar(0);
        run(running);
    }

    function run(job) {
        var p = ctx.plug && ctx.plug();
        if (!p) return finish(null,
            '✖ la descarga corre solo en el APK instalado');
        startTick(Date.now());
        try {
            p.dlStart({ url: job.url, audio: job.audio,
                        playlist: job.playlist }).then(function (r) {
                var files = (r && r.files && r.files.length) ? r.files
                    : (r && r.path ? [r] : []);
                Promise.all(files.map(function (f) {
                    return adoptOne(f, job);
                })).then(function () {
                    finish(files.length ? files.length +
                        ' archivo(s) en tu biblioteca' : null,
                        files.length ? null : '✖ yt-dlp no dejó archivo');
                });
            }).catch(function (e) {
                var m = String((e && e.message) || e).slice(0, 140);
                // "closed file" = bug del motor yt-dlp ya arreglado en
                // versiones nuevas → sugerir ⟳ actualizar motor
                if (/closed file/i.test(m)) {
                    log('✖ ' + m, 'err');
                    log('→ bug conocido de yt-dlp — toca «⟳ actualizar ' +
                        'motor» y reintenta', 'err');
                    m += ' — actualiza el motor (⟳)';
                }
                window.TribalDlLog.add({ name: job.url, url: job.url,
                    kind: job.audio ? 'a' : 'v', status: 'fail', err: m });
                log('✖ ' + m, 'err');
                finish(null, '✖ ' + m);
            });
        } catch (e) { finish(null, '✖ ' + String(e)); }
    }

    // el archivo bajó a tribu_dl (staging) → dlAdopt lo mueve a
    // tribu_media/ y queda registrado como archivo PROPIO de la
    // biblioteca (meta.path relativo, sin ref): igual que subirlo por
    // el selector — entra a Videos/Música de una y persiste.
    // Si la adopción falla, queda como ref externa (comportamiento viejo).
    function adoptOne(f, job) {
        var mime = ctx.mimeOf(f.name);
        function done(pathForLog, metaId, absForLog) {
            window.TribalDlLog.add({ name: f.name,
                path: absForLog || pathForLog,
                lib: pathForLog.indexOf('tribu_media') === 0
                     ? pathForLog : null,
                size: f.size, url: job.url,
                kind: job.audio ? 'a' : 'v', status: 'ok',
                metaId: metaId });
        }
        var p = ctx.plug && ctx.plug();
        if (!p || !p.dlAdopt) {          // fallback: solo ref
            var m = null;
            try {
                ctx.store.addRefs([{ path: f.path, name: f.name,
                    size: f.size, mime: mime, mtime: Date.now() }]);
                m = ctx.metaOf(f.path);
            } catch (e) {}
            return Promise.resolve(done(f.path, m ? m.id : null));
        }
        return p.dlAdopt({ path: f.path, name: f.name }).then(function (r) {
            var m2 = null;
            try {
                m2 = ctx.store.adoptLocal({ path: r.path, name: f.name,
                    size: r.size || f.size, mime: mime, dl: true });
            } catch (e) {}
            done(r.path, m2 ? m2.id : null, r.abs || f.path);
        }).catch(function () {
            var m3 = null;
            try {
                ctx.store.addRefs([{ path: f.path, name: f.name,
                    size: f.size, mime: mime, mtime: Date.now() }]);
                m3 = ctx.metaOf(f.path);
            } catch (e) {}
            done(f.path, m3 ? m3.id : null);
        });
    }

    function finish(ok, err) {
        stopTick(); running = null;
        if (ok) {
            bar(100); say('✔ ' + ok);
            if (ctx.toast) ctx.toast('⬇ descarga lista');
            log('✔ ' + ok);
        } else say(err || '');
        if (ctx.reload) ctx.reload();
        repaint(); pump();
    }

    // al cerrar la página: corta el proceso nativo y vacía la cola
    function cancel() {
        stopTick();
        if (running && ctx.plug && ctx.plug()) {
            try { ctx.plug().dlCancel(); } catch (e) {}
        }
        queue = []; running = null;
    }

    return { init: init, enqueue: enqueue, onProg: onProg, cancel: cancel,
             queue: function () { return queue; },
             running: function () { return running; },
             pct: function () { return pct; },
             line: function () { return lastLine; } };
})();
