// === media/vnotesfx.js — Editor de notas de audio (UI) ====================
// Onda con A–B arrastrables + espectro vivo (vnoteswave.js), transporte,
// cortar/copiar/pegar con crossfade, EQ tribal, fades, echo, pista de
// fondo (tribu o dispositivo) con volumen, exporta vía TribalConvert.
// DSP en vnotesdsp.js. API: TribalVNoteFX.open(item, deps)
// =========================================================================
window.TribalVNoteFX = (function () {
    'use strict';
    var ov, deps, item, ab, amb = null, clip = null, pv = null, wv = null, pvRaf,
        D = function () { return window.TribalVDSP; };

    function q(id) { return ov.querySelector(id); }
    function esc(s) {
        var E = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
        return String(s || '').replace(/[&<>"]/g, function (c) { return E[c]; });
    }
    function status(t) { q('#vfx-st').textContent = t; }
    function ft(s) {
        s = Math.max(0, s || 0);
        return Math.floor(s / 60) + ':' + ('0' + (s % 60).toFixed(1)).slice(-4);
    }
    function times() {
        var r = wv.sel();
        q('#vfx-ta').textContent = 'A ' + ft(r[0]);
        q('#vfx-td').textContent = ft(wv.dur());
        q('#vfx-tb').textContent = 'B ' + ft(r[1]); }
    function refresh(msg) { wv.buf(ab); times(); status(msg || ''); }

    // -------- previa con espectro vivo sobre la onda ---------------------
    function stopPv() {
        if (pvRaf) cancelAnimationFrame(pvRaf); pvRaf = null;
        if (pv) { try { pv.src.onended = null; pv.src.stop(); pv.ctx.close(); }
            catch (e) {} pv = null; }
        if (wv) { wv.live(null); wv.pos(null); }
        var b = q('#vfx-pv'); if (b) b.innerHTML = '<i class="bi bi-play-fill"></i>';
    }
    function preview() {
        if (pv) return stopPv();
        var Ctx = window.AudioContext || window.webkitAudioContext;
        var ctx = new Ctx(), src = ctx.createBufferSource(),
            an = ctx.createAnalyser();
        src.buffer = ab; an.fftSize = 1024;
        src.connect(an); an.connect(ctx.destination);
        src.start(0); pv = { ctx: ctx, src: src, t0: ctx.currentTime };
        wv.live(an); q('#vfx-pv').innerHTML = '<i class="bi bi-stop-fill"></i>';
        (function loop() {
            if (!pv) return;
            wv.pos(pv.ctx.currentTime - pv.t0);
            pvRaf = requestAnimationFrame(loop);
        })();
        src.onended = function () { if (pv) stopPv(); };
    }

    // -------- pista de fondo ---------------------------------------------
    function loadAmbMeta(m) {
        deps.urlFor(m, function (u) {
            fetch(u).then(function (r) { return r.blob(); }).then(D().decode)
                .then(function (b) { amb = { buf: b, name: m.name };
                    status('Fondo: ' + m.name); });
        });
    }
    function pickAmb() {
        if (window.TribalFiles && TribalFiles.native() && deps.sono) {
            TribalFiles.pick(deps.sono, { kinds: ['audio'], single: true,
                title: 'Pista de fondo' }).then(function (ms) {
                    if (ms && ms[0]) loadAmbMeta(ms[0]); });
            return;
        }
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'audio/*';
        inp.onchange = function () {
            if (inp.files[0]) D().decode(inp.files[0]).then(function (b) {
                amb = { buf: b, name: inp.files[0].name };
                status('Fondo: ' + amb.name); });
        };
        inp.click();
    }

    // -------- efectos / export --------------------------------------------
    function collect() {
        return {
            eq: q('#vfx-eq').value,
            fIn: +q('#vfx-fin').value || 0, fOut: +q('#vfx-fout').value || 0,
            echo: q('#vfx-echo').checked,
            echoT: +q('#vfx-et').value || .35,
            echoFb: Math.min(.85, +q('#vfx-ef').value || .35),
            echoMix: +q('#vfx-em').value || .4,
            ambVol: +q('#vfx-avol').value / 100
        };
    }
    function exportIt() {
        status('Renderizando efectos…'); var rdur = 0;
        D().render(ab, collect(), amb).then(function (out) {
            rdur = out.duration;
            return window.TribalConvert.convert(D().wav(out),
                q('#vfx-fmt').value,
                function (p) { status('Codificando ' + Math.round(p * 100) + '%…'); });
        }).then(function (r) {
            var base = item.name.replace(/\.[^.]+$/, '') + ' (edit)' + r.ext;
            return deps.store.add(new File([r.blob], base, { type: r.blob.type }))
                .then(function (m) {
                    if (deps.store.updateInfo)
                        deps.store.updateInfo(m.id, { vn: 1, dur: rdur });
                    status(''); deps.toast('«' + base + '» guardado');
                    if (deps.reload) deps.reload();
                });
        }).catch(function (e) { status('Error: ' + (e && e.message || e)); });
    }

    function build() {
        ov = document.createElement('div');
        ov.className = 'tribal-overlay vn-overlay';
        var eqs = (window.TribalEQ.PRESETS || []).map(function (p) {
            return '<option value="' + p.id + '">' + p.label + '</option>'; }).join('');
        var fmts = window.TribalConvert.formats().map(function (f) {
            return '<option value="' + f.id + '">' + f.label + '</option>'; }).join('');
        var auds = (deps.items || []).filter(function (m) {
            return m.kind === 'audio' && m.id !== item.id;
        }).map(function (m) {
            return '<option value="' + m.id + '">' + esc(m.name) + '</option>';
        }).join('');
        ov.innerHTML = '<div class="vn-panel"><div class="lk-head">' +
            '<h3><i class="bi bi-mic"></i> ' + esc(item.name) + '</h3>' +
            '<button class="lk-x" id="vfx-x"><i class="bi bi-x-lg"></i></button></div>' +
            '<div class="lk-body"><div class="vfx-stage">' +
            '<canvas id="vfx-wave" class="vfx-wave" width="720" height="150"></canvas>' +
            '<div class="vfx-times"><span id="vfx-ta">A 0:00</span>' +
            '<span id="vfx-td" class="vfx-dur">0:00</span><span id="vfx-tb">B 0:00</span></div>' +
            '<div class="vfx-transport"><button id="vfx-pv" class="vfx-play">' +
            '<i class="bi bi-play-fill"></i></button>' +
            '<span class="vfx-hint">Arrastra la onda o las asas para elegir A–B</span></div>' +
            '</div><div class="vfx-tools">' +
            '<button id="vfx-cut"><i class="bi bi-scissors"></i><span>Cortar</span></button>' +
            '<button id="vfx-copy"><i class="bi bi-clipboard"></i><span>Copiar</span></button>' +
            '<button id="vfx-paste"><i class="bi bi-box-arrow-in-down"></i><span>Pegar en B</span></button>' +
            '<button id="vfx-keep"><i class="bi bi-bounding-box"></i><span>Solo A–B</span></button>' +
            '<label class="vfx-xf"><i class="bi bi-intersect"></i>' +
            '<select id="vfx-xf"><option value="0">Sin unión</option>' +
            '<option value="0.3">Unión 0.3s</option><option value="0.7">Unión 0.7s</option>' +
            '<option value="1.5">Unión 1.5s</option></select></label></div>' +
            '<div class="vfx-tools">' +
            '<label><i class="bi bi-sliders"></i><select id="vfx-eq">' + eqs + '</select></label>' +
            '<label><i class="bi bi-graph-up-arrow"></i><input id="vfx-fin" type="number" step="0.1" value="0" title="Fade in (s)"></label>' +
            '<label><i class="bi bi-graph-down-arrow"></i><input id="vfx-fout" type="number" step="0.1" value="0" title="Fade out (s)"></label>' +
            '<label><i class="bi bi-vinyl"></i><input id="vfx-echo" type="checkbox"> Eco</label>' +
            '<input id="vfx-et" type="number" step="0.05" value="0.35" title="Retardo">' +
            '<input id="vfx-ef" type="number" step="0.05" value="0.35" title="Rebote">' +
            '<input id="vfx-em" type="number" step="0.05" value="0.4" title="Mezcla"></div>' +
            '<div class="vfx-tools">' +
            '<label><i class="bi bi-music-note"></i><select id="vfx-amb">' +
            '<option value="">— sin pista de fondo —</option>' + auds + '</select></label>' +
            '<button id="vfx-ambpick"><i class="bi bi-folder2-open"></i><span>Dispositivo</span></button>' +
            '<label><i class="bi bi-volume-down"></i>' +
            '<input id="vfx-avol" type="range" min="0" max="100" value="25"></label></div>' +
            '<div class="vfx-tools vfx-out">' +
            '<label><i class="bi bi-filetype-mp3"></i><select id="vfx-fmt">' + fmts + '</select></label>' +
            '<button id="vfx-go"><i class="bi bi-download"></i><span>Exportar</span></button></div>' +
            '<div id="vfx-st" class="vn-state"></div></div></div>';
        (deps.mount || document.body).appendChild(ov);
        wv = window.TribalVWave.mount(q('#vfx-wave'));
        wv.onchange(times);
        q('#vfx-x').addEventListener('click', close);
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
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
            var id = q('#vfx-amb').value; if (!id) { amb = null; return; }
            var m = deps.items.find(function (x) { return x.id === id; });
            if (m) loadAmbMeta(m);
        });
        q('#vfx-ambpick').addEventListener('click', pickAmb);
        q('#vfx-go').addEventListener('click', exportIt);
        wv.buf(ab); times();
    }
    function close() {
        stopPv();
        if (ov) { ov.parentNode.removeChild(ov); ov = null; }
        amb = clip = null; wv = null;
    }
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
