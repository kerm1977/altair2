// === media/vnotesfx.js — Editor simple de notas (UI) ======================
// Agregar audio · cortar fragmento A–B · efectos (EQ/fades/eco) · exportar
// MP3 con portada opcional. Previa en A–B (vnotespv) · autosave (vnotesauto)
// · DSP en vnotesdsp.js · onda/selección en vnoteswave.js.
// =========================================================================
window.TribalVNoteFX = (function () {
    'use strict';
    var ov, deps, item, ab, clip = null, wv, saveT, coverB = null,
        D = function () { return window.TribalVDSP; };

    function q(id) { return ov.querySelector(id); }
    function status(t) { q('#vfx-st').textContent = t; }
    function ft(s) { s = Math.max(0, s || 0); return Math.floor(s / 60) +
        ':' + ('0' + (s % 60).toFixed(1)).slice(-4); }
    function times() {
        var r = wv.sel();
        q('#vfx-ta').textContent = 'A ' + ft(r[0]);
        q('#vfx-td').textContent = ft(ab ? ab.duration : 0);
        q('#vfx-tb').textContent = 'B ' + ft(r[1]);
    }
    function refresh(msg) { wv.buf(ab); times(); status(msg || ''); save(); }

    // autosave (sobrevive cierre de la app)
    function packNow() {
        return { voice: D().wav(ab), sel: wv.sel(), cfg: collect(),
            fmt: q('#vfx-fmt').value, xf: q('#vfx-xf').value, tracks: [] };
    }
    function save() {
        clearTimeout(saveT);
        saveT = setTimeout(function () {
            if (ov && ab && wv) window.TribalVAuto.save(item.id, packNow());
        }, 500);
    }
    function restore() {
        window.TribalVAuto.load(item.id).then(function (p) {
            if (!p || !p.voice) return;
            D().decode(p.voice).then(function (b) {
                ab = b; wv.buf(ab); wv.setSel(p.sel[0], p.sel[1]);
                [['eq','eq'],['fIn','fin'],['fOut','fout'],['echoT','et'],
                 ['echoFb','ef'],['echoMix','em']].forEach(function (kv) {
                    if (p.cfg && p.cfg[kv[0]] != null)
                        q('#vfx-' + kv[1]).value = p.cfg[kv[0]]; });
                if (p.cfg) q('#vfx-echo').checked = !!p.cfg.echo;
                if (p.fmt) q('#vfx-fmt').value = p.fmt;
                if (p.xf) q('#vfx-xf').value = p.xf;
                times(); status('Borrador restaurado');
            }).catch(function () {});
        });
    }

    // previa A–B de la pista de trabajo (vnotespv.js)
    function stopPv() { window.TribalVPV.stop(); }
    function preview() {
        window.TribalVPV.toggle({ sel: wv.sel(), ab: ab, tracks: [],
            wv: wv, btn: q('#vfx-pv'), D: D });
    }

    // agregar audio: carga otro archivo como pista de trabajo
    function loadMeta(m) {
        deps.urlFor(m, function (u) {
            fetch(u).then(function (r) { return r.blob(); }).then(D().decode)
                .then(function (b) {
                    ab = b; clip = null;
                    wv.buf(ab); wv.setSel(0, ab.duration);
                    refresh('Cargado: ' + m.name); })
                .catch(function (e) { status(e.message || 'No decodificable'); });
        });
    }
    function pickFile() {
        if (window.TribalFiles && TribalFiles.native() && deps.sono)
            return TribalFiles.pick(deps.sono, { kinds: ['audio'],
                single: true, title: 'Agregar audio' }).then(function (ms) {
                if (ms && ms[0]) loadMeta(ms[0]); });
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'audio/*';
        inp.onchange = function () {
            if (inp.files[0]) D().decode(inp.files[0]).then(function (b) {
                ab = b; clip = null;
                wv.buf(ab); wv.setSel(0, ab.duration);
                refresh('Cargado: ' + inp.files[0].name);
            }).catch(function (e) { status(e.message || 'No decodificable'); });
        };
        inp.click();
    }

    function collect() {
        var V = function (id) { return q('#vfx-' + id).value; };
        return { eq: V('eq'), fIn: +V('fin') || 0, fOut: +V('fout') || 0,
            echo: q('#vfx-echo').checked, echoT: +V('et') || .35,
            echoFb: Math.min(.85, +V('ef') || .35), echoMix: +V('em') || .4 };
    }
    function exportIt() {
        var r = wv.sel(), rdur = 0;
        status('Renderizando A–B…');
        D().render(ab, collect(), [], r[0], r[1]).then(function (out) {
            rdur = out.duration;
            return window.TribalConvert.convert(D().wav(out), q('#vfx-fmt').value,
                function (p) { status('Codificando ' + Math.round(p * 100) + '%…'); });
        }).then(function (r) {
            var base = item.name.replace(/\.[^.]+$/, '') + ' (edit)' + r.ext;
            var f = new File([r.blob], base, { type: r.blob.type });
            return deps.store.add(f).then(function (m) {
                if (deps.store.updateInfo)
                    deps.store.updateInfo(m.id, { vn: 1, dur: rdur });
                if (coverB && deps.store.saveArtwork)
                    deps.store.saveArtwork(m.id, coverB);
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
            if (m) loadMeta(m);
        });
        q('#vfx-ambpick').addEventListener('click', pickFile);
        q('#vfx-cover').addEventListener('click', function () {
            var inp = document.createElement('input');
            inp.type = 'file'; inp.accept = 'image/*';
            inp.onchange = function () {
                if (!inp.files[0]) return;
                coverB = inp.files[0];
                var img = q('#vfx-coverimg');
                img.src = URL.createObjectURL(coverB); img.hidden = false;
                q('#vfx-covername').textContent = coverB.name; };
            inp.click(); });
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
        if (ab && wv) window.TribalVAuto.save(item.id, packNow());
        stopPv();
        if (ov) { ov.parentNode.removeChild(ov); ov = null; }
        clip = null; wv = null; }
    function open(m, d) {
        deps = d; item = m; coverB = null;
        deps.urlFor(m, function (u) {
            if (!u) return deps.toast('No se pudo leer el audio');
            fetch(u).then(function (r) { return r.blob(); }).then(D().decode)
                .then(function (buf) { ab = buf; if (ov) close(); build(); })
                .catch(function (e) { deps.toast(e.message || 'No se pudo decodificar'); });
        });
    }
    return { open: open };
})();
