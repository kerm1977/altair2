// === media/secorder.js — orden de las secciones de «Todo» ================
// Botón junto al trigger de vista: despliega un panel con los tipos
// (imágenes, música, videos, documentos, otros) y flechas ▲▼ para elegir
// qué sección se muestra primero. Persiste en localStorage
// (tribu_sec_order) y se aplica en render.js al agrupar la vista «Todo».
// =========================================================================
window.Sono.register('secorder', function (S) {
    'use strict';
    var $ = S.$;
    var KEY = 'tribu_sec_order';
    var DEF = ['image', 'audio', 'video', 'doc', 'other'];
    var META = {
        image: { i: 'bi-image', t: 'Imágenes' },
        audio: { i: 'bi-music-note-beamed', t: 'Música' },
        video: { i: 'bi-camera-video', t: 'Videos' },
        doc:   { i: 'bi-book', t: 'Libros y notas' },
        other: { i: 'bi-file-earmark', t: 'Otros' }
    };
    try {
        var p = JSON.parse(localStorage.getItem(KEY) || 'null');
        S.secOrder = (p && p.length === DEF.length &&
            DEF.every(function (g) { return p.indexOf(g) !== -1; }))
            ? p : DEF.slice();
    } catch (e) { S.secOrder = DEF.slice(); }

    // secciones colapsadas (toque en el título / long-press en el botón)
    try {
        S.secCollapsed =
            JSON.parse(localStorage.getItem('tribu_sec_collapsed') || '{}') || {};
    } catch (e0) { S.secCollapsed = {}; }
    function persistCol() {
        try {
            localStorage.setItem('tribu_sec_collapsed',
                JSON.stringify(S.secCollapsed));
        } catch (e3) {}
    }
    // long-press: colapsa TODO dejando solo títulos · otra vez = expandir todo
    function toggleAll() {
        var keys = ['image', 'audio', 'grab', 'video', 'doc', 'other'];
        var allOn = keys.every(function (g) { return S.secCollapsed[g]; });
        S.secCollapsed = {};
        if (!allOn) keys.forEach(function (g) { S.secCollapsed[g] = 1; });
        persistCol();
        if (navigator.vibrate) navigator.vibrate(15);
        S.render();
    }

    var btn = $('sec-order'), panel = null;
    if (!btn) return;

    // long-press (~0.55s) → colapsar/expandir todo; tap corto → panel
    var lpT = 0, lpFired = false;
    btn.addEventListener('pointerdown', function () {
        lpFired = false;
        lpT = setTimeout(function () { lpFired = true; toggleAll(); }, 550);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
        btn.addEventListener(ev, function () { clearTimeout(lpT); });
    });

    function fill() {
        panel.innerHTML = '<p class="sec-ttl">Orden de secciones</p>' +
            S.secOrder.map(function (g, i) {
                var m = META[g];
                return '<div class="sec-row" data-g="' + g + '">' +
                    '<i class="bi ' + m.i + '"></i><span>' + m.t + '</span>' +
                    '<button data-mv="-1" ' + (i === 0 ? 'disabled' : '') +
                        ' aria-label="Subir"><i class="bi bi-chevron-up"></i></button>' +
                    '<button data-mv="1" ' +
                        (i === S.secOrder.length - 1 ? 'disabled' : '') +
                        ' aria-label="Bajar"><i class="bi bi-chevron-down"></i></button>' +
                    '</div>';
            }).join('');
    }
    function onMove(e) {
        var b = e.target.closest('[data-mv]');
        if (!b || b.disabled) return;
        var row = e.target.closest('.sec-row');
        var i = S.secOrder.indexOf(row.dataset.g), j = i + (+b.dataset.mv);
        if (i < 0 || j < 0 || j >= S.secOrder.length) return;
        S.secOrder.splice(i, 1);
        S.secOrder.splice(j, 0, row.dataset.g);
        try { localStorage.setItem(KEY, JSON.stringify(S.secOrder)); }
        catch (e2) {}
        fill();
        S.render();
    }
    function hide() { if (panel) panel.hidden = true; }
    btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (lpFired) { lpFired = false; return; }   // fue long-press, no tap
        if (!panel) {
            panel = document.createElement('div');
            panel.className = 'sec-panel';
            panel.hidden = true;
            document.body.appendChild(panel);
            panel.addEventListener('click', onMove);
            document.addEventListener('click', function (ev) {
                if (panel.hidden) return;
                if (panel.contains(ev.target) || btn.contains(ev.target)) return;
                hide();
            });
            fill();
        }
        if (!panel.hidden) return hide();
        var r = btn.getBoundingClientRect();
        panel.style.top = (r.bottom + 6) + 'px';
        panel.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
        panel.hidden = false;
    });
});
