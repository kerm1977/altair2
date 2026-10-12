// ============================================================================
// ARCHIVO: media-slideshow.js
// RESPONSABILIDAD: núcleo del slideshow de fotografías (offline-first).
//   - Estado compartido en TribalSlide._x (los módulos media-slidecfg.js,
//     media-slideplay.js, media-slideexport.js y media-webp.js extienden la API)
//   - Persistencia de ajustes (localStorage tribu_slide_cfg)
//   - Helpers comunes: shell de overlays, transiciones, dibujo de frames
//   API: TribalSlide.open(deps) · close() · isOpen()
//   deps = { mount, images:[], audios:[], urlFor, store, toast, onBeforeStart }
// ============================================================================
window.TribalSlide = (function () {
    'use strict';

    // estado interno compartido entre los módulos del slideshow
    var _x = {
        ov: null,                  // overlay actual (config / stage / export)
        timer: null,
        running: false,
        deps: null,
        photos: [],
        urls: {},                  // id -> url (los administra el caché de la vista)
        idx: 0, curLayer: 0,
        secs: 5, loop: true, effect: 'fade', fxSecs: 0.9, orient: 'auto',
        quality: 'media',
        audioEl: null,
        exporting: false,
        // los módulos asignan estas funciones:
        openConfig: null, startStage: null,
        exportVideo: null, exportGIF: null, exportWebP: null
    };

    var CFG_KEY = 'tribu_slide_cfg';
    var EFFECTS = ['fade', 'flash', 'slide', 'zoom'];

    function saveCfg(songId) {
        try {
            localStorage.setItem(CFG_KEY, JSON.stringify({
                secs: _x.secs, fxSecs: _x.fxSecs, effect: _x.effect,
                orient: _x.orient, loop: _x.loop, quality: _x.quality,
                songId: songId || '',
                photoIds: _x.photos.map(function (m) { return m.id; })
            }));
        } catch (e) {}
    }

    function aspectToOrient(im) {
        if (!im || !im.width) return 'h';
        var r = im.width / im.height;
        return r > 1.15 ? 'h' : (r < 0.87 ? 'v' : 's');
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function killTimer() { if (_x.timer) { clearInterval(_x.timer); _x.timer = null; } }

    // Las URLs vienen del caché de la vista (urlFor) — no las revocamos aquí.
    function close() {
        _x.running = false;
        killTimer();
        if (_x.syncFs) {
            window.removeEventListener('resize', _x.syncFs);
            _x.syncFs = null;
            try {
                if (document.fullscreenElement) document.exitFullscreen();
            } catch (e) {}
        }
        if (_x.audioEl) {
            _x.audioEl.pause();
            _x.audioEl.removeAttribute('src');
            _x.audioEl.load();
        }
        _x.urls = {};
        if (_x.ov && _x.ov.parentNode) _x.ov.parentNode.removeChild(_x.ov);
        _x.ov = null;
    }

    function shell(mount, html, cls) {
        if (_x.ov && _x.ov.parentNode) _x.ov.parentNode.removeChild(_x.ov);
        _x.ov = document.createElement('div');
        _x.ov.className = 'tribal-overlay ' + (cls || '');
        _x.ov.innerHTML = html;
        (mount || document.body).appendChild(_x.ov);
        return _x.ov;
    }

    function pickEffect() {
        return _x.effect === 'rand'
            ? EFFECTS[Math.floor(Math.random() * EFFECTS.length)]
            : _x.effect;
    }

    // ------------------------------------------------- helpers de dibujo ---
    function loadImg(url) {
        return new Promise(function (res) {
            var i = new Image();
            i.onload = function () { res(i); };
            i.onerror = function () { res(null); };
            i.src = url;
        });
    }

    function drawCover(ctx, img, W, H, alpha, scale, dx) {
        if (!img) return;
        var s = Math.max(W / img.width, H / img.height) * (scale || 1);
        var w = img.width * s, h = img.height * s;
        ctx.globalAlpha = alpha == null ? 1 : alpha;
        ctx.drawImage(img, (W - w) / 2 + (dx || 0), (H - h) / 2, w, h);
        ctx.globalAlpha = 1;
    }

    // un fotograma del slideshow en el tiempo t (usado por video/GIF/WebP)
    function drawFrame(ctx, imgs, t, W, H) {
        var photos = _x.photos, secs = _x.secs, fxSecs = _x.fxSecs;
        var i = Math.min(photos.length - 1, Math.floor(t / secs));
        var local = t - i * secs;
        var hold = secs - fxSecs;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        var first = imgs.find(function (x) { return x; });
        if (!first) return;
        if (local < hold || i >= photos.length - 1) {
            drawCover(ctx, imgs[i] || first, W, H);
            return;
        }
        var p = (local - hold) / fxSecs;
        var A = imgs[i] || first, B = imgs[i + 1] || A;
        var fx = pickEffect();
        if (fx === 'flash') {
            drawCover(ctx, A, W, H, 1 - p);
            drawCover(ctx, B, W, H, p);
            ctx.globalAlpha = Math.sin(p * Math.PI);
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = 1;
        } else if (fx === 'slide') {
            drawCover(ctx, A, W, H, 1, 1, -p * W);
            drawCover(ctx, B, W, H, 1, 1, (1 - p) * W);
        } else if (fx === 'zoom') {
            drawCover(ctx, A, W, H, 1 - p, 1 + p * 0.1);
            drawCover(ctx, B, W, H, p, 1.15 - 0.15 * p);
        } else { // fade
            drawCover(ctx, A, W, H, 1 - p);
            drawCover(ctx, B, W, H, p);
        }
    }

    _x.CFG_KEY = CFG_KEY;
    _x.EFFECTS = EFFECTS;
    _x.saveCfg = saveCfg;
    _x.aspectToOrient = aspectToOrient;
    _x.esc = esc;
    _x.killTimer = killTimer;
    _x.close = close;
    _x.shell = shell;
    _x.pickEffect = pickEffect;
    _x.loadImg = loadImg;
    _x.drawCover = drawCover;
    _x.drawFrame = drawFrame;

    return {
        _x: _x,
        open: function (d) {
            if (_x.openConfig) _x.openConfig(d);
        },
        close: close,
        isOpen: function () { return !!_x.ov; }
    };
})();
