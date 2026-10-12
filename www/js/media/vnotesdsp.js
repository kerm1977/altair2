// === media/vnotesdsp.js — DSP de notas de audio ===========================
// decode/slice/paste/wav/render offline: EQ tribal, fades, echo y pista
// ambiental. Usado por vnotesfx.js — sin UI. API: TribalVDSP.*
// =========================================================================
window.TribalVDSP = (function () {
    'use strict';
    var FREQS = [60, 230, 910, 3600, 14000],
        TYPES = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];

    function decode(blob) {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        var ctx = new Ctx();
        return blob.arrayBuffer().then(function (b) {
            return new Promise(function (rs, rj) {
                ctx.decodeAudioData(b, rs,
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
    // inserta `clip` dentro de `buf` en la posición `at` (segundos)
    function paste(buf, clip, at) {
        var sr = buf.sampleRate, n = buf.length,
            i = Math.max(0, Math.min(n, Math.round(at * sr)));
        var ch = Math.max(buf.numberOfChannels, clip.numberOfChannels);
        var out = new AudioBuffer({ length: n + clip.length,
            numberOfChannels: ch, sampleRate: sr });
        for (var c = 0; c < ch; c++) {
            var o = out.getChannelData(c);
            var d = buf.getChannelData(Math.min(c, buf.numberOfChannels - 1));
            var k = clip.getChannelData(Math.min(c, clip.numberOfChannels - 1));
            o.set(d.subarray(0, i)); o.set(k, i); o.set(d.subarray(i), i + k.length);
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
    // cadena offline: src → EQ → fades → echo → destino (+ ambiente ×vol)
    function render(buf, cfg, amb) {
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
            var as = octx.createBufferSource(); as.buffer = amb.buf; as.loop = true;
            var ag = octx.createGain(); ag.gain.value = cfg.ambVol;
            as.connect(ag); ag.connect(octx.destination); as.start(0);
        }
        return octx.startRendering();
    }
    return { decode: decode, slice: slice, paste: paste, wav: wav, render: render };
})();
