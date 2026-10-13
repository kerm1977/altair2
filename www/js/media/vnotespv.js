// === media/vnotespv.js — motor de previa A–B del mezclador ================
// Todos los canales suenan a la vez dentro de la ventana A–B: C1 (voz) +
// C2–C8 (pistas armadas). Un solo AudioContext compartido (D().actx()).
// API: TribalVPV.toggle(env) · TribalVPV.stop()
//   env = { sel:[a,b], ab:AudioBuffer, tracks:[], wv, btn, D() }
// =========================================================================
window.TribalVPV = (function () {
    'use strict';
    var pv = null, raf = null;
    function stop() {
        if (raf) cancelAnimationFrame(raf); raf = null;
        if (pv) {
            (pv.all || []).forEach(function (s) {
                try { s.onended = null; s.stop(); } catch (e) {} });
            try { pv.bus.disconnect(); } catch (e) {}
            var env = pv.env;
            if (env.wv) { env.wv.live(null); env.wv.pos(null); }
            env.btn.innerHTML = '<i class="bi bi-play-fill"></i>';
            pv = null;
        }
    }
    function toggle(env) {
        if (pv) { stop(); return; }
        var a = env.sel[0], b = Math.max(env.sel[1], a + .05);
        var ctx = env.D().actx(),
            src = ctx.createBufferSource(),
            an = ctx.createAnalyser(), bus = ctx.createGain();
        src.buffer = env.ab; an.fftSize = 1024;
        if (env.fx && env.D().chain) env.D().chain(ctx, src, bus, env.fx, b - a);
        else src.connect(bus);
        bus.connect(an); an.connect(ctx.destination);
        var all = [src];
        (env.tracks || []).forEach(function (t) {
            var s = env.D().armTrack(ctx, bus, t, a, b);
            if (s) all.push(s); });
        src.start(0, a, b - a);
        pv = { env: env, all: all, bus: bus, ctx: ctx, t0: ctx.currentTime };
        env.wv.live(an);
        env.btn.innerHTML = '<i class="bi bi-stop-fill"></i>';
        (function loop() {
            if (!pv) return;
            env.wv.pos(a + (pv.ctx.currentTime - pv.t0));
            raf = requestAnimationFrame(loop);
        })();
        src.onended = stop;
    }
    return { toggle: toggle, stop: stop };
})();
