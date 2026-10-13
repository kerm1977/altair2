// === media/vnotesui.js — Template HTML del editor de notas ================
// Solo maquetado; la lógica vive en vnotesfx.js. Editor simple:
// agregar audio, cortar fragmento A–B, efectos de sonido, exportar MP3.
// API: TribalVNoteUI.html(item, deps) → string
// =========================================================================
window.TribalVNoteUI = (function () {
    'use strict';
    function esc(s) {
        var E = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
        return String(s || '').replace(/[&<>"]/g, function (c) { return E[c]; });
    }
    function html(item, deps) {
        var eqs = (window.TribalEQ.PRESETS || []).map(function (p) {
            return '<option value="' + p.id + '">' + p.label + '</option>'; }).join('');
        var fmts = window.TribalConvert.formats().map(function (f) {
            return '<option value="' + f.id + '"' +
                (f.id === 'mp3-192' ? ' selected' : '') + '>' + f.label +
                '</option>'; }).join('');
        return '<div class="vn-panel"><div class="lk-head">' +
            '<h3><i class="bi bi-mic"></i> ' + esc(item.name) + '</h3>' +
            '<button class="lk-x" id="vfx-x"><i class="bi bi-x-lg"></i></button></div>' +
            '<div class="lk-body"><div class="vfx-stage">' +
            '<canvas id="vfx-wave" class="vfx-wave" width="720" height="130"></canvas>' +
            '<div class="vfx-times"><span id="vfx-ta">A 0:00</span>' +
            '<span id="vfx-td" class="vfx-dur">0:00</span><span id="vfx-tb">B 0:00</span></div>' +
            '<div class="vfx-transport"><button id="vfx-pv" class="vfx-play">' +
            '<i class="bi bi-play-fill"></i></button>' +
            '<span class="vfx-hint">▶ suena entre A y B · arrastra la onda o las asas</span></div>' +
            '<div class="vfx-tabs">' +
            '<button class="on" data-sec="edit"><i class="bi bi-scissors"></i> Edición</button>' +
            '<button data-sec="fx"><i class="bi bi-magic"></i> Efectos</button>' +
            '<button data-sec="out"><i class="bi bi-download"></i> Exportar</button></div>' +
            '</div>' +
            // ----- sección: edición -----
            '<div class="vfx-secwrap on" data-sec="edit"><div class="vfx-tools">' +
            '<button id="vfx-cut"><i class="bi bi-scissors"></i><span>Cortar</span></button>' +
            '<button id="vfx-keep"><i class="bi bi-bounding-box"></i><span>Solo A–B</span></button>' +
            '<button id="vfx-copy"><i class="bi bi-clipboard"></i><span>Copiar</span></button>' +
            '<button id="vfx-paste"><i class="bi bi-box-arrow-in-down"></i><span>Pegar en B</span></button></div></div>' +
            // ----- sección: efectos (solo filtros EQ) -----
            '<div class="vfx-secwrap" data-sec="fx"><div class="vfx-tools">' +
            '<label><i class="bi bi-sliders"></i><select id="vfx-eq">' + eqs + '</select></label></div></div>' +
            // ----- sección: exportar -----
            '<div class="vfx-secwrap" data-sec="out"><div class="vfx-tools vfx-out">' +
            '<label><i class="bi bi-filetype-mp3"></i><select id="vfx-fmt">' + fmts + '</select></label>' +
            '<button id="vfx-cover"><i class="bi bi-image"></i><span>Portada</span></button>' +
            '<button id="vfx-go"><i class="bi bi-download"></i><span>Exportar MP3</span></button></div>' +
            '<div class="vfx-coverrow"><img id="vfx-coverimg" hidden alt="">' +
            '<span id="vfx-covername" class="vfx-hint"></span></div></div>' +
            '<div id="vfx-st" class="vn-state"></div></div></div>';
    }
    return { html: html };
})();
