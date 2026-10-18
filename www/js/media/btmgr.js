// === media/btmgr.js (<=200): Administrador Bluetooth — emula el flujo del chat ===
// Orden idéntico a btchat.js open(): ensurePerms → init → listen → scan → devices
// → enable? (espera 2.5 s). N se liga perezoso: el orden de <script> no importa.
window.TribalBtMgr = (function () {
    'use strict';
    var N = null, FAV_KEY = 'tribu_btfavs';
    function net() { if (!N) N = window.TribalBtNet; return N; }
    var ov = null, deps = {}, devs = {}, connected = {}, lanDevs = {},
        scanning = false, visibleUntil = 0, kFilter = 'all';
    var KIND_META = {
        audio:{ico:'bi-headphones',lbl:'Audífonos / Audio'}, keyboard:{ico:'bi-keyboard-fill',lbl:'Teclado BT'},
        mouse:{ico:'bi-mouse2-fill',lbl:'Mouse / Trackpad'}, input:{ico:'bi-controller',lbl:'Control / Periférico'},
        phone:{ico:'bi-phone-fill',lbl:'Teléfono'}, pc:{ico:'bi-laptop',lbl:'Computadora'},
        lan:{ico:'bi-router-fill',lbl:'Equipo en mi red'}, bt:{ico:'bi-bluetooth',lbl:'Dispositivo BT'} };
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function toast(m) { if (deps && deps.toast) deps.toast(m); }
    function status(t) { if (ov) { var el = ov.querySelector('#btm-status'); if (el) el.textContent = t; } }
    function guessKind(name, k) { if (k && k !== 'bt') return k; var n = String(name || '').toLowerCase();
        if (/airpod|buds|headphone|speaker|audifon|auricular|jbl|sony|bose|sound|parlante|cascos|estereo/.test(n)) return 'audio';
        if (/keyb|teclado/.test(n)) return 'keyboard'; if (/mouse|raton|trackpad/.test(n)) return 'mouse';
        if (/gamepad|xbox|playstation|controller|control|mando/.test(n)) return 'input';
        if (/galaxy|iphone|redmi|moto|pixel|huawei|xiaomi|honor|poco|phone|tribu|android/.test(n)) return 'phone';
        if (/pc|laptop|macbook|windows|desktop/.test(n)) return 'pc'; return k || 'bt'; }
    function saveDevice(addr, name, kind, favFlag) { var n = net(); if (!addr || !n) return;
        var kd = guessKind(name, kind); n.setFav(addr, name, kd, favFlag);
        devs[addr] = { name: name || addr, addr: addr, kind: kd, saved: true, fav: n.isFav(addr) }; }
    function forgetDevice(addr) { var f = net() && net().favs ? net().favs() : {}; delete f[addr]; delete devs[addr]; delete connected[addr];
        try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); } catch (e) {} render(); toast('Dispositivo eliminado'); }

    // réplica de onEvt del chat: device | scanDone | peer | scanMode | wifiDevice
    function onNetEvent(d) { if (!d || !d.type || !ov) return; var n = net();
        if (d.type === 'device' && d.addr) { var kd = guessKind(d.name, d.kind);
            devs[d.addr] = { addr: d.addr, name: d.name || d.addr, kind: kd, near: true, bonded: !!d.bonded, fav: n && n.isFav(d.addr) };
            if (d.connected) connected[d.addr] = { name: d.name || d.addr, kind: kd }; render(); }
        else if (d.type === 'wifiDevice' && d.ip) { lanDevs[d.ip] = { ip: d.ip, name: d.name || ('Equipo ' + d.ip) }; render(); }
        else if (d.type === 'scanDone') { scanning = false; render();
            status(Object.keys(devs).length + ' cerca · escuchando'); }
        else if (d.type === 'scanMode') {
            if (d.mode === 23 || d.mode === 3) { visibleUntil = Date.now() + 300000; status('👁 Visible para otros dispositivos (5 min)'); }
            else if (d.mode === 21 || d.mode === 20) { visibleUntil = 0; status('Visibilidad apagada'); } render(); }
        else if (d.type === 'peer') { var a = d.addr || d.name || 'peer';
            if (d.state === 'open') { var kp = guessKind(d.name, d.kind); connected[a] = { name: d.name || a, kind: kp };
                saveDevice(a, d.name || a, kp, true); toast('Conectado con ' + (d.name || a)); }
            else if (d.state === 'closed' || d.state === 'error') delete connected[a]; render(); } }

    // doScan idéntico al chat: limpia, pinta favoritos, lanza N.scan()
    function doScan(fromUser) { var n = net(); if (!n) { status('Motor BT no cargado'); return; }
        scanning = true; devs = {};
        var saved = n.favs ? n.favs() : {};
        Object.keys(saved).forEach(function (a) { var s = saved[a]; if (s.kind === 'wifi') return;
            devs[a] = { addr: a, name: s.name || a, kind: guessKind(s.name, s.kind), saved: true, fav: s.fav !== false }; });
        status('escaneando…'); render();
        n.scan(!!fromUser).catch(function (e) { scanning = false; status('error'); toast(String(e)); render(); }); }

    // arranque idéntico al open() del chat: perms → init → listen → scan → bonded → enable?
    function boot() { var n = net(); if (!n) { status('Motor BT no cargado'); return; }
        status('Iniciando Bluetooth…');
        n.ensurePerms().then(function () { return n.init(onNetEvent); }).then(function () {
            n.listen().catch(function () {}); doScan(false);
            n.devices().then(function (r) {
                ((r && r.bonded) || []).forEach(function (x) { if (!x || !x.addr) return;
                    var kd = guessKind(x.name, x.kind);
                    devs[x.addr] = { addr: x.addr, name: x.name || x.addr, kind: kd, bonded: true, saved: true, fav: n.isFav(x.addr) };
                    if (x.connected) connected[x.addr] = { name: x.name || x.addr, kind: kd }; });
                render();
                if (r && r.permsOk === false) { scanning = false; status('⚠ Permisos Bluetooth/Ubicación denegados — actívalos en Ajustes'); return; }
                if (r && r.enabled === false) { status('bluetooth desconectado — activando…');
                    n.enable().then(function () { n.listen().catch(function () {});
                        setTimeout(function () { doScan(false); }, 2500);   // esperar al radio, como el chat
                    }).catch(function () { toast('No se pudo activar el Bluetooth'); }); }
            }).catch(function () {});
        }).catch(function (e) { status('Sin permisos: ' + e); }); }

    function catOf(kd) { return kd === 'audio' ? 'audio' : (/keyboard|mouse|input/.test(kd) ? 'input' : (/phone|pc/.test(kd) ? 'phone' : 'other')); }
    function rowHtml(it) { var n = net();
        var isConn = !!connected[it.addr], fav = n && n.isFav(it.addr), m = KIND_META[it.kind] || KIND_META.bt;
        var stTxt = (fav ? '★ Favorito auto · ' : '') + (isConn ? 'Conectado' : (it.near ? 'Cercano' : (it.bonded ? 'Emparejado' : 'Guardado')));
        return '<div class="btm-row' + (isConn ? ' on' : '') + '"><div class="btm-top"><div class="btm-ico-wrap"><i class="bi ' + m.ico + ' btm-ico"></i></div>' +
            '<div class="btm-info"><b>' + esc(it.name || it.addr) + '</b><small>' + m.lbl + ' · ' + stTxt + '</small></div>' +
            '<button class="tribal-ctrl np-doc-fav' + (fav ? ' on' : '') + '" data-act="fav" data-addr="' + esc(it.addr) + '" data-name="' + esc(it.name || it.addr) + '" data-kind="' + esc(it.kind) + '" title="Favorito"><i class="bi ' + (fav ? 'bi-star-fill' : 'bi-star') + '"></i></button></div>' +
            '<hr class="btm-hr"><div class="btm-row-acts">' +
            '<button class="btm-power' + (isConn ? ' on' : '') + '" data-act="pow" data-addr="' + esc(it.addr) + '" data-name="' + esc(it.name || it.addr) + '" data-kind="' + esc(it.kind) + '" title="' + (isConn ? 'Desconectar' : 'Conectar') + '"><i class="bi bi-power"></i></button>' +
            (isConn ? '<button class="tribal-btn tribal-btn-xs" data-act="chat"><i class="bi bi-chat-dots-fill"></i> Chat</button>' +
                '<button class="tribal-btn tribal-btn-xs" data-act="rc"><i class="bi bi-controller"></i> Control</button>' : '') +
            '<button class="tribal-btn tribal-btn-xs danger" data-act="forget" data-addr="' + esc(it.addr) + '" data-name="' + esc(it.name || it.addr) + '"><i class="bi bi-trash3"></i></button></div></div>'; }

    // modal de eliminación en dos pasos: «Eliminar» → «¿Seguro? confirmar»
    function confirmDel(addr, name) {
        if (!ov) return;
        var bd = document.createElement('div'); bd.className = 'np-modal-bd';
        bd.innerHTML = '<div class="np-modal-card"><p style="margin:0 0 6px"><i class="bi bi-exclamation-triangle-fill"></i> <b>¿Eliminar «' + esc(name || addr) + '»?</b></p>' +
            '<p class="btm-modal-sub" style="margin:0 0 12px">El dispositivo se quitará de la tribu.</p>' +
            '<div class="np-modal-acts"><button class="tribal-btn tribal-btn-xs" id="cfd-no">Cancelar</button>' +
            '<button class="tribal-btn tribal-btn-xs danger" id="cfd-yes">Eliminar</button></div></div>';
        ov.appendChild(bd);
        var step = 0, yes = bd.querySelector('#cfd-yes');
        bd.querySelector('#cfd-no').onclick = function () { bd.remove(); };
        yes.onclick = function () { step++;
            if (step === 1) { yes.innerHTML = '¿Realmente seguro? Confirmar'; return; }
            bd.remove(); forgetDevice(addr); };
    }
    function render() { if (!ov) return;
        var all = Object.keys(devs).map(function (a) { return devs[a]; }), lan = Object.keys(lanDevs).map(function (i) { return lanDevs[i]; });
        var counts = { all: all.length + lan.length, audio: 0, input: 0, phone: 0 };
        all.forEach(function (it) { var c = catOf(it.kind); if (counts[c] != null) counts[c]++; });
        ov.querySelectorAll('#btm-kfilters button').forEach(function (b) { var kf = b.getAttribute('data-kf'), sp = b.querySelector('em');
            if (sp) sp.textContent = counts[kf] || 0; b.classList.toggle('on', kf === kFilter); });
        var connN = Object.keys(connected).length, visLeft = Math.max(0, Math.round((visibleUntil - Date.now()) / 1000));
        if (!scanning) status((visLeft > 0 ? '👁 Visible (' + visLeft + 's) · ' : '') + connN + ' conectado(s) · ' + all.length + ' BT · ' + lan.length + ' en red');
        all.sort(function (a, b) { var n = net(), fa = n && n.isFav(a.addr) ? 1 : 0, fb = n && n.isFav(b.addr) ? 1 : 0;
            return fb !== fa ? fb - fa : (connected[b.addr] ? 1 : 0) - (connected[a.addr] ? 1 : 0); });
        var html = all.filter(function (it) { return kFilter === 'all' || catOf(it.kind) === kFilter; }).map(rowHtml).join('');
        if (kFilter === 'all') lan.forEach(function (wd) {
            html += '<div class="btm-row on"><div class="btm-top"><div class="btm-ico-wrap"><i class="bi bi-router-fill btm-ico"></i></div><div class="btm-info"><b>' + esc(wd.name) + '</b><small>Equipo TRIBALs en tu Wi-Fi/Hotspot (' + esc(wd.ip) + ')</small></div></div>' +
                '<hr class="btm-hr"><div class="btm-row-acts"><button class="tribal-btn tribal-btn-xs primary" data-act="rc"><i class="bi bi-controller"></i> Control remoto</button></div></div>'; });
        ov.querySelector('#btm-list').innerHTML = html || '<div class="btm-empty"><i class="bi bi-bluetooth"></i><p>Sin dispositivos en esta categoría.</p><small>Toca «Buscar cercanos».</small></div>'; }

    function open(d) { deps = d || {}; if (!N) N = window.TribalBtNet;
        if (window.TribalState) TribalState.opened('btmgr');
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = document.createElement('div');
        ov.className = 'tribal-overlay tribal-p2p-ov';
        ov.innerHTML = '<div class="tribal-p2p tribal-links"><div class="tribal-p2p-head">' +
                '<button class="tribal-ctrl lk-back" id="btm-back"><i class="bi bi-arrow-left"></i><span>Volver</span></button>' +
                '<i class="bi bi-bluetooth"></i><strong>Administrador Bluetooth</strong>' +
                '<button class="tribal-btn tribal-btn-xs" id="btm-sys" style="margin-left:auto"><i class="bi bi-gear-fill"></i> Ajustes</button></div>' +
            '<div class="lk-body btm-body">' +
                '<button class="btm-hero-chat" id="btm-gochat"><div class="btm-hero-ico"><i class="bi bi-chat-dots-fill"></i></div><div class="btm-hero-txt"><strong>Ir a chatear con la tribu</strong><span>Chat Bluetooth con reconexión automática</span></div><i class="bi bi-chevron-right"></i></button>' +
                '<div class="btm-grid-tiles">' +
                    '<button class="btm-tile" id="btm-scan"><i class="bi bi-radar"></i><span>Buscar cercanos</span></button>' +
                    '<button class="btm-tile" id="btm-vis"><i class="bi bi-broadcast"></i><span>Hacerme visible</span></button>' +
                    '<button class="btm-tile" id="btm-wifi"><i class="bi bi-wifi"></i><span>Analizar Wi-Fi</span></button>' +
                    '<button class="btm-tile" id="btm-hs"><i class="bi bi-broadcast-pin"></i><span>Analizar Hotspot</span></button>' +
                    '<button class="btm-tile" id="btm-rc"><i class="bi bi-controller"></i><span>Control remoto</span></button></div>' +
                '<div class="btm-cats" id="btm-kfilters">' +
                    '<button type="button" class="btm-cat on" data-kf="all"><i class="bi bi-grid-fill"></i><span>Todos</span><em>0</em></button>' +
                    '<button type="button" class="btm-cat" data-kf="audio"><i class="bi bi-headphones"></i><span>Audio</span><em>0</em></button>' +
                    '<button type="button" class="btm-cat" data-kf="input"><i class="bi bi-keyboard-fill"></i><span>Teclado / Mouse</span><em>0</em></button>' +
                    '<button type="button" class="btm-cat" data-kf="phone"><i class="bi bi-phone-fill"></i><span>Teléfonos / PC</span><em>0</em></button>' +
                '</div>' +
                '<p class="btm-status-bar" id="btm-status">Iniciando Bluetooth…</p>' +
                '<div id="btm-list" class="btm-list"></div>' +
            '</div></div>';
        (deps.mount || document.body).appendChild(ov);
        ov.querySelector('#btm-back').onclick = close; ov.querySelector('#btm-scan').onclick = function () { doScan(true); };
        ov.querySelector('#btm-sys').onclick = function () { var n = net(); if (n && n.openSettings) n.openSettings(); };
        ov.querySelector('#btm-wifi').onclick = function () { close(); if (window.TribalBtWifi) window.TribalBtWifi.open(deps, 'wifi'); };
        ov.querySelector('#btm-hs').onclick = function () { close(); if (window.TribalBtWifi) window.TribalBtWifi.open(deps, 'hotspot'); };
        ov.querySelector('#btm-vis').onclick = function () { var n = net(); if (n) { status('Solicitando visibilidad al sistema…');
            n.invite().then(function () { toast('Visibilidad solicitada — el estado se confirma abajo'); render(); }).catch(function (e) { status('No se pudo activar visibilidad: ' + e); }); } };
        ov.querySelector('#btm-gochat').onclick = function () { close(); if (window.TribalBtChat) window.TribalBtChat.open(deps); };
        ov.querySelector('#btm-rc').onclick = function () { close(); if (window.TribalRemote) window.TribalRemote.open(deps); };
        ov.querySelector('#btm-kfilters').onclick = function (e) { var b = e.target.closest('[data-kf]'); if (b) { kFilter = b.getAttribute('data-kf'); render(); } };
        ov.querySelector('#btm-list').onclick = function (e) {
            var b = e.target.closest('[data-act]'); if (!b) return; var n = net();
            var act = b.getAttribute('data-act'), addr = b.getAttribute('data-addr'), nm = b.getAttribute('data-name'), kd = b.getAttribute('data-kind');
            if (act === 'fav' && n) { var on = n.toggleFav(addr, nm, kd); toast(on ? '★ Guardado en Favoritos (se conectará solo)' : 'Quitado de Favoritos'); render(); }
            else if (act === 'pow' && n) {
                if (connected[addr]) { n.close().then(function () { delete connected[addr]; render(); }); }
                else { saveDevice(addr, nm, kd, true); toast('Conectando con ' + (nm || addr) + '…'); n.connect(addr).catch(function () {}); } }
            else if (act === 'forget') confirmDel(addr, nm);
            else if (act === 'chat') { close(); if (window.TribalBtChat) window.TribalBtChat.open(deps); }
            else if (act === 'rc') { close(); if (window.TribalRemote) window.TribalRemote.open(deps); }
        };
        boot();
    }
    function close() { if (window.TribalState) TribalState.closed('btmgr'); if (ov && ov.parentNode) ov.parentNode.removeChild(ov); ov = null; }
    return { open: open, close: close };
})();
