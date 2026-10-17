// === media/vnotes.js — Notas de audio (grabador tipo podcast) ==========
// Mic: toca→graba / grabando→pausa / pausa→reanuda. Stop → confirmación:
// guardar / seguir / eliminar (triple confirmación). Guarda «Mi grabación N».
// Si el sistema se pega o la app se oculta, queda en pausa con borrador
// persistente (vndraft.js + vnotesav.js) para seguir / guardar / eliminar.
// Viz: vnotesviz.js · fila: vnotesrow.js.
window.TribalVNotes = (function () {
    'use strict';
    var ov, deps, rec, stream, viz, tickT, draftT,
        ctx = { chunks: null, mime: '', elapsed: 0, startedAt: 0,
                pendingBuf: null, pendingBlobs: [], pendingExt: '',
                mode: 'mic', fmt: 'm4a' };   // mode: mic|call|screen · fmt: mp3|m4a|mp4
    function isScreen() { return ctx.mode === 'screen'; }
    function noop() {}

    var MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    // grabación nativa (servicio de micrófono): sobrevive a pantalla apagada;
    // el WebView solo aporta la visualización — el audio lo graba Android
    var REC = (window.Capacitor && window.Capacitor.Plugins &&
        window.Capacitor.Plugins.TribalRec) || null;
    function isNative() {
        return !!(REC && window.Capacitor.isNativePlatform &&
            window.Capacitor.isNativePlatform()); }
    // lee el .m4a del servicio → blob para el pipeline normal
    function recFileBlob() {
        return REC.recPeek().then(function (r) {
            if (!r || !r.rel) return null;
            var FS = window.Capacitor.Plugins.Filesystem;
            return FS.readFile({ path: r.rel, directory: 'DATA' })
                .then(function (f) {
                    var bin = atob(f.data), u = new Uint8Array(bin.length);
                    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
                    return { blob: new Blob([u], { type: 'audio/mp4' }),
                             durMs: r.durMs || 0 };
                });
        }); }
    function esc(s) {
        var E = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
        return String(s || '').replace(/[&<>"]/g, function (c) { return E[c]; });
    }
    function fmtT(s) {
        s = Math.floor(s);
        return ('0' + ((s / 60) | 0)).slice(-2) + ':' + ('0' + (s % 60)).slice(-2);
    }
    // «Mi grabación N»: siguiente N libre según lo ya guardado + sesión
    var lastN = 0;
    function peekN() {
        var n = lastN;
        (deps.items || []).forEach(function (m) {
            var x = /^mi grabaci[oó]n\s+(\d+)/i.exec(m.name || '');
            if (x) n = Math.max(n, +x[1]);
        });
        return n + 1;
    }
    ctx.nextName = function () { return 'Mi grabación ' + (lastN = peekN()); };
    ctx.ext = function () {
        var m = (ctx.mime || '').split(';')[0].split('/')[1] || 'webm';
        return '.' + (m === 'mpeg' ? 'mp3' : m === 'mp4' ? 'm4a' : m);
    };
    ctx.liveSecs = function () {
        return ctx.elapsed +
            (state() === 'rec' ? (Date.now() - ctx.startedAt) / 1000 : 0);
    };
    ctx.fillList = function () { fillList(); };
    function state() { return ctx.state; }
    function pendDur() { return window.TribalVNav.pendDur(ctx); }
    function saveDraft() { window.TribalVNav.saveDraft(ctx); }

    function setState(s) {
        ctx.state = s;
        if (viz && viz.setPaused) viz.setPaused(s === 'paused');
        var recB = ov.querySelector('#vn-rec'), stopB = ov.querySelector('#vn-stop');
        var st = ov.querySelector('#vn-state');
        recB.classList.toggle('live', s === 'rec');
        recB.querySelector('i').className = 'bi bi-' +
            (s === 'rec' ? 'pause' : s === 'paused' ? 'play' : 'mic') + '-fill';
        stopB.hidden = (s === 'idle' || s === 'draft');
        var minB = ov.querySelector('#vn-min');
        if (minB) minB.hidden = !(isScreen() && window.TribalVScreen &&
            TribalVScreen.native() && (s === 'rec' || s === 'paused'));
        st.textContent = s === 'rec' ? (isScreen() ? 'Grabando la pantalla — toca para pausar'
                                                   : 'Grabando — toca para pausar') :
            s === 'paused' ? 'En pausa — toca para seguir' :
            s === 'draft' ? 'Borrador recuperado — decide abajo' :
                             'Toca el micrófono para grabar';
    }
    function tick() {
        ov.querySelector('#vn-time').textContent = fmtT(pendDur() + ctx.liveSecs());
    }

    function startRec() {
        if (isNative()) {
            return REC.recStart().then(function () {
                ctx.mime = 'audio/mp4'; ctx.chunks = [];
                ctx.startedAt = Date.now();
                setState('rec');
                tickT = setInterval(tick, 250);
                // la visualización usa su propio stream (extra, opcional)
                navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(function (st) {
                        stream = st;
                        viz = window.TribalViz &&
                            TribalViz.mic(ov.querySelector('#vn-canvas'), stream);
                    }).catch(function () {});
            }).catch(function () {
                deps.toast('No se pudo iniciar la grabación');
            });
        }
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (st) {
            stream = st;
            ctx.mime = (ctx.fmt === 'm4a' ? ['audio/mp4'].concat(MIMES) : MIMES).filter(function (m) {
                try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; }
            })[0];
            rec = new MediaRecorder(st, ctx.mime ? { mimeType: ctx.mime } : undefined);
            ctx.chunks = [];
            rec.ondataavailable = function (e) {
                if (e.data && e.data.size) ctx.chunks.push(e.data);
            };
            rec.onstop = onStopped;
            rec.start(300);
            ctx.startedAt = Date.now();
            setState('rec');
            tickT = setInterval(tick, 250);
            draftT = setInterval(saveDraft, 5000);   // autoguardado cada 5s
            viz = window.TribalViz &&
                  TribalViz.mic(ov.querySelector('#vn-canvas'), stream);
        }).catch(function () {
            deps.toast('Sin acceso al micrófono — revisa el permiso');
        });
    }
    function endStream() {
        if (viz) { viz.stop(); viz = null; }
        if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
        stream = rec = null;
        clearInterval(tickT); clearInterval(draftT);
    }
    // audio terminado: si se pidió MP3 se convierte antes de guardar
    function finishAudio(blob, dur) {
        var N = window.TribalVNav;
        if (ctx.fmt !== 'mp3' || !window.TribalConvert || !blob.size ||
            ctx.pendingBuf || ctx.pendingBlobs.length) return N.finishBlob(deps, ctx, blob, dur);
        deps.toast('Convirtiendo a MP3…');
        TribalConvert.convert(blob, 'mp3-192').then(function (o) {
            ctx.mime = 'audio/mpeg'; N.finishBlob(deps, ctx, o.blob, dur);
        }).catch(function () { N.finishBlob(deps, ctx, blob, dur); });
    }
    function onStopped() {
        endStream(); setState('idle');
        ov.querySelector('#vn-time').textContent = '00:00';
        var blob = new Blob(ctx.chunks || [], { type: ctx.mime || 'audio/webm' });
        finishAudio(blob, ctx.liveSecs());
    }

    // ---- selector de modo: micrófono · llamada · pantalla y sonido ---------
    function pauseAny() {
        if (isScreen()) TribalVScreen.pause();
        else if (isNative()) REC.recPause().catch(noop);
        else if (rec) rec.pause();
    }
    function resumeAny() {
        if (isScreen()) TribalVScreen.resume();
        else if (isNative()) REC.recResume().catch(noop);
        else if (rec) rec.resume();
    }
    function begin(sel) {
        ctx.mode = sel.mode; ctx.fmt = sel.fmt;
        if (!isScreen()) return startRec();
        if (!window.TribalVScreen || !TribalVScreen.supported())
            return deps.toast('Este dispositivo no permite grabar la pantalla');
        TribalVScreen.start(onScreenEnded).then(function () {
            ctx.mime = ''; ctx.chunks = []; ctx.elapsed = 0; ctx.startedAt = Date.now();
            setState('rec'); tickT = setInterval(tick, 250);
            if (TribalVScreen.native()) {
                deps.toast('Grabando la pantalla — detén desde la notificación ■');
                setTimeout(TribalVScreen.minimize, 700);   // app al fondo, como el grabador de Samsung
            }
        }).catch(function () { deps.toast('No se pudo iniciar la grabación de pantalla'); });
    }
    function pickMode() {
        if (!window.TribalVMode) { ctx.mode = 'mic'; ctx.fmt = 'm4a'; return startRec(); }
        TribalVMode.pick(ov, begin);
    }
    function onScreenEnded() {                  // web: dejó de compartirse la pantalla
        if (!ov || ctx.state !== 'rec') return;
        ctx.elapsed += (Date.now() - ctx.startedAt) / 1000;
        setState('paused'); askStop();
    }
    function syncScreen() {                     // nativo: ¿se detuvo desde la notificación?
        TribalVScreen.peek().then(function (r) {
            if (r && !r.live && ctx.state === 'rec' && ov) {
                ctx.elapsed += (Date.now() - ctx.startedAt) / 1000;
                setState('paused'); askStop();
            }
        }).catch(noop);
    }
    function saveScreen() {
        var secs = ctx.elapsed;
        TribalVScreen.stop().then(function (r) {
            endStream(); setState('idle'); ctx.elapsed = 0;
            if (ov) ov.querySelector('#vn-time').textContent = '00:00';
            if (!r || !r.blob) return deps.toast('No quedó nada que guardar');
            if (!r.durMs) r.durMs = secs * 1000;
            return TribalVScreen.save(deps, r, ctx.fmt,
                ctx.fmt === 'mp3' ? ctx.nextName() : '', ctx.fillList);
        }).catch(function () { deps.toast('No se pudo guardar la grabación de pantalla'); });
    }
    function restoreScreen(r) {                 // MP4 que quedó sin guardar (cierre / notificación)
        ctx.mode = 'screen'; ctx.fmt = 'mp4'; ctx.elapsed = 0; setState('draft');
        ov.querySelector('#vn-time').textContent = fmtT((r.durMs || 0) / 1000);
        var box = ov.querySelector('#vn-ask');
        box.innerHTML = '<p><i class="bi bi-display"></i> Grabación de pantalla sin guardar' +
            (r.durMs ? ' (' + fmtT(r.durMs / 1000) + ')' : '') + ' — ¿qué hago?</p>' +
            '<div class="vn-ask-btns"><button data-a="d-save"><i class="bi bi-check2"></i> Guardar en Videos</button>' +
            '<button data-a="del" class="danger"><i class="bi bi-trash3"></i> Eliminar</button></div>';
        box.hidden = false;
    }

    // stop → confirmar: guardar / seguir / eliminar (eliminar = 3 pasos)
    function askStop() {
        var box = ov.querySelector('#vn-ask');
        box.innerHTML = '<p><i class="bi bi-question-circle"></i> ' +
            '¿Qué hago con ' + (isScreen() ? 'la grabación de pantalla' :
                '«Mi grabación ' + peekN() + '»') + '?</p>' +
            '<div class="vn-ask-btns"><button data-a="save"><i class="bi bi-check2"></i> Guardar</button>' +
            '<button data-a="more"><i class="bi bi-play"></i> Seguir grabando</button>' +
            '<button data-a="del" class="danger"><i class="bi bi-trash3"></i> Eliminar memo</button></div>';
        box.hidden = false;
    }
    function askDelete(step) {
        var box = ov.querySelector('#vn-ask');
        box.innerHTML = '<p><i class="bi bi-exclamation-triangle"></i> ' +
            (step === 1 ? '¿Seguro? El memo se pierde para siempre.'
                        : 'Última advertencia — no hay vuelta atrás.') +
            '</p><div class="vn-ask-btns">' +
            '<button data-a="del' + (step + 1) + '" class="danger">' +
            '<i class="bi bi-trash3"></i> ' +
            (step === 1 ? 'Sí, eliminar' : 'Eliminar definitivamente') + '</button>' +
            '<button data-a="back"><i class="bi bi-arrow-left"></i> Volver</button></div>';
    }
    function dropRec() {                        // tirar el memo sin guardar
        window.TribalVNav.clearPending(ctx); ctx.chunks = [];
        if (isScreen()) {
            TribalVScreen.peek().then(function (r) {
                TribalVScreen.cancel(); if (r) TribalVScreen.drop(r.rel);
            }).catch(noop);
            endStream(); setState('idle');
            ov.querySelector('#vn-time').textContent = '00:00';
            ctx.elapsed = 0; return;
        }
        if (isNative()) {
            REC.recCancel().catch(function () {});
            endStream(); setState('idle');
            ov.querySelector('#vn-time').textContent = '00:00';
            ctx.elapsed = 0; return;
        }
        if (rec && rec.state !== 'inactive') {
            rec.onstop = function () { endStream(); setState('idle'); };
            try { rec.stop(); } catch (e) { endStream(); setState('idle'); }
        } else { endStream(); setState('idle'); }
        ov.querySelector('#vn-time').textContent = '00:00'; ctx.elapsed = 0;
    }
    function onAsk(e) {
        var b = e.target.closest('[data-a]');
        if (!b) return;
        var a = b.dataset.a, box = ov.querySelector('#vn-ask');
        if (a === 'del') return askDelete(1);
        if (a === 'del2') return askDelete(2);
        if (a === 'back') { box.hidden = true; return; }
        box.hidden = true;
        if (a === 'del3') return dropRec();
        if (a === 'd-save') {                   // guardar el borrador tal cual
            if (isScreen()) return saveScreen();
            return window.TribalVNav.savePending(deps, ctx)
                .then(function () { window.TribalVNav.clearPending(ctx); })
                .then(function () {
                    ctx.elapsed = 0; setState('idle');
                    ov.querySelector('#vn-time').textContent = '00:00';
                });
        }
        if (a === 'more') {                     // seguir: reanuda la grabación
            if (isScreen()) {
                return TribalVScreen.peek().then(function (r) {
                    if (r && r.live) {
                        TribalVScreen.resume(); ctx.startedAt = Date.now(); setState('rec');
                    } else {
                        deps.toast('La grabación ya terminó — guárdala o elimínala');
                        askStop();
                    }
                }).catch(noop);
            }
            if (isNative()) {
                if (ctx.state === 'paused') REC.recResume().catch(function () {});
                else { startRec(); return; }    // borrador nativo → toma nueva
            }
            else if (rec && rec.state === 'paused') { rec.resume(); }
            else if (!rec) { startRec(); return; }
            ctx.startedAt = Date.now(); setState('rec'); return;
        }
        if (isScreen()) return saveScreen();
        if (isNative()) {                       // save (ruta nativa)
            REC.recStop().then(recFileBlob).then(function (r) {
                endStream(); setState('idle');
                ov.querySelector('#vn-time').textContent = '00:00';
                if (r && r.blob) finishAudio(r.blob, (r.durMs || 0) / 1000 || ctx.liveSecs());
            }).catch(function () { deps.toast('No se pudo cerrar la grabación'); });
            return;
        }
        if (rec && rec.state !== 'inactive') {  // save
            try { rec.stop(); } catch (e2) { onStopped(); }
        }
    }

    // ---- borrador encontrado al abrir: seguir / guardar / eliminar --------
    function restoreDraft() {
        window.TribalVNav.restore(ctx, function (meta) {
            if (!ov) return;
            ctx.elapsed = 0; setState('draft');
            ov.querySelector('#vn-time').textContent = fmtT(meta.dur || 0);
            var box = ov.querySelector('#vn-ask');
            box.innerHTML = '<p><i class="bi bi-arrow-counterclockwise"></i> ' +
                'Grabación sin guardar (' + fmtT(meta.dur || 0) + ') — ¿qué hago?</p>' +
                '<div class="vn-ask-btns"><button data-a="more"><i class="bi bi-play"></i> Seguir grabando</button>' +
                '<button data-a="d-save"><i class="bi bi-check2"></i> Guardar</button>' +
                '<button data-a="del" class="danger"><i class="bi bi-trash3"></i> Eliminar memo</button></div>';
            box.hidden = false;
        });
    }

    // lista: SOLO las grabaciones hechas aquí (info.vn o «Mi grabación …»),
    // las más nuevas primero, con fecha y duración · 20 por página
    var PER_PAGE = 20, listPage = 0;
    function fillList() {
        var box = ov.querySelector('#vn-list');
        var all = (deps.items || []).filter(function (m) {
            return m.kind === 'audio' &&
                ((m.info && m.info.vn) || /^mi grabaci/i.test(m.name || ''));
        }).sort(function (a, b) { return (b.addedAt || 0) - (a.addedAt || 0); });
        var pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
        listPage = Math.max(0, Math.min(listPage, pages - 1));
        var list = all.slice(listPage * PER_PAGE, (listPage + 1) * PER_PAGE);
        box.innerHTML = '';
        if (!all.length) {
            box.innerHTML = '<p class="vn-empty">Sin notas todavía</p>';
            return;
        }
        var head = document.createElement('div');
        head.className = 'vn-list-head';
        head.innerHTML = '<span><i class="bi bi-collection"></i> Grabaciones</span>' +
            '<small>' + all.length + ' en total</small>';
        box.appendChild(head);
        list.forEach(function (m) {
            var r = window.TribalVRow.row(m);
            box.appendChild(r);
            window.TribalVRow.attach(r, m, { deps: deps, refresh: fillList,
                play: function (rw) { if (window.TribalVNotePlay)
                    TribalVNotePlay.toggle(m, rw, deps); } });
        });
        if (pages > 1) {
            var pg = document.createElement('div');
            pg.className = 'vn-pager';
            pg.innerHTML = '<button data-pg="-1"' + (listPage ? '' : ' disabled') +
                '><i class="bi bi-chevron-left"></i> Anterior</button>' +
                '<span>Página ' + (listPage + 1) + ' / ' + pages + '</span>' +
                '<button data-pg="1"' + (listPage < pages - 1 ? '' : ' disabled') +
                '>Siguiente <i class="bi bi-chevron-right"></i></button>';
            pg.onclick = function (e) {
                var b = e.target.closest('[data-pg]');
                if (!b || b.disabled) return;
                if (window.TribalVNotePlay) TribalVNotePlay.stop();
                listPage += +b.getAttribute('data-pg');
                fillList();
                box.scrollIntoView({ block: 'start' });
            };
            box.appendChild(pg);
        }
    }

    function build() {
        ov = document.createElement('div');
        ov.className = 'tribal-overlay lk-overlay vn-overlay';
        ov.innerHTML = '<div class="lk-panel vn-panel"><div class="lk-head">' +
            '<h3><i class="bi bi-mic-fill"></i> Notas de audio</h3>' +
            '<button class="lk-x" id="vn-x"><i class="bi bi-x-lg"></i></button></div>' +
            '<div class="lk-body"><canvas id="vn-canvas" width="360" height="300"></canvas>' +
            '<div id="vn-time" class="vn-time">00:00</div><div id="vn-state" class="vn-state"></div>' +
            '<div class="vn-btns"><button id="vn-rec" class="vn-rec"><i class="bi bi-mic-fill"></i></button>' +
            '<button id="vn-stop" class="vn-stop" hidden><i class="bi bi-stop-fill"></i></button>' +
            '<button id="vn-min" class="vn-stop" hidden title="Minimizar y seguir grabando">' +
            '<i class="bi bi-box-arrow-down-left"></i></button></div>' +
            '<div id="vn-ask" class="vn-ask" hidden></div><div id="vn-list" class="vn-list"></div>' +
            '</div></div>';
        (deps.mount || document.body).appendChild(ov);
        ov.querySelector('#vn-x').addEventListener('click', close);
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
        ov.querySelector('#vn-ask').addEventListener('click', onAsk);
        ov.querySelector('#vn-rec').addEventListener('click', function () {
            if (ctx.state === 'draft') return;   // decide en el aviso primero
            if (ctx.state === 'idle') return pickMode();
            if (ctx.state === 'rec') {
                ctx.elapsed += (Date.now() - ctx.startedAt) / 1000;
                pauseAny();
                setState('paused'); saveDraft();
            } else {
                resumeAny();
                ctx.startedAt = Date.now(); setState('rec'); }
        });
        ov.querySelector('#vn-stop').addEventListener('click', function () {
            if (ctx.state === 'rec') {
                ctx.elapsed += (Date.now() - ctx.startedAt) / 1000;
                pauseAny();
            }
            setState('paused'); saveDraft(); askStop();
        });
        ov.querySelector('#vn-min').addEventListener('click', function () {
            if (window.TribalVScreen) TribalVScreen.minimize();
        });
    }
    // si el sistema se pega / la app se oculta → pausa + borrador salvo.
    // Se registran UNA vez a nivel de módulo (no dentro de build, que corre
    // cada vez que se abre el panel).
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden && ov && isScreen() && ctx.state === 'rec') syncScreen();
        if (isNative()) return;   // nativo sigue grabando con pantalla apagada
        if (document.hidden && ctx.state === 'rec' && rec) {
            ctx.elapsed += (Date.now() - ctx.startedAt) / 1000;
            try { rec.pause(); } catch (e) {}
            if (ov) setState('paused');
            saveDraft();
        }
    });
    window.addEventListener('pagehide', saveDraft);
    function close() {
        if (ctx.state === 'rec' || ctx.state === 'paused') return askStop();
        if (window.TribalVNotePlay) TribalVNotePlay.stop();
        endStream();
        if (ov) { ov.parentNode.removeChild(ov); ov = null; }
    }
    // archivo nativo pendiente (crash/cierre a medio grabar) → borrador
    function restoreNative(r) {
        if (!r || !r.rel) return;
        var FS = window.Capacitor.Plugins.Filesystem;
        FS.readFile({ path: r.rel, directory: 'DATA' }).then(function (f) {
            var bin = atob(f.data), u = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
            ctx.pendingBlobs = [new Blob([u], { type: 'audio/mp4' })];
            ctx.pendingExt = '.m4a';
            ctx.elapsed = 0; setState('draft');
            ov.querySelector('#vn-time').textContent = fmtT((r.durMs || 0) / 1000);
            var box = ov.querySelector('#vn-ask');
            box.innerHTML = '<p><i class="bi bi-arrow-counterclockwise"></i> ' +
                'Grabación recuperada del teléfono (' + fmtT((r.durMs || 0) / 1000) +
                ') — ¿qué hago?</p><div class="vn-ask-btns">' +
                '<button data-a="more"><i class="bi bi-play"></i> Seguir grabando</button>' +
                '<button data-a="d-save"><i class="bi bi-check2"></i> Guardar</button>' +
                '<button data-a="del" class="danger"><i class="bi bi-trash3"></i> Eliminar memo</button></div>';
            box.hidden = false;
            FS.deleteFile({ path: r.rel, directory: 'DATA' }).catch(function () {});
        }).catch(function () {});
    }
    function open(d) {
        deps = d;
        if (ov) close(); build();
        ctx.mode = 'mic'; ctx.fmt = 'm4a'; listPage = 0;
        ctx.elapsed = 0; ctx.state = 'idle'; setState('idle'); fillList();
        if (window.TribalVDraft && TribalVDraft.meta()) restoreDraft();
        else if (isNative()) (window.TribalVScreen ? TribalVScreen.peek() : Promise.resolve({}))
            .then(function (sr) {
                if (sr && sr.live) {              // pantalla grabándose en segundo plano
                    ctx.mode = 'screen'; ctx.fmt = 'mp4';
                    ctx.elapsed = (sr.durMs || 0) / 1000; ctx.startedAt = Date.now();
                    setState(sr.paused ? 'paused' : 'rec');
                    tickT = setInterval(tick, 250);
                    return;
                }
                if (sr && sr.rel) return restoreScreen(sr);
                return REC.recPeek().then(function (r) {
                    if (r && r.live) {                // sigue grabando en segundo plano
                        ctx.elapsed = (r.durMs || 0) / 1000; ctx.mime = 'audio/mp4';
                        ctx.startedAt = Date.now(); setState('rec');
                        tickT = setInterval(tick, 250); }
                    else if (r && r.rel) restoreNative(r);
                });
            }).catch(noop);
    }
    return { open: open };
})();
