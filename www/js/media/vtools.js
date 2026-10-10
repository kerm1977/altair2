// ============================================================================
// ARCHIVO: media/vtools.js
// RESPONSABILIDAD: herramientas de imagen del video (⋮ del visor).
//   - Sliders: brillo/contraste/saturación/RGB/nitidez/zoom (media-videofx.js)
//   - Transformar: voltear H/V, rotar ±90°, fundido en bordes
//   - Buffer manual para videos pesados
// ============================================================================
window.Sono.register('vtools', function (S) {
    'use strict';
    var $ = S.$;
    var videoEl = S.videoEl, pMenu = S.pMenu;

    // --------------------------------------------- imagen + tools de video
    window.TribalVidFX.bind(videoEl, S.root);
    var VFX_SLIDERS = [
        { k: 'br',    label: 'Brillo',     min: 30,  max: 200 },
        { k: 'co',    label: 'Contraste',  min: 30,  max: 200 },
        { k: 'sa',    label: 'Saturación', min: 0,   max: 300 },
        { k: 'r',     label: 'Rojo',       min: 0,   max: 200 },
        { k: 'g',     label: 'Verde',      min: 0,   max: 200 },
        { k: 'b',     label: 'Azul',       min: 0,   max: 200 },
        { k: 'sharp', label: 'Nitidez',    min: 0,   max: 100 },
        { k: 'zoom',  label: 'Zoom',       min: 100, max: 300 }
    ];
    var vfxBox = $('vfx-box'), vfxInputs = {};
    VFX_SLIDERS.forEach(function (s) {
        var row = document.createElement('label');
        row.className = 'vfx-row';
        row.innerHTML = '<span>' + s.label + '</span>' +
            '<input type="range" min="' + s.min + '" max="' + s.max +
                '" value="' + window.TribalVidFX.get(s.k) + '">' +
            '<b>' + window.TribalVidFX.get(s.k) + '%</b>';
        var rng = row.querySelector('input'), val = row.querySelector('b');
        rng.addEventListener('input', function () {
            window.TribalVidFX.set(s.k, +rng.value);
            val.textContent = rng.value + '%';
        });
        vfxInputs[s.k] = { rng: rng, val: val };
        vfxBox.appendChild(row);
    });
    var vfxReset = document.createElement('button');
    vfxReset.className = 'vfx-reset';
    vfxReset.innerHTML = '<i class="bi bi-arrow-counterclockwise"></i> Restablecer imagen';
    vfxReset.addEventListener('click', function () {
        window.TribalVidFX.reset();
        VFX_SLIDERS.forEach(function (s) {
            var d = vfxInputs[s.k], v = window.TribalVidFX.get(s.k);
            d.rng.value = v;
            d.val.textContent = v + '%';
        });
    });
    vfxBox.appendChild(vfxReset);

    // ----------------------------------------- transformaciones del editor
    function syncTransformBtns() {
        $('vx-fliph').classList.toggle('set', !!window.TribalVidFX.get('flipH'));
        $('vx-flipv').classList.toggle('set', !!window.TribalVidFX.get('flipV'));
        var rot = window.TribalVidFX.get('rot');
        $('vx-rotl').classList.toggle('set', rot === 270);
        $('vx-rotr').classList.toggle('set', rot === 90 || rot === 180);
    }
    $('vx-fliph').addEventListener('click', function () {
        window.TribalVidFX.set('flipH', window.TribalVidFX.get('flipH') ? 0 : 1);
        syncTransformBtns();
    });
    $('vx-flipv').addEventListener('click', function () {
        window.TribalVidFX.set('flipV', window.TribalVidFX.get('flipV') ? 0 : 1);
        syncTransformBtns();
    });
    $('vx-rotl').addEventListener('click', function () {
        window.TribalVidFX.set('rot', (window.TribalVidFX.get('rot') + 270) % 360);
        syncTransformBtns();
    });
    $('vx-rotr').addEventListener('click', function () {
        window.TribalVidFX.set('rot', (window.TribalVidFX.get('rot') + 90) % 360);
        syncTransformBtns();
    });

    // fundido en los bordes de los fragmentos
    var edgeFadeChk = $('vx-edgefade');
    edgeFadeChk.checked = !!window.TribalVidFX.get('edgeFade');
    edgeFadeChk.addEventListener('change', function () {
        window.TribalVidFX.set('edgeFade', edgeFadeChk.checked ? 1 : 0);
    });

    // ----------------------------------------- buffer manual -------------
    // Meta de segundos a cargar ANTES de soltar el play. Mientras carga se ve
    // el badge sobre el video con "Xs / Ys" y barra, y en el ⋮ una barra con
    // el total cacheado + segundos en memoria.
    var bufBadge = $('vf-buffer-badge'), bufTxt = $('vf-buffer-txt'),
        bufFill = $('vf-buffer-fill'),
        menuFill = $('vx-buffill'), menuInfo = $('vx-bufinfo');

    function bufferedAhead() {
        var end = 0;
        for (var i = 0; i < videoEl.buffered.length; i++) {
            end = Math.max(end, videoEl.buffered.end(i));
        }
        return Math.max(0, end - videoEl.currentTime);
    }
    function paintBuf() {
        var d = videoEl.duration || 0, end = videoEl.currentTime + bufferedAhead();
        if (menuFill) menuFill.style.width = (d ? Math.min(100, end / d * 100) : 0) + '%';
        if (menuInfo) menuInfo.textContent = bufferedAhead().toFixed(1) + ' s en memoria';
    }
    function checkBuf() {
        if (S.bufGoal <= 0) return;
        var ahead = bufferedAhead();
        bufTxt.textContent = 'Cargando ' + ahead.toFixed(0) + 's / ' + S.bufGoal + 's';
        bufFill.style.width = Math.min(100, ahead / S.bufGoal * 100) + '%';
        if (ahead >= S.bufGoal) {
            S.pausedByBuf = false;
            bufBadge.hidden = true;
            if (S.wantPlay) {
                S.wantPlay = false;
                videoEl.play().catch(function () {});
            }
        }
    }
    $('vx-buffer').addEventListener('change', function () {
        S.bufGoal = +this.value;
        if (!S.bufGoal) {
            var wasBuf = S.pausedByBuf;
            S.pausedByBuf = false;
            S.wantPlay = false;
            bufBadge.hidden = true;
            if (wasBuf) videoEl.play().catch(function () {});
            return S.showToast('Buffer automático');
        }
        S.showToast('Buffer manual: ' + S.bufGoal + ' s adelante');
        // si aún no está lleno, precarga ahora y suelta el play al llegar
        if (bufferedAhead() < S.bufGoal) {
            S.wantPlay = true;
            S.pausedByBuf = true;
            videoEl.pause();
            bufBadge.hidden = false;
            checkBuf();
        }
    });
    // precarga al dar play: si la meta no está llena, pausa y espera
    videoEl.addEventListener('play', function () {
        if (S.bufGoal > 0 && bufferedAhead() < S.bufGoal) {
            S.pausedByBuf = true;
            S.wantPlay = true;
            videoEl.pause();
            bufBadge.hidden = false;
            checkBuf();
        }
    });
    videoEl.addEventListener('timeupdate', function () {
        paintBuf();
        if (S.bufGoal <= 0 || videoEl.paused || videoEl.ended) return;
        if (bufferedAhead() < S.bufGoal) {
            S.pausedByBuf = true;
            S.wantPlay = true;
            videoEl.pause();
            bufBadge.hidden = false;
            checkBuf();
        }
    });
    videoEl.addEventListener('progress', function () { checkBuf(); paintBuf(); });
    videoEl.addEventListener('durationchange', paintBuf);
    videoEl.addEventListener('seeked', paintBuf);
});
