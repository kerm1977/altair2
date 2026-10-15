// ============================================================================
// ARCHIVO: media/swipenav.js  (<=200 líneas)
// RESPONSABILIDAD: gesto horizontal «pasar con el dedo» entre elementos
//   de un visor a pantalla completa (imágenes / videos del overlay).
//   - El dedo arrastra el contenido (translateX siguiendo el gesto).
//   - Al soltar: supera el umbral → step(±1) cambia al anterior/siguiente;
//     si no, el contenido regresa con resorte a su sitio.
//   - Solo toques de 1 dedo y gestos claramente horizontales; los botones
//     y controles nativos se ignoran via guard(e) opcional.
//   API: TribalSwipeNav.attach(overlayEl, targetEl, step, guard)
// ============================================================================
window.TribalSwipeNav = (function () {
    'use strict';
    var TH = 60;                      // umbral en px para cambiar de elemento

    function attach(ov, target, step, guard) {
        if (!ov || !target || ov._snBound) return;
        ov._snBound = true;
        var sx = 0, sy = 0, on = false, mov = false, dx = 0;

        function reset(animate) {
            if (animate) {
                target.style.transition = 'transform .25s ease';
                target.style.transform = '';
                setTimeout(function () { target.style.transition = ''; }, 280);
            } else {
                target.style.transition = '';
                target.style.transform = '';
            }
        }

        ov.addEventListener('touchstart', function (e) {
            if (e.touches.length !== 1) { on = false; return; }
            if (guard && !guard(e)) { on = false; return; }
            sx = e.touches[0].clientX;
            sy = e.touches[0].clientY;
            on = true; mov = false; dx = 0;
        }, { passive: true });

        ov.addEventListener('touchmove', function (e) {
            if (!on || e.touches.length !== 1) return;
            dx = e.touches[0].clientX - sx;
            var dy = e.touches[0].clientY - sy;
            if (!mov && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) {
                mov = true;
            }
            if (mov) {
                // el contenido sigue al dedo y se asoma ligeramente atenuado
                target.style.transition = 'none';
                target.style.transform = 'translateX(' + (dx * 0.92) + 'px)';
                target.style.opacity = String(1 - Math.min(Math.abs(dx) / 700, .35));
            }
        }, { passive: true });

        ov.addEventListener('touchend', function (e) {
            if (!on) return;
            on = false;
            if (!mov) return;
            mov = false;
            var ddx = e.changedTouches[0].clientX - sx;
            reset(true);
            target.style.opacity = '';
            if (Math.abs(ddx) > TH) {
                var dir = ddx < 0 ? 1 : -1;   // izquierda → siguiente
                setTimeout(function () { step(dir); }, 60);
            }
        }, { passive: true });

        ov.addEventListener('touchcancel', function () {
            on = false; mov = false;
            reset(false);
            target.style.opacity = '';
        }, { passive: true });
    }

    return { attach: attach };
})();
