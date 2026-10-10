// ============================================================================
// ARCHIVO: media/rangeguard.js
// RESPONSABILIDAD: sliders seguros en TRIBALs (todos los editores del player).
//   - Un <input type="range"> YA NO salta de valor al tocar la pista:
//     solo responde cuando el gesto empieza sobre el puntito y se arrastra
//   - La pista queda "no táctil" → se puede hacer scroll vertical encima
//     de una barra sin que el valor cambie por accidente
//   - Delegación global en document: aplica a imagen, video, EQ, dimmer,
//     texto, slideshow y cualquier slider presente o futuro
// ============================================================================
(function () {
    'use strict';

    var THUMB = 26;   // semiancho de tolerancia alrededor del puntito (px)

    // ¿el toque cayó FUERA del puntito? → true = hay que bloquear
    function offThumb(inp, clientX) {
        var r = inp.getBoundingClientRect();
        if (!r.width) return true;
        var min = +inp.min || 0;
        var max = +inp.max || 100;
        var frac = (max - min) ? (+inp.value - min) / (max - min) : 0;
        frac = Math.max(0, Math.min(1, frac));
        var w = Math.min(THUMB, r.width * 0.25);   // thumb real ≈ 16-22px
        var cx = r.left + w / 2 + frac * (r.width - w);
        return Math.abs(clientX - cx) > w;
    }

    function guard(e) {
        var inp = e.target;
        if (!inp || inp.type !== 'range' || inp.disabled) return;
        var pt = (e.touches && e.touches[0]) || e;
        if (offThumb(inp, pt.clientX)) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }

    // pointerdown cubre mouse+táctil en el WebView; mousedown refuerza mouse.
    // OJO: NO se bloquea touchstart — hacerlo mataría el scroll que empieza
    // encima de la pista (justo lo que queremos permitir).
    document.addEventListener('pointerdown', guard, true);
    document.addEventListener('mousedown', guard, true);
})();
