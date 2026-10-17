// ============================================================================
// ARCHIVO: media/coverdev.js
// RESPONSABILIDAD: elegir una imagen/GIF del dispositivo como carátula.
//   Usa el selector nativo del sistema (galería en el móvil, explorador
//   en la PC) — accept image/* incluye GIF animado.
//   API: TribalCoverDev.pick(cb) → cb(file|null)
// ============================================================================
window.TribalCoverDev = (function () {
    'use strict';

    function pick(cb) {
        var inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        inp.style.display = 'none';
        document.body.appendChild(inp);
        inp.addEventListener('change', function () {
            var f = inp.files && inp.files[0];
            inp.remove();
            cb(f || null);
        });
        inp.click();
    }

    return { pick: pick };
})();
