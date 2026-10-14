// ============================================================================
// ARCHIVO: media/vnotesviz.js
// RESPONSABILIDAD: animación de grabación de Notas de audio.
//   - Dos anillos tribales girando en sentidos opuestos (estilo vinilo),
//     su radio pulsa con el nivel real de la voz.
//   - Franja inferior: ecualizador de barras espejo que responde a la
//     amplitud del micrófono — se "ve" cuando alguien habla.
//   API: TribalViz.mic(canvas, mediaStream) → { stop() }
// ============================================================================
window.TribalViz = (function () {
    'use strict';

    function mic(canvas, stream) {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        var ctx = new Ctx();
        var src = ctx.createMediaStreamSource(stream);
        var an = ctx.createAnalyser();
        an.fftSize = 512;
        an.smoothingTimeConstant = 0.82;
        src.connect(an);
        var data = new Uint8Array(an.fftSize);
        var g = canvas.getContext('2d');
        var raf = null, ang = 0, paused = false;

        function drawPaused(w, h) {
            var cx = w / 2, cy = h / 2;
            var barW = Math.round(Math.min(w, h) * 0.11);
            var barH = Math.round(Math.min(w, h) * 0.44);
            var gap = Math.round(barW * 0.85);
            g.save();
            g.fillStyle = '#f0b429';
            g.shadowColor = 'rgba(226, 96, 46, 0.55)';
            g.shadowBlur = 16;
            g.fillRect(Math.round(cx - gap / 2 - barW), Math.round(cy - barH / 2), barW, barH);
            g.fillRect(Math.round(cx + gap / 2), Math.round(cy - barH / 2), barW, barH);
            g.restore();
        }

        function draw() {
            raf = requestAnimationFrame(draw);
            var w = canvas.width, h = canvas.height;
            g.clearRect(0, 0, w, h);
            if (paused) {
                drawPaused(w, h);
                return;
            }
            an.getByteTimeDomainData(data);

            // nivel RMS 0..1 — conduce el pulso de los anillos
            var sum = 0, i, v;
            for (i = 0; i < data.length; i++) {
                v = (data[i] - 128) / 128;
                sum += v * v;
            }
            var lvl = Math.min(1, Math.sqrt(sum / data.length) * 4);
            ang += 0.012 + lvl * 0.05;

            // ---------- anillos giratorios ----------
            var cx = w / 2, cy = h * 0.42, R = Math.min(w, h) * 0.24;
            g.save();
            g.translate(cx, cy);
            g.rotate(ang);
            g.strokeStyle = '#f0b429';
            g.lineWidth = 3;
            g.setLineDash([14, 9]);
            g.beginPath();
            g.arc(0, 0, R * (1 + lvl * 0.25), 0, Math.PI * 2);
            g.stroke();
            g.rotate(-ang * 2.4);
            g.strokeStyle = '#e2602e';
            g.lineWidth = 2.5;
            g.setLineDash([6, 12]);
            g.beginPath();
            g.arc(0, 0, R * 0.72 * (1 + lvl * 0.35), 0, Math.PI * 2);
            g.stroke();
            g.setLineDash([]);
            // núcleo que respira con la voz
            g.fillStyle = 'rgba(240,180,41,' + (0.25 + lvl * 0.5) + ')';
            g.beginPath();
            g.arc(0, 0, R * 0.3 * (1 + lvl * 0.6), 0, Math.PI * 2);
            g.fill();
            g.restore();

            // ---------- ecualizador espejo inferior ----------
            var bars = 48, bw = w / bars, midY = h - 6;
            g.fillStyle = '#f0b429';
            for (i = 0; i < bars; i++) {
                var s = data[(i * (data.length / bars)) | 0];
                var bh = Math.abs(s - 128) / 128 * (h * 0.22) + 2;
                g.globalAlpha = 0.35 + bh / (h * 0.24);
                g.fillRect(i * bw + 1, midY - bh, bw - 2, bh);
            }
            g.globalAlpha = 1;
        }
        draw();
        return {
            setPaused: function (p) {
                paused = !!p;
            },
            stop: function () {
                if (raf) cancelAnimationFrame(raf);
                try { src.disconnect(); ctx.close(); } catch (e) {}
                g.clearRect(0, 0, canvas.width, canvas.height);
            }
        };
    }
    return { mic: mic };
})();
