// ============================================================================
// ARCHIVO: media/vfxtools.js
// RESPONSABILIDAD: overlays sobre el video.
//   - Sticker arrastrable con tamaño + ventana de tiempo (de/a)
//   - Texto sobre el video (diálogo, arrastre, tamaño, ventana)
//   - LUTs .cube: cargar, activar, borrar
//   - Visibilidad por tiempo en la vista previa (timeupdate)
// ============================================================================
window.Sono.register('vfxtools', function (S) {
    'use strict';
    var $ = S.$;
    var videoEl = S.videoEl, pMenu = S.pMenu;

    // --------------------------------------------------------- sticker ----
    var stickEl = $('vf-sticker'), stickImg = $('vf-sticker-img'),
        stickSize = $('vf-sticker-size'), stickOv = $('stick-overlay'),
        stickList = $('stick-list');

    function syncSticker() {
        var st = window.TribalVidFX.getSticker();
        $('vx-sticker-st').textContent = st ? 'activo' : '';
        stickEl.hidden = !st;
        if (st) {
            stickImg.style.left = (st.x * 100) + '%';
            stickImg.style.top = (st.y * 100) + '%';
            stickImg.style.width = (st.s * 100) + '%';
        }
    }
    function placeSticker(img, url) {
        window.TribalVidFX.setSticker({ img: img, x: 0.5, y: 0.5, s: 0.25, t0: 0, t1: 0 });
        stickImg.src = url;
        stickSize.value = 25;
        $('vf-sticker-t0').value = '';
        $('vf-sticker-t1').value = '';
        stickImg.style.visibility = 'visible';
        syncSticker();
    }
    $('vx-sticker').addEventListener('click', function () {
        pMenu.hidden = true;
        var imgs = S.items.filter(function (m) { return m.kind === 'image'; });
        if (!imgs.length) return S.showToast('No hay fotos en la tribu');
        stickList.innerHTML = imgs.map(function (m) {
            return '<div class="tribal-col-row">' +
                '<button class="tribal-col-check" data-stick="' + m.id + '">' +
                    '<i class="bi bi-image"></i><span>' + S.esc(m.name) + '</span></button>' +
                '</div>';
        }).join('');
        stickOv.hidden = false;
    });
    stickList.addEventListener('click', function (e) {
        var b = e.target.closest('[data-stick]');
        if (!b) return;
        var m = S.byId(b.dataset.stick);
        if (!m) return;
        stickOv.hidden = true;
        S.urlFor(m, function (u) {
            if (!u) return S.showToast('No se pudo cargar la foto');
            var im = new Image();
            im.onload = function () { placeSticker(im, u); };
            im.src = u;
        });
    });
    $('stick-cancel').addEventListener('click', function () { stickOv.hidden = true; });
    $('vf-sticker-x').addEventListener('click', function () {
        S.confirm('Quitar sticker', '¿Quitar el sticker del video?', 'Quitar', function () {
            window.TribalVidFX.setSticker(null);
            syncSticker();
        });
    });
    stickSize.addEventListener('input', function () {
        var st = window.TribalVidFX.getSticker();
        if (!st) return;
        st.s = stickSize.value / 100;
        stickImg.style.width = stickSize.value + '%';
    });
    // ventana de tiempo del sticker
    [$('vf-sticker-t0'), $('vf-sticker-t1')].forEach(function (inp, i) {
        inp.addEventListener('change', function () {
            var st = window.TribalVidFX.getSticker();
            if (!st) return;
            st[i === 0 ? 't0' : 't1'] = +inp.value || 0;
        });
    });
    // arrastrar el sticker sobre el video
    (function () {
        var drag = false;
        stickImg.addEventListener('pointerdown', function (e) {
            drag = true;
            stickImg.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        stickImg.addEventListener('pointermove', function (e) {
            var st = window.TribalVidFX.getSticker();
            if (!drag || !st) return;
            var r = stickEl.getBoundingClientRect();
            st.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
            st.y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
            stickImg.style.left = (st.x * 100) + '%';
            stickImg.style.top = (st.y * 100) + '%';
        });
        ['pointerup', 'pointercancel'].forEach(function (ev) {
            stickImg.addEventListener(ev, function () { drag = false; });
        });
    })();

    // ------------------------------------- texto sobre el video --------------
    var textOvEl = $('vf-text'), textSpan = $('vf-text-s'),
        textSize = $('vf-text-size'), textT0 = $('vf-text-t0'),
        textT1 = $('vf-text-t1'), textovOv = $('textov-overlay');

    function syncTextOv() {
        var t = window.TribalVidFX.getText();
        $('vx-text-st').textContent = t ? 'activo' : '';
        textOvEl.hidden = !t;
        if (t) {
            textSpan.textContent = t.str;
            textSpan.style.left = (t.x * 100) + '%';
            textSpan.style.top = (t.y * 100) + '%';
            textSpan.style.fontSize =
                Math.max(14, textOvEl.clientHeight * t.s) + 'px';
        }
    }
    $('vx-text').addEventListener('click', function () {
        pMenu.hidden = true;
        var cur = window.TribalVidFX.getText();
        $('textov-input').value = cur ? cur.str : '';
        textovOv.hidden = false;
    });
    $('textov-cancel').addEventListener('click', function () { textovOv.hidden = true; });
    $('textov-ok').addEventListener('click', function () {
        var s = $('textov-input').value.trim();
        textovOv.hidden = true;
        if (!s) { window.TribalVidFX.setText(null); syncTextOv(); return; }
        var t = window.TribalVidFX.getText() || { x: 0.5, y: 0.5, s: 0.08, t0: 0, t1: 0 };
        t.str = s;
        window.TribalVidFX.setText(t);
        textSize.value = Math.round(t.s * 100);
        textT0.value = t.t0 || '';
        textT1.value = t.t1 || '';
        syncTextOv();
    });
    $('vf-text-x').addEventListener('click', function () {
        S.confirm('Quitar texto', '¿Quitar el texto del video?', 'Quitar', function () {
            window.TribalVidFX.setText(null);
            syncTextOv();
        });
    });
    textSize.addEventListener('input', function () {
        var t = window.TribalVidFX.getText();
        if (!t) return;
        t.s = textSize.value / 100;
        syncTextOv();
    });
    [textT0, textT1].forEach(function (inp, i) {
        inp.addEventListener('change', function () {
            var t = window.TribalVidFX.getText();
            if (!t) return;
            t[i === 0 ? 't0' : 't1'] = +inp.value || 0;
        });
    });
    (function () {
        var drag = false;
        textSpan.addEventListener('pointerdown', function (e) {
            drag = true;
            textSpan.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        textSpan.addEventListener('pointermove', function (e) {
            var t = window.TribalVidFX.getText();
            if (!drag || !t) return;
            var r = textOvEl.getBoundingClientRect();
            t.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
            t.y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
            textSpan.style.left = (t.x * 100) + '%';
            textSpan.style.top = (t.y * 100) + '%';
        });
        ['pointerup', 'pointercancel'].forEach(function (ev) {
            textSpan.addEventListener(ev, function () { drag = false; });
        });
    })();

    // ventanas de sticker/texto en la vista previa
    videoEl.addEventListener('timeupdate', function () {
        var t = videoEl.currentTime;
        var st = window.TribalVidFX.getSticker();
        if (st) {
            stickImg.style.visibility =
                (t >= (st.t0 || 0) && (!st.t1 || t <= st.t1)) ? 'visible' : 'hidden';
        }
        var to = window.TribalVidFX.getText();
        if (to) {
            textSpan.style.visibility =
                (t >= (to.t0 || 0) && (!to.t1 || t <= to.t1)) ? 'visible' : 'hidden';
        }
    });

    syncSticker();
});
