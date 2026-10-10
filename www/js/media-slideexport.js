// ============================================================================
// ARCHIVO: media-slideexport.js
// RESPONSABILIDAD: exportación del slideshow a video y GIF animado.
//   - Diálogo de progreso con cancelación
//   - Dimensiones/bitrate por formato (h/v/s) y calidad (alta/media/baja)
//   - Video: canvas.captureStream + MediaRecorder + pista de la canción
//   - GIF: frames sintéticos a 10fps con gif.js vendored
//   Extiende window.TribalSlide (estado en _x). WebP vive en media-webp.js.
// ============================================================================
(function () {
    'use strict';
    var TS = window.TribalSlide;
    if (!TS) return;
    var _x = TS._x;

    // ------------------------------------------------- helpers de export
    function exportShell() {
        var cancelled = { v: false };
        var el = _x.shell(_x.deps.mount,
            '<div class="tribal-dialog">' +
                '<h4>Exportando</h4>' +
                '<p id="ts-exp-pct">Preparando fotos…</p>' +
                '<div class="tribal-player-progress"><div id="ts-exp-bar"></div></div>' +
                '<div class="tribal-dialog-actions" style="margin-top:16px">' +
                    '<button class="tribal-btn danger" id="ts-exp-cancel">Cancelar</button>' +
                '</div>' +
            '</div>');
        el.querySelector('#ts-exp-cancel').addEventListener('click', function () {
            cancelled.v = true;
        });
        return {
            bar: el.querySelector('#ts-exp-bar'),
            pct: el.querySelector('#ts-exp-pct'),
            cancelled: cancelled
        };
    }
    _x.exportShell = exportShell;

    function loadAll(cb) {
        Promise.all(_x.photos.map(function (m) {
            return new Promise(function (res) {
                _x.deps.urlFor(m, function (u) {
                    if (!u) return res(null);
                    _x.urls[m.id] = u;
                    _x.loadImg(u).then(res);
                });
            });
        })).then(cb);
    }
    _x.loadAll = loadAll;

    // 'auto' → decide por mayoría de orientación de las fotos
    function autoOrient(imgs) {
        if (_x.orient !== 'auto') return _x.orient;
        var v = 0, s = 0, h = 0;
        imgs.forEach(function (im) {
            var o = _x.aspectToOrient(im);
            if (o === 'v') v++; else if (o === 's') s++; else h++;
        });
        return v >= h && v >= s ? 'v' : (s > h ? 's' : 'h');
    }
    _x.autoOrient = autoOrient;

    // resoluciones y bitrates por formato y calidad
    var VDIMS = {
        h: { alta: [1920, 1080], media: [1280, 720],  baja: [854, 480] },
        v: { alta: [1080, 1920], media: [720, 1280],  baja: [480, 854] },
        s: { alta: [1080, 1080], media: [960, 960],   baja: [640, 640] }
    };
    var VBIT = { alta: 8000000, media: 6000000, baja: 2500000 };
    var GDIMS = { // dimensiones pares (requerido por WebP animado)
        h: { alta: [960, 540],  media: [720, 404],  baja: [480, 270] },
        v: { alta: [540, 960],  media: [404, 720],  baja: [270, 480] },
        s: { alta: [720, 720],  media: [540, 540],  baja: [400, 400] }
    };
    var GQUAL = { alta: 5, media: 10, baja: 20 }; // gif.js: menor = mejor
    _x.VDIMS = VDIMS;
    _x.GDIMS = GDIMS;

    // ------------------------------------------------------ exportar video
    function exportVideo(song) {
        if (_x.exporting) return;
        _x.exporting = true;
        var deps = _x.deps;
        var ui = exportShell();

        loadAll(function (imgs) {
            if (ui.cancelled.v) { _x.exporting = false; return _x.close(); }

            var dims = VDIMS[autoOrient(imgs)] || VDIMS.h;
            var W = dims[0], H = dims[1];

            var canvas = document.createElement('canvas');
            canvas.width = W; canvas.height = H;
            var ctx = canvas.getContext('2d');
            var stream = canvas.captureStream(30);

            var aEl = null;
            function record() {
                var mime = window.TribalVidFX ? window.TribalVidFX.pickMime() : '';
                var rec;
                try {
                    rec = new MediaRecorder(stream,
                        mime ? { mimeType: mime, videoBitsPerSecond: VBIT[_x.quality] || 6000000 }
                             : undefined);
                } catch (e) {
                    _x.exporting = false; _x.close();
                    return deps.toast('MediaRecorder no disponible aquí');
                }
                var chunks = [];
                rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
                rec.onstop = function () {
                    if (aEl) aEl.pause();
                    if (ui.cancelled.v) { _x.exporting = false; return _x.close(); }
                    var blob = new Blob(chunks, { type: rec.mimeType || 'video/mp4' });
                    var ext = blob.type.indexOf('mp4') >= 0 ? '.mp4' : '.webm';
                    var name = 'Slideshow ' + _x.quality.toUpperCase() + ' · ' +
                        _x.photos.length + ' fotos';
                    var f = new File([blob], name + ext, { type: blob.type });
                    deps.store.add(f).then(function (item) {
                        deps.store.updateInfo(item.id, {
                            notes: 'Slideshow · formato ' + autoOrient(imgs) +
                                ' · calidad ' + _x.quality + ' · ' + _x.photos.length + ' fotos'
                        });
                        _x.exporting = false;
                        _x.close();
                        deps.toast('Slideshow guardado como video (' + ext + ')');
                    });
                };

                var total = _x.photos.length * _x.secs; // segundos, una pasada
                var t0 = performance.now();
                function frame() {
                    if (ui.cancelled.v) { try { rec.stop(); } catch (e) {} return; }
                    var t = (performance.now() - t0) / 1000;
                    if (t >= total) {
                        _x.drawFrame(ctx, imgs, total - 0.01, W, H);
                        try { rec.stop(); } catch (e) {}
                        if (aEl) aEl.pause();
                        return;
                    }
                    _x.drawFrame(ctx, imgs, t, W, H);
                    ui.bar.style.width = (t / total * 100) + '%';
                    ui.pct.textContent = 'Grabando ' + Math.round(t / total * 100) +
                        '% — ' + Math.round(t) + 's de ' + total + 's';
                    requestAnimationFrame(frame);
                }
                rec.start(250);
                if (aEl) aEl.play().catch(function () {});
                frame();
            }

            if (song) {
                deps.urlFor(song, function (u) {
                    if (u) {
                        aEl = document.createElement('audio');
                        aEl.src = u;
                        var as = aEl.captureStream ? aEl.captureStream()
                            : (aEl.mozCaptureStream ? aEl.mozCaptureStream() : null);
                        if (as) {
                            as.getAudioTracks().forEach(function (t) { stream.addTrack(t); });
                        }
                        _x.urls['__song'] = u;
                    }
                    record();
                });
            } else {
                record();
            }
        });
    }

    // ---------------------------------------------------------- GIF animado
    function exportGIF() {
        if (_x.exporting) return;
        if (typeof GIF !== 'function') {
            return _x.deps.toast('El encoder GIF no está disponible');
        }
        _x.exporting = true;
        var deps = _x.deps;
        var ui = exportShell();

        loadAll(function (imgs) {
            if (ui.cancelled.v) { _x.exporting = false; return _x.close(); }

            var dims = GDIMS[autoOrient(imgs)] || GDIMS.h;
            var W = dims[0], H = dims[1];
            var canvas = document.createElement('canvas');
            canvas.width = W; canvas.height = H;
            var ctx = canvas.getContext('2d');

            var gif;
            try {
                gif = new GIF({
                    workers: 2,
                    quality: GQUAL[_x.quality] || 10,
                    width: W,
                    height: H,
                    workerScript: 'js/vendor/gif.worker.js'
                });
            } catch (e) {
                _x.exporting = false; _x.close();
                return deps.toast('No se pudo iniciar el encoder GIF');
            }

            // 10 fps: frames sintéticos, no en tiempo real
            var total = _x.photos.length * _x.secs;
            var step = 0.1;
            var frames = Math.max(2, Math.round(total / step));
            var i = 0;

            function gen() {
                // lotes de 4 frames para no congelar la UI
                for (var k = 0; k < 4 && i < frames; k++, i++) {
                    _x.drawFrame(ctx, imgs, i * step, W, H);
                    gif.addFrame(ctx, { copy: true, delay: step * 1000 });
                }
                ui.bar.style.width = (i / frames * 50) + '%'; // 0–50%: generación
                ui.pct.textContent = 'Generando frames ' + i + ' de ' + frames + '…';
                if (ui.cancelled.v) { _x.exporting = false; return _x.close(); }
                if (i < frames) setTimeout(gen, 0);
                else {
                    ui.pct.textContent = 'Comprimiendo GIF…';
                    gif.render();
                }
            }

            gif.on('progress', function (p) {
                ui.bar.style.width = (50 + p * 50) + '%'; // 50–100%: compresión
                ui.pct.textContent = 'Comprimiendo GIF ' + Math.round(p * 100) + '%';
            });
            gif.on('finished', function (blob) {
                var f = new File([blob],
                    'GIF ' + _x.quality.toUpperCase() + ' · ' + _x.photos.length + ' fotos.gif',
                    { type: 'image/gif' });
                deps.store.add(f).then(function (item) {
                    deps.store.updateInfo(item.id, {
                        notes: 'GIF animado · calidad ' + _x.quality + ' · ' + _x.photos.length + ' fotos'
                    });
                    _x.exporting = false;
                    _x.close();
                    deps.toast('GIF guardado en Fotos');
                });
            });
            gif.on('abort', function () { _x.exporting = false; _x.close(); });

            gen();
        });
    }

    _x.exportVideo = exportVideo;
    _x.exportGIF = exportGIF;
})();
