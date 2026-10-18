// === media/ftpserver.js (<=200): Servidor de archivos LAN (FTP tribal) ===
// Panel ⋮ «Servidor de archivos»: inicia/detiene el mini servidor HTTP
// nativo (TribalFtpPlugin, puerto 8765), muestra enlaces compartibles
// (LAN + hotspot + nombre), y auto-arranca al abrir la app salvo apagado.
window.TribalFtp = (function () {
    'use strict';
    var AUTO_KEY = 'tribu_ftp_auto', NAME_KEY = 'tribu_ftp_name', SEL_KEY = 'tribu_ftp_sel';
    var ov = null, deps = {}, lastInfo = null, S0 = null;
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function toast(m) { if (deps && deps.toast) deps.toast(m); else if (S0 && S0.showToast) S0.showToast(m); }
    function plug() { var C = window.Capacitor;
        return (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.TribalFtp) || null; }
    function isAuto() { return localStorage.getItem(AUTO_KEY) !== '0'; }
    function isSel() { return localStorage.getItem(SEL_KEY) === '1'; }
    function srvName() { return localStorage.getItem(NAME_KEY) || 'Mi tribu'; }

    // catálogo: {name, items:[{i,n,s,k,p,ro}]} — p: 'builtin/…' | 'tribu_media/…'
    // modo «solo elegidos»: solo los items marcados info.ftp salen por el servidor
    function catalog() {
        var MS = window.MediaStore;
        if (!MS || !MS.list) return Promise.resolve('{"items":[]}');
        return MS.list().then(function (items) {
            var sel = isSel();
            var arr = items.filter(function (m) {
                    // refs del escáner quedan fuera: /dl no lleva auth y
                    // servir rutas absolutas externas expondría el disco a la LAN
                    if (!m || m.ref || !(m.path || m.builtin)) return false;
                    return !sel || (m.info && m.info.ftp);
                })
                .map(function (m) { return { i: m.id, n: m.name, s: m.size || 0,
                    k: m.kind || 'other', p: m.builtin || m.path, ro: m.builtin ? 1 : 0 }; });
            return JSON.stringify({ name: srvName(), items: arr });
        }).catch(function () { return '{"items":[]}'; });
    }
    function pushCat() { var P = plug(); if (!P) return Promise.resolve();
        return catalog().then(function (j) { return P.setCatalog({ json: j }); }).catch(function () {}); }

    function paint(r) {
        if (!ov || !r) return; lastInfo = r;
        var on = !!r.running;
        var st = ov.querySelector('#ftp-state'), url = ov.querySelector('#ftp-url'),
            pw = ov.querySelector('#ftp-power'), cnt = ov.querySelector('#ftp-count'),
            alts = ov.querySelector('#ftp-alts'), nm = ov.querySelector('#ftp-name');
        if (st) { st.innerHTML = on ? '● <b>Servidor activo</b> — comparte el enlace con equipos de tu red' : '○ Servidor detenido — inícialo para compartir archivos';
            st.className = 'btm-status-bar' + (on ? ' ftp-live' : ''); }
        var main = on ? (r.host || r.url) : '—';
        if (url) { url.textContent = main; url.classList.toggle('ftp-url-on', on); }
        if (pw) pw.classList.toggle('on', on);
        if (nm && document.activeElement !== nm) nm.value = srvName();
        if (alts) {
            var links = [];
            ((r.urls) || []).forEach(function (u) { links.push('<b>' + esc(u.u) + '</b>' + (u.hot ? ' 📡 hotspot' : '')); });
            alts.innerHTML = links.length
                ? 'Si el nombre no abre, usa el número: ' + links.join(' · ')
                : 'Sin red detectada — enciende Wi-Fi o tu Hotspot';
        }
        catalog().then(function (j) { try { var d = JSON.parse(j);
            if (cnt) cnt.textContent = (d.items || []).length + ' archivos visibles en la tribu'; } catch (e) {} });
    }

    function refresh() { var P = plug(); if (!P) return;
        pushCat().then(function () { return P.status(); }).then(paint).catch(function () {}); }
    function toggleSrv() { var P = plug(); if (!P) return toast('Solo disponible en el APK');
        P.status().then(function (r) {
            if (r && r.running) return P.stop().then(function (s) { toast('Servidor detenido — ya no es visible en la red'); paint(s); });
            return pushCat().then(function () { return P.start(); })
                .then(function (s) { toast('📡 Servidor activo en tu red'); paint(s); });
        }).catch(function (e) { toast('Servidor: ' + e); }); }

    function mainUrl() { return (lastInfo && lastInfo.host) || (lastInfo && lastInfo.url) || 'http://…:8765'; }
    function shareTxt() {
        return '🔥 ' + srvName() + ' — abre este enlace en mi misma red (o conéctate a mi hotspot): ' + mainUrl(); }
    function copyLink() { if (!lastInfo || !lastInfo.running) return toast('Inicia el servidor primero');
        var done = function () { toast('Enlace copiado — pégalo en el navegador del otro equipo'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(mainUrl()).then(done, done); else done(); }
    function shareLink() { if (!lastInfo || !lastInfo.running) return toast('Inicia el servidor primero');
        var C = window.Capacitor, Sh = C && C.Plugins && C.Plugins.Share;
        if (Sh && Sh.share) Sh.share({ title: srvName() + ' · servidor de archivos', text: shareTxt(), url: mainUrl() }).catch(function () {});
        else copyLink(); }
    function shareWA() { if (!lastInfo || !lastInfo.running) return toast('Inicia el servidor primero');
        window.open('https://wa.me/?text=' + encodeURIComponent(shareTxt()), '_blank'); }

    function open(d) {
        if (window.TribalState) TribalState.opened('ftp');
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
                    '<button class="tribal-btn tribal-btn-xs" id="ftp-share"><i class="bi bi-share"></i> Compartir</button>' +
                    '<button class="tribal-btn tribal-btn-xs" id="ftp-wa"><i class="bi bi-whatsapp"></i> WhatsApp</button></div>' +
                    '<p class="ftp-note" id="ftp-alts"></p></div>' +
                '<div class="ftp-namebox"><span>🏷 Nombre de tu servidor — es lo que ven en la página en vez del número</span>' +
                    '<input type="text" id="ftp-name" maxlength="30" placeholder="Mi tribu"></div>' +
                '<details class="ftp-help"><summary><i class="bi bi-question-circle"></i> ¿Cómo conectar otro equipo?</summary>' +
                    '<ol><li><b>Misma casa/oficina:</b> ambos en el mismo Wi-Fi → abren el enlace.</li>' +
                    '<li><b>Sin Wi-Fi (solo datos):</b> toca «Mi Hotspot», enciéndelo; en el otro equipo conéctate a la red Wi-Fi portátil de tu teléfono y abre el enlace — no gasta datos, es directo.</li>' +
                    '<li><b>Compartir:</b> Copiar, Compartir o WhatsApp envían el enlace listo.</li>' +
                    '<li><b>En la página:</b> suben archivos o carpetas (caen solos en tu biblioteca), descargan los tuyos y pueden borrar (pide 3 confirmaciones).</li></ol></details>' +
                '<div class="btm-grid-tiles">' +
                    '<button class="btm-tile" id="ftp-power"><i class="bi bi-power"></i><span>Encender / Apagar</span></button>' +
                    '<button class="btm-tile" id="ftp-refresh"><i class="bi bi-arrow-clockwise"></i><span>Actualizar</span></button>' +
                    '<button class="btm-tile" id="ftp-hs"><i class="bi bi-broadcast-pin"></i><span>Mi Hotspot</span></button></div>' +
                '<label class="ftp-auto"><input type="checkbox" id="ftp-auto"' + (isAuto() ? ' checked' : '') + '>' +
                    '<span>Auto-encender al abrir la app<br><small>Visible siempre en casa salvo que lo apagues aquí</small></span></label>' +
                '<label class="ftp-auto"><input type="checkbox" id="ftp-sel"' + (isSel() ? ' checked' : '') + '>' +
                    '<span>Compartir solo los elegidos<br><small>Apagado = toda la biblioteca; encendido = solo lo marcado «Enviar al servidor» (⋮ de cada archivo o selección múltiple)</small></span></label>' +
                '<p class="btm-status-bar" id="ftp-count"></p>' +
                '<p class="ftp-note">Sin límite de tamaño: las subidas caen en tu biblioteca solas; desde la página también pueden borrar (con triple confirmación) y se borra del dispositivo.</p>' +
            '</div></div>';
        (deps.mount || document.body).appendChild(ov);
        ov.querySelector('#ftp-back').onclick = close;
        ov.querySelector('#ftp-power').onclick = toggleSrv;
        ov.querySelector('#ftp-refresh').onclick = refresh;
        ov.querySelector('#ftp-copy').onclick = copyLink;
        ov.querySelector('#ftp-share').onclick = shareLink;
        ov.querySelector('#ftp-wa').onclick = shareWA;
        ov.querySelector('#ftp-hs').onclick = function () { var n = window.TribalBtNet;
            if (n && n.openHotspotSettings) n.openHotspotSettings(); else toast('Enciende tu hotspot en Ajustes de Android'); };
        ov.querySelector('#ftp-name').onchange = function (e) {
            var v = String(e.target.value || '').trim() || 'Mi tribu';
            localStorage.setItem(NAME_KEY, v); pushCat(); toast('El servidor se llama «' + v + '»'); };
        ov.querySelector('#ftp-auto').onchange = function (e) {
            localStorage.setItem(AUTO_KEY, e.target.checked ? '1' : '0');
            toast(e.target.checked ? 'El servidor se encenderá solo al abrir TRIBALs' : 'Auto-encendido apagado'); };
        ov.querySelector('#ftp-sel').onchange = function (e) {
            localStorage.setItem(SEL_KEY, e.target.checked ? '1' : '0');
            pushCat().then(function () { if (ov) refresh(); });
            toast(e.target.checked ? 'Solo salen los archivos que marques «Enviar al servidor»' : 'Toda la biblioteca visible en la página'); };
        if (!plug()) { var st = ov.querySelector('#ftp-state'); if (st) st.textContent = 'Disponible solo en el APK instalado'; }
        refresh();
    }
    function close() { if (window.TribalState) TribalState.closed('ftp'); if (ov && ov.parentNode) ov.parentNode.removeChild(ov); ov = null; }

    // marca/quita info.ftp en los ids, empuja el catálogo y enciende el servidor
    function share(ids, on) {
        var MS = window.MediaStore;
        if (!MS || !MS.updateInfo || !ids || !ids.length) return Promise.resolve(0);
        var seq = Promise.resolve(), n = 0;
        ids.forEach(function (id) {
            seq = seq.then(function () {
                return MS.updateInfo(id, { ftp: on ? 1 : 0 });
            }).then(function (m) { if (m) n++; }).catch(function () {});
        });
        return seq.then(function () {
            return pushCat();
        }).then(function () {
            var P = plug();
            if (!P || !on) { if (ov) paint(lastInfo); return n; }
            return P.status().then(function (r) {
                if (r && r.running) { if (ov) paint(r); return n; }
                return P.start().then(function (s) {
                    lastInfo = s; if (ov) paint(s);
                    toast('📡 Servidor encendido — comparte el enlace');
                    return n;
                });
            });
        }).then(function () { return n; });
    }
    function unshareAll(ids) { return share(ids, false); }

    // auto-arranque + borrados que llegan desde la web (ya pasaron 3 pasos allá)
    window.Sono.register('ftpserver', function (S) {
        S0 = S;
        var P = plug(); if (!P) return;
        P.addListener('ftpDel', function (ev) {
            var MS = window.MediaStore, id = ev && ev.id;
            if (!MS || !MS.list || !id) return;
            MS.list().then(function (items) {
                var m = items.filter(function (x) { return x.id === id; })[0];
                if (!m || m.builtin) return;   // la música semilla no se borra por FTP
                return MS.remove(id).then(function () {
                    toast('🗑 «' + m.name + '» eliminado desde la web'); S.reload(); setTimeout(pushCat, 600); });
            }).catch(function () {});
        });
        P.addListener('ftpRen', function (ev) {
            var MS = window.MediaStore, id = ev && ev.id, nm = ev && ev.name;
            if (!MS || !MS.rename || !id || !nm) return;
            MS.rename(id, nm).then(function () {
                toast('✎ Renombrado desde la web: «' + nm + '»'); S.reload(); setTimeout(pushCat, 600); });
        });
        if (!isAuto()) return;
        pushCat().then(function () { return P.start(); })
            .then(function (r) { if (r) lastInfo = r; }).catch(function () {});
        window.addEventListener('tribalInbox', function () { setTimeout(pushCat, 1800); });
    });
    return { open: open, close: close, share: share, unshare: unshareAll };
})();
