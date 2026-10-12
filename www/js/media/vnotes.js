// === media/vnotes.js — Notas de audio (grabador tipo podcast) ==========
// Mic: toca→graba / grabando→pausa / pausa→reanuda. Stop → confirmación:
// guardar / seguir / eliminar (2ª confirmación). Guarda «Mi grabación N»
// con info.vn=1. Viz: vnotesviz.js · Editor: TribalVNoteFX (vnotesfx.js).
window.TribalVNotes = (function () {
    'use strict';
    var ov, deps, rec, stream, viz, chunks, tickT, mime,
        state = 'idle', elapsed = 0, startedAt = 0;

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
    function nextName() {
        var n = lastN;
        (deps.items || []).forEach(function (m) {
            var x = /^mi grabaci[oó]n\s+(\d+)/i.exec(m.name || '');
            if (x) n = Math.max(n, +x[1]);
        });
        return 'Mi grabación ' + (lastN = n + 1);
    }
    function ext() {
        var m = (mime || '').split(';')[0].split('/')[1] || 'webm';
        return '.' + (m === 'mpeg' ? 'mp3' : m);
    }

    function setState(s) {
        state = s;
        var recB = ov.querySelector('#vn-rec'), stopB = ov.querySelector('#vn-stop');
        var st = ov.querySelector('#vn-state');
        recB.classList.toggle('live', s === 'rec');
        recB.querySelector('i').className = 'bi bi-' +
            (s === 'rec' ? 'pause' : s === 'paused' ? 'play' : 'mic') + '-fill';
        stopB.hidden = (s === 'idle');
        st.textContent = s === 'rec' ? 'Grabando — toca para pausar' :
            s === 'paused' ? 'En pausa — toca para seguir' :
                             'Toca el micrófono para grabar';
    }
    function tick() {
        ov.querySelector('#vn-time').textContent = fmtT(
            elapsed + (state === 'rec' ? (Date.now() - startedAt) / 1000 : 0));
    }

    function startRec() {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (st) {
            stream = st;
            mime = MIMES.filter(function (m) {
                try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; }
            })[0];
            rec = new MediaRecorder(st, mime ? { mimeType: mime } : undefined);
            chunks = [];
            rec.ondataavailable = function (e) {
                if (e.data && e.data.size) chunks.push(e.data);
            };
            rec.onstop = onStopped;
            rec.start(300);
            startedAt = Date.now();
            setState('rec');
            tickT = setInterval(tick, 250);
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
        clearInterval(tickT);
    }
    function onStopped() {
        endStream(); setState('idle');
        ov.querySelector('#vn-time').textContent = '00:00';
        var blob = new Blob(chunks, { type: mime || 'audio/webm' });
        if (!blob.size) return;
        var name = nextName() + ext(); deps.store.add(
            new File([blob], name, { type: blob.type })).then(function (m) {
            if (m && deps.store.updateInfo) deps.store.updateInfo(m.id,
                { vn: 1, dur: Math.max(.1, elapsed) });
            deps.toast('«' + name + '» guardada en la tribu');
            if (deps.reload) deps.reload();
            fillList();
        });
    }

    // stop → confirmar: guardar / seguir / eliminar (eliminar = doble confirm)
    function askStop() {
        var box = ov.querySelector('#vn-ask');
        box.innerHTML = '<p><i class="bi bi-question-circle"></i> ' +
            '¿Qué hago con «' + esc(nextName()) + '»?</p><div class="vn-ask-btns">' +
            '<button data-a="save"><i class="bi bi-check2"></i> Guardar</button>' +
            '<button data-a="more"><i class="bi bi-play"></i> Seguir grabando</button>' +
            '<button data-a="del" class="danger"><i class="bi bi-trash3"></i> Eliminar memo</button></div>';
        box.hidden = false;
    }
    function askDelete() {
        var box = ov.querySelector('#vn-ask');
        box.innerHTML = '<p><i class="bi bi-exclamation-triangle"></i> ' +
            '¿Seguro? El memo se pierde para siempre.</p><div class="vn-ask-btns">' +
            '<button data-a="del2" class="danger"><i class="bi bi-trash3"></i> Sí, eliminar</button>' +
            '<button data-a="more"><i class="bi bi-arrow-left"></i> Volver</button></div>';
    }
    function onAsk(e) {
        var b = e.target.closest('[data-a]');
        if (!b) return;
        var a = b.dataset.a, box = ov.querySelector('#vn-ask');
        if (a === 'del') return askDelete();
        box.hidden = true;
        if (a === 'more') { if (rec) rec.resume();
            startedAt = Date.now(); setState('rec'); return; }
        if (rec && rec.state !== 'inactive') {
            if (a === 'del2') {
                rec.onstop = function () { endStream(); setState('idle'); };
                try { rec.stop(); } catch (e2) { endStream(); setState('idle'); }
            } else {                                  // save
                try { rec.stop(); } catch (e2) { onStopped(); }
            }
        }
    }

    // lista: SOLO las grabaciones hechas aquí (info.vn o «Mi grabación …»)
    function fillList() {
        var box = ov.querySelector('#vn-list');
        var list = (deps.items || []).filter(function (m) {
            return m.kind === 'audio' &&
                ((m.info && m.info.vn) || /^mi grabaci/i.test(m.name || ''));
        }).slice(0, 40);
        box.innerHTML = list.length ? list.map(function (m) {
            return '<div class="vn-row"><i class="bi bi-mic"></i>' +
                '<span>' + esc(m.name) + '</span>' +
                '<button data-play="' + m.id + '" title="Escuchar">' +
                '<i class="bi bi-play-circle"></i></button><button data-edit="' +
                m.id + '" title="Editar"><i class="bi bi-sliders"></i></button></div>';
        }).join('') : '<p class="vn-empty">Sin notas todavía</p>';
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
        ov.querySelector('#vn-list').addEventListener('click', function (e) {
            var b = e.target.closest('[data-play],[data-edit]');
            if (!b) return;
            var id = b.dataset.play || b.dataset.edit;
            var m = (deps.items || []).find(function (x) { return x.id === id; });
            if (!m) return;
            if (b.dataset.play && window.TribalVNotePlay)
                TribalVNotePlay.toggle(m, b.closest('.vn-row'), deps);
            else if (b.dataset.edit) edit(m, deps);   // editor aquí mismo
        });
        ov.querySelector('#vn-rec').addEventListener('click', function () {
            if (state === 'idle') return startRec();
            if (state === 'rec') {
                elapsed += (Date.now() - startedAt) / 1000;
                rec.pause(); setState('paused');
            } else { rec.resume(); startedAt = Date.now(); setState('rec'); }
        });
        ov.querySelector('#vn-stop').addEventListener('click', function () {
            if (state === 'rec') {
                elapsed += (Date.now() - startedAt) / 1000; rec.pause();
            }
            setState('paused'); askStop();
        });
    }
    function close() {
        if (state !== 'idle') return askStop();   // grabando → decide primero
        if (window.TribalVNotePlay) TribalVNotePlay.stop();
        endStream();
        if (ov) { ov.parentNode.removeChild(ov); ov = null; }
    }
    function open(d) {
        deps = d;
        if (ov) close(); build();
        elapsed = 0; setState('idle'); fillList();
    }
    // editor de la nota guardada → módulo aparte (vnotesfx.js)
    function edit(m, d) {
        if (window.TribalVNoteFX) TribalVNoteFX.open(m, d);
        else (d.toast || function () {})('Editor no disponible'); }
    return { open: open, edit: edit };
})();