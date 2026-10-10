// ============================================================================
// ARCHIVO: media-convert.js
// RESPONSABILIDAD: Conversión de audio 100% offline dentro de la app.
//   - Decodifica cualquier formato que entienda el WebView (mp3, wav, m4a,
//     ogg, opus, flac…) con AudioContext.decodeAudioData.
//   - Codifica a MP3 con lamejs (vendored), a WAV (PCM16, sin pérdida)
//     o a WebM/Opus con MediaRecorder (en tiempo real).
//   API: TribalConvert.convert(blob, {format, kbps}, onProgress) → Blob
//        TribalConvert.formats() → [{id, label}]
// ============================================================================
window.TribalConvert = (function () {
    'use strict';

    function decode(blob) {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return Promise.reject(new Error('Web Audio no disponible'));
        var ctx = new Ctx();
        return blob.arrayBuffer().then(function (ab) {
            return new Promise(function (res, rej) {
                ctx.decodeAudioData(ab, res, function () {
                    rej(new Error('Formato no decodificable en este dispositivo'));
                });
            });
        });
    }

    function f32ToI16(f32) {
        var out = new Int16Array(f32.length);
        for (var i = 0; i < f32.length; i++) {
            var v = Math.max(-1, Math.min(1, f32[i]));
            out[i] = v < 0 ? v * 0x8000 : v * 0x7FFF;
        }
        return out;
    }

    // ------------------------------------------------------------------ MP3
    function toMp3(ab, kbps, onProgress) {
        if (typeof lamejs === 'undefined' || !lamejs.Mp3Encoder) {
            return Promise.reject(new Error('Encoder MP3 no disponible'));
        }
        var nch = Math.min(2, ab.numberOfChannels);
        var enc = new lamejs.Mp3Encoder(nch, ab.sampleRate, kbps || 192);
        var L = f32ToI16(ab.getChannelData(0));
        var R = nch > 1 ? f32ToI16(ab.getChannelData(1)) : L;
        var parts = [], block = 1152 * 40, i = 0;

        return new Promise(function (res) {
            function pump() {
                var end = Math.min(L.length, i + block);
                for (; i < end; i += 1152) {
                    var d = nch > 1
                        ? enc.encodeBuffer(L.subarray(i, i + 1152), R.subarray(i, i + 1152))
                        : enc.encodeBuffer(L.subarray(i, i + 1152));
                    if (d.length) parts.push(new Int8Array(d));
                }
                if (onProgress) onProgress(i / L.length * 0.95);
                if (i < L.length) return setTimeout(pump, 0);
                var tail = enc.flush();
                if (tail.length) parts.push(new Int8Array(tail));
                res(new Blob(parts, { type: 'audio/mpeg' }));
            }
            pump();
        });
    }

    // ------------------------------------------------------------------ WAV
    function toWav(ab) {
        var ch = ab.numberOfChannels, sr = ab.sampleRate, n = ab.length;
        var bytes = 44 + n * ch * 2;
        var buf = new ArrayBuffer(bytes), dv = new DataView(buf);
        function str(o, s) { for (var i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); }
        str(0, 'RIFF'); dv.setUint32(4, bytes - 8, true); str(8, 'WAVE');
        str(12, 'fmt '); dv.setUint32(16, 16, true);
        dv.setUint16(20, 1, true);                    // PCM
        dv.setUint16(22, ch, true);
        dv.setUint32(24, sr, true);
        dv.setUint32(28, sr * ch * 2, true);
        dv.setUint16(32, ch * 2, true);
        dv.setUint16(34, 16, true);
        str(36, 'data'); dv.setUint32(40, n * ch * 2, true);
        var off = 44, chans = [];
        for (var c = 0; c < ch; c++) chans.push(ab.getChannelData(c));
        for (var i = 0; i < n; i++) {
            for (c = 0; c < ch; c++) {
                var v = Math.max(-1, Math.min(1, chans[c][i]));
                dv.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7FFF, true);
                off += 2;
            }
        }
        return Promise.resolve(new Blob([buf], { type: 'audio/wav' }));
    }

    // ------------------------------------------------------------- WebM/Opus
    // MediaRecorder sobre MediaStreamDestination — corre en tiempo real.
    function toWebm(ab, onProgress) {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx || !window.MediaRecorder) {
            return Promise.reject(new Error('MediaRecorder no disponible'));
        }
        var mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']
            .filter(function (m) {
                try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; }
            })[0];
        if (!mime) return Promise.reject(new Error('Este dispositivo no codifica audio webm/ogg'));

        var ctx = new Ctx();
        var dest = ctx.createMediaStreamDestination();
        var src = ctx.createBufferSource();
        src.buffer = ab;
        src.connect(dest);
        var rec = new MediaRecorder(dest.stream, { mimeType: mime });
        var chunks = [];
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        return new Promise(function (res, rej) {
            rec.onstop = function () {
                res(new Blob(chunks, { type: mime.split(';')[0] }));
            };
            src.onended = function () {
                setTimeout(function () { try { rec.stop(); } catch (e) {} }, 300);
            };
            var t0 = ctx.currentTime, dur = ab.duration;
            var iv = setInterval(function () {
                var p = (ctx.currentTime - t0) / dur;
                if (onProgress) onProgress(Math.min(0.99, p));
                if (p >= 1.05) clearInterval(iv);
            }, 400);
            rec.onerror = function () { clearInterval(iv); rej(new Error('Falló la grabación')); };
            rec.start(250);
            src.start();
        });
    }

    // --------------------------------------------------------------- API ---
    var FORMATS = [
        { id: 'mp3-320', label: 'MP3 · 320 kbps (máxima)',   ext: '.mp3',  mime: 'audio/mpeg' },
        { id: 'mp3-192', label: 'MP3 · 192 kbps (estándar)', ext: '.mp3',  mime: 'audio/mpeg' },
        { id: 'mp3-128', label: 'MP3 · 128 kbps (liviano)',  ext: '.mp3',  mime: 'audio/mpeg' },
        { id: 'wav',     label: 'WAV · sin pérdida',         ext: '.wav',  mime: 'audio/wav' },
        { id: 'webm',    label: 'WebM/Opus (tiempo real)',   ext: '.webm', mime: 'audio/webm' }
    ];

    // convert(blob, fmtId, onProgress) → { blob, ext }
    function convert(blob, fmtId, onProgress) {
        return decode(blob).then(function (ab) {
            var f;
            if (fmtId === 'wav') f = toWav(ab);
            else if (fmtId === 'webm') f = toWebm(ab, onProgress);
            else {
                var kbps = { 'mp3-320': 320, 'mp3-192': 192, 'mp3-128': 128 }[fmtId] || 192;
                f = toMp3(ab, kbps, onProgress);
            }
            return f.then(function (out) {
                var meta = FORMATS.filter(function (x) { return x.id === fmtId; })[0];
                return { blob: out, ext: meta.ext };
            });
        });
    }

    return { convert: convert, formats: function () { return FORMATS; } };
})();
