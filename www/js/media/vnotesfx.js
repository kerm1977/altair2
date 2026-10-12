// === media/vnotesfx.js — Editor de notas de audio (UI) ====================
// Previa, recorte/copia/pega A–B, EQ tribal, fades, echo, pista ambiental
// (de la tribu o del dispositivo) con volumen, exporta vía TribalConvert.
// DSP en vnotesdsp.js. API: TribalVNoteFX.open(item, deps)
// =========================================================================
window.TribalVNoteFX = (function () {
    'use strict';
    var ov, deps, item, ab, amb = null, clip = null, pv = null;

    function esc(s) {
        var E = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
        return String(s || '').replace(/[&<>"]/g, function (c) { return E[c]; });
    }
    function status(t) { ov.querySelector('#vfx-st').textContent = t; }
    function dur() { return ab ? ab.duration : 0; }
    function abv() {
        return [+ov.querySelector('#vfx-a').value || 0,
                +ov.querySelector('#vfx-b').value || dur()];
    }
    function refresh(msg) {
        ov.querySelector('#vfx-b').value = dur().toFixed(1);
        drawWave();
        status(msg || ('Duración: ' + dur().toFixed(1) + ' s'));
    }
    function drawWave() {
        var c = ov.querySelector('#vfx-wave'), g = c.getContext('2d');
        var d = ab.getChannelData(0), w = c.width, h = c.height;
        g.clearRect(0, 0, w, h); g.fillStyle = '#f0b429';
        for (var x = 0; x < w; x++) {
            var bh = Math.abs(d[(x * d.length / w) | 0]) * h;
            g.fillRect(x, (h - bh) / 2, 1, Math.max(1, bh));
        }
    }
    // previa de la voz editada tal como va quedando
    function preview() {
        if (pv) { try { pv.src.stop(); pv.ctx.close(); } catch (e) {} pv = null; }
        var Ctx = window.AudioContext || window.webkitAudioContext;
        var ctx = new Ctx(), src = ctx.createBufferSource();
        src.buffer = ab; src.connect(ctx.destination); src.start(0);
        pv = { ctx: ctx, src: src };
        status('Reproduciendo previa…');
        src.onended = function () { status(''); pv = null; };
    }
    function loadAmbMeta(m) {
        deps.urlFor(m, function (u) {
            fetch(u).then(function (r) { return r.blob(); })
                .then(window.TribalVDSP.decode)
                .then(function (b) { amb = { buf: b, name: m.name };
                    status('Fondo: ' + m.name); });
        });
    }
    // pista de fondo: de la tribu o buscada en el dispositivo
    function pickAmb() {
        if (window.TribalFiles && TribalFiles.native() && deps.sono) {
            TribalFiles.pick(deps.sono, { kinds: ['audio'], single: true,
                title: 'Pista de fondo' }).then(function (ms) {
                    if (ms && ms[0]) loadAmbMeta(ms[0]);
                });
            return;
        }
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'audio/*';
        inp.onchange = function () {
            if (inp.files[0]) window.TribalVDSP.decode(inp.files[0])
                .then(function (b) { amb = { buf: b, name: inp.files[0].name };
                    status('Fondo: ' + amb.name); });
        };
        inp.click();
    }
    function collect() {
        return {
            eq: ov.querySelector('#vfx-eq').value,
            fIn: +ov.querySelector('#vfx-fin').value || 0,
            fOut: +ov.querySelector('#vfx-fout').value || 0,
            echo: ov.querySelector('#vfx-echo').checked,
            echoT: +ov.querySelector('#vfx-et').value || 0.35,
            echoFb: Math.min(0.85, +ov.querySelector('#vfx-ef').value || 0.35),
            echoMix: +ov.querySelector('#vfx-em').value || 0.4,
            ambVol: +ov.querySelector('#vfx-avol').value / 100
        };
    }
    function exportIt() {
        status('Renderizando efectos…');
        window.TribalVDSP.render(ab, collect(), amb).then(function (out) {
            return window.TribalConvert.convert(window.TribalVDSP.wav(out),
                ov.querySelector('#vfx-fmt').value,
                function (p) { status('Codificando ' + Math.round(p * 100) + '%…'); });
        }).then(function (r) {
            var base = item.name.replace(/\.[^.]+$/, '') + ' (edit)' + r.ext;
            return deps.store.add(new File([r.blob], base, { type: r.blob.type }))
                .then(function (m) {
                    if (deps.store.updateInfo) deps.store.updateInfo(m.id, { vn: 1 });
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
            '<h3><i class="bi bi-sliders"></i> ' + esc(item.name) + '</h3>' +
            '<button class="lk-x" id="vfx-x"><i class="bi bi-x-lg"></i></button></div>' +
            '<div class="lk-body"><canvas id="vfx-wave" width="360" height="90"></canvas>' +
            '<div class="vn-frow"><button id="vfx-pv" class="tribal-btn tribal-btn-xs">' +
            '<i class="bi bi-play-fill"></i> Previa</button>' +
            '<label>A <input id="vfx-a" type="number" step="0.1" value="0"></label>' +
            '<label>B <input id="vfx-b" type="number" step="0.1"></label></div>' +
            '<div class="vn-frow"><button id="vfx-keep" class="tribal-btn tribal-btn-xs">Usar solo A–B</button>' +
            '<button id="vfx-cut" class="tribal-btn tribal-btn-xs">Cortar A–B</button>' +
            '<button id="vfx-copy" class="tribal-btn tribal-btn-xs">Copiar A–B</button>' +
            '<label>en <input id="vfx-p" type="number" step="0.1" value="0"></label>' +
            '<button id="vfx-paste" class="tribal-btn tribal-btn-xs">Pegar</button></div>' +
            '<div class="vn-frow"><label>EQ <select id="vfx-eq">' + eqs + '</select></label>' +
            '<label>Fade in <input id="vfx-fin" type="number" step="0.1" value="0">s</label>' +
            '<label>out <input id="vfx-fout" type="number" step="0.1" value="0">s</label></div>' +
            '<div class="vn-frow"><label><input id="vfx-echo" type="checkbox"> Echo</label>' +
            '<label>retardo <input id="vfx-et" type="number" step="0.05" value="0.35"></label>' +
            '<label>rebote <input id="vfx-ef" type="number" step="0.05" value="0.35"></label>' +
            '<label>mezcla <input id="vfx-em" type="number" step="0.05" value="0.4"></label></div>' +
            '<div class="vn-frow"><label>Fondo <select id="vfx-amb">' +
            '<option value="">— sin pista —</option>' + auds + '</select></label>' +
            '<button id="vfx-ambpick" class="tribal-btn tribal-btn-xs">' +
            '<i class="bi bi-folder2-open"></i> Dispositivo</button>' +
            '<label>Vol <input id="vfx-avol" type="range" min="0" max="100" value="25"></label></div>' +
            '<div class="vn-frow"><label>Formato <select id="vfx-fmt">' + fmts + '</select></label>' +
            '<button id="vfx-go" class="tribal-btn tribal-btn-xs">' +
            '<i class="bi bi-download"></i> Exportar</button></div>' +
            '<div id="vfx-st" class="vn-state"></div></div></div>';
        (deps.mount || document.body).appendChild(ov);
        var q = function (id) { return ov.querySelector(id); };
        q('#vfx-x').addEventListener('click', close);
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
        q('#vfx-b').value = dur().toFixed(1);
        q('#vfx-pv').addEventListener('click', preview);
        q('#vfx-keep').addEventListener('click', function () {
            var r = abv(); ab = window.TribalVDSP.slice(ab, r[0], r[1], true); refresh(); });
        q('#vfx-cut').addEventListener('click', function () {
            var r = abv(); ab = window.TribalVDSP.slice(ab, r[0], r[1], false);
            refresh('Fragmento cortado'); });
        q('#vfx-copy').addEventListener('click', function () {
            var r = abv(); clip = window.TribalVDSP.slice(ab, r[0], r[1], true);
            status('Copiado ' + clip.duration.toFixed(1) + ' s'); });
        q('#vfx-paste').addEventListener('click', function () {
            if (!clip) return status('Nada copiado — usa «Copiar A–B»');
            ab = window.TribalVDSP.paste(ab, clip,
                +q('#vfx-p').value || 0); refresh('Pegado'); });
        q('#vfx-amb').addEventListener('change', function () {
            var id = q('#vfx-amb').value; if (!id) { amb = null; return; }
            var m = deps.items.find(function (x) { return x.id === id; });
            if (m) loadAmbMeta(m);
        });
        q('#vfx-ambpick').addEventListener('click', pickAmb);
        q('#vfx-go').addEventListener('click', exportIt);
    }
    function close() {
        if (pv) { try { pv.src.stop(); pv.ctx.close(); } catch (e) {} pv = null; }
        if (ov) { ov.parentNode.removeChild(ov); ov = null; }
        amb = clip = null;
    }
    function open(m, d) {
        deps = d; item = m;
        deps.urlFor(m, function (u) {
            if (!u) return deps.toast('No se pudo leer el audio');
            fetch(u).then(function (r) { return r.blob(); }).then(window.TribalVDSP.decode)
                .then(function (buf) { ab = buf; if (ov) close(); build(); drawWave(); })
                .catch(function (e) { deps.toast(e.message || 'No se pudo decodificar'); });
        });
    }
    return { open: open };
})();
