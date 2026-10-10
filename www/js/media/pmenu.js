// ============================================================================
// ARCHIVO: media/pmenu.js
// RESPONSABILIDAD: menú ⋮ del reproductor / visor de video.
//   - Favorito + colección del item que suena
//   - Ecualizador (media-eq.js), velocidad, repetir/aleatorio
//   - Repetir fragmento A-B + navegación (retroceder 10s / reiniciar)
//   - Badges del player
//   Exporta en S: openPlayerMenu, syncBadges, syncAB, syncModes
// ============================================================================
window.Sono.register('pmenu', function (S) {
    'use strict';
    var $ = S.$;
    var audio = S.audio, videoEl = S.videoEl, videoOv = S.videoOv, pMenu = S.pMenu;

    // abrir el menú pausa el video; cerrarlo lo reanuda y vuelve al visor
    function showPMenu() {
        if (!videoOv.hidden && !videoEl.paused) {
            videoEl.pause();
            S._pmResume = true;
        } else {
            S._pmResume = false;
        }
    }
    function closePMenu() {
        var resume = S._pmResume && !videoOv.hidden;
        pMenu.hidden = true;
        S._pmResume = false;
        if (resume) videoEl.play().catch(function () {});
    }
    S.closePMenu = closePMenu;

    function openPlayerMenu(anchor) {
        if (!pMenu.hidden) { closePMenu(); return; }   // toggle
        showPMenu();
        pMenu.hidden = false;
        // las secciones de imagen/herramientas solo salen si hay video abierto
        pMenu.classList.toggle('for-video', !videoOv.hidden);
        S.favLabel($('pm-fav'), S.byId(S.activeItemId));
        var rw = S.root.getBoundingClientRect();
        var ar = anchor.getBoundingClientRect();
        var top = ar.top - rw.top - pMenu.offsetHeight - 8;
        if (top < 10) top = Math.min(ar.bottom - rw.top + 6, rw.height - pMenu.offsetHeight - 10);
        pMenu.style.top = Math.max(10, top) + 'px';
        // centrado horizontal total — nada de menú echado a un lado
        var left = (rw.width - pMenu.offsetWidth) / 2;
        pMenu.style.left = Math.max(8, left) + 'px';
    }
    S.openPlayerMenu = openPlayerMenu;

    $('player-more').addEventListener('click', function (e) {
        e.stopPropagation();
        openPlayerMenu(e.currentTarget);
    });
    $('video-more').addEventListener('click', function (e) {
        e.stopPropagation();
        openPlayerMenu(e.currentTarget);
    });
    if (!window.__sonoExtrasBound) {
        window.__sonoExtrasBound = true;
        document.addEventListener('click', function (e) {
            var m = document.getElementById('player-menu');
            if (m && !m.hidden && !m.contains(e.target)) closePMenu();
        });
    }
    // X propia del menú: cierra solo el menú → vuelve al video sonando
    $('pm-close').addEventListener('click', function (e) {
        e.stopPropagation();
        closePMenu();
    });

    S.syncBadges = function () {
        var out = '';
        if (S.prefs.speed !== 1) out += '<span class="tribal-badge-mini">' + S.prefs.speed + '×</span>';
        if (S.loopA != null && S.loopB != null) out += '<span class="tribal-badge-mini">A–B</span>';
        else if (S.loopA != null) out += '<span class="tribal-badge-mini">A–</span>';
        S.pBadges.innerHTML = out;
    };

    // ⋮ del player / visor de video → favorito y colección del item activo
    var pmFav = $('pm-fav');
    pmFav.addEventListener('click', function () {
        if (!S.activeItemId) return;
        window.MediaStore.toggleFavorite(S.activeItemId).then(function (m) {
            S.favLabel(pmFav, m);
            S.showToast(m.fav ? 'Guardado en Favoritos' : 'Quitado de Favoritos');
            S.reload();
        });
    });
    $('pm-col').addEventListener('click', function () {
        if (!S.activeItemId) return;
        pMenu.hidden = true;
        S._pmResume = false;   // el diálogo de colección queda encima del video
        S.openColAssign(S.activeItemId);
    });

    // ecualizador
    var eqList = $('eq-list');
    if (!window.TribalEQ.isSupported()) {
        eqList.innerHTML = '<p class="tribal-ab-status">Ecualizador no disponible en este dispositivo</p>';
    } else {
        window.TribalEQ.PRESETS.forEach(function (p) {
            var b = document.createElement('button');
            b.textContent = p.label;
            if (p.id === S.prefs.eq) b.classList.add('active');
            b.addEventListener('click', function () {
                S.prefs.eq = p.id;
                S.savePrefs();
                window.TribalEQ.setPreset(p.id, [audio, videoEl]);
                eqList.querySelectorAll('button').forEach(function (x) {
                    x.classList.toggle('active', x === b);
                });
                S.showToast('Ecualizador: ' + p.label);
            });
            eqList.appendChild(b);
        });
        audio.addEventListener('play', function () { window.TribalEQ.ensure(audio); });
        videoEl.addEventListener('play', function () { window.TribalEQ.ensure(videoEl); });
    }

    // velocidad
    var spGrid = $('speed-grid');
    S.SPEEDS.forEach(function (v) {
        var b = document.createElement('button');
        b.textContent = v + '×';
        if (v === S.prefs.speed) b.classList.add('active');
        b.addEventListener('click', function () {
            S.prefs.speed = v;
            S.savePrefs();
            S.activeEl().playbackRate = v;
            spGrid.querySelectorAll('button').forEach(function (x) {
                x.classList.toggle('active', x === b);
            });
            S.syncBadges();
            S.showToast('Velocidad ' + v + '×');
        });
        spGrid.appendChild(b);
    });

    // repetir / aleatorio
    var btnRepeat = $('pm-repeat'), btnShuffle = $('pm-shuffle');
    function syncModes() {
        btnRepeat.querySelector('b').textContent = S.REPEAT_LABEL[S.prefs.repeat];
        btnRepeat.querySelector('i').className =
            'bi ' + (S.prefs.repeat === 'one' ? 'bi-repeat-1' : 'bi-repeat');
        btnShuffle.querySelector('b').textContent = S.prefs.shuffle ? 'activado' : 'desactivado';
    }
    S.syncModes = syncModes;
    btnRepeat.addEventListener('click', function () {
        S.prefs.repeat = S.prefs.repeat === 'off' ? 'all' : (S.prefs.repeat === 'all' ? 'one' : 'off');
        S.savePrefs();
        syncModes();
    });
    btnShuffle.addEventListener('click', function () {
        S.prefs.shuffle = !S.prefs.shuffle;
        S.savePrefs();
        syncModes();
    });

    // repetir fragmento A-B
    var btnA = $('pm-ab-a'), btnB = $('pm-ab-b'), abStatus = $('pm-ab-status');
    S.syncAB = function () {
        btnA.classList.toggle('set', S.loopA != null);
        btnB.classList.toggle('set', S.loopB != null);
        abStatus.textContent = S.loopA == null ? 'Sin fragmento'
            : 'A: ' + S.fmtTime(S.loopA) + (S.loopB != null ? '  →  B: ' + S.fmtTime(S.loopB) : '  →  marca el punto B');
        S.syncBadges();
    };
    btnA.addEventListener('click', function () { S.loopA = S.activeEl().currentTime; S.syncAB(); });
    btnB.addEventListener('click', function () {
        var t = S.activeEl().currentTime;
        if (S.loopA == null) S.loopA = 0;
        if (t <= S.loopA + 0.2) t = S.loopA + 1;
        S.loopB = t;
        S.activeEl().currentTime = S.loopA;
        S.syncAB();
    });
    $('pm-ab-clear').addEventListener('click', function () {
        S.loopA = S.loopB = null;
        S.syncAB();
    });

    // navegar
    $('pm-back10').addEventListener('click', function () {
        var el = S.activeEl();
        el.currentTime = Math.max(0, el.currentTime - 10);
    });
    $('pm-restart').addEventListener('click', function () {
        S.activeEl().currentTime = 0;
    });

    syncModes();
    S.syncAB();
});
