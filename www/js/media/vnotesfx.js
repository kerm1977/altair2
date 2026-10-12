// === media/vnotesfx.js — Editor multipista de notas (UI) =================
// A–B (vnoteswave) · previa mezclada (vnotestracks) · crossfade, EQ, fades,
// eco · autosave (vnotesauto) · exporta MP3 y descarga. DSP: vnotesdsp.js.
// =========================================================================
window.TribalVNoteFX = (function () {
    'use strict';
    var ov, deps, item, ab, clip = null, pv = null, wv, tr, pvRaf, saveT,
        D = function () { return window.TribalVDSP; };

    function q(id) { return ov.querySelector(id); }
    function status(t) { q('#vfx-st').textContent = t; }
    function ft(s) { s = Math.max(0, s || 0); return Math.floor(s / 60) +
        ':' + ('0' + (s % 60).toFixed(1)).slice(-4); }
    function times() {
        var r = wv.sel();
        q('#vfx-ta').textContent = 'A ' + ft(r[0]);
        q('#vfx-td').textContent = ft(D().tlDur(ab, tr.list()));
        q('#vfx-tb').textContent = 'B ' + ft(r[1]);
    }
    function refresh(msg) { wv.buf(ab); tr.draw(); times(); status(msg || ''); save(); }
    function tl() { return D().tlDur(ab, tr.list()); }

    // autosave (sobrevive cierre de la app)
    function packNow() {
        return { voice: D().wav(ab), sel: wv.sel(), cfg: collect(),
            fmt: q('#vfx-fmt').value, xf: q('#vfx-xf').value,
            tracks: tr.list().map(function (t) {
                return { wav: D().wav(t.buf), name: t.name, off: t.off,
                    vol: t.vol, a: t.a, b: t.b, muted: t.muted, locked: t.locked };
            }) };
    }
    function save() {
        clearTimeout(saveT);
        saveT = setTimeout(function () {
            if (ov && ab && wv && tr) window.TribalVAuto.save(item.id, packNow());
        }, 500);
    }
    function restore() {
        window.TribalVAuto.load(item.id).then(function (p) {
            if (!p) return;
            var jobs = [D().decode(p.voice)].concat(p.tracks.map(function (t) {
                return D().decode(t.wav).then(function (b) { t.buf = b; });
            }));
            Promise.all(jobs).then(function (rs) {
                ab = rs[0]; wv.buf(ab); wv.setSel(p.sel[0], p.sel[1]);
                [['eq','eq'],['fIn','fin'],['fOut','fout'],['echoT','et'],
                 ['echoFb','ef'],['echoMix','em']].forEach(function (kv) {
                    if (p.cfg && p.cfg[kv[0]] != null)
                        q('#vfx-' + kv[1]).value = p.cfg[kv[0]]; });
                if (p.cfg) q('#vfx-echo').checked = !!p.cfg.echo;
                if (p.fmt) q('#vfx-fmt').value = p.fmt;
                if (p.xf) q('#vfx-xf').value = p.xf;
                tr.restore(p.tracks); times();
                status('Borrador restaurado · ' + (p.tracks || []).length + ' pista(s)');
            }).catch(function () {});
        });
    }

    // previa A–B mezclando todas las pistas
    function stopPv() {
        if (pvRaf) cancelAnimationFrame(pvRaf); pvRaf = null;
        if (pv) { try { pv.src.onended = null; pv.src.stop();
            pv.ctx.close(); } catch (e) {} pv = null; }
        if (wv) { wv.live(null); wv.pos(null); }
        var b = q('#vfx-pv'); if (b) b.innerHTML = '<i class="bi bi-play-fill"></i>';
    }
    function preview() {
        if (pv) return stopPv();
        var r = wv.sel(), a = r[0], b = Math.max(r[1], r[0] + .05);
        var Ctx = window.AudioContext || window.webkitAudioContext,
            ctx = new Ctx(), src = ctx.createBufferSource(),
            an = ctx.createAnalyser(), bus = ctx.createGain();
        src.buffer = ab; an.fftSize = 1024;
        src.connect(bus); bus.connect(an); an.connect(ctx.destination);
        tr.list().forEach(function (t) { D().armTrack(ctx, bus, t, a, b); });
        src.start(0, a, b - a); pv = { ctx: ctx, src: src, t0: ctx.currentTime };
        wv.live(an); q('#vfx-pv').innerHTML = '<i class="bi bi-stop-fill"></i>';
        (function loop() {
            if (!pv) return;
            wv.pos(a + (pv.ctx.currentTime - pv.t0));
            pvRaf = requestAnimationFrame(loop);
        })();
        src.onended = function () { if (pv) stopPv(); };
    }

    // agregar pistas
    function addTrackMeta(m) {
        deps.urlFor(m, function (u) {
            fetch(u).then(function (r) { return r.blob(); }).then(D().decode)
                .then(function (b) { tr.add(b, m.name); status('+ ' + m.name); });
        });
    }
    function pickTrack() {
        if (window.TribalFiles && TribalFiles.native() && deps.sono) {
            TribalFiles.pick(deps.sono, { kinds: ['audio'], single: true,
                title: 'Agregar pista' }).then(function (ms) {
                    if (ms && ms[0]) addTrackMeta(ms[0]); });
            return;
        }
        var inp = document.createElement('input'); inp.type = 'file';
        inp.accept = 'audio/*';
        inp.onchange = function () {
            if (inp.files[0]) D().decode(inp.files[0]).then(function (b) {
                tr.add(b, inp.files[0].name); status('+ ' + inp.files[0].name); });
        };
        inp.click();
    }

    function collect() {
        return { eq: q('#vfx-eq').value,
            fIn: +q('#vfx-fin').value || 0, fOut: +q('#vfx-fout').value || 0,
            echo: q('#vfx-echo').checked,
            echoT: +q('#vfx-et').value || .35,
            echoFb: Math.min(.85, +q('#vfx-ef').value || .35),
            echoMix: +q('#vfx-em').value || .4 };
    }
    function exportIt() {
        status('Renderizando mezcla…'); var rdur = 0;
        D().render(ab, collect(), tr.list()).then(function (out) {
            rdur = out.duration;
            return window.TribalConvert.convert(D().wav(out), q('#vfx-fmt').value,
                function (p) { status('Codificando ' + Math.round(p * 100) + '%…'); });
        }).then(function (r) {
            var base = item.name.replace(/\.[^.]+$/, '') + ' (edit)' + r.ext;
            var f = new File([r.blob], base, { type: r.blob.type });
            return deps.store.add(f).then(function (m) {
                if (deps.store.updateInfo)
                    deps.store.updateInfo(m.id, { vn: 1, dur: rdur });
                var a = document.createElement('a');       // descarga directa
                a.href = URL.createObjectURL(r.blob); a.download = base;
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
                status(''); deps.toast('«' + base + '» guardado y descargado');
                window.TribalVAuto.clear(item.id);
                if (deps.reload) deps.reload();
            });
        }).catch(function (e) { status('Error: ' + (e && e.message || e)); });
    }

    function build() {
        ov = document.createElement('div'); ov.className = 'tribal-overlay vn-overlay';
        ov.innerHTML = window.TribalVNoteUI.html(item, deps);
        (deps.mount || document.body).appendChild(ov);
        wv = window.TribalVWave.mount(q('#vfx-wave'));
        tr = window.TribalVTracks.mount(q('#vfx-lanes'), { tl: tl, onchange: function () {
            times(); save(); } });
        wv.onchange(times);
        q('#vfx-x').addEventListener('click', close);
        ov.addEventListener('click', function (e) {
            if (e.target === ov) close(); });
        q('#vfx-pv').addEventListener('click', preview);
        q('#vfx-keep').addEventListener('click', function () {
            var r = wv.sel(); ab = D().slice(ab, r[0], r[1], true); refresh('Recorte aplicado'); });
        q('#vfx-cut').addEventListener('click', function () {
            var r = wv.sel(); ab = D().slice(ab, r[0], r[1], false); refresh('Fragmento cortado'); });
        q('#vfx-copy').addEventListener('click', function () {
            var r = wv.sel(); clip = D().slice(ab, r[0], r[1], true);
            status('Copiado ' + clip.duration.toFixed(1) + ' s'); });
        q('#vfx-paste').addEventListener('click', function () {
            if (!clip) return status('Nada copiado — usa «Copiar»');
            ab = D().paste(ab, clip, wv.sel()[1], +q('#vfx-xf').value || 0);
            refresh('Pegado en B'); });
        q('#vfx-amb').addEventListener('change', function () {
            var id = q('#vfx-amb').value; q('#vfx-amb').value = '';
            if (!id) return;
            var m = deps.items.find(function (x) { return x.id === id; });
            if (m) addTrackMeta(m);
        });
        q('#vfx-ambpick').addEventListener('click', pickTrack);
        q('#vfx-go').addEventListener('click', exportIt);
        ov.querySelectorAll('.vfx-tabs button').forEach(function (b) {
            b.addEventListener('click', function () {
                ov.querySelectorAll('.vfx-tabs button').forEach(function (x) {
                    x.classList.toggle('on', x === b); });
                ov.querySelectorAll('.vfx-secwrap').forEach(function (w) {
                    w.classList.toggle('on', w.dataset.sec === b.dataset.sec); });
            });
        });
        ['vfx-eq', 'vfx-fin', 'vfx-fout', 'vfx-echo', 'vfx-et', 'vfx-ef', 'vfx-em',
         'vfx-fmt', 'vfx-xf'].forEach(function (id) {
            q('#' + id).addEventListener('change', function () { times(); save(); });
        });
        wv.buf(ab); times(); restore();
    }
    function close() {
        if (ab && wv && tr) window.TribalVAuto.save(item.id, packNow());
        stopPv();
        if (ov) { ov.parentNode.removeChild(ov); ov = null; }
        clip = null; wv = tr = null; }
    function open(m, d) {
        deps = d; item = m;
        deps.urlFor(m, function (u) {
            if (!u) return deps.toast('No se pudo leer el audio');
            fetch(u).then(function (r) { return r.blob(); }).then(D().decode)
                .then(function (buf) { ab = buf; if (ov) close(); build(); })
                .catch(function (e) { deps.toast(e.message || 'No se pudo decodificar'); });
        });
    }
    return { open: open };
})();
