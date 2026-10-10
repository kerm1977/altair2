// ============================================================================
// ARCHIVO: media-vinyl.js
// RESPONSABILIDAD: Pantalla completa "vinilo tribal" para la música.
//   Disco girando mientras suena, nombre, artista/álbum y tiempos.
//   Reutiliza el <audio> ya existente: no duplica reproducción.
//   - Visualizador naranja (media-viz.js) bajo el disco, solo en fullscreen
//   - Si no hay carátula, el centro del disco lleva el sol tribal girando
//   API: TribalVinyl.open({ meta, el, url, onPrev, onNext, onClose })
// ============================================================================
window.TribalVinyl = (function () {
    'use strict';

    var ov = null, disc, titleEl, subEl, curEl, durEl, fill, bar, btnPlay;
    var btnRep, btnShuf, volRange;
    var el = null, cb = {}, bound = false, vizBound = false;

    // el mismo sol tribal de la cabecera, como avatar por defecto del disco
    function sunSvg() {
        var rays = '';
        for (var i = 0; i < 8; i++) {
            rays += '<polygon points="32,0 36,10 28,10" transform="rotate(' +
                (i * 45) + ' 32 32)"/>';
        }
        return '<svg class="tribal-vinyl-sun" viewBox="0 0 64 64" aria-hidden="true">' +
            '<g fill="#f0b429">' + rays + '</g>' +
            '<circle cx="32" cy="32" r="15" fill="#e2602e" stroke="#f0b429" stroke-width="2"/>' +
            '<circle cx="32" cy="32" r="7" fill="none" stroke="#f3e6cf" stroke-width="2" stroke-dasharray="3 3"/>' +
            '</svg>';
    }
    function labelHtml(artUrl) {
        return artUrl ? '<img src="' + esc(artUrl) + '" alt="">' : sunSvg();
    }

    function fmt(s) {
        if (!isFinite(s)) return '0:00';
        s = Math.floor(s);
        return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function build() {
        if (ov) return;
        ov = document.createElement('div');
        ov.className = 'tribal-vinyl';
        ov.id = 'vinyl-overlay';
        ov.innerHTML =
            '<button class="tribal-close" data-v="close"><i class="bi bi-x-lg"></i></button>' +
            '<div class="tribal-vinyl-brand">T<span class="tr-sm">R</span>I' +
                '<span class="tr-b">B</span>AL<span>s</span>' +
                '<small>El fuego guarda tu música</small></div>' +
            '<div class="tribal-vinyl-stage">' +
                '<svg class="tribal-vinyl-ring" viewBox="0 0 200 200" aria-hidden="true">' +
                    '<circle cx="100" cy="100" r="96" fill="none" stroke="#f0b429" stroke-width="2" stroke-dasharray="6 6"/>' +
                    '<g fill="#e2602e">' +
                        '<polygon points="100,2 104,12 96,12"/>' +
                        '<polygon points="100,2 104,12 96,12" transform="rotate(45 100 100)"/>' +
                        '<polygon points="100,2 104,12 96,12" transform="rotate(90 100 100)"/>' +
                        '<polygon points="100,2 104,12 96,12" transform="rotate(135 100 100)"/>' +
                        '<polygon points="100,2 104,12 96,12" transform="rotate(180 100 100)"/>' +
                        '<polygon points="100,2 104,12 96,12" transform="rotate(225 100 100)"/>' +
                        '<polygon points="100,2 104,12 96,12" transform="rotate(270 100 100)"/>' +
                        '<polygon points="100,2 104,12 96,12" transform="rotate(315 100 100)"/>' +
                    '</g>' +
                '</svg>' +
                '<div class="tribal-vinyl-disc"><div class="tribal-vinyl-label">' + sunSvg() + '</div></div>' +
            '</div>' +
            '<p class="tribal-vinyl-title"></p>' +
            '<p class="tribal-vinyl-sub"></p>' +
            '<div class="tribal-vinyl-bar"><div class="tribal-vinyl-fill"></div></div>' +
            '<div class="tribal-vinyl-times"><span class="tribal-vinyl-cur">0:00</span><span class="tribal-vinyl-dur">0:00</span></div>' +
            '<canvas class="tribal-vinyl-viz"></canvas>' +
            '<div class="tribal-vinyl-controls">' +
                '<button class="tribal-ctrl mode" data-v="repeat" title="Repetir"><i class="bi bi-repeat"></i></button>' +
                '<button class="tribal-ctrl" data-v="prev"><i class="bi bi-skip-backward-fill"></i></button>' +
                '<button class="tribal-ctrl play" data-v="play"><i class="bi bi-play-fill"></i></button>' +
                '<button class="tribal-ctrl" data-v="next"><i class="bi bi-skip-forward-fill"></i></button>' +
                '<button class="tribal-ctrl mode" data-v="shuffle" title="Aleatorio"><i class="bi bi-shuffle"></i></button>' +
            '</div>' +
            '<div class="tribal-vinyl-vol">' +
                '<i class="bi bi-volume-mute-fill"></i>' +
                '<input type="range" class="tribal-vinyl-volrange" min="0" max="100" step="1" value="100">' +
                '<i class="bi bi-volume-up-fill"></i>' +
            '</div>';
        disc = ov.querySelector('.tribal-vinyl-disc');
        titleEl = ov.querySelector('.tribal-vinyl-title');
        subEl = ov.querySelector('.tribal-vinyl-sub');
        curEl = ov.querySelector('.tribal-vinyl-cur');
        durEl = ov.querySelector('.tribal-vinyl-dur');
        fill = ov.querySelector('.tribal-vinyl-fill');
        bar = ov.querySelector('.tribal-vinyl-bar');
        btnPlay = ov.querySelector('[data-v="play"]');
        btnRep = ov.querySelector('[data-v="repeat"]');
        btnShuf = ov.querySelector('[data-v="shuffle"]');
        volRange = ov.querySelector('.tribal-vinyl-volrange');

        ov.addEventListener('click', function (e) {
            var b = e.target.closest('[data-v]');
            if (!b) return;
            var k = b.dataset.v;
            if (k === 'close') close();
            else if (k === 'play' && el) { el.paused ? el.play() : el.pause(); }
            else if (k === 'prev' && cb.onPrev) cb.onPrev();
            else if (k === 'next' && cb.onNext) cb.onNext();
            else if (k === 'repeat' && cb.prefs) {
                var p = cb.prefs;
                p.repeat = p.repeat === 'off' ? 'all' : (p.repeat === 'all' ? 'one' : 'off');
                if (cb.onPref) cb.onPref();
                syncModes();
            }
            else if (k === 'shuffle' && cb.prefs) {
                cb.prefs.shuffle = !cb.prefs.shuffle;
                if (cb.onPref) cb.onPref();
                syncModes();
            }
        });
        volRange.addEventListener('input', function () {
            if (!el) return;
            el.muted = false;
            el.volume = volRange.value / 100;
        });
        bar.addEventListener('click', function (e) {
            if (!el || !el.duration) return;
            var r = bar.getBoundingClientRect();
            el.currentTime = (e.clientX - r.left) / r.width * el.duration;
        });
    }

    function sync() {
        if (!el) return;
        btnPlay.innerHTML = el.paused ? '<i class="bi bi-play-fill"></i>' : '<i class="bi bi-pause-fill"></i>';
        disc.classList.toggle('spinning', !el.paused);
    }
    function syncModes() {
        if (!btnRep || !cb.prefs) return;
        var r = cb.prefs.repeat;
        btnRep.querySelector('i').className =
            'bi ' + (r === 'one' ? 'bi-repeat-1' : 'bi-repeat');
        btnRep.classList.toggle('active', r !== 'off');
        btnRep.classList.toggle('off', r === 'off');
        btnShuf.classList.toggle('active', !!cb.prefs.shuffle);
    }
    function tick() {
        if (!el) return;
        curEl.textContent = fmt(el.currentTime);
        durEl.textContent = fmt(el.duration);
        if (el.duration) fill.style.width = (el.currentTime / el.duration * 100) + '%';
    }
    function bind() {
        if (bound || !el) return;
        bound = true;
        el.addEventListener('play', sync);
        el.addEventListener('pause', sync);
        el.addEventListener('timeupdate', tick);
        el.addEventListener('loadedmetadata', tick);
        el.addEventListener('durationchange', tick);
    }

    function open(opts) {
        build();
        el = opts.el;
        cb = { onPrev: opts.onPrev, onNext: opts.onNext, onClose: opts.onClose,
               prefs: opts.prefs, onPref: opts.onPref };
        if (volRange && el) volRange.value = Math.round((el.volume != null ? el.volume : 1) * 100);
        var m = opts.meta || {};
        var info = m.info || {};
        titleEl.textContent = info.titulo || m.name || '—';
        subEl.textContent = [info.artista, info.album].filter(Boolean).join(' · ');
        var label = ov.querySelector('.tribal-vinyl-label');
        label.innerHTML = labelHtml(opts.artUrl);
        bind();
        sync();
        syncModes();
        tick();
        (opts.mount || document.body).appendChild(ov);
        if (!vizBound && window.TribalViz) {
            vizBound = true;
            TribalViz.bind(ov.querySelector('.tribal-vinyl-viz'), el);
        }
        if (ov.requestFullscreen) ov.requestFullscreen().catch(function () {});
    }

    function close() {
        if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) {} }
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        el = null;
        if (cb.onClose) cb.onClose();
        cb = {};
    }

    // Actualiza título cuando cambia de pista sin cerrar
    function setMeta(m, artUrl) {
        if (!ov || !m) return;
        var info = m.info || {};
        titleEl.textContent = info.titulo || m.name || '—';
        subEl.textContent = [info.artista, info.album].filter(Boolean).join(' · ');
        ov.querySelector('.tribal-vinyl-label').innerHTML = labelHtml(artUrl);
    }

    return { open: open, close: close, setMeta: setMeta, isOpen: function () { return !!(ov && ov.parentNode); } };
})();
