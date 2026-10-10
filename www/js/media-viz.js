// ============================================================================
// ARCHIVO: media-viz.js
// RESPONSABILIDAD: Visualizador del reproductor — una línea/montaña naranja
//   que se mueve con el ritmo (AnalyserNode → canvas). Cuando no suena,
//   queda como línea casi plana con leve "respiración".
//   API: TribalViz.bind(canvasEl, audioEl) · TribalViz.attach(analyser)
// ============================================================================
window.TribalViz = (function () {
    'use strict';

    var canvas = null, ctx = null, el = null, analyser = null;
    var buf = null, running = false, phase = 0;

    function bind(canvasEl, audioEl) {
        canvas = canvasEl;
        el = audioEl;
        ctx = canvas.getContext('2d');
        if (!running) { running = true; requestAnimationFrame(loop); }
        // conecta el tap del EQ cuando el audio empieza a sonar
        el.addEventListener('play', function () {
            if (window.TribalEQ && TribalEQ.analyserFor) {
                attach(TribalEQ.analyserFor(el));
            }
        });
    }

    function attach(an) {
        analyser = an;
        if (an && (!buf || buf.length !== an.frequencyBinCount)) {
            buf = new Uint8Array(an.frequencyBinCount);
        }
    }

    function loop() {
        requestAnimationFrame(loop);
        if (!canvas || !canvas.isConnected) return;
        var w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || !h) return;
        if (canvas.width !== w * 2) { canvas.width = w * 2; canvas.height = h * 2; }
        ctx.setTransform(2, 0, 0, 2, 0, 0);
        ctx.clearRect(0, 0, w, h);

        var PTS = 48, pts = [];
        var playing = el && !el.paused && !el.ended;
        if (playing && analyser && buf) {
            analyser.getByteFrequencyData(buf);
            for (var i = 0; i < PTS; i++) {
                var bi = Math.floor(Math.pow(i / PTS, 1.6) * buf.length * 0.72);
                pts.push(buf[bi] / 255);
            }
        } else {
            phase += 0.02; // respiración suave en reposo
            for (var j = 0; j < PTS; j++) {
                pts.push(0.06 + 0.04 * Math.sin(phase + j * 0.35));
            }
        }

        // cordillera naranja: línea superior + relleno degradado
        var base = h - 2;
        ctx.beginPath();
        ctx.moveTo(0, base);
        for (var k = 0; k < PTS; k++) {
            var x = k / (PTS - 1) * w;
            var y = base - 2 - pts[k] * (h - 6);
            if (k === 0) ctx.lineTo(x, y);
            else {
                var px = (k - 1) / (PTS - 1) * w;
                var py = base - 2 - pts[k - 1] * (h - 6);
                ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
            }
        }
        var grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#f0b429');
        grad.addColorStop(0.5, '#e2602e');
        grad.addColorStop(1, 'rgba(226, 96, 46, 0.15)');
        ctx.strokeStyle = '#f0b429';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        ctx.lineTo(w, base);
        ctx.lineTo(0, base);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
    }

    return { bind: bind, attach: attach };
})();
