// ============================================================================
// ARCHIVO: media/cutter.js
// RESPONSABILIDAD: cortador del visor de video.
//   - Barra arrastrable con knob (seek), marcas A/B y lista de fragmentos
//   - Los fragmentos guardados alimentan "Cortar fragmento A–B" (export.js)
// ============================================================================
window.Sono.register('cutter', function (S) {
    'use strict';
    var $ = S.$;
    var videoEl = S.videoEl, pMenu = S.pMenu;
    var cutter = $('vf-cutter'), cutTrack = $('vf-cut-track'),
        cutFill = $('vf-cut-fill'), cutKnob = $('vf-cut-knob'),
        cutMa = $('vf-cut-ma'), cutMb = $('vf-cut-mb'),
        clipList = $('vf-cut-clips');

    $('vx-cutter').addEventListener('click', function () {
        pMenu.hidden = true;
        cutter.hidden = !cutter.hidden;
        $('vx-cutter-st').textContent = cutter.hidden ? '' : 'abierto';
    });

    function paintCutMarks() {
        var d = videoEl.duration || 0;
        cutMa.hidden = S.loopA == null || !d;
        cutMb.hidden = S.loopB == null || !d;
        if (d) {
            if (S.loopA != null) cutMa.style.left = (S.loopA / d * 100) + '%';
            if (S.loopB != null) cutMb.style.left = (S.loopB / d * 100) + '%';
        }
    }
    $('vf-cut-a').addEventListener('click', function () {
        S.loopA = videoEl.currentTime;
        S.syncAB(); paintCutMarks();
    });
    $('vf-cut-b').addEventListener('click', function () {
        var t = videoEl.currentTime;
        if (S.loopA == null) S.loopA = 0;
        if (t <= S.loopA + 0.2) t = S.loopA + 1;
        S.loopB = t;
        videoEl.currentTime = S.loopA;
        S.syncAB(); paintCutMarks();
    });
    $('vf-cut-add').addEventListener('click', function () {
        if (S.loopA == null || S.loopB == null || S.loopB <= S.loopA) {
            return S.showToast('Marca A y B primero');
        }
        S.clips.push({ a: S.loopA, b: S.loopB });
        renderClips();
        S.showToast('Fragmento guardado en la lista');
    });
    function renderClips() {
        clipList.innerHTML = S.clips.map(function (c, i) {
            return '<span class="vf-clip" data-clip="' + i + '">' +
                '<i class="bi bi-film"></i> ' + S.fmtTime(c.a) + '–' + S.fmtTime(c.b) +
                '<b data-clipdel="' + i + '">✕</b></span>';
        }).join('');
        $('vx-cutter-st').textContent = cutter.hidden ? '' : 'abierto';
    }
    clipList.addEventListener('click', function (e) {
        var del = e.target.closest('[data-clipdel]');
        if (del) {
            S.confirm('Eliminar fragmento',
                '¿Quitar este corte de la lista? El video original no se toca.',
                'Quitar', function () {
                S.clips.splice(+del.dataset.clipdel, 1);
                renderClips();
            });
            return;
        }
        var chip = e.target.closest('[data-clip]');
        if (!chip) return;
        var c = S.clips[+chip.dataset.clip];
        if (!c) return;
        S.loopA = c.a; S.loopB = c.b;
        videoEl.currentTime = c.a;
        S.syncAB(); paintCutMarks();
        S.showToast('Fragmento seleccionado: ' + S.fmtTime(c.a) + '–' + S.fmtTime(c.b));
    });

    // knob arrastrable → seek
    (function () {
        var drag = false;
        function seek(e) {
            var r = cutTrack.getBoundingClientRect();
            var p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
            if (videoEl.duration) videoEl.currentTime = p * videoEl.duration;
        }
        cutTrack.addEventListener('pointerdown', function (e) {
            drag = true;
            cutTrack.setPointerCapture(e.pointerId);
            seek(e);
        });
        cutTrack.addEventListener('pointermove', function (e) { if (drag) seek(e); });
        ['pointerup', 'pointercancel'].forEach(function (ev) {
            cutTrack.addEventListener(ev, function () { drag = false; });
        });
    })();

    // progreso del cutter
    videoEl.addEventListener('timeupdate', function () {
        var d = videoEl.duration || 0;
        if (!d) return;
        var p = videoEl.currentTime / d * 100;
        cutFill.style.width = p + '%';
        cutKnob.style.left = p + '%';
    });
});
