// === media/btmgr.js (<= 200 líneas): Administrador Bluetooth & Wi-Fi/Hotspots ===
window.TribalBtMgr = (function () {
    'use strict';
    var N = window.TribalBtNet, FAV_KEY = 'tribu_btfavs';
    var ov = null, deps = {}, devs = {}, connected = {}, wifiNets = [], wifiDevs = {}, wifiInfo = {},
        scanning = false, visibleUntil = 0, kFilter = 'all';
    var KIND_META = {
        audio:{ico:'bi-headphones',lbl:'Audífonos / Audio'}, keyboard:{ico:'bi-keyboard-fill',lbl:'Teclado BT'},
        mouse:{ico:'bi-mouse2-fill',lbl:'Mouse / Trackpad'}, input:{ico:'bi-controller',lbl:'Control / Periférico'},
        phone:{ico:'bi-phone-fill',lbl:'Teléfono'}, pc:{ico:'bi-laptop',lbl:'Computadora'},
        wifi:{ico:'bi-wifi',lbl:'Red Wi-Fi / Hotspot'}, bt:{ico:'bi-bluetooth',lbl:'Dispositivo BT'} };
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function toast(m) { if (deps && deps.toast) deps.toast(m); }
    function status(t) { if (ov) { var el = ov.querySelector('#btm-status'); if (el) el.textContent = t; } }
    function guessKind(name, k) { if (k && k !== 'bt') return k; var n = String(name || '').toLowerCase();
        if (/airpod|buds|headphone|speaker|audifon|auricular|jbl|sony|bose|sound|parlante|cascos|estereo/.test(n)) return 'audio';
        if (/keyb|teclado/.test(n)) return 'keyboard'; if (/mouse|raton|trackpad/.test(n)) return 'mouse';
        if (/gamepad|xbox|playstation|controller|control|mando/.test(n)) return 'input';
        if (/galaxy|iphone|redmi|moto|pixel|huawei|xiaomi|honor|poco|phone|tribu|android/.test(n)) return 'phone';
        if (/pc|laptop|macbook|windows|desktop/.test(n)) return 'pc'; return k || 'bt'; }
    function loadSaved() { return N && N.favs ? N.favs() : {}; }
    function wFavs() { var f = loadSaved(), o = {}; Object.keys(f).forEach(function (a) { if (f[a] && f[a].kind === 'wifi' && f[a].fav !== false) o[a] = f[a]; }); return o; }
    function wFav(ssid) { return wFavs()[ssid] || null; }
    function saveDevice(addr, name, kind, favFlag) { if (!addr || !N) return; var kd = guessKind(name, kind); N.setFav(addr, name, kd, favFlag);
        devs[addr] = { name: name || addr, addr: addr, kind: kd, saved: true, fav: N.isFav(addr) }; }
    function forgetDevice(addr) { var f = loadSaved(); delete f[addr]; delete devs[addr]; delete connected[addr];
        try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); } catch (e) {} render(); toast('Dispositivo eliminado'); }
    function onNetEvent(d) { if (!d || !d.type || !ov) return;
        if (d.type === 'device' && d.addr) { var kd = guessKind(d.name, d.kind);
            devs[d.addr] = { addr: d.addr, name: d.name || d.addr, kind: kd, near: true, bonded: !!d.bonded, fav: N.isFav(d.addr) };
            if (d.connected) connected[d.addr] = { name: d.name || d.addr, kind: kd }; render(); }
        else if (d.type === 'wifiDevice' && d.ip) { wifiDevs[d.ip] = { ip: d.ip, name: d.name || ('Equipo Wi-Fi ' + d.ip) }; render(); }
        else if (d.type === 'scanDone') { scanning = false; render();
            status('Escaneo terminado: ' + Object.keys(devs).length + ' BT · ' + (wifiNets.length + Object.keys(wifiDevs).length) + ' Wi-Fi'); }
        else if (d.type === 'wifiNets') { wifiNets = d.networks || []; render(); }
        else if (d.type === 'scanMode') {
            if (d.mode === 23 || d.mode === 3) { visibleUntil = Date.now() + 300000; status('👁 Visible para otros dispositivos (5 min)'); }
            else if (d.mode === 21 || d.mode === 20) { visibleUntil = 0; status('Visibilidad apagada'); }
            render();
        } else if (d.type === 'peer') { var a = d.addr || d.name || 'peer';
            if (d.state === 'open') { var kp = guessKind(d.name, d.kind); connected[a] = { name: d.name || a, kind: kp };
                saveDevice(a, d.name || a, kp, true); toast('Conectado con ' + (d.name || a)); }
            else if (d.state === 'closed' || d.state === 'error') delete connected[a]; render(); } }

    // Flujo idéntico al chat: ensurePerms → listen → devices → enable? → scan.
    // El Wi-Fi corre EN PARALELO — si el BT falla el Wi-Fi igual funciona.
    function doScan(fromUser) { if (!N) return;
        scanning = true; devs = {}; wifiDevs = {}; connected = {};
        var saved = loadSaved(); Object.keys(saved).forEach(function (a) { var s = saved[a]; if (s.kind === 'wifi') return;
            devs[a] = { addr: a, name: s.name || a, kind: guessKind(s.name, s.kind), saved: true, fav: s.fav !== false }; });
        status('📡 Escaneo profundo: permisos → emparejados → cercanos → Wi-Fi…'); render();
        setTimeout(function () { if (scanning) { scanning = false; render(); } }, 14000);
        N.ensurePerms().then(function () { N.listen().catch(function () {}); return N.devices(); })
            .then(function (r) {
                ((r && r.bonded) || []).forEach(function (x) { if (!x || !x.addr) return;
                    var kd = guessKind(x.name, x.kind);
                    devs[x.addr] = { addr: x.addr, name: x.name || x.addr, kind: kd, bonded: true, saved: true, fav: N.isFav(x.addr) };
                    if (x.connected) connected[x.addr] = { name: x.name || x.addr, kind: kd }; });
                render();
                if (r && r.permsOk === false) { scanning = false; status('⚠ Permisos Bluetooth/Ubicación denegados — actívalos en Ajustes'); return; }
                if (r && r.enabled === false) { status('Encendiendo Bluetooth…'); // como el chat: esperar 2.5 s
                    N.enable().catch(function () {});                              // o startDiscovery muere
                    setTimeout(function () { N.scan().catch(function () { scanning = false; render(); }); }, 2500); return; }
                status('📡 Buscando dispositivos cercanos…');
                return N.scan(!!fromUser);
            }).catch(function () { scanning = false; render(); });
        N.wifiScan().then(function (w) {
            wifiInfo = w || {}; wifiNets = (w && w.networks) || []; render();
            if (w && w.locationOn === false) toast('Activa la Ubicación del teléfono para ver redes Wi-Fi cercanas');
        }).catch(function () {}); }
    function doWifi() { if (!N) return;
        status('📶 Leyendo Wi-Fi / Hotspots cercanos…');
        N.ensurePerms().then(function () { return N.wifiScan(); }).then(function (w) {
            wifiInfo = w || {}; wifiNets = (w && w.networks) || []; kFilter = 'wifi'; render();
            var msg = (wifiInfo.hotspotOn ? '📡 Tu Hotspot está ACTIVO · ' : '') + wifiNets.length + ' redes Wi-Fi/Hotspots detectadas' +
                (wifiInfo.currentSsid ? ' · Conectado a: ' + wifiInfo.currentSsid : '');
            status(msg); toast(msg);
            if (w && w.locationOn === false) toast('Ubicación apagada: Android exige ubicación ON para listar redes Wi-Fi'); })
        .catch(function () { status('No se pudo leer el Wi-Fi'); }); }
    function wifiJoin(ssid, secure) { var fv = wFav(ssid);
        if (fv) return joinWifi(ssid, fv.pass || '');
        askPass(ssid, secure, function (p) { joinWifi(ssid, p); }); }
    function joinWifi(ssid, pass) { status('Conectando a «' + ssid + '»…');
        N.wifiConnect({ ssid: ssid, pass: pass }).then(function (r) {
            toast('Wi-Fi «' + ssid + '»: ' + (r && r.remember === 'ok' ? 'recordada y ' : '') + 'conexión solicitada'); doWifi();
        }).catch(function (e) { var m = String(e && e.message || e);
            if (/wifi_apagado/.test(m)) { toast('Wi-Fi apagado — enciéndelo'); if (N.openWifiSettings) N.openWifiSettings(); }
            else status('No se pudo conectar: ' + m); }); }
    function askPass(ssid, secure, cb) { if (!secure) return cb('');
        var p = window.prompt('Contraseña Wi-Fi para «' + ssid + '» (deja vacío si es abierta):');
        if (p == null) return; cb(p); }
    function wifiRemember(ssid, secure) { var cur = wFav(ssid);
        if (cur) { N.setFav(ssid, ssid, 'wifi', false); if (N.wifiForget) N.wifiForget(ssid);
            toast('«' + ssid + '» olvidada'); render(); return; }
        var label = window.prompt('¿Con qué nombre recuerdo esta red? (Casa, Aeropuerto, Restaurante…)', '');
        if (label == null) return;
        askPass(ssid, secure, function (p) {
            N.setFav(ssid, ssid, 'wifi', true, { label: label || '', pass: p || '' });
            N.wifiConnect({ ssid: ssid, pass: p || '' }).catch(function () {});
            toast('★ «' + (label || ssid) + '» recordada — se une sola al estar en rango'); render(); }); }

    function catOf(kd) { return kd === 'audio' ? 'audio' : (/keyboard|mouse|input/.test(kd) ? 'input' : (/phone|pc/.test(kd) ? 'phone' : 'other')); }
    function rowHtml(it) {
        var isConn = !!connected[it.addr], fav = N.isFav(it.addr), m = KIND_META[it.kind] || KIND_META.bt;
        var stTxt = (fav ? '★ Favorito auto · ' : '') + (isConn ? 'Conectado' : (it.near ? 'Cercano' : (it.bonded ? 'Emparejado' : 'Guardado')));
        return '<div class="btm-row' + (isConn ? ' on' : '') + '" data-addr="' + esc(it.addr) + '">' +
            '<div class="btm-ico-wrap"><i class="bi ' + m.ico + ' btm-ico"></i></div>' +
            '<div class="btm-info"><b>' + esc(it.name || it.addr) + '</b><small>' + m.lbl + ' · ' + stTxt + '</small></div><div class="btm-row-acts">' +
            '<button class="tribal-ctrl np-doc-fav' + (fav ? ' on' : '') + '" data-act="fav" data-addr="' + esc(it.addr) + '" data-name="' + esc(it.name || it.addr) + '" data-kind="' + esc(it.kind) + '" title="Favorito"><i class="bi ' + (fav ? 'bi-star-fill' : 'bi-star') + '"></i></button>' +
            (isConn ? '<button class="tribal-btn tribal-btn-xs" data-act="chat" data-addr="' + esc(it.addr) + '"><i class="bi bi-chat-dots-fill"></i></button>' +
                '<button class="tribal-btn tribal-btn-xs" data-act="rc"><i class="bi bi-controller"></i></button>' +
                '<button class="tribal-btn tribal-btn-xs danger" data-act="disc"><i class="bi bi-x-circle"></i></button>'
            : '<button class="tribal-btn tribal-btn-xs primary" data-act="conn" data-addr="' + esc(it.addr) + '" data-name="' + esc(it.name || it.addr) + '" data-kind="' + esc(it.kind) + '">Conectar</button>') +
            '<button class="tribal-btn tribal-btn-xs" data-act="forget" data-addr="' + esc(it.addr) + '"><i class="bi bi-trash3"></i></button></div></div>'; }
    function wifiRowHtml(w) {
        var ico = w.hotspot ? 'bi-broadcast-pin' : 'bi-wifi', fv = wFav(w.ssid);
        var tag = (w.hotspot ? 'Hotspot móvil' : 'Red Wi-Fi') + ' · ' + (w.level || 0) + '%' + (w.secure ? ' · 🔒' : ' · abierta') +
            (w.connected ? ' · Conectada' : '') + (fv ? ' · ★ «' + esc(fv.label || 'recordada') + '»' : '');
        return '<div class="btm-row' + (w.connected ? ' on' : '') + '"><div class="btm-ico-wrap"><i class="bi ' + ico + ' btm-ico"></i></div>' +
            '<div class="btm-info"><b>' + esc(fv && fv.label ? fv.label : w.ssid) + '</b><small>' + tag + '</small></div>' +
            '<div class="btm-row-acts"><button class="tribal-ctrl np-doc-fav' + (fv ? ' on' : '') + '" data-act="wififav" data-ssid="' + esc(w.ssid) + '" data-sec="' + (w.secure ? 1 : 0) + '" title="Recordar red"><i class="bi ' + (fv ? 'bi-star-fill' : 'bi-star') + '"></i></button>' +
            '<button class="tribal-btn tribal-btn-xs ' + (w.connected ? '' : 'primary') + '" data-act="wificonn" data-ssid="' + esc(w.ssid) + '" data-sec="' + (w.secure ? 1 : 0) + '">' + (w.connected ? 'Conectado' : 'Conectar') + '</button></div></div>'; }
    function render() {
        if (!ov) return;
        var all = Object.keys(devs).map(function (a) { return devs[a]; }), wDevs = Object.keys(wifiDevs).map(function (ip) { return wifiDevs[ip]; });
        var counts = { all: all.length + wifiNets.length + wDevs.length, audio: 0, input: 0, phone: 0, wifi: wifiNets.length + wDevs.length };
        all.forEach(function (it) { var c = catOf(it.kind); if (counts[c] != null) counts[c]++; });
        ov.querySelectorAll('#btm-kfilters button').forEach(function (b) { var kf = b.getAttribute('data-kf'), sp = b.querySelector('em');
            if (sp) sp.textContent = counts[kf] || 0; b.classList.toggle('on', kf === kFilter); });
        var connN = Object.keys(connected).length, visLeft = Math.max(0, Math.round((visibleUntil - Date.now()) / 1000));
        if (!scanning) status((visLeft > 0 ? '👁 Visible (' + visLeft + 's) · ' : '') +
            (wifiInfo.currentSsid ? 'Wi-Fi: ' + wifiInfo.currentSsid + ' (' + (wifiInfo.ip || '') + ') · ' : '') +
            connN + ' BT conectado(s) · ' + wifiNets.length + ' Wi-Fi/Hotspots · ' + all.length + ' BT detectados');
        all.sort(function (a, b) { var fa = N.isFav(a.addr) ? 1 : 0, fb = N.isFav(b.addr) ? 1 : 0;
            return fb !== fa ? fb - fa : (connected[b.addr] ? 1 : 0) - (connected[a.addr] ? 1 : 0); });
        var html = '';
        if (kFilter !== 'wifi') html += all.filter(function (it) { return kFilter === 'all' || catOf(it.kind) === kFilter; }).map(rowHtml).join('');
        if (kFilter === 'all' || kFilter === 'wifi') {
            wDevs.forEach(function (wd) {
                html += '<div class="btm-row on"><div class="btm-ico-wrap"><i class="bi bi-router-fill btm-ico"></i></div><div class="btm-info"><b>' + esc(wd.name) + '</b><small>Equipo TRIBALs en tu Wi-Fi/Hotspot (' + esc(wd.ip) + ')</small></div><div class="btm-row-acts"><button class="tribal-btn tribal-btn-xs primary" data-act="rc">Control remoto</button></div></div>'; });
            var wf = wFavs();
            Object.keys(wf).forEach(function (ssid) { var seen = wifiNets.some(function (n2) { return n2.ssid === ssid; }); if (seen) return;
                html += '<div class="btm-row"><div class="btm-ico-wrap"><i class="bi bi-wifi-off btm-ico"></i></div><div class="btm-info"><b>★ ' + esc(wf[ssid].label || ssid) + '</b><small>Red recordada (' + esc(ssid) + ') · fuera de rango ahora</small></div>' +
                    '<div class="btm-row-acts"><button class="tribal-ctrl np-doc-fav on" data-act="wififav" data-ssid="' + esc(ssid) + '" data-sec="1"><i class="bi bi-star-fill"></i></button></div></div>'; });
            html += wifiNets.map(wifiRowHtml).join('');
        }
        ov.querySelector('#btm-list').innerHTML = html || '<div class="btm-empty"><i class="bi bi-bluetooth"></i><p>Sin dispositivos en esta categoría.</p><small>Toca «Buscar cercanos» o «Hotspot / Wi-Fi».</small></div>';
    }

    function open(d) { deps = d || {};
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = document.createElement('div');
        ov.className = 'tribal-overlay tribal-p2p-ov';
        ov.innerHTML = '<div class="tribal-p2p tribal-links"><div class="tribal-p2p-head">' +
                '<button class="tribal-ctrl lk-back" id="btm-back"><i class="bi bi-arrow-left"></i><span>Volver</span></button>' +
                '<i class="bi bi-bluetooth"></i><strong>Bluetooth & Wi-Fi / Hotspot</strong>' +
                '<button class="tribal-btn tribal-btn-xs" id="btm-sys" style="margin-left:auto"><i class="bi bi-gear-fill"></i> Ajustes</button></div>' +
            '<div class="lk-body btm-body">' +
                '<button class="btm-hero-chat" id="btm-gochat"><div class="btm-hero-ico"><i class="bi bi-chat-dots-fill"></i></div><div class="btm-hero-txt"><strong>Ir a chatear con la tribu</strong><span>Chat Bluetooth con reconexión automática</span></div><i class="bi bi-chevron-right"></i></button>' +
                '<div class="btm-grid-tiles">' +
                    '<button class="btm-tile" id="btm-scan"><i class="bi bi-radar"></i><span>Buscar cercanos</span></button>' +
                    '<button class="btm-tile" id="btm-vis"><i class="bi bi-broadcast"></i><span>Hacerme visible</span></button>' +
                    '<button class="btm-tile" id="btm-hs"><i class="bi bi-broadcast-pin"></i><span>Hotspot / Wi-Fi</span></button>' +
                    '<button class="btm-tile" id="btm-rc"><i class="bi bi-controller"></i><span>Control remoto</span></button></div>' +
                '<div class="btm-cats" id="btm-kfilters">' +
                    '<button type="button" class="btm-cat on" data-kf="all"><i class="bi bi-grid-fill"></i><span>Todos</span><em>0</em></button>' +
                    '<button type="button" class="btm-cat" data-kf="wifi"><i class="bi bi-wifi"></i><span>Wi-Fi / Hotspot</span><em>0</em></button>' +
                    '<button type="button" class="btm-cat" data-kf="audio"><i class="bi bi-headphones"></i><span>Audio</span><em>0</em></button>' +
                    '<button type="button" class="btm-cat" data-kf="input"><i class="bi bi-keyboard-fill"></i><span>Teclado / Mouse</span><em>0</em></button>' +
                    '<button type="button" class="btm-cat" data-kf="phone"><i class="bi bi-phone-fill"></i><span>Teléfonos</span><em>0</em></button>' +
                '</div>' +
                '<p class="btm-status-bar" id="btm-status">Iniciando reconocimiento Bluetooth y Wi-Fi…</p>' +
                '<div id="btm-list" class="btm-list"></div>' +
            '</div></div>';
        (deps.mount || document.body).appendChild(ov);
        ov.querySelector('#btm-back').onclick = close; ov.querySelector('#btm-scan').onclick = function () { doScan(true); };
        ov.querySelector('#btm-sys').onclick = function () { if (N && N.openSettings) N.openSettings(); };
        ov.querySelector('#btm-hs').onclick = doWifi;
        ov.querySelector('#btm-vis').onclick = function () { if (N) { status('Solicitando visibilidad al sistema…'); N.invite().then(function () { toast('Solicitud de visibilidad enviada — el modo visible se confirma abajo'); render(); }).catch(function (e) { status('No se pudo activar visibilidad: ' + e); }); } };
        ov.querySelector('#btm-gochat').onclick = function () { close(); if (window.TribalBtChat) window.TribalBtChat.open(deps); };
        ov.querySelector('#btm-rc').onclick = function () { close(); if (window.TribalRemote) window.TribalRemote.open(deps); };
        ov.querySelector('#btm-kfilters').onclick = function (e) { var b = e.target.closest('[data-kf]'); if (b) { kFilter = b.getAttribute('data-kf'); render(); } };
        ov.querySelector('#btm-list').onclick = function (e) {
            var b = e.target.closest('[data-act]'); if (!b) return;
            var act = b.getAttribute('data-act'), addr = b.getAttribute('data-addr'), nm = b.getAttribute('data-name'), kd = b.getAttribute('data-kind'),
                ssid = b.getAttribute('data-ssid'), sec = b.getAttribute('data-sec') === '1';
            if (act === 'fav' && N) { var on = N.toggleFav(addr, nm, kd); toast(on ? '★ Guardado en Favoritos (se conectará solo)' : 'Quitado de Favoritos'); render(); }
            else if (act === 'conn' && N) { saveDevice(addr, nm, kd, true); toast('Conectando con ' + (nm || addr) + '…'); N.connect(addr).catch(function () {}); }
            else if (act === 'wificonn' && N) wifiJoin(ssid, sec);
            else if (act === 'wififav' && N) wifiRemember(ssid, sec);
            else if (act === 'disc' && N) N.close().then(function () { delete connected[addr]; render(); });
            else if (act === 'forget') forgetDevice(addr);
            else if (act === 'chat') { close(); if (window.TribalBtChat) window.TribalBtChat.open(deps); }
            else if (act === 'rc') { close(); if (window.TribalRemote) window.TribalRemote.open(deps); }
        };
        if (N) N.ensurePerms().then(function () { return N.init(onNetEvent); }).then(function () { doScan(false); });
    }
    function close() { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); ov = null; }
    return { open: open, close: close };
})();
