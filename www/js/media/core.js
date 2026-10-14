// ============================================================================
// ARCHIVO: media/core.js
// RESPONSABILIDAD: Núcleo de TRIBALs.
//   - Crea el contexto compartido `window.Sono` (refs DOM + estado + utils).
//   - Sono.register(fn) encola un módulo; Sono.boot() los inicializa en orden
//     (se invoca al final de media.html; se auto-protege contra doble init).
//   - Render de la cuadrícula, filtros por tipo/búsqueda, subida de archivos,
//     limpieza de URLs al salir de la vista.
// Los demás módulos hacen: Sono.register(function (S) { ... });
// ============================================================================
window.Sono = (function () {
    'use strict';

    var S = {};
    var mods = {};         // nombre → init(S); registro idempotente (SPA re-inyecta scripts)
    var modOrder = [];

    S.register = function (name, fn) {
        if (typeof name === 'function') { fn = name; name = 'm' + modOrder.length; }
        if (!mods[name]) modOrder.push(name);
        mods[name] = fn;
    };

    // ------------------------------------------------------------------ boot
    S.boot = function () {
        var root = document.getElementById('tribal-root');
        if (!root || root.dataset.init === '1') return;
        root.dataset.init = '1';
        bindRefs();
        modOrder.forEach(function (k) { mods[k](S); });
        S.reload();
    };

    function bindRefs() {
        var $ = S.$ = function (id) { return document.getElementById(id); };
        S.root = $('tribal-root');
        S.grid = $('media-grid'); S.empty = $('media-empty');
        S.gridWrap = $('media-grid-wrap');
        S.tabs = $('media-tabs'); S.search = $('media-search');
        S.fab = $('media-fab'); S.input = $('media-input');
        S.player = $('media-player'); S.audio = $('media-audio');
        S.pTitle = $('player-title'); S.pFill = $('player-progress-fill');
        S.pProg = $('player-progress'); S.pCur = $('player-current');
        S.pDur = $('player-duration'); S.pToggle = $('player-toggle');
        S.videoOv = $('video-overlay'); S.videoEl = $('video-viewer');
        S.videoTitle = $('video-title');
        S.imageOv = $('image-overlay'); S.imageEl = $('image-viewer');
        S.imageTitle = $('image-title');
        S.renOv = $('rename-overlay'); S.renInput = $('rename-input');
        S.delOv = $('delete-overlay'); S.delText = $('delete-text');
        S.menu = $('card-menu'); S.toastEl = $('media-toast');
        S.pMenu = $('player-menu'); S.pBadges = $('player-badges');
        S.pCover = S.player.querySelector('.tribal-player-cover');
        S.crumb = $('media-crumb'); S.crumbName = $('crumb-name');
        S.colsOv = $('cols-overlay'); S.colsList = $('cols-list');
        S.newcolOv = $('newcol-overlay'); S.newcolInput = $('newcol-name');

        // ------------------------------------------------------------ estado
        S.KIND_ICON = { audio: 'bi-music-note-beamed', video: 'bi-camera-video-fill', image: 'bi-image-fill', doc: 'bi-book-half', other: 'bi-file-earmark' };
        S.KIND_LABEL = { audio: 'Audio', video: 'Video', image: 'Foto', doc: 'Libro', other: 'Archivo' };
        S.SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
        S.REPEAT_LABEL = { off: 'desactivado', all: 'lista', one: 'una' };

        S.items = [];
        S.filter = 'all'; S.query = '';
        S.queue = []; S.queueIdx = -1;     // playlist de audio
        S.menuItem = null;                 // item sobre el que se abrió el menú
        S.pendingId = null;                // id para renombrar / eliminar
        S.urlCache = {};                   // id -> objectURL (solo web)
        S.toastTimer = null;
        S.viewMode = 'items';              // 'items' | 'cols' | 'col'
        S.activeCol = null;                // 'fav' o id de colección
        S.activeItemId = null;             // último item abierto
        S.colAssignId = null;              // item al que se asignan colecciones
        S.recording = false; S.recHandle = null;
        S.clips = [];                      // fragmentos del cortador
        S.bufGoal = 0; S.pausedByBuf = false;

        // extras del reproductor
        S.prefs = { eq: 'normal', speed: 1, repeat: 'all', shuffle: false };
        try {
            Object.assign(S.prefs,
                JSON.parse(localStorage.getItem('tribu_media_prefs') || '{}'));
        } catch (e) {}
        S.loopA = null; S.loopB = null;
    }

    // ------------------------------------------------------------------ utils
    S.esc = function (s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };
    S.fmtSize = function (b) {
        if (!b) return '';
        var u = ['B', 'KB', 'MB', 'GB'], i = 0;
        while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
        return b.toFixed(b >= 10 || i === 0 ? 0 : 1) + ' ' + u[i];
    };
    S.fmtTime = function (s) {
        if (!isFinite(s)) return '0:00';
        s = Math.floor(s);
        return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    };
    S.showToast = function (msg) {
        S.toastEl.textContent = msg;
        S.toastEl.classList.add('show');
        clearTimeout(S.toastTimer);
        S.toastTimer = setTimeout(function () {
            S.toastEl.classList.remove('show');
        }, 2400);
    };
    S.savePrefs = function () {
        try { localStorage.setItem('tribu_media_prefs', JSON.stringify(S.prefs)); } catch (e) {}
    };
    S.activeEl = function () { return !S.videoOv.hidden ? S.videoEl : S.audio; };
    S.goFullscreen = function (el) {
        if (el && el.requestFullscreen) el.requestFullscreen().catch(function () {});
    };
    S.exitFull = function () {
        if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    };
    // confirmación de doble paso genérica:
    // S.confirm(title, msg, okLabel, cb [, onNo]) — onNo corre al cancelar
    S.confirm = function (title, msg, okLabel, cb, onNo) {
        var ov = S.$('confirm-overlay');
        if (!ov) return cb();
        S.$('confirm-title').textContent = title || 'Confirmar';
        S.$('confirm-text').textContent = msg || '';
        S.$('confirm-ok').textContent = okLabel || 'Eliminar';
        ov.hidden = false;
        var done = function (yes) {
            ov.hidden = true;
            S.$('confirm-ok').onclick = S.$('confirm-cancel').onclick = ov.onclick = null;
            if (yes) cb(); else if (onNo) onNo();
        };
        S.$('confirm-ok').onclick = function () { done(true); };
        S.$('confirm-cancel').onclick = function () { done(false); };
        ov.onclick = function (e) { if (e.target === ov) done(false); };
    };
    S.favLabel = function (btn, m) {
        if (!btn) return;
        var on = !!(m && m.fav);
        var i = btn.querySelector('i');
        if (i) i.className = 'bi ' + (on ? 'bi-heart-fill' : 'bi-heart');
        var b = btn.querySelector('b');
        if (b) b.textContent = on ? 'sí' : 'no';
    };

    // ------------------------------------------------------------------ urls
    S.urlFor = function (meta, cb) {
        if (S.urlCache[meta.id]) return cb(S.urlCache[meta.id]);
        window.MediaStore.getURL(meta).then(function (u) {
            if (u && !window.MediaStore.isNative()) S.urlCache[meta.id] = u;
            cb(u);
        }).catch(function () { cb(null); });
    };

    S.videoThumb = function (url, cb) {
        var v = document.createElement('video');
        v.muted = true; v.playsInline = true; v.preload = 'metadata'; v.src = url;
        var done = false;
        function finish(data) {
            if (!done) { done = true; cb(data); }
            v.removeAttribute('src'); v.load();   // src='' rompe Firefox
        }
        v.addEventListener('loadeddata', function () {
            try { v.currentTime = Math.min(0.6, (v.duration || 1) / 3); } catch (e) { finish(null); }
        });
        v.addEventListener('seeked', function () {
            try {
                var c = document.createElement('canvas');
                c.width = v.videoWidth || 320; c.height = v.videoHeight || 320;
                c.getContext('2d').drawImage(v, 0, 0);
                finish(c.toDataURL('image/jpeg', 0.6));
            } catch (e) { finish(null); }
        });
        v.addEventListener('error', function () { finish(null); });
        setTimeout(function () { finish(null); }, 4000);
    };

    return S;
})();
