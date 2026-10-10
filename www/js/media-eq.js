// ============================================================================
// ARCHIVO: media-eq.js
// RESPONSABILIDAD: Ecualizador tribal (Web Audio API).
//   Cadena de 5 filtros biquad insertada entre el elemento <audio>/<video>
//   y la salida. Funciona igual para música y para el visor de video.
// ============================================================================
window.TribalEQ = (function () {
    'use strict';

    var FREQS = [60, 230, 910, 3600, 14000];
    var TYPES = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];

    var PRESETS = [
        { id: 'normal',  label: 'Normal',        gains: [0, 0, 0, 0, 0] },
        { id: 'acustico',label: 'Acústico',      gains: [4, 3, 1, 3, 4] },
        { id: 'rock',    label: 'Rock',          gains: [4, 2, -2, 3, 5] },
        { id: 'pop',     label: 'Pop',           gains: [-1, 2, 5, 3, -1] },
        { id: 'clasica', label: 'Clásica',       gains: [4, 1, -2, 2, 4] },
        { id: 'jazz',    label: 'Jazz',          gains: [3, 2, 0, 2, 4] },
        { id: 'electro', label: 'Electrónica',   gains: [6, 4, 0, -2, 3] },
        { id: 'graves',  label: 'Graves +',      gains: [8, 5, 0, -3, -5] },
        { id: 'vocal',   label: 'Voz / Podcast', gains: [-3, 0, 5, 4, 2] },
        { id: 'suave',   label: 'Suave / Chill', gains: [2, 1, -1, 2, 1] }
    ];

    var ctx = null;
    var graphs = [];            // [{ el, nodes }] — WeakMap no itera
    var presetId = 'normal';
    var supported = !!(window.AudioContext || window.webkitAudioContext);

    function context() {
        if (!supported) return null;
        if (!ctx) {
            var AC = window.AudioContext || window.webkitAudioContext;
            try { ctx = new AC(); } catch (e) { supported = false; return null; }
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    function graphOf(el) {
        for (var i = 0; i < graphs.length; i++) {
            if (graphs[i].el === el) return graphs[i];
        }
        var c = context();
        if (!c) return null;
        var src;
        try { src = c.createMediaElementSource(el); }
        catch (e) { return null; }          // ya existe una fuente para ese elemento
        var nodes = FREQS.map(function (f, i) {
            var b = c.createBiquadFilter();
            b.type = TYPES[i];
            b.frequency.value = f;
            b.gain.value = 0;
            return b;
        });
        var head = src;
        nodes.forEach(function (n) { head.connect(n); head = n; });
        head.connect(c.destination);
        var g = { el: el, nodes: nodes, tail: head, analyser: null };
        graphs.push(g);
        return g;
    }

    // AnalyserNode como "tap" en paralelo (para el visualizador del player).
    // Crea la cadena aunque el preset sea Normal — con ganancias 0 el audio
    // pasa transparente.
    function analyserFor(el) {
        var g = graphOf(el);
        if (!g) return null;
        if (!g.analyser) {
            var c = context();
            if (!c) return null;
            g.analyser = c.createAnalyser();
            g.analyser.fftSize = 1024;
            g.analyser.smoothingTimeConstant = 0.82;
            g.tail.connect(g.analyser);
        }
        return g.analyser;
    }

    function preset(id) {
        for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
        return PRESETS[0];
    }

    // Aplica el preset a un elemento (crea la cadena si hace falta).
    function apply(el, id) {
        var g = graphOf(el);
        if (!g) return false;
        var p = preset(id);
        g.nodes.forEach(function (n, i) { n.gain.value = p.gains[i]; });
        return true;
    }

    // Asegura que el elemento pasa por la cadena solo si hay EQ activo
    // (con 'Normal' no se crea el grafo: el audio fluye directo).
    function ensure(el) {
        if (presetId !== 'normal') apply(el, presetId);
    }

    return {
        PRESETS: PRESETS,
        isSupported: function () { return supported; },
        getPreset: function () { return presetId; },
        // Cambia el preset activo y lo aplica a los elementos dados.
        setPreset: function (id, els) {
            presetId = id;
            (els || []).forEach(function (el) { if (el) apply(el, id); });
            return preset(presetId);
        },
        ensure: ensure,
        apply: apply,
        analyserFor: analyserFor
    };
})();
