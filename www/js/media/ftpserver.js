// === media/ftpserver.js (<=200): Servidor de archivos LAN (FTP tribal) ===
// Panel ⋮ «Servidor de archivos»: inicia/detiene el mini servidor HTTP
// nativo (TribalFtpPlugin, puerto 8765), muestra el enlace compartible,
// y auto-arranca al abrir la app salvo que el usuario lo apague.
window.TribalFtp = (function () {
    'use strict';
    var AUTO_KEY = 'tribu_ftp_auto';
    var ov = null, deps = {}, lastUrl = '';
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function toast(m) { if (deps && deps.toast) deps.toast(m); }
    function plug() {
        var C = window.Capacitor;
        return (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.TribalFtp) || null;
    }
    function isAuto() { return localStorage.getItem(AUTO_KEY) !== '0'; }

    // catálogo: {n: nombre, s: tamaño, k: kind, p: 'builtin/…' | 'tribu_media/…'}
    function catalog() {
        var MS = window.MediaStore;
        if (!MS || !MS.list) return Promise.resolve('[]');
        return MS.list().then(function (items) {
            var arr = items.filter(function (m) { return m && (m.path || m.builtin); })
                .map(function (m) { return { n: m.name, s: m.size || 0, k: m.kind || 'other', p: m.builtin || m.path }; });
            return JSON.stringify(arr);
        }).catch(function () { return '[]'; });
    }
    function pushCat() {
        var P = plug(); if (!P) return Promise.resolve();
        return catalog().then(function (j) { return P.setCatalog({ json: j }); }).catch(function () {});
    }

    function paint(r) {
        if (!ov) return;
        var on = !!(r && r.running);
        if (r && r.url) lastUrl = r.url;
        var st = ov.querySelector('#ftp-state'), url = ov.querySelector('#ftp-url'),
            pw = ov.querySelector('#ftp-power'), cnt = ov.querySelector('#ftp-count');
        if (st) st.innerHTML = on
            ? '● <b>Servidor activo</b> — comparte el enlace con equipos de tu red'
            : '○ Servidor detenido — inícialo para compartir archivos';
        if (st) st.className = 'btm-status-bar' + (on ? ' ftp-live' : '');
        if (url) { url.textContent = on ? lastUrl : '—'; url.classList.toggle('ftp-url-on', on); }
        if (pw) pw.classList.toggle('on', on);
        catalog().then(function (j) {
            try { if (cnt) cnt.textContent = JSON.parse(j).length + ' archivos visibles en la tribu'; } catch (e) {}
        });
    }

    function refresh() {
        var P = plug(); if (!P) return;
        pushCat().then(function () { return P.status(); }).then(paint).catch(function () {});
    }

    function toggleSrv() {
        var P = plug(); if (!P) return toast('Solo disponible en el APK');
        P.status().then(function (r) {
            if (r && r.running) return P.stop().then(function (s) { toast('Servidor detenido — ya no es visible en la red'); paint(s); });
            return pushCat().then(function () { return P.start(); })
                .then(function (s) { toast('📡 Servidor activo en tu red'); paint(s); });
        }).catch(function (e) { toast('Servidor: ' + e); });
    }

    function copyLink() {
        if (!lastUrl) return toast('Inicia el servidor primero');
        var done = function () { toast('Enlace copiado — pégalo en el navegador del otro equipo'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lastUrl).then(done, done);
        else done();
    }
    function shareLink() {
        if (!lastUrl) return toast('Inicia el servidor primero');
        var C = window.Capacitor, Sh = C && C.Plugins && C.Plugins.Share;
        if (Sh && Sh.share) Sh.share({ title: 'TRIBALs · servidor de archivos', text: 'Abre este enlace en la misma red: ' + lastUrl, url: lastUrl }).catch(function () {});
        else copyLink();
    }

    function open(d) {
        deps = d || {};
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = document.createElement('div');
        ov.className = 'tribal-overlay tribal-p2p-ov';
        ov.innerHTML = '<div class="tribal-p2p tribal-links"><div class="tribal-p2p-head">' +
                '<button class="tribal-ctrl lk-back" id="ftp-back"><i class="bi bi-arrow-left"></i><span>Volver</span></button>' +
                '<i class="bi bi-hdd-network-fill"></i><strong>Servidor de archivos</strong></div>' +
            '<div class="lk-body btm-body">' +
                '<p class="btm-status-bar" id="ftp-state">Comprobando…</p>' +
                '<div class="ftp-urlbox"><span>Enlace para compartir</span><b id="ftp-url">—</b>' +
                    '<div class="ftp-urlacts"><button class="tribal-btn tribal-btn-xs" id="ftp-copy"><i class="bi bi-clipboard"></i> Copiar</button>' +
                    '<button class="tribal-btn tribal-btn-xs" id="ftp-share"><i class="bi bi-share"></i> Compartir</button></div></div>' +
                '<div class="btm-grid-tiles">' +
                    '<button class="btm-tile" id="ftp-power"><i class="bi bi-power"></i><span>Encender / Apagar</span></button>' +
                    '<button class="btm-tile" id="ftp-refresh"><i class="bi bi-arrow-clockwise"></i><span>Actualizar</span></button></div>' +
                '<label class="ftp-auto"><input type="checkbox" id="ftp-auto"' + (isAuto() ? ' checked' : '') + '>' +
                    '<span>Auto-encender al abrir la app<br><small>Visible siempre en casa salvo que lo apagues aquí</small></span></label>' +
                '<p class="btm-status-bar" id="ftp-count"></p>' +
                '<p class="ftp-note">Los archivos que suban aparecen solos en tu biblioteca — caen por la bandeja de entrada.</p>' +
            '</div></div>';
        (deps.mount || document.body).appendChild(ov);
        ov.querySelector('#ftp-back').onclick = close;
        ov.querySelector('#ftp-power').onclick = toggleSrv;
        ov.querySelector('#ftp-refresh').onclick = refresh;
        ov.querySelector('#ftp-copy').onclick = copyLink;
        ov.querySelector('#ftp-share').onclick = shareLink;
        ov.querySelector('#ftp-auto').onchange = function (e) {
            localStorage.setItem(AUTO_KEY, e.target.checked ? '1' : '0');
            toast(e.target.checked ? 'El servidor se encenderá solo al abrir TRIBALs' : 'Auto-encendido apagado');
        };
        if (!plug()) { var st = ov.querySelector('#ftp-state'); if (st) st.textContent = 'Disponible solo en el APK instalado'; }
        refresh();
    }
    function close() { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); ov = null; }

    // auto-arranque al abrir la app (salvo apagado explícito del usuario)
    window.Sono.register('ftpserver', function (S) {
        var P = plug(); if (!P || !isAuto()) return;
        pushCat().then(function () { return P.start(); })
            .then(function (r) { if (r && r.url) lastUrl = r.url; })
            .catch(function () {});
        // el catálogo se refresca cuando entran archivos nuevos por la bandeja
        window.addEventListener('tribalInbox', function () { setTimeout(pushCat, 1800); });
    });
    return { open: open, close: close };
})();
