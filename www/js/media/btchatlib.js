// ============================================================================
// ARCHIVO: media/btchatlib.js
// RESPONSABILIDAD: enviar medios de la biblioteca (MediaStore) por el chat BT.
//   ⋮ → "Enviar de mi biblioteca" abre un picker con canciones, imágenes,
//   videos y libros; al tocar uno se lee vía getURL → blob → dataURL y sale
//   por TribalBtChat.sendMedia. Límite 8 MB (RFCOMM) — los grandes se
//   muestran deshabilitados.
// API: window.TribalBtLib.{open, close}
// ============================================================================
window.TribalBtLib = (function () {
    'use strict';
    var MAX = 8 * 1024 * 1024;
    var ov = null;
    var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

    function $(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
    function kOf(meta) {
        var k = meta.kind || '';
        return k === 'audio' ? 'aud' : k === 'video' ? 'vid'
             : k === 'image' ? 'img' : 'doc'; }
    function fmt(sz) {
        return sz > 1048576 ? (sz / 1048576).toFixed(1) + ' MB'
             : Math.max(1, Math.round(sz / 1024)) + ' KB'; }
    function icon(k) {
        return k === 'audio' ? 'bi-music-note-beamed'
             : k === 'video' ? 'bi-camera-video'
             : k === 'doc' ? 'bi-book'
             : k === 'image' ? 'bi-image' : 'bi-file-earmark'; }

    function build() {
        if (ov) return;
        ov = document.createElement('div');
        ov.className = 'tribal-overlay btclib-ov';
        ov.innerHTML = '<div class="btclib"><div class="btclib-head">' +
            '<b>Enviar a la tribu</b><small>toca una canción o medio</small>' +
            '<button id="btclib-x" class="btchat-btn"><i class="bi bi-x-lg"></i></button></div>' +
            '<div id="btclib-list" class="btclib-list"></div></div>';
        document.body.appendChild(ov);
        $('btclib-x').addEventListener('click', close);
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    }

    function close() { if (ov) ov.hidden = true; }

    // llena la lista: audios primero (el pedido era pasar canciones)
    function fill() {
        var el = $('btclib-list');
        el.innerHTML = '<p class="btc-empty">Leyendo la biblioteca…</p>';
        window.MediaStore.list().then(function (metas) {
            var items = (metas || []).filter(function (m) {
                return m.kind === 'audio' || m.kind === 'image'
                    || m.kind === 'video' || m.kind === 'doc';
            }).sort(function (a, b) {
                return (a.kind === 'audio' ? 0 : 1) - (b.kind === 'audio' ? 0 : 1); });
            if (!items.length) {
                el.innerHTML = '<p class="btc-empty">La biblioteca está vacía — sube medios primero</p>';
                return; }
            el.innerHTML = items.map(function (m) {
                var big = (m.size || 0) > MAX;
                return '<div class="btc-dev btclib-item' + (big ? ' big' : '') +
                    '" data-id="' + esc(m.id) + '">' +
                    '<i class="bi ' + icon(m.kind) + '"></i>' +
                    '<span>' + esc(m.name) + '<small>' + fmt(m.size || 0) +
                    (big ? ' · muy grande para BT' : '') + '</small></span></div>';
            }).join('');
        });
    }

    // toca un ítem → getURL → blob → dataURL → sendMedia del chat
    document.addEventListener('click', function (e) {
        var it = e.target.closest && e.target.closest('.btclib-item');
        if (!it || it.classList.contains('big')) return;
        var id = it.dataset.id;
        it.classList.add('busy');
        window.MediaStore.list().then(function (metas) {
            var meta = metas.filter(function (m) { return m.id === id; })[0];
            if (!meta) throw new Error('no está');
            return window.MediaStore.getURL(meta).then(function (u) {
                if (!u) throw new Error('sin datos');
                return fetch(u).then(function (r) {
                    if (!r.ok) throw new Error('http ' + r.status);
                    return r.blob();
                }).then(function (blob) { return { meta: meta, blob: blob }; });
            });
        }).then(function (x) {
            var fr = new FileReader();
            fr.onload = function () {
                window.TribalBtChat.sendMedia(kOf(x.meta), x.meta.name,
                    x.meta.mime || x.blob.type || '', fr.result);
                it.classList.remove('busy');
                close();
            };
            fr.readAsDataURL(x.blob);
        }).catch(function () { it.classList.remove('busy'); });
    });

    function open() { build(); ov.hidden = false; fill(); }
    return { open: open, close: close };
})();
