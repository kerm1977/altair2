// ============================================================================
// ARCHIVO: media-gifcap.js
// RESPONSABILIDAD: captura de fragmentos de video a GIF animado.
//   - Muestrea el video en tiempo real a ~10 fps con el pipeline completo
//     (drawEdit de media-editexport.js) y codifica con gif.js vendored.
//   - Devuelve { stop, pause, resume, isPaused } para el indicador REC.
//   Extiende window.TribalVidFX (estado compartido en _x).
// ============================================================================
(function () {
    'use strict';
    var FX = window.TribalVidFX;
    if (!FX) return;
    var _x = FX._x;

    // opts: { url, from, to, width } — muestrea en tiempo real a ~10 fps
    function captureGIF(opts, onProgress, onDone) {
        if (typeof GIF !== 'function') return onDone(null, 'Encoder GIF no disponible');
        var hv = document.createElement('video');
        hv.muted = true; hv.playsInline = true; hv.preload = 'auto';
        var stopped = false, gif = null, done = false, paused = false;

        function fail(msg) { if (!stopped) { stopped = true; done = true; onDone(null, msg); } }
        hv.addEventListener('error', function () { fail('No se pudo leer el video'); });
        hv.addEventListener('loadedmetadata', function () {
            var from = opts.from || 0;
            var to = opts.to != null ? Math.min(opts.to, hv.duration)
                                     : Math.min(from + 5, hv.duration);
            var W = Math.min(480, hv.videoWidth) - (Math.min(480, hv.videoWidth) % 2);
            var H = Math.round(hv.videoHeight * W / hv.videoWidth);
            H -= H % 2;
            var canvas = document.createElement('canvas');
            canvas.width = W; canvas.height = H;
            var ctx = canvas.getContext('2d');

            gif = new GIF({
                workers: 2, quality: 10, width: W, height: H,
                workerScript: 'js/vendor/gif.worker.js'
            });
            gif.on('progress', function (p) {
                if (onProgress) onProgress(-1, p); // fase compresión
            });
            gif.on('finished', function (blob) {
                if (!done) { done = true; stopped = true; onDone(blob, null); }
            });

            var last = -1, STEP = 0.1; // 10 fps
            function frame() {
                if (stopped) return;
                var t = hv.currentTime;
                if (t >= to || hv.ended) {
                    stopped = true;
                    hv.pause();
                    gif.render();
                    return;
                }
                if (paused) { requestAnimationFrame(frame); return; }
                if (t - last >= STEP) {
                    last = t;
                    _x.drawEdit(ctx, hv, W, H, t - from, to - from, false, t);
                    gif.addFrame(ctx, { copy: true, delay: STEP * 1000 });
                    if (onProgress) onProgress((t - from) / (to - from), 0);
                }
                requestAnimationFrame(frame);
            }
            hv.addEventListener('seeked', function seek() {
                hv.removeEventListener('seeked', seek);
                hv.play().catch(function () {});
                frame();
            });
            try { hv.currentTime = from; } catch (e) {}
        });
        hv.src = opts.url;
        return {
            stop: function () {
                stopped = true;
                hv.pause();
                try { if (gif) gif.abort(); } catch (e) {}
                if (!done) { done = true; onDone(null, 'Cancelado'); }
            },
            pause: function () { paused = true; hv.pause(); },
            resume: function () { paused = false; hv.play().catch(function () {}); },
            isPaused: function () { return paused; }
        };
    }

    FX.captureGIF = captureGIF;
})();
