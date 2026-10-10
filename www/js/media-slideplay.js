// ============================================================================
// ARCHIVO: media-slideplay.js
// RESPONSABILIDAD: escenario del slideshow en vivo.
//   - Dos capas de imagen con transiciones CSS (fade/flash/slide/zoom)
//   - Contador, prev/next, salir, bucle, timer por foto
//   - Formato automático según la primera foto
//   - Canción de la biblioteca en bucle (puede correr horas)
//   Extiende window.TribalSlide (estado en _x).
// ============================================================================
(function () {
    'use strict';
    var TS = window.TribalSlide;
    if (!TS) return;
    var _x = TS._x;

    // ------------------------------------------------------------- escenario
    function startStage(song) {
        var deps = _x.deps;
        var el = _x.shell(deps.mount,
            '<div class="tslide-stage frame-h">' +
                '<img class="tslide-img" alt="">' +
                '<img class="tslide-img" alt="">' +
                '<div class="tslide-flash"></div>' +
            '</div>' +
            '<div class="tslide-ui">' +
                '<span class="tslide-count" id="ts-count"></span>' +
                '<div class="tslide-btns">' +
                    '<button class="tribal-ctrl" id="ts-prev"><i class="bi bi-skip-backward-fill"></i></button>' +
                    '<button class="tribal-ctrl" id="ts-next"><i class="bi bi-skip-forward-fill"></i></button>' +
                    '<button class="tribal-ctrl" id="ts-exit"><i class="bi bi-x-lg"></i></button>' +
                '</div>' +
            '</div>', 'tslide-ov');

        var stageEl = el.querySelector('.tslide-stage');
        var layers = el.querySelectorAll('.tslide-img');
        var flash = el.querySelector('.tslide-flash');
        var countEl = el.querySelector('#ts-count');
        var photos = _x.photos;
        _x.idx = 0; _x.curLayer = 0;

        // formato automático: sigue la orientación de las fotos
        if (_x.orient !== 'auto') {
            stageEl.className = 'tslide-stage frame-' + _x.orient;
        } else {
            deps.urlFor(photos[0], function (u) {
                if (!u) return;
                _x.loadImg(u).then(function (im) {
                    stageEl.className = 'tslide-stage frame-' + _x.aspectToOrient(im);
                });
            });
        }

        function show(n) {
            var m = photos[n];
            deps.urlFor(m, function (u) {
                if (!u || !_x.running) return;
                _x.urls[m.id] = u;
                var next = 1 - _x.curLayer;
                var inc = layers[next], out = layers[_x.curLayer];
                var fx = _x.pickEffect();
                inc.style.transitionDuration = _x.fxSecs + 's';
                out.style.transitionDuration = _x.fxSecs + 's';
                inc.src = u;
                inc.className = 'tslide-img fx-' + fx + '-in';
                out.className = 'tslide-img on fx-' + fx + '-out';
                if (fx === 'flash') {
                    flash.style.transitionDuration = (_x.fxSecs / 2) + 's';
                    flash.style.opacity = '0.85';
                    setTimeout(function () { flash.style.opacity = '0'; }, _x.fxSecs * 500);
                }
                requestAnimationFrame(function () {
                    requestAnimationFrame(function () {
                        inc.classList.add('on');
                        out.classList.remove('on');
                    });
                });
                _x.curLayer = next;
                countEl.textContent = (n + 1) + ' / ' + photos.length;
            });
        }

        function step(dir) {
            _x.idx += dir;
            if (_x.idx >= photos.length) {
                if (_x.loop) _x.idx = 0;
                else { deps.toast('Slideshow terminado'); return _x.close(); }
            }
            if (_x.idx < 0) _x.idx = photos.length - 1;
            show(_x.idx);
        }

        function armTimer() {
            _x.killTimer();
            _x.timer = setInterval(function () { step(1); }, _x.secs * 1000);
        }

        photos.forEach(function (m) {
            deps.urlFor(m, function (u) { if (u) _x.urls[m.id] = u; });
        });

        _x.running = true;
        show(0);
        armTimer();

        el.querySelector('#ts-prev').addEventListener('click', function () { step(-1); armTimer(); });
        el.querySelector('#ts-next').addEventListener('click', function () { step(1); armTimer(); });
        el.querySelector('#ts-exit').addEventListener('click', _x.close);
        el.addEventListener('click', function (e) {
            if (e.target === _x.ov || e.target.classList.contains('tslide-stage')) _x.close();
        });

        // música de fondo en bucle (para horas)
        if (song) {
            _x.audioEl = _x.audioEl || document.createElement('audio');
            deps.urlFor(song, function (u) {
                if (!u || !_x.running) return;
                _x.urls['__song'] = u;
                _x.audioEl.src = u;
                _x.audioEl.loop = true;
                _x.audioEl.play().catch(function () {});
            });
        }
    }

    _x.startStage = startStage;
})();
