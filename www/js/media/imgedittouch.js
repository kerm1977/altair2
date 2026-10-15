// ============================================================================
// ARCHIVO: media/imgedittouch.js
// RESPONSABILIDAD: interacción táctil/ratón del editor de imágenes.
//   - Arrastrar capas (textos/emojis/fotos) sobre el canvas (hit-test por caja)
//   - Doble clic sobre una capa de texto → la carga en el panel para editarla
//   - Modo viñeta: tocar/arrastrar mueve el centro (enfocar un área)
//   - Modo recorte: recuadro con 8 puntos (esquinas + lados) + mover interior.
//     Los deltas se miden contra el CANVAS (estable), nunca contra el propio
//     div del recuadro — medir contra él causaba el «brinco» al arrastrar.
//   - applyCrop: hornea el área recortada como nueva imagen base
//   API: TribalImgEditTouch.bind(E) / .applyCrop(E) / .placeCropDiv(E) /
//        .setRatio(E, r)
// ============================================================================
window.TribalImgEditTouch = (function () {
    'use strict';

    function rect(E) { return E.cv.getBoundingClientRect(); }
    function toCv(E, e) {
        var r = rect(E);
        return { x: (e.clientX - r.left) * (E.cv.width / r.width),
                 y: (e.clientY - r.top) * (E.cv.height / r.height) };
    }
    function curTab(E) {
        var p = E.ov.querySelector('#ie-panel');
        return p ? p.dataset.tab : 'img';
    }
    function hit(E, pt) {  // capa bajo el punto (la última en el orden z gana)
        var all = E.st.ovs;
        for (var i = all.length - 1; i >= 0; i--) {
            var b = E.selBox(all[i]);
            if (pt.x >= b.x - 8 && pt.x <= b.x + b.w + 8 &&
                pt.y >= b.y - 8 && pt.y <= b.y + b.h + 8) return all[i];
        }
        return null;
    }
    function showSelRow(E) { if (E.paintSel) E.paintSel(); }

    // ---- recuadro de recorte ------------------------------------------------
    function placeCropDiv(E) {
        var d = E.ov.querySelector('#ie-crop');
        var b = E.cropBox;
        if (!b) { d.hidden = true; return; }
        var r = rect(E), st = E.ov.querySelector('#ie-stage').getBoundingClientRect();
        d.hidden = false;
        d.style.left = (r.left - st.left + b.x * r.width) + 'px';
        d.style.top = (r.top - st.top + b.y * r.height) + 'px';
        d.style.width = (b.w * r.width) + 'px';
        d.style.height = (b.h * r.height) + 'px';
    }
    function clampBox(b) {
        b.w = Math.max(.06, Math.min(1, b.w)); b.h = Math.max(.06, Math.min(1, b.h));
        b.x = Math.max(0, Math.min(1 - b.w, b.x)); b.y = Math.max(0, Math.min(1 - b.h, b.y));
    }
    // ajusta b para respetar E.cropRatio (w/h en px) anclando la esquina opuesta
    function ratioFix(E, b, o, hd) {
        var t = E.cropRatio * E.cv.height / E.cv.width; // w/h en unidades 0-1
        if (Math.abs(b.w - o.w) / o.w >= Math.abs(b.h - o.h) / o.h) b.h = b.w / t;
        else b.w = b.h * t;
        for (var k = 0; k < 2; k++) {
            if (hd.indexOf('w') >= 0) b.x = o.x + o.w - b.w;
            if (hd.indexOf('n') >= 0) b.y = o.y + o.h - b.h;
            clampBox(b);
            if (k === 0 && b.w / b.h > t) b.w = b.h * t;
            else if (k === 0 && b.w / b.h < t) b.h = b.w / t;
        }
    }
    // fija un aspecto de recorte (r = w/h en px, 0 = libre) y encuadra el máximo
    function setRatio(E, r) { E.cropRatio = r || null;
        if (!r) { placeCropDiv(E); return; }
        var t = r * E.cv.height / E.cv.width, w = 1, h = 1 / t;
        if (h > 1) { h = 1; w = t; }
        if (w < .06 || h < .06) return;
        E.cropBox = { x: (1 - w) / 2, y: (1 - h) / 2, w: w, h: h };
        placeCropDiv(E); }
    function wireCrop(E) {
        var d = E.ov.querySelector('#ie-crop');
        var drag = null;
        d.addEventListener('pointerdown', function (e) {
            if (!E.cropBox) return;
            var cr = rect(E);                  // referencia ESTABLE: el canvas
            var ch = e.target.closest('[data-ch]');
            drag = {
                h: ch ? ch.dataset.ch : 'move',
                x0: (e.clientX - cr.left) / cr.width,
                y0: (e.clientY - cr.top) / cr.height,
                b: { x: E.cropBox.x, y: E.cropBox.y, w: E.cropBox.w, h: E.cropBox.h }
            };
            d.setPointerCapture(e.pointerId);
            e.stopPropagation();
        });
        d.addEventListener('pointermove', function (e) {
            if (!drag || !E.cropBox) return;
            var cr = rect(E);                  // siempre contra el canvas fijo
            var dx = (e.clientX - cr.left) / cr.width - drag.x0;
            var dy = (e.clientY - cr.top) / cr.height - drag.y0;
            var b = E.cropBox, o = drag.b;
            if (drag.h === 'move') { b.x = o.x + dx; b.y = o.y + dy; }
            if (drag.h.indexOf('e') >= 0) b.w = o.w + dx;
            if (drag.h.indexOf('s') >= 0) b.h = o.h + dy;
            if (drag.h.indexOf('w') >= 0) { b.x = o.x + dx; b.w = o.w - dx; }
            if (drag.h.indexOf('n') >= 0) { b.y = o.y + dy; b.h = o.h - dy; }
            if (E.cropRatio && drag.h !== 'move') ratioFix(E, b, o, drag.h);
            else clampBox(b);
            placeCropDiv(E);
        });
        ['pointerup', 'pointercancel'].forEach(function (ev) { d.addEventListener(ev, function () { drag = null; }); }); }

    // ---- gestos sobre el canvas ---------------------------------------------
    function bind(E) {
        var cv = E.cv, drag = null;
        wireCrop(E);
        cv.addEventListener('pointerdown', function (e) {
            var pt = toCv(E, e), tab = curTab(E);
            if (tab === 'crop') {
                if (!E.cropBox) E.cropBox = { x: .15, y: .15, w: .7, h: .7 };
                placeCropDiv(E);
                return;
            }
            if (tab === 'vig') {
                drag = { t: 'vig' };
                E.st.vx = Math.max(0, Math.min(1, pt.x / E.cv.width));
                E.st.vy = Math.max(0, Math.min(1, pt.y / E.cv.height));
                E.render();
                cv.setPointerCapture(e.pointerId);
                return;
            }
            var o = hit(E, pt);
            E.sel = o;
            if (o) {
                drag = { t: 'ov', o: o,
                         dx: o.x * E.cv.width - pt.x,
                         dy: o.y * E.cv.height - pt.y };
                cv.setPointerCapture(e.pointerId);
            }
            E.render();
            showSelRow(E);
        });
        cv.addEventListener('pointermove', function (e) {
            if (!drag) return;
            var pt = toCv(E, e);
            if (drag.t === 'vig') {
                E.st.vx = Math.max(0, Math.min(1, pt.x / E.cv.width));
                E.st.vy = Math.max(0, Math.min(1, pt.y / E.cv.height));
            } else {
                drag.o.x = Math.max(0, Math.min(1, (pt.x + drag.dx) / E.cv.width));
                drag.o.y = Math.max(0, Math.min(1, (pt.y + drag.dy) / E.cv.height));
            }
            E.render();
        });
        ['pointerup', 'pointercancel'].forEach(function (ev) {
            cv.addEventListener(ev, function () { if (drag && drag.t === 'ov' && E.commit) E.commit(); drag = null; });
        });
        // doble clic sobre una capa → editarla (texto: carga str/color/fuente)
        cv.addEventListener('dblclick', function (e) {
            if (curTab(E) === 'crop') return;
            var o = hit(E, toCv(E, e));
            if (o && E.editLayer) E.editLayer(o);
        });
    }

    // aplica el recuadro: el área se hornea como nueva imagen base
    function applyCrop(E) {
        var b = E.cropBox;
        if (!b) return;
        var W = Math.round(b.w * E.cv.width), H = Math.round(b.h * E.cv.height);
        if (W < 8 || H < 8) return;
        var ovs = E.st.ovs, sel = E.sel;
        E.st.ovs = []; E.sel = null;
        E.render();
        var c2 = document.createElement('canvas');
        c2.width = W; c2.height = H;
        c2.getContext('2d').drawImage(E.cv,
            Math.round(b.x * E.cv.width), Math.round(b.y * E.cv.height),
            W, H, 0, 0, W, H);
        E.st.ovs = ovs;
        var ni = new Image();
        ni.onload = function () {
            E.img = ni;
            E.imgSrc = ni.src;               // la base horneada (persiste)
            E.st.rot = 0; E.st.zoom = 100; E.st.flipH = 0; E.st.flipV = 0;
            E.st.br = 100; E.st.co = 100; E.st.sa = 100;
            E.st.r = 100; E.st.g = 100; E.st.b = 100;
            E.st.sharp = 0; E.st.blur = 0; E.st.edgeBlur = 0; E.st.vig = 0;
            E.st.vx = .5; E.st.vy = .5;
            E.st.crop = null; E.cropBox = null; E.cropRatio = null; E.sel = sel;
            placeCropDiv(E);
            var on = E.ov.querySelector('.ie-tab.on');
            if (on && window.TribalImgEditUI) {
                var p = E.ov.querySelector('#ie-panel');
                p.dataset.tab = '';
                on.click();
            }
            if (E.commit) E.commit();
            E.render();
        };
        ni.src = c2.toDataURL('image/png');
    }

    return { bind: bind, applyCrop: applyCrop, placeCropDiv: placeCropDiv, setRatio: setRatio };
})();
