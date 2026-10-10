// ============================================================================
// ARCHIVO: media-editexport.js
// RESPONSABILIDAD: pipeline de exportación del editor de video.
//   - drawEdit: fotograma completo (transformaciones, zoom+zona, filtros,
//     sticker, texto, LUT, fundido en bordes)
//   - renderExport: video completo/fragmento → MediaRecorder (tiempo real)
//   - captureGIF: fragmento → GIF a 10fps (usa gif.js vendored)
//   Extiende window.TribalVidFX (estado compartido en _x).
// ============================================================================
(function () {
    'use strict';
    var FX = window.TribalVidFX;
    if (!FX) return;
    var _x = FX._x;

    // ================================================= EDITOR (exportación)
    // Dibuja un fotograma con todo el pipeline: transformaciones, zoom+zona,
    // filtros de color, sticker, LUT y fundido en bordes.
    // tIn/dur: segundos dentro del fragmento exportado (para el fade); -1 = sin fade.
    // absT: tiempo absoluto del video (ventanas de sticker/texto).
    function drawEdit(ctx, src, W, H, tIn, dur, plain, absT) {
        var state = _x.state;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        var vw = src.videoWidth || src.width, vh = src.videoHeight || src.height;
        if (!vw || !vh) return;

        ctx.save();
        ctx.translate(W / 2, H / 2);
        if (!plain) {
            ctx.rotate(state.rot * Math.PI / 180);
            if (state.flipH || state.flipV) {
                ctx.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1);
            }
        }
        // tras rotar 90/270 el espacio visible se intercambia
        var rot90 = !plain && state.rot % 180 !== 0;
        var rw = rot90 ? H : W, rh = rot90 ? W : H;
        var zoom = plain ? 1 : state.zoom / 100;
        var s = Math.min(rw / vw, rh / vh) * zoom;
        var w = vw * s, h = vh * s;
        // la ventana visible se desplaza hacia el punto focal al hacer zoom
        var dx = plain ? 0 : -(state.px - 50) / 100 * (w - rw);
        var dy = plain ? 0 : -(state.py - 50) / 100 * (h - rh);
        if (!plain) { try { ctx.filter = _x.cssFilter(); } catch (e) {} }
        ctx.drawImage(src, -w / 2 + dx, -h / 2 + dy, w, h);
        ctx.restore();

        if (plain) return;

        var at = absT == null ? -1 : absT;
        var inWin = function (o) {
            return at >= 0 && at >= (o.t0 || 0) &&
                (o.t1 == null || o.t1 <= 0 || at <= o.t1);
        };
        var sticker = _x.sticker;
        if (sticker && inWin(sticker) &&
            sticker.img && sticker.img.complete && sticker.img.width) {
            var sw = W * sticker.s;
            var sh = sw * sticker.img.height / sticker.img.width;
            ctx.drawImage(sticker.img,
                W * sticker.x - sw / 2, H * sticker.y - sh / 2, sw, sh);
        }
        var textOv = _x.textOv;
        if (textOv && textOv.str && inWin(textOv)) {
            var fs = Math.max(14, H * textOv.s);
            ctx.font = '800 ' + fs + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = Math.max(2, fs / 9);
            ctx.strokeStyle = 'rgba(0,0,0,0.85)';
            ctx.fillStyle = '#f0b429';
            ctx.strokeText(textOv.str, W * textOv.x, H * textOv.y);
            ctx.fillText(textOv.str, W * textOv.x, H * textOv.y);
        }
        if (_x.lut) FX.applyLUT(ctx, W, H);
        if (state.edgeFade && tIn >= 0 && dur > 0) {
            var F = Math.min(0.6, dur / 4);
            var a = Math.min(1, tIn / F, (dur - tIn) / F);
            if (a < 1) {
                ctx.fillStyle = 'rgba(0,0,0,' + (1 - Math.max(0, a)).toFixed(3) + ')';
                ctx.fillRect(0, 0, W, H);
            }
        }
    }
    _x.drawEdit = drawEdit;
    FX.drawEdit = drawEdit;

    // --------------------------------------- exportación con todo el editor
    // opts: { url, from, to, speed, scale (ancho máx), plain, onProgress }
    // Devuelve { stop, pause, resume, isPaused } — corre en tiempo real.
    function renderExport(opts, onProgress, onDone) {
        if (typeof document.createElement('canvas').captureStream !== 'function' ||
            !window.MediaRecorder) {
            return onDone(null, 'Este dispositivo no permite capturar video');
        }
        var hv = document.createElement('video');
        hv.muted = true; hv.playsInline = true; hv.preload = 'auto';
        var finished = false, cancelled = false, rec = null, paused = false;

        function fail(msg) {
            if (!finished) { finished = true; onDone(null, msg); }
        }

        hv.addEventListener('error', function () { fail('No se pudo leer el video'); });
        hv.addEventListener('loadedmetadata', function () {
            var vw = hv.videoWidth, vh = hv.videoHeight;
            if (!vw) return fail('Video sin dimensiones');
            var plain = !!opts.plain;
            var rot90 = !plain && _x.state.rot % 180 !== 0;
            var W = rot90 ? vh : vw, H = rot90 ? vw : vh;
            if (opts.scale && W > opts.scale) {
                H = Math.round(H * opts.scale / W); W = opts.scale;
            }
            W -= W % 2; H -= H % 2;

            var canvas = document.createElement('canvas');
            canvas.width = W; canvas.height = H;
            var ctx = canvas.getContext('2d');
            var stream = canvas.captureStream(30);
            try {
                var as = hv.captureStream ? hv.captureStream()
                    : (hv.mozCaptureStream ? hv.mozCaptureStream() : null);
                if (as) as.getAudioTracks().forEach(function (t) { stream.addTrack(t); });
            } catch (e) {}

            var mime = FX.pickMime();
            try {
                rec = new MediaRecorder(stream,
                    mime ? { mimeType: mime, videoBitsPerSecond: opts.bitrate || 6000000 }
                         : undefined);
            } catch (e) { return fail('MediaRecorder no disponible'); }

            var chunks = [];
            rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
            rec.onstop = function () {
                if (finished) return;
                finished = true;
                if (cancelled) return onDone(null, 'Cancelado');
                onDone(new Blob(chunks, { type: rec.mimeType || 'video/mp4' }), null);
            };

            var from = opts.from || 0, to = opts.to;
            var dur = Math.max(0.1, (to != null ? to : hv.duration) - from);
            hv.playbackRate = opts.speed || 1;

            function frame() {
                if (finished) return;
                if (paused) { requestAnimationFrame(frame); return; }
                var t = hv.currentTime;
                var tIn = t - from;
                drawEdit(ctx, hv, W, H, tIn, dur, plain, t);
                if (onProgress) onProgress(Math.min(1, tIn / dur));
                if ((to != null && t >= to) || hv.ended) {
                    drawEdit(ctx, hv, W, H, Math.min(tIn, dur), dur, plain, t);
                    hv.pause();
                    try { rec.stop(); } catch (e) { finished = true; onDone(null, 'Error al grabar'); }
                    return;
                }
                requestAnimationFrame(frame);
            }

            var onSeek = function () {
                hv.removeEventListener('seeked', onSeek);
                rec.start(250);
                hv.play().catch(function () {});
                frame();
            };
            hv.addEventListener('seeked', onSeek);
            hv.addEventListener('ended', function () {
                if (!finished) try { rec.stop(); } catch (e) {}
            });
            try { hv.currentTime = from; } catch (e) { onSeek(); }
        });
        hv.src = opts.url;

        return {
            stop: function () {
                if (finished) return;
                cancelled = true;
                hv.pause();
                if (rec) { try { rec.stop(); } catch (e) {} }
                else { finished = true; onDone(null, 'Cancelado'); }
            },
            pause: function () {
                paused = true;
                hv.pause();
                if (rec && rec.state === 'recording') rec.pause();
            },
            resume: function () {
                paused = false;
                if (rec && rec.state === 'paused') rec.resume();
                hv.play().catch(function () {});
            },
            isPaused: function () { return paused; }
        };
    }

    FX.renderExport = renderExport;
})();
