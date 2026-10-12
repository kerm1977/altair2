// === media/vnoteswave.js — Onda interactiva del editor de notas =========
// Waveform con marcadores A–B arrastrables, playhead en vivo y espectro
// animado mientras suena la previa. API:
//   wv = TribalVWave.mount(canvas) → { buf(ab), sel(), pos(t), live(an),
//                                      onchange, dur() }
// =========================================================================
window.TribalVWave = (function () {
    'use strict';
    function mount(canvas) {
        var g = canvas.getContext('2d');
        var ab = null, peaks = null, a = 0, b = 0, head = null, an = null;
        var drag = -1, raf = null, onchange = null;
        var GOLD = '#f0b429', TERRA = '#e2602e';

        function peaksOf(buf) {            // min/max por columna
            var w = canvas.width, d = buf.getChannelData(0), p = new Float32Array(w);
            for (var x = 0; x < w; x++) {
                var i0 = (x * d.length / w) | 0, i1 = ((x + 1) * d.length / w) | 0, mx = 0;
                for (var i = i0; i < i1; i += 8) { var s = Math.abs(d[i]); if (s > mx) mx = s; }
                p[x] = mx;
            }
            return p;
        }
        function t2x(t) { return ab ? t / ab.duration * canvas.width : 0; }
        function x2t(x) { return ab ? x / canvas.width * ab.duration : 0; }
        function draw() {
            var w = canvas.width, h = canvas.height;
            g.clearRect(0, 0, w, h);
            if (!ab) return;
            var xa = t2x(Math.min(a, b)), xb = t2x(Math.max(a, b));
            g.fillStyle = 'rgba(240,180,41,.9)';
            for (var x = 0; x < w; x++) {
                var bh = peaks[x] * h;
                if (x >= xa && x <= xb) g.fillStyle = GOLD;        // selección viva
                else g.fillStyle = 'rgba(179,147,114,.5)';          // fuera: apagado
                g.fillRect(x, (h - bh) / 2, 1, Math.max(1, bh));
            }
            g.fillStyle = 'rgba(0,0,0,.45)';                        // sombra fuera de A–B
            g.fillRect(0, 0, xa, h); g.fillRect(xb, 0, w - xb, h);
            // espectro en vivo (línea turquesa que baila con la previa)
            if (an) {
                var fd = new Uint8Array(an.frequencyBinCount);
                an.getByteFrequencyData(fd);
                g.strokeStyle = '#2a9d8f'; g.lineWidth = 2; g.beginPath();
                for (x = 0; x < w; x += 4) {
                    var v = fd[(x / w * fd.length * .6) | 0] / 255;
                    var y = h - v * h * .55 - 2;
                    x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
                }
                g.stroke();
            }
            // marcadores A/B con asas
            [xa, xb].forEach(function (mx) {
                g.strokeStyle = TERRA; g.lineWidth = 3;
                g.beginPath(); g.moveTo(mx, 0); g.lineTo(mx, h); g.stroke();
                g.fillStyle = GOLD;
                g.beginPath(); g.arc(mx, 10, 6, 0, Math.PI * 2); g.fill();
            });
            if (head != null) {                  // playhead
                var hx = t2x(head);
                g.strokeStyle = '#fff8ec'; g.lineWidth = 2;
                g.beginPath(); g.moveTo(hx, 0); g.lineTo(hx, h); g.stroke();
            }
        }
        function loop() { raf = requestAnimationFrame(loop); draw(); }
        function px(e) {
            var r = canvas.getBoundingClientRect();
            var cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
            return cx / r.width * canvas.width;
        }
        canvas.addEventListener('pointerdown', function (e) {
            if (!ab) return;
            e.preventDefault();
            var x = px(e), xa = t2x(Math.min(a, b)), xb = t2x(Math.max(a, b));
            if (Math.abs(x - xa) < 14) drag = 0;
            else if (Math.abs(x - xb) < 14) drag = 1;
            else { a = x2t(x); b = a; drag = 1; }   // arrastre nuevo define A–B
        });
        canvas.addEventListener('pointermove', function (e) {
            if (drag < 0 || !ab) return;
            e.preventDefault();
            var t = Math.max(0, Math.min(ab.duration, x2t(px(e))));
            if (drag === 0) a = t; else b = t;
            if (onchange) onchange(Math.min(a, b), Math.max(a, b));
        });
        window.addEventListener('pointerup', function () { drag = -1; });
        loop();
        return {
            buf: function (n) { ab = n; peaks = n ? peaksOf(n) : null;
                                b = n ? n.duration : 0; head = null; draw(); },
            sel: function () { return [Math.min(a, b), Math.max(a, b)]; },
            setSel: function (na, nb) { a = na; b = nb; },
            pos: function (t) { head = t; },
            live: function (an2) { an = an2; },
            dur: function () { return ab ? ab.duration : 0; },
            onchange: function (f) { onchange = f; }
        };
    }
    return { mount: mount };
})();
