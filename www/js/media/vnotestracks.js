// === media/vnotestracks.js — Carriles de pista extra del editor ==========
// Cada pista es un carril con su onda posicionada en la línea de tiempo:
// arrastrar el cuerpo la desplaza, arrastrar un borde la recorta, con
// mute, candado, volumen y quitar. API:
//   tr = TribalVTracks.mount(container, { tl(), onchange })
//   tr.add(buf, name) · tr.list() · tr.draw() · tr.clear()
// =========================================================================
window.TribalVTracks = (function () {
    'use strict';
    var TERRA = '#e2602e', TEAL = '#2a9d8f', GOLD = '#f0b429';

    function mount(box, opts) {
        var tracks = [];
        function tl() { return Math.max(0.1, opts.tl()); }
        function lane(t) {
            var row = document.createElement('div');
            row.className = 'vfx-lane';
            var c = document.createElement('canvas');
            c.width = 720; c.height = 56; c.className = 'vfx-lanewave';
            var bar = document.createElement('div');
            bar.className = 'vfx-lanebar';
            bar.innerHTML =
                '<span class="vfx-lname" title="' + t.name + '">' + t.name + '</span>' +
                '<button class="vfx-lmute" title="Mute"><i class="bi bi-volume-up-fill"></i></button>' +
                '<button class="vfx-llock" title="Bloquear"><i class="bi bi-unlock"></i></button>' +
                '<input class="vfx-lvol" type="range" min="0" max="100" value="' +
                    Math.round(t.vol * 100) + '" title="Volumen">' +
                '<button class="vfx-ldel" title="Quitar"><i class="bi bi-x-lg"></i></button>';
            row.appendChild(c); row.appendChild(bar);
            bar.querySelector('.vfx-lmute').addEventListener('click', function () {
                t.muted = !t.muted;
                this.innerHTML = '<i class="bi bi-volume-' +
                    (t.muted ? 'mute' : 'up') + '-fill"></i>';
                row.classList.toggle('muted', t.muted); opts.onchange();
            });
            bar.querySelector('.vfx-llock').addEventListener('click', function () {
                t.locked = !t.locked;
                this.innerHTML = '<i class="bi bi-' +
                    (t.locked ? 'lock-fill' : 'unlock') + '"></i>';
                row.classList.toggle('locked', t.locked);
            });
            bar.querySelector('.vfx-lvol').addEventListener('input', function () {
                t.vol = this.value / 100; opts.onchange();
            });
            bar.querySelector('.vfx-ldel').addEventListener('click', function () {
                tracks.splice(tracks.indexOf(t), 1);
                row.parentNode.removeChild(row); opts.onchange();
            });
            // arrastre: cuerpo → offset · bordes → recorte a/b
            var drag = -1;
            function px(e) {
                var r = c.getBoundingClientRect();
                return (e.clientX - r.left) / r.width * tl();
            }
            function span() {           // [inicio,fin] del clip en el timeline
                var b = t.b > 0 ? t.b : t.buf.duration;
                return [t.off, t.off + (b - t.a)];
            }
            c.addEventListener('pointerdown', function (e) {
                if (t.locked) return;
                e.preventDefault(); c.setPointerCapture(e.pointerId);
                var x = px(e), s = span(), w = tl();
                if (Math.abs(x - s[0]) < w * .03) drag = 0;
                else if (Math.abs(x - s[1]) < w * .03) drag = 1;
                else drag = 2;
            });
            c.addEventListener('pointermove', function (e) {
                if (drag < 0 || t.locked) return;
                e.preventDefault();
                var x = Math.max(0, px(e)), s = span(), d = s[1] - s[0];
                if (drag === 2) t.off = Math.max(0, Math.min(x - d / 2, tl() - d));
                else if (drag === 0) {
                    t.a = Math.max(0, Math.min(t.a + (x - s[0]), t.buf.duration));
                    t.off = Math.max(0, x);
                } else t.b = Math.min(t.buf.duration,
                                      Math.max(t.a + .1, t.a + (x - s[0])));
                drawLane(t, c); opts.onchange();
            });
            c.addEventListener('pointerup', function () { drag = -1; });
            return { row: row, canvas: c };
        }
        function drawLane(t, c) {
            var g = c.getContext('2d'), w = c.width, h = c.height;
            g.clearRect(0, 0, w, h);
            var d = t.buf.getChannelData(0), s = span();
            var x0 = s[0] / tl() * w, x1 = s[1] / tl() * w;
            var a = t.a, b = t.b > 0 ? t.b : t.buf.duration;
            g.fillStyle = t.muted ? 'rgba(179,147,114,.35)' : TEAL;
            for (var x = x0; x < x1; x++) {
                var si = (a + (x - x0) / Math.max(1, x1 - x0) * (b - a)) * t.buf.sampleRate;
                var bh = Math.abs(d[Math.min(d.length - 1, si | 0)]) * h;
                g.fillRect(x, (h - bh) / 2, 1, Math.max(1, bh));
            }
            [x0, x1].forEach(function (mx) {      // bordes = asas de recorte
                g.fillStyle = GOLD;
                g.fillRect(mx - 2, 0, 4, h);
            });
            g.strokeStyle = t.locked ? TERRA : 'rgba(240,180,41,.4)';
            g.strokeRect(x0 + .5, .5, Math.max(2, x1 - x0) - 1, h - 1);
        }
        function draw() { tracks.forEach(function (t) { drawLane(t, t._c); }); }
        return {
            add: function (buf, name, preset) {
                var t = { buf: buf, name: name, off: 0, vol: .25, a: 0, b: 0,
                          muted: false, locked: false };
                if (preset) Object.keys(preset).forEach(function (k) { t[k] = preset[k]; });
                var l = lane(t); t._c = l.canvas;
                box.appendChild(l.row); drawLane(t, l.canvas);
                opts.onchange();
                return t;
            },
            list: function () { return tracks; },
            draw: draw,
            clear: function () {
                tracks = []; box.querySelectorAll('.vfx-lane').forEach(function (r) {
                    r.parentNode.removeChild(r); });
            },
            restore: function (arr) {           // [{buf,name,off,vol,a,b,muted,locked}]
                var self = this;
                (arr || []).forEach(function (p) { self.add(p.buf, p.name, p); });
            }
        };
    }
    return { mount: mount };
})();
