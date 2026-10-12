// ============================================================================
// ARCHIVO: media/readerswipe.js
// RESPONSABILIDAD: pasar hojas del lector como un libro real (estilo Calibre).
//   - HOJA ORGÁNICA: al arrastrar, la página se DOBLA sobre el lomo siguiendo
//     el dedo — giro + curvatura (rotateZ) + oscurecer al levantarse +
//     sombra proyectada sobre la página que se revela difuminada
//   - Al soltar: supera el umbral → la hoja termina de girar sola;
//     si no, rebota con resorte y se asienta de vuelta
//   - Botones Anterior/Siguiente y flechas disparan la misma hoja automática
//   - EPUB (iframe) usa la animación flip de clase (fallback)
//   API: TribalReaderSwipe.{ bind(ui,step) · bindDoc(doc,ui) · flip(pg,dir) }
// ============================================================================
window.TribalReaderSwipe = (function () {
    'use strict';
    var TH = 55;                       // umbral de cambio de hoja (px)

    function isCtl(t) {
        return !!(t && t.closest && t.closest(
            'button,input,select,textarea,a,audio,video,' +
            '.tr-selpop,.tr-look,.tr-music,' +
            '.tribal-reader-bar,.tribal-reader-nav,.tr-chrome-fab'));
    }
    function copyCanvas(src, dst) {    // cloneNode no copia píxeles de canvas
        var a = src.querySelectorAll('canvas'), b = dst.querySelectorAll('canvas');
        for (var i = 0; i < a.length && i < b.length; i++) {
            try { b[i].getContext('2d').drawImage(a[i], 0, 0); } catch (e) {}
        }
    }

    // la hoja: frente = página actual · dorso = papel · debajo = página
    // difuminada + sombra que la hoja proyecta al levantarse
    function makeLeaf(pg, dir) {
        var under = pg.cloneNode(true);
        under.removeAttribute('id');
        under.className = 'tribal-reader-page tr-under';
        copyCanvas(pg, under);
        var shade = document.createElement('div');
        shade.className = 'tr-under-shade ' + (dir > 0 ? 'r' : 'l');
        under.appendChild(shade);
        var leaf = document.createElement('div');
        leaf.className = 'tr-leaf';
        var front = pg.cloneNode(true);
        front.removeAttribute('id');
        front.className = 'tribal-reader-page tr-leaf-face';
        copyCanvas(pg, front);
        var back = document.createElement('div');
        back.className = 'tr-leaf-face tr-leaf-back';
        leaf.appendChild(front); leaf.appendChild(back);
        var w = pg.parentNode;
        [under, leaf].forEach(function (el) {
            el.style.left = pg.offsetLeft + 'px';
            el.style.top = pg.offsetTop + 'px';
            el.style.width = pg.offsetWidth + 'px';
            el.style.height = pg.offsetHeight + 'px';
            w.appendChild(el);
        });
        pg.style.visibility = 'hidden';
        return { leaf: leaf, under: under, shade: shade, pg: pg, dir: dir };
    }
    function killLeaf(L) {
        if (!L || !L.leaf) return;
        L.leaf.remove(); L.under.remove(); L.pg.style.visibility = '';
    }
    // p 0..1 = progreso del giro → posa la hoja con física orgánica:
    // rotateY sobre el lomo + rotateZ (el borde libre se arquea como papel)
    // + se oscurece al levantarse + sombra proyectada en la página de abajo
    function poseLeaf(L, p) {
        p = Math.max(0, Math.min(1, p));
        var a = L.dir > 0 ? -p * 172 : -180 + p * 180,
            bend = Math.sin(p * Math.PI) * 4.5;      // curva máx. a mitad
        L.leaf.style.transform = 'rotateY(' + a + 'deg) rotateZ(' +
            (L.dir > 0 ? 1 : -1) * bend + 'deg)';
        L.leaf.style.filter = 'brightness(' + (1 - p * 0.22) + ')';
        if (L.shade) L.shade.style.opacity = String(p * 0.85);
    }
    // completar (turn) o regresar la hoja con resorte de papel
    function settleLeaf(L, done, turn) {
        L.leaf.style.transition =
            'transform .4s cubic-bezier(.28,1.35,.45,1), filter .4s ease';
        poseLeaf(L, turn ? 1 : 0);
        if (L.shade) L.shade.style.opacity = '0';
        setTimeout(function () { killLeaf(L); if (done) done(); }, 410);
    }

    // fallback simple para EPUB/iframe (no se puede clonar el contenido)
    function dragFx(pg, dx) {
        if (!pg) return;
        pg.style.transition = 'none';
        pg.style.transform = 'translateX(' + (dx * 0.85) + 'px) ' +
            'rotateY(' + (-dx / 14) + 'deg)';
        pg.style.opacity = String(1 - Math.min(Math.abs(dx) / 600, 0.35));
    }
    function dragReset(pg) {
        if (!pg) return;
        pg.style.transition = 'transform .22s ease, opacity .22s ease';
        pg.style.transform = ''; pg.style.opacity = '';
        setTimeout(function () { if (pg) pg.style.transition = ''; }, 250);
    }

    function attach(target, step) {
        if (!target || target._trSwipe) return;
        target._trSwipe = true;
        var sx = 0, sy = 0, on = false, pg = null, L = null;
        function page() {
            return (target.ownerDocument || document)
                .querySelector('.tribal-reader-page');
        }
        target.addEventListener('touchstart', function (e) {
            if (e.touches.length !== 1 || isCtl(e.target)) { on = false; return; }
            sx = e.touches[0].clientX; sy = e.touches[0].clientY;
            pg = page(); on = true; L = null;
        }, { passive: true });
        target.addEventListener('touchmove', function (e) {
            if (!on || e.touches.length !== 1) return;
            var dx = e.touches[0].clientX - sx,
                dy = e.touches[0].clientY - sy;
            if (Math.abs(dx) <= 10 || Math.abs(dx) <= Math.abs(dy) * 1.4) return;
            if (L === null) {
                if (!pg) { on = false; return; }
                // la hoja nace en el primer tirón horizontal firme
                L = pg.querySelector('iframe') ? 'fx'
                                             : makeLeaf(pg, dx < 0 ? 1 : -1);
            }
            if (L === 'fx') dragFx(pg, dx);
            else if (L.leaf) {
                L.leaf.style.transition = 'none';
                poseLeaf(L, Math.abs(dx) / (pg.offsetWidth * 0.9));
            }
        }, { passive: true });
        target.addEventListener('touchend', function (e) {
            if (!on) return;
            on = false;
            var dx = e.changedTouches[0].clientX - sx,
                dy = e.changedTouches[0].clientY - sy,
                turn = Math.abs(dx) > TH && Math.abs(dx) > Math.abs(dy) * 1.4;
            if (L && L.leaf) {
                // solo gira si el dedo terminó en el sentido de la hoja
                turn = turn && ((dx < 0 ? 1 : -1) === L.dir);
                settleLeaf(L, turn ? function () { step(L.dir); } : null, turn);
            } else {
                if (L === 'fx') dragReset(pg);
                if (turn) step(dx < 0 ? 1 : -1);
            }
            L = null;
        }, { passive: true });
        target.addEventListener('touchcancel', function () {
            if (on) { on = false;
                if (L && L.leaf) settleLeaf(L, null, false);
                else if (L === 'fx') dragReset(pg);
                L = null; }
        }, { passive: true });
    }

    // flip(pg, dir): hoja automática para botones/flechas — dir ±1.
    // En TXT/PDF dobla la hoja real; en EPUB (iframe) animación de clase.
    function flip(pg, dir) {
        if (!pg) return;
        pg.style.transition = '';
        pg.style.transform = ''; pg.style.opacity = '';
        if (!dir || pg.querySelector('iframe')) {
            pg.classList.remove('flip-next', 'flip-prev');
            if (!dir) return;
            void pg.offsetWidth;                     // reflow → reinicio
            pg.classList.add('flip-' + (dir > 0 ? 'next' : 'prev'));
            return;
        }
        var L = makeLeaf(pg, dir);
        poseLeaf(L, 0);
        void L.leaf.offsetWidth;
        L.leaf.style.transition =
            'transform .55s cubic-bezier(.3,.85,.35,1), filter .55s ease';
        poseLeaf(L, 1);
        setTimeout(function () { killLeaf(L); }, 570);
    }

    // bind(ui, step): el overlay completo del lector — sirve también con
    // las barras ocultas (modo limpio), porque vive en ui.el
    function bind(ui, step) { attach(ui.el, step); }

    // bindDoc(doc, ui): el documento DENTRO del iframe del EPUB — sus
    // toques no suben al overlay, así que se engancha por cada página
    function bindDoc(doc, ui) {
        attach(doc, function (d) { if (ui.navStep) ui.navStep(d); });
    }

    return { bind: bind, bindDoc: bindDoc, attach: attach, flip: flip };
})();
