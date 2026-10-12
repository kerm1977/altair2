// === media/vnotesdsp.js — DSP de notas de audio ===========================
// decode/slice/paste/wav/render offline: EQ tribal, fades, echo y pista
// ambiental. Usado por vnotesfx.js — sin UI. API: TribalVDSP.*
// =========================================================================
window.TribalVDSP = (function () {
    'use strict';
    var FREQS = [60, 230, 910, 3600, 14000],
        TYPES = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];

    var dctx;        // contexto único para decodificar (evita el límite de 6)
    function decode(blob) {
        if (!dctx) {
            var Ctx = window.AudioContext || window.webkitAudioContext;
            dctx = new Ctx();
        }
        return blob.arrayBuffer().then(function (b) {
            return new Promise(function (rs, rj) {
                dctx.decodeAudioData(b, rs,
                    function () { rj(new Error('Formato no decodificable')); });
            });
        });
    }
    // slice: keep=true conserva [a,b); keep=false lo elimina
    function slice(buf, a, b, keep) {
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
    // inserta `clip` dentro de `buf` en `at` (s). Con xf>0 hace crossfade
    // en ambas uniones: la pista se difumina entrando y saliendo.
    function paste(buf, clip, at, xf) {
        var sr = buf.sampleRate, n = buf.length, c = clip.length,
            i = Math.max(0, Math.min(n, Math.round(at * sr))),
            x = Math.max(0, Math.min(Math.round((xf || 0) * sr),
                                     c >> 1, (n - i) >> 1));
        var ch = Math.max(buf.numberOfChannels, clip.numberOfChannels);
        var out = new AudioBuffer({ length: n + c - 2 * x,
            numberOfChannels: ch, sampleRate: sr });
        for (var k = 0; k < ch; k++) {
            var o = out.getChannelData(k),
                d = buf.getChannelData(Math.min(k, buf.numberOfChannels - 1)),
                p = clip.getChannelData(Math.min(k, clip.numberOfChannels - 1));
            o.set(d.subarray(0, i));
            for (var t = 0; t < x; t++)
                o[i + t] = d[i + t] * (1 - t / x) + p[t] * (t / x);
            o.set(p.subarray(x, c - x), i + x);
            for (t = 0; t < x; t++)
                o[i + c - x + t] = p[c - x + t] * (1 - t / x) + d[i + x + t] * (t / x);
            o.set(d.subarray(i + 2 * x), i + c);
        }
        return out;
    }
    function wav(buf) {                 // PCM16 — puente hacia TribalConvert
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
    // arma una pista sobre ctx (online u offline): solo suena su parte que
    // cae dentro de la ventana [from,to) del timeline — sirve para la
    // previa y para el render offline.
    function armTrack(ctx, dest, t, from, to) {
        if (t.muted || !t.buf) return;
        var a = t.a || 0, b = (t.b > 0 ? t.b : t.buf.duration);
        var s0 = Math.max(from, t.off), s1 = Math.min(to, t.off + (b - a));
        if (s1 <= s0) return;
        var src = ctx.createBufferSource(); src.buffer = t.buf;
        var g = ctx.createGain(); g.gain.value = t.vol;
        t._g = g;                            // volumen vivo durante la previa
        src.connect(g); g.connect(dest);
        src.start(ctx.currentTime + Math.max(0, s0 - from),
                  a + (s0 - t.off), s1 - s0);
    }
    // duración total del timeline: voz + fin de cada pista
    function tlDur(buf, tracks) {
        var d = buf.duration;
        (tracks || []).forEach(function (t) {
            var frag = (t.b > 0 ? t.b : t.buf.duration) - (t.a || 0);
            d = Math.max(d, t.off + frag);
        });
        return d;
    }
    // cadena offline: src → EQ → fades → echo → destino (+ pistas)
    // renderiza SOLO la ventana [w0,w1) del timeline (las barras A–B)
    function render(buf, cfg, tracks, w0, w1) {
        var a = Math.max(0, w0 || 0),
            b = w1 > a ? w1 : tlDur(buf, tracks),
            dur = b - a;
        var octx = new OfflineAudioContext(Math.min(2, buf.numberOfChannels),
            Math.ceil(dur * buf.sampleRate), buf.sampleRate);
        var src = octx.createBufferSource(), chain = src;
        src.buffer = buf;
        var p = (window.TribalEQ.PRESETS || []).find(function (x) { return x.id === cfg.eq; });
        if (p && p.id !== 'normal') FREQS.forEach(function (f, k) {
            var bq = octx.createBiquadFilter();
            bq.type = TYPES[k]; bq.frequency.value = f; bq.gain.value = p.gains[k];
            chain.connect(bq); chain = bq;
        });
        var fg = octx.createGain();
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
        chain.connect(octx.destination);
        var vlen = Math.min(b, buf.duration) - a;   // voz solo dentro de A–B
        if (vlen > 0) src.start(0, a, vlen);
        (tracks || []).forEach(function (t) {
            armTrack(octx, octx.destination, t, a, b);
        });
        return octx.startRendering();
    }
    return { decode: decode, slice: slice, paste: paste, wav: wav,
             render: render, armTrack: armTrack, tlDur: tlDur };
})();
