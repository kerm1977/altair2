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
                pendingBuf: null, pendingBlobs: [], pendingExt: '' };

    var MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
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
        return '.' + (m === 'mpeg' ? 'mp3' : m);
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
        st.textContent = s === 'rec' ? 'Grabando — toca para pausar' :
            s === 'paused' ? 'En pausa — toca para seguir' :
            s === 'draft' ? 'Borrador recuperado — decide abajo' :
                             'Toca el micrófono para grabar';
    }
    function tick() {
        ov.querySelector('#vn-time').textContent = fmtT(pendDur() + ctx.liveSecs());
    }

    function startRec() {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (st) {
            stream = st;
            ctx.mime = MIMES.filter(function (m) {
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
    function onStopped() {
        endStream(); setState('idle');
        ov.querySelector('#vn-time').textContent = '00:00';
        var blob = new Blob(ctx.chunks || [], { type: ctx.mime || 'audio/webm' });
        window.TribalVNav.finishBlob(deps, ctx, blob, ctx.liveSecs());
    }

    // stop → confirmar: guardar / seguir / eliminar (eliminar = 3 pasos)
    function askStop() {
        var box = ov.querySelector('#vn-ask');
        box.innerHTML = '<p><i class="bi bi-question-circle"></i> ' +
            '¿Qué hago con «Mi grabación ' + peekN() + '»?</p>' +
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
            return window.TribalVNav.savePending(deps, ctx)
                .then(function () { window.TribalVNav.clearPending(ctx); })
                .then(function () {
                    ctx.elapsed = 0; setState('idle');
                    ov.querySelector('#vn-time').textContent = '00:00';
                });
        }
        if (a === 'more') {                     // seguir: reanuda la grabación
            if (rec && rec.state === 'paused') { rec.resume(); }
            else if (!rec) { startRec(); return; }
            ctx.startedAt = Date.now(); setState('rec'); return;
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

    // lista: SOLO las grabaciones hechas aquí (info.vn o «Mi grabación …»)
    function fillList() {
        var box = ov.querySelector('#vn-list');
        var list = (deps.items || []).filter(function (m) {
            return m.kind === 'audio' &&
                ((m.info && m.info.vn) || /^mi grabaci/i.test(m.name || ''));
        }).slice(0, 40);
        box.innerHTML = '';
        if (!list.length) {
            box.innerHTML = '<p class="vn-empty">Sin notas todavía</p>';
            return;
        }
        list.forEach(function (m) {
            var r = window.TribalVRow.row(m);
            box.appendChild(r);
            window.TribalVRow.attach(r, m, { deps: deps, refresh: fillList,
                play: function (rw) { if (window.TribalVNotePlay)
                    TribalVNotePlay.toggle(m, rw, deps); } });
        });
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
            '<button id="vn-stop" class="vn-stop" hidden><i class="bi bi-stop-fill"></i></button></div>' +
            '<div id="vn-ask" class="vn-ask" hidden></div><div id="vn-list" class="vn-list"></div>' +
            '</div></div>';
        (deps.mount || document.body).appendChild(ov);
        ov.querySelector('#vn-x').addEventListener('click', close);
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
        ov.querySelector('#vn-ask').addEventListener('click', onAsk);
        ov.querySelector('#vn-rec').addEventListener('click', function () {
            if (ctx.state === 'draft') return;   // decide en el aviso primero
            if (ctx.state === 'idle') return startRec();
            if (ctx.state === 'rec') {
                ctx.elapsed += (Date.now() - ctx.startedAt) / 1000;
                rec.pause(); setState('paused'); saveDraft();
            } else { rec.resume(); ctx.startedAt = Date.now(); setState('rec'); }
        });
        ov.querySelector('#vn-stop').addEventListener('click', function () {
            if (ctx.state === 'rec') {
                ctx.elapsed += (Date.now() - ctx.startedAt) / 1000; rec.pause();
            }
            setState('paused'); saveDraft(); askStop();
        });
    }
    // si el sistema se pega / la app se oculta → pausa + borrador salvo.
    // Se registran UNA vez a nivel de módulo (no dentro de build, que corre
    // cada vez que se abre el panel).
    document.addEventListener('visibilitychange', function () {
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
    function open(d) {
        deps = d;
        if (ov) close(); build();
        ctx.elapsed = 0; ctx.state = 'idle'; setState('idle'); fillList();
        if (window.TribalVDraft && TribalVDraft.meta()) restoreDraft();
    }
    return { open: open };
})();
