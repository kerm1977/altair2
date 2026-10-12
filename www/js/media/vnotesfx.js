// === media/vnotesfx.js — Editor de notas de audio ==========================
// Recorte A–B (conservar/quitar), EQ tribal, fades, echo, ambiente ×vol,
// exporta MP3/WAV/WebM vía TribalConvert. API: TribalVNoteFX.open(item, deps)
// =========================================================================
window.TribalVNoteFX = (function () {
    'use strict';
    var ov, deps, item, ab, amb = null;
    var FREQS = [60, 230, 910, 3600, 14000],
        TYPES = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];

    function esc(s) {
        var E = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
        return String(s || '').replace(/[&<>"]/g, function (c) { return E[c]; });
    }
    function decode(blob) {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        var ctx = new Ctx();
        return blob.arrayBuffer().then(function (b) {
            return new Promise(function (rs, rj) {
                ctx.decodeAudioData(b, rs, function () { rj(new Error('Formato no decodificable')); });
            });
        });
    }
    // trocea un AudioBuffer: keep mantiene [a,b), keep=false lo elimina
    function sliceBuf(buf, a, b, keep) {
        var sr = buf.sampleRate, n = buf.length,
            i0 = Math.max(0, Math.min(n, Math.round(a * sr))),
            i1 = Math.max(i0, Math.min(n, Math.round(b * sr)));
        var len = keep ? (i1 - i0) : (n - (i1 - i0));
        if (len < 1) return buf;
        var out = new AudioBuffer({ length: len,
            numberOfChannels: buf.numberOfChannels, sampleRate: sr });
        for (var c = 0; c < buf.numberOfChannels; c++) {
            var d = buf.getChannelData(c), o = out.getChannelData(c);
            if (keep) o.set(d.subarray(i0, i1));
            else { o.set(d.subarray(0, i0)); o.set(d.subarray(i1), i0); }
        }
        return out;
    }
    function wavBlob(buf) {           // PCM16 — puente hacia TribalConvert
        var ch = buf.numberOfChannels, sr = buf.sampleRate, n = buf.length,
            dv = new DataView(new ArrayBuffer(44 + n * ch * 2));
        function st(o, z) { for (var i = 0; i < z.length; i++) dv.setUint8(o + i, z.charCodeAt(i)); }
        st(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * 2, true); st(8, 'WAVE');
        st(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
        dv.setUint16(22, ch, true); dv.setUint32(24, sr, true);
        dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true);
        dv.setUint16(34, 16, true); st(36, 'data'); dv.setUint32(40, n * ch * 2, true);
        var off = 44;
        for (var i = 0; i < n; i++) for (var c = 0; c < ch; c++) {
            var v = Math.max(-1, Math.min(1, buf.getChannelData(c)[i]));
            dv.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7FFF, true); off += 2;
        }
        return new Blob([dv.buffer], { type: 'audio/wav' });
    }
    // cadena offline: src → EQ → fades → echo → destino (+ ambiente ×vol)
    function render(buf, cfg) {
        var octx = new OfflineAudioContext(
            Math.min(2, buf.numberOfChannels), buf.length, buf.sampleRate);
        var src = octx.createBufferSource(), chain = src;
        src.buffer = buf;
        var p = (window.TribalEQ.PRESETS || []).find(function (x) { return x.id === cfg.eq; });
        if (p && p.id !== 'normal') FREQS.forEach(function (f, k) {
            var bq = octx.createBiquadFilter();
            bq.type = TYPES[k]; bq.frequency.value = f; bq.gain.value = p.gains[k];
            chain.connect(bq); chain = bq;
        });
        var fg = octx.createGain(), dur = buf.duration;
        if (cfg.fIn > 0) { fg.gain.setValueAtTime(0, 0);
            fg.gain.linearRampToValueAtTime(1, Math.min(cfg.fIn, dur)); }
        if (cfg.fOut > 0) { fg.gain.setValueAtTime(1, Math.max(0, dur - cfg.fOut));
            fg.gain.linearRampToValueAtTime(0, dur); }
        chain.connect(fg); chain = fg;
        if (cfg.echo) {
            var mix = octx.createGain(), dl = octx.createDelay(4),
                fb = octx.createGain(), wet = octx.createGain();
            dl.delayTime.value = cfg.echoT; fb.gain.value = cfg.echoFb;
            wet.gain.value = cfg.echoMix;
            chain.connect(mix); chain.connect(dl);
            dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(mix);
            chain = mix;
        }
        chain.connect(octx.destination); src.start(0);
        if (amb) {
            var as = octx.createBufferSource(); as.buffer = amb; as.loop = true;
            var ag = octx.createGain(); ag.gain.value = cfg.ambVol;
            as.connect(ag); ag.connect(octx.destination); as.start(0);
        }
        return octx.startRendering();
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
    function status(t) { ov.querySelector('#vfx-st').textContent = t; }

    function build() {
        ov = document.createElement('div');
        ov.className = 'tribal-overlay lk-overlay vn-overlay';
        var eqs = (window.TribalEQ.PRESETS || []).map(function (p) {
            return '<option value="' + p.id + '">' + p.label + '</option>'; }).join('');
        var fmts = window.TribalConvert.formats().map(function (f) {
            return '<option value="' + f.id + '">' + f.label + '</option>'; }).join('');
        var auds = (deps.items || []).filter(function (m) {
            return m.kind === 'audio' && m.id !== item.id;
        }).map(function (m) {
            return '<option value="' + m.id + '">' + esc(m.name) + '</option>';
        }).join('');
        ov.innerHTML = '<div class="lk-panel vn-panel"><div class="lk-head">' +
            '<h3><i class="bi bi-sliders"></i> ' + esc(item.name) + '</h3>' +
            '<button class="lk-x" id="vfx-x"><i class="bi bi-x-lg"></i></button></div>' +
            '<div class="lk-body">' +
            '<canvas id="vfx-wave" width="360" height="90"></canvas>' +
            '<div class="vn-frow"><label>A <input id="vfx-a" type="number" step="0.1" value="0"></label>' +
            '<label>B <input id="vfx-b" type="number" step="0.1"></label></div>' +
            '<div class="vn-frow"><button id="vfx-keep" class="tribal-btn tribal-btn-xs">Usar solo A–B</button>' +
            '<button id="vfx-cut" class="tribal-btn tribal-btn-xs">Quitar A–B</button></div>' +
            '<div class="vn-frow"><label>EQ <select id="vfx-eq">' + eqs + '</select></label></div>' +
            '<div class="vn-frow"><label>Fade in <input id="vfx-fin" type="number" step="0.1" value="0">s</label>' +
            '<label>Fade out <input id="vfx-fout" type="number" step="0.1" value="0">s</label></div>' +
            '<div class="vn-frow"><label><input id="vfx-echo" type="checkbox"> Echo</label>' +
            '<label>retardo <input id="vfx-et" type="number" step="0.05" value="0.35"></label>' +
            '<label>rebote <input id="vfx-ef" type="number" step="0.05" value="0.35"></label>' +
            '<label>mezcla <input id="vfx-em" type="number" step="0.05" value="0.4"></label></div>' +
            '<div class="vn-frow"><label>Ambiente <select id="vfx-amb">' +
            '<option value="">— sin pista —</option>' + auds + '</select></label>' +
            '<label>Vol <input id="vfx-avol" type="range" min="0" max="100" value="25"></label></div>' +
            '<div class="vn-frow"><label>Formato <select id="vfx-fmt">' + fmts + '</select></label>' +
            '<button id="vfx-go" class="tribal-btn tribal-btn-xs">Exportar</button></div>' +
            '<div id="vfx-st" class="vn-state"></div></div></div>';
        (deps.mount || document.body).appendChild(ov);
        ov.querySelector('#vfx-x').addEventListener('click', close);
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
        ov.querySelector('#vfx-b').value = ab ? ab.duration.toFixed(1) : '0';
        ov.querySelector('#vfx-keep').addEventListener('click', function () { cutTo(true); });
        ov.querySelector('#vfx-cut').addEventListener('click', function () { cutTo(false); });
        ov.querySelector('#vfx-amb').addEventListener('change', loadAmb);
        ov.querySelector('#vfx-go').addEventListener('click', exportIt);
    }
    function cutTo(keep) {
        var a = +ov.querySelector('#vfx-a').value || 0;
        var b = +ov.querySelector('#vfx-b').value || ab.duration;
        ab = sliceBuf(ab, a, b, keep);
        ov.querySelector('#vfx-b').value = ab.duration.toFixed(1);
        drawWave();
        status('Duración ahora: ' + ab.duration.toFixed(1) + ' s');
    }
    function loadAmb() {
        var id = ov.querySelector('#vfx-amb').value;
        if (!id) { amb = null; return; }
        var m = deps.items.find(function (x) { return x.id === id; });
        deps.urlFor(m, function (u) {
            fetch(u).then(function (r) { return r.blob(); })
                .then(decode).then(function (b) { amb = b; status('Ambiente: ' + m.name); });
        });
    }
    function exportIt() {
        status('Renderizando efectos…');
        render(ab, collect()).then(function (out) {
            return window.TribalConvert.convert(wavBlob(out),
                ov.querySelector('#vfx-fmt').value,
                function (p) { status('Codificando ' + Math.round(p * 100) + '%…'); });
        }).then(function (r) {
            var base = item.name.replace(/\.[^.]+$/, '') + ' (edit)' + r.ext;
            return deps.store.add(new File([r.blob], base, { type: r.blob.type }))
                .then(function () {
                    status(''); deps.toast('«' + base + '» guardado');
                    if (deps.reload) deps.reload();
                });
        }).catch(function (e) { status('Error: ' + (e && e.message || e)); });
    }
    function close() { if (ov) { ov.parentNode.removeChild(ov); ov = null; } amb = null; }
    function open(m, d) {
        deps = d; item = m;
        deps.urlFor(m, function (u) {
            if (!u) return deps.toast('No se pudo leer el audio');
            fetch(u).then(function (r) { return r.blob(); }).then(decode)
                .then(function (buf) { ab = buf; if (ov) close(); build(); drawWave(); })
                .catch(function (e) { deps.toast(e.message || 'No se pudo decodificar'); });
        });
    }
    return { open: open };
})();
