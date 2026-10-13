// === media/vnotesplay.js — Player inline de las notas =====================
// Reproduce la nota DENTRO del overlay: fila se expande con ecualizador
// vivo (analyser real), barra de progreso con seek y stop — sin salir al
// reproductor de música. API: TribalVNotePlay.toggle(meta, row, deps)
// =========================================================================
window.TribalVNotePlay = (function () {
    'use strict';
    var FREQS = [60, 230, 910, 3600, 14000],
        TYPES = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];
    var cur = null;                 // { el, ctx, src, bqs, vg, an, ui, row, btn, raf }

    // cambia filtro/volumen EN VIVO mientras suena (desde la fila)
    function setFx(eq, vol) {
        if (!cur) return;
        var p = (window.TribalEQ.PRESETS || []).filter(function (x) {
            return x.id === eq; })[0];
        if (p) cur.bqs.forEach(function (b, i) { b.gain.value = p.gains[i]; });
        if (vol != null) cur.vg.gain.value = vol;
    }

    function ft(s) {
        s = Math.floor(Math.max(0, s || 0));
        return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    }
    function kill() {
        if (!cur) return;
        cancelAnimationFrame(cur.raf);
        try { cur.el.pause(); cur.src.disconnect(); cur.ctx.close(); } catch (e) {}
        if (cur.ui.parentNode) cur.ui.parentNode.removeChild(cur.ui);
        if (cur.btn) cur.btn.querySelector('i').className = 'bi bi-play-circle';
        cur = null;
    }
    function draw() {
        var c = cur;
        c.raf = requestAnimationFrame(draw);
        var an = c.an, g = c.g, w = c.cv.width, h = c.cv.height;
        var fd = c.fd; an.getByteFrequencyData(fd);
        g.clearRect(0, 0, w, h);
        var bars = 24, bw = w / bars;
        for (var i = 0; i < bars; i++) {
            var v = fd[(i * fd.length / bars * .7) | 0] / 255;
            var bh = Math.max(2, v * h);
            g.fillStyle = 'rgba(240,180,41,' + (.4 + v * .6) + ')';
            g.fillRect(i * bw + 1, h - bh, bw - 2, bh);
        }
        var dur = isFinite(c.el.duration) && c.el.duration > 0
            ? c.el.duration : (c.meta.info && c.meta.info.dur) || 0;
        c.fill.style.width = dur ? (c.el.currentTime / dur * 100) + '%' : '0%';
        c.t.textContent = ft(c.el.currentTime) + (dur ? ' / ' + ft(dur) : '');
    }
    function toggle(m, row, deps) {
        if (cur && cur.row === row) { kill(); return; }
        var btn = row.querySelector('[data-play]');
        kill();
        deps.urlFor(m, function (u) {
            if (!u) return deps.toast('No se pudo leer el audio');
            var el = new Audio(u);
            var Ctx = window.AudioContext || window.webkitAudioContext;
            var ctx = new Ctx(), src = ctx.createMediaElementSource(el),
                an = ctx.createAnalyser();
            // cadena: src → EQ (filtro de la nota) → volumen → analyser
            var eqId = (m.info && m.info.veq) || 'normal',
                pv = (window.TribalEQ.PRESETS || []).filter(function (x) {
                    return x.id === eqId; })[0];
            var bqs = FREQS.map(function (f, i) {
                var b = ctx.createBiquadFilter();
                b.type = TYPES[i]; b.frequency.value = f;
                b.gain.value = pv ? pv.gains[i] : 0;
                return b;
            });
            var vg = ctx.createGain();
            vg.gain.value = m.info && m.info.vvol != null ? +m.info.vvol : 1;
            var head = src;
            bqs.forEach(function (b) { head.connect(b); head = b; });
            head.connect(vg); vg.connect(an);
            an.fftSize = 256;
            an.connect(ctx.destination);
            var ui = document.createElement('div');
            ui.className = 'vn-mini';
            ui.innerHTML =
                '<button class="vn-mini-b"><i class="bi bi-stop-fill"></i></button>' +
                '<canvas class="vn-mini-eq" width="180" height="30"></canvas>' +
                '<div class="vn-mini-prog"><div class="vn-mini-fill"></div></div>' +
                '<span class="vn-mini-t">0:00</span>';
            row.appendChild(ui);
            var cv = ui.querySelector('canvas');
            cur = { el: el, ctx: ctx, src: src, bqs: bqs, vg: vg, an: an,
                    ui: ui, row: row, btn: btn, meta: m,
                    g: cv.getContext('2d'), cv: cv,
                    fd: new Uint8Array(an.frequencyBinCount),
                    fill: ui.querySelector('.vn-mini-fill'),
                    t: ui.querySelector('.vn-mini-t'), raf: 0 };
            ui.querySelector('.vn-mini-b').addEventListener('click', kill);
            ui.querySelector('.vn-mini-prog').addEventListener('click', function (e) {
                var d = isFinite(el.duration) && el.duration > 0
                    ? el.duration : (m.info && m.info.dur) || 0;
                if (!d) return;
                var r = this.getBoundingClientRect();
                el.currentTime = (e.clientX - r.left) / r.width * d;
            });
            el.addEventListener('ended', kill);
            el.play().then(function () {
                if (cur && cur.btn)
                    cur.btn.querySelector('i').className = 'bi bi-stop-circle';
            }).catch(function () { kill(); deps.toast('No se pudo reproducir'); });
            draw();
        });
    }
    return { toggle: toggle, stop: kill, setFx: setFx };
})();
