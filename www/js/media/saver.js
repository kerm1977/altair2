// ============================================================================
// ARCHIVO: media/saver.js — ANTI-CRASH · captura y restauración de estado
// RESPONSABILIDAD:
//   - Captura contínua: vista (filtro/modo/orden/página/búsqueda/colapsos),
//     scroll, selección múltiple, reproductor (pista/posición/volumen/vinilo).
//     Se dispara en cada render/toggle/scroll/evento de audio; el flush a
//     disco lo hace TribalState (debounced + síncrono al salir).
//   - Restauración al arrancar: parchea S ANTES del primer render y, tras el
//     primer reload, reabre la herramienta que estaba encima, el reproductor
//     (a la posición exacta; si sonaba, sigue sonando), el scroll y la barra
//     de selección.
//   IMPORTANTE: cargar este script de ÚLTIMO entre los módulos media — su
//   init envuelve S.render/S.reload y S.ms* ya definidos.
// ============================================================================
window.Sono.register('saver', function (S) {
    'use strict';
    var TS = window.TribalState;
    if (!TS) return;
    var $ = S.$, audio = S.audio;

    // --------------------------------------------- RESTORE (pre-render) --
    var v = TS.get('view', null);
    if (v) {
        if (v.viewMode) S.viewMode = v.viewMode;
        if (v.filter) S.filter = v.filter;
        if (v.sortMode) S.sortMode = v.sortMode;
        if (v.listMode !== undefined) S.listMode = v.listMode;
        if (v.page !== undefined) S.page = v.page;
        if (v.activeCol !== undefined) S.activeCol = v.activeCol;
        if (v.query) { S.query = v.query; if (S.search) S.search.value = v.query; }
        if (v.secCollapsed) S.secCollapsed = v.secCollapsed;
        if (v.msSel && Object.keys(v.msSel).length) {
            S.msMode = true; S.msSel = v.msSel;
        }
    }

    // --------------------------------------------------------- CAPTURE --
    function capture() {
        TS.save('view', {
            viewMode: S.viewMode, filter: S.filter, sortMode: S.sortMode,
            listMode: S.listMode, page: S.page, activeCol: S.activeCol,
            query: S.query, secCollapsed: S.secCollapsed,
            msSel: (S.msMode && S.msSel) ? S.msSel : null,
            scroll: S.gridWrap ? S.gridWrap.scrollTop : 0
        });
    }
    var _render = S.render;
    S.render = function () { _render(); capture(); };
    if (S.gridWrap) S.gridWrap.addEventListener('scroll', capture);
    ['msStart', 'msToggle', 'msExit'].forEach(function (k) {
        var f = S[k];
        if (!f) return;
        S[k] = function () { f.apply(S, arguments); capture(); };
    });

    // ------------------------------------------------------ reproductor --
    var lastT = 0;
    function savePlayer(paused) {
        var id = audio.dataset.current;
        if (!id) { TS.del('player'); return; }
        TS.save('player', {
            id: id, t: audio.currentTime || 0, vol: audio.volume,
            paused: paused === undefined ? audio.paused : paused,
            vinyl: !!(window.TribalVinyl && window.TribalVinyl.isOpen &&
                      window.TribalVinyl.isOpen())
        });
    }
    audio.addEventListener('timeupdate', function () {
        var now = Date.now();
        if (now - lastT > 4000) { lastT = now; savePlayer(); }
    });
    audio.addEventListener('pause', function () { savePlayer(true); });
    audio.addEventListener('play', function () { savePlayer(false); });
    audio.addEventListener('volumechange', function () { savePlayer(); });
    $('player-close').addEventListener('click', function () { TS.del('player'); });
    var _openVinyl = S.openVinyl;
    if (_openVinyl) S.openVinyl = function (m) { _openVinyl(m); savePlayer(); };

    function restorePlayer() {
        var p = TS.get('player', null);
        if (!p || !p.id) return;
        var m = (S.items || []).filter(function (x) { return x.id === p.id; })[0];
        if (!m) return;
        S.activeItemId = m.id;
        S.queue = S.items.filter(function (x) { return x.kind === 'audio'; });
        S.queueIdx = S.queue.indexOf(m);
        S.urlFor(m, function (u) {
            if (!u || audio.dataset.current) return;
            audio.src = u;
            audio.dataset.current = m.id;
            audio.playbackRate = S.prefs.speed || 1;
            if (p.vol !== undefined) audio.volume = p.vol;
            if (window.TribalEQ) window.TribalEQ.ensure(audio);
            audio.addEventListener('loadedmetadata', function () {
                try { audio.currentTime = p.t || 0; } catch (e) {}
            });
            try { audio.load(); } catch (e) {}
            S.pTitle.textContent = (m.info && m.info.titulo) || m.name;
            S.updateCover(m);
            S.player.classList.remove('d-none');
            S.root.classList.add('has-player');
            S.pToggle.innerHTML = '<i class="bi bi-play-fill"></i>';
            if (p.vinyl && S.openVinyl) S.openVinyl(m);
            if (!p.paused) audio.play().catch(function () {
                S.pToggle.innerHTML = '<i class="bi bi-play-fill"></i>';
            });
        });
    }

    // -------------------------------------------- herramientas abiertas --
    function deps() { return S.extDeps ? S.extDeps() : {}; }
    TS.reg('fx',      function () { if (window.TribalFX) TribalFX.open(); });
    TS.reg('notepad', function () {
        if (window.TribalNotepad)
            TribalNotepad.open(deps(),
                localStorage.getItem('tribu_np_open_id_v1'));
    });
    TS.reg('doc', function (p) {
        var m = p && S.byId ? S.byId(p.id) : null;
        if (m && window.TribalReader) TribalReader.open(m, deps());
    });
    TS.reg('chat',   function () { if (window.TribalBtChat) TribalBtChat.open(deps()); });
    TS.reg('btmgr',  function () { if (window.TribalBtMgr) TribalBtMgr.open(deps()); });
    TS.reg('remote', function () { if (window.TribalRemote) TribalRemote.open(deps()); });
    TS.reg('wifi',   function () { if (window.TribalBtWifi) TribalBtWifi.open(deps()); });
    TS.reg('scan',   function () { if (window.TribalScan) TribalScan.open(deps()); });
    TS.reg('clean',  function () { if (window.TribalClean) TribalClean.open(deps()); });
    TS.reg('ftp',    function () { if (window.TribalFtp) TribalFtp.open(deps()); });
    TS.reg('zip',    function () { if (window.TribalZipUI) TribalZipUI.open(deps()); });
    TS.reg('links',  function () { if (window.TribalLinks) TribalLinks.open(deps()); });
    TS.reg('slide',  function () {
        if (window.TribalSlide && TribalSlide.openConfig)
            TribalSlide.openConfig(deps());
    });
    TS.reg('batch', function () { var b = $('vm-batch'); if (b) b.click(); });

    // ----------------------------- RESTORE tras el primer reload de datos --
    var restored = false;
    var _reload = S.reload;
    S.reload = function () {
        var p = _reload();
        if (!restored) {
            restored = true;
            p = p.then(function () {
                var vv = TS.get('view', null);
                if (vv) {
                    if (vv.scroll && S.gridWrap) S.gridWrap.scrollTop = vv.scroll;
                    if (vv.msSel && Object.keys(vv.msSel).length) {
                        $('media-msbar').hidden = false;
                        var n = Object.keys(S.msSel).length;
                        $('ms-count').textContent =
                            n + ' seleccionado' + (n === 1 ? '' : 's');
                    }
                }
                restorePlayer();
                TS.restoreTools();
            });
        }
        return p;
    };
});
