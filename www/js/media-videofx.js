// ============================================================================
// ARCHIVO: media-videofx.js
// RESPONSABILIDAD: Núcleo del editor de video (vista previa en vivo).
//   - Estado compartido en TribalVidFX._x (usado por media-lut.js y
//     media-editexport.js que extienden esta misma API).
//   - Ecualizador de imagen: brillo, contraste, saturación, canales R/G/B,
//     nitidez (SVG feColorMatrix + feConvolveMatrix + CSS filters).
//   - Zoom sobre una zona + transformaciones (flip H/V, rotación).
//   - Screenshot y captura directa del elemento de video.
//   API: TribalVidFX.bind(videoEl, mount) · set(k,v) · get(k) · reset()
//        screenshot(cb) · capture(opts,onProgress,onDone) · pickMime()
// ============================================================================
window.TribalVidFX = (function () {
    'use strict';

    // estado interno compartido con los módulos que extienden la API
    var _x = {
        video: null,
        rgbMatrix: null, sharpKernel: null,
        state: {
            br: 100, co: 100, sa: 100, r: 100, g: 100, b: 100,
            sharp: 0, zoom: 100,
            px: 50, py: 50,                 // punto focal del zoom (%)
            flipH: 0, flipV: 0, rot: 0,     // transformaciones del editor
            edgeFade: 0                     // fundido en los bordes al exportar
        },
        sticker: null,                    // { img, x, y, s, t0, t1 }
        textOv: null,                     // { str, x, y, s, t0, t1 }
        lut: null,                        // { name, size, data(Float32Array) }
        drawEdit: null                    // lo asigna media-editexport.js
    };
    var DEF = {
        br: 100, co: 100, sa: 100, r: 100, g: 100, b: 100,
        sharp: 0, zoom: 100, px: 50, py: 50,
        flipH: 0, flipV: 0, rot: 0, edgeFade: 0
    };
    var PANNING = false;
    var state = _x.state;

    // ----------------------------------------------------- filtros SVG -----
    function mountFilters(mount) {
        _x.rgbMatrix = document.getElementById('tb-rgb');
        _x.sharpKernel = document.getElementById('tb-sharp');
        if (_x.rgbMatrix && _x.sharpKernel) return; // ya montados
        var wrap = document.createElement('div');
        wrap.innerHTML =
            '<svg width="0" height="0" style="position:absolute" aria-hidden="true">' +
            '<filter id="tb-vidfx" color-interpolation-filters="sRGB">' +
                '<feColorMatrix id="tb-rgb" type="matrix" ' +
                    'values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"/>' +
                '<feConvolveMatrix id="tb-sharp" order="3" preserveAlpha="true" ' +
                    'kernelMatrix="0 0 0 0 1 0 0 0 0"/>' +
            '</filter></svg>';
        (mount || document.body).appendChild(wrap.firstChild);
        _x.rgbMatrix = document.getElementById('tb-rgb');
        _x.sharpKernel = document.getElementById('tb-sharp');
    }

    function cssFilter() {
        return 'url(#tb-vidfx)' +
            ' brightness(' + state.br / 100 + ')' +
            ' contrast(' + state.co / 100 + ')' +
            ' saturate(' + state.sa / 100 + ')';
    }
    _x.cssFilter = cssFilter;

    function apply() {
        if (!_x.video) return;
        var r = state.r / 100, g = state.g / 100, b = state.b / 100;
        if (_x.rgbMatrix) {
            _x.rgbMatrix.setAttribute('values',
                r + ' 0 0 0 0  0 ' + g + ' 0 0 0  0 0 ' + b + ' 0 0  0 0 0 1 0');
        }
        var s = state.sharp / 100;
        if (_x.sharpKernel) {
            _x.sharpKernel.setAttribute('kernelMatrix',
                '0 ' + (-s) + ' 0  ' + (-s) + ' ' + (1 + 4 * s) + ' ' + (-s) + '  0 ' + (-s) + ' 0');
        }
        _x.video.style.filter = cssFilter();
        _x.video.style.transform =
            'scale(' + state.zoom / 100 + ')' +
            ' rotate(' + state.rot + 'deg)' +
            ' scaleX(' + (state.flipH ? -1 : 1) + ')' +
            ' scaleY(' + (state.flipV ? -1 : 1) + ')';
    }
    _x.apply = apply;

    // ---------------------------------------------------- zoom por zona ----
    function panTo(e) {
        if (!_x.video || state.zoom <= 100) return;
        var r = _x.video.getBoundingClientRect();
        var x = Math.min(100, Math.max(0, (e.clientX - r.left) / r.width * 100));
        var y = Math.min(100, Math.max(0, (e.clientY - r.top) / r.height * 100));
        state.px = x; state.py = y;
        _x.video.style.transformOrigin = x.toFixed(1) + '% ' + y.toFixed(1) + '%';
    }

    function bind(videoEl, mount) {
        _x.video = videoEl;
        mountFilters(mount);
        apply();
        if (videoEl.dataset.vfxBound) return;
        videoEl.dataset.vfxBound = '1';
        videoEl.addEventListener('pointerdown', function (e) {
            if (state.zoom <= 100) return;
            PANNING = true;
            panTo(e);
        });
        videoEl.addEventListener('pointermove', function (e) {
            if (PANNING) panTo(e);
        });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
            videoEl.addEventListener(ev, function () { PANNING = false; });
        });
    }

    function set(k, v) {
        if (!(k in state)) return;
        state[k] = v;
        apply();
    }

    function reset() {
        Object.keys(DEF).forEach(function (k) { state[k] = DEF[k]; });
        if (_x.video) _x.video.style.transformOrigin = '50% 50%';
        apply();
    }

    // -------------------------------------------------------- screenshot ---
    function screenshot(cb) {
        var video = _x.video;
        if (!video || !video.videoWidth || !_x.drawEdit) return cb(null);
        try {
            var rot90 = state.rot % 180 !== 0;
            var c = document.createElement('canvas');
            c.width = rot90 ? video.videoHeight : video.videoWidth;
            c.height = rot90 ? video.videoWidth : video.videoHeight;
            var ctx = c.getContext('2d');
            _x.drawEdit(ctx, video, c.width, c.height, -1, -1, false, video.currentTime);
            c.toBlob(function (b) { cb(b); }, 'image/png');
        } catch (e) { cb(null); }
    }

    // ------------------------------------------------- captura / conversión
    function pickMime() {
        var cands = [
            'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
            'video/mp4;codecs=avc1',
            'video/mp4',
            'video/webm;codecs=h264,opus',
            'video/webm;codecs=vp9,opus',
            'video/webm'
        ];
        for (var i = 0; i < cands.length; i++) {
            try {
                if (window.MediaRecorder && MediaRecorder.isTypeSupported(cands[i])) {
                    return cands[i];
                }
            } catch (e) {}
        }
        return '';
    }

    // opts: { from (s), to (s|null) } — graba la reproducción en tiempo real
    function capture(opts, onProgress, onDone) {
        var video = _x.video;
        if (!video) return onDone(null, 'No hay video abierto');
        if (typeof video.captureStream !== 'function' || !window.MediaRecorder) {
            return onDone(null, 'Este dispositivo no permite capturar video');
        }
        var mime = pickMime();
        var rec;
        try {
            rec = new MediaRecorder(video.captureStream(),
                mime ? { mimeType: mime, videoBitsPerSecond: 5000000 } : undefined);
        } catch (e) {
            return onDone(null, 'MediaRecorder no disponible');
        }

        var chunks = [], done = false;
        var from = opts.from || 0, to = opts.to;

        function stop() {
            if (done) return;
            done = true;
            video.removeEventListener('timeupdate', onTime);
            video.removeEventListener('ended', stop);
            try { rec.stop(); } catch (e) {}
        }
        function onTime() {
            if (to != null && video.currentTime >= to) { stop(); return; }
            if (onProgress) {
                var total = (to != null ? to : (video.duration || 0)) - from;
                if (total > 0) onProgress(Math.min(1, (video.currentTime - from) / total));
            }
        }

        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = function () {
            onDone(new Blob(chunks, { type: rec.mimeType || 'video/webm' }), null);
        };

        video.addEventListener('timeupdate', onTime);
        video.addEventListener('ended', stop);
        video.currentTime = from;
        video.play().catch(function () {});
        rec.start(250);
        return { stop: stop };
    }

    var api = {
        _x: _x,
        bind: bind,
        set: set,
        get: function (k) { return state[k]; },
        reset: reset,
        screenshot: screenshot,
        capture: capture,
        pickMime: pickMime,
        setSticker: function (s) { _x.sticker = s; },
        getSticker: function () { return _x.sticker; },
        setText: function (t) { _x.textOv = t; },
        getText: function () { return _x.textOv; },
        getLUT: function () { return _x.lut; }
    };
    return api;
})();
