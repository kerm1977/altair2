// === media/btmgr.js (<= 200 líneas): Administrador Bluetooth universal ===
window.TribalBtMgr = (function () {
    'use strict';
    var N = window.TribalBtNet, FAV_KEY = 'tribu_btfavs';
    var ov = null, deps = {}, devs = {}, connected = {}, scanning = false, visibleUntil = 0, kFilter = 'all';

    var KIND_META = {
        audio: { ico: 'bi-headphones', lbl: 'Audífonos / Audio' }, keyboard: { ico: 'bi-keyboard-fill', lbl: 'Teclado BT' },
        mouse: { ico: 'bi-mouse2-fill', lbl: 'Mouse / Trackpad' }, input: { ico: 'bi-controller', lbl: 'Control / Periférico' },
        phone: { ico: 'bi-phone-fill', lbl: 'Teléfono' }, pc: { ico: 'bi-laptop', lbl: 'Computadora' },
        wear: { ico: 'bi-smartwatch', lbl: 'Reloj / Wearable' }, bt: { ico: 'bi-bluetooth', lbl: 'Dispositivo BT' }
    };
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function toast(m) { if (deps && deps.toast) deps.toast(m); }
    function guessKind(name, k) {
        if (k && k !== 'bt') return k;
        var n = String(name || '').toLowerCase();
        if (/airpod|buds|headphone|speaker|audifon|auricular|jbl|sony|bose|sound|parlante|cascos|estereo/.test(n)) return 'audio';
        if (/keyb|teclado/.test(n)) return 'keyboard';
        if (/mouse|raton|trackpad/.test(n)) return 'mouse';
        if (/gamepad|xbox|playstation|controller|control|mando/.test(n)) return 'input';
        if (/galaxy|iphone|redmi|moto|pixel|huawei|xiaomi|honor|poco|phone|tribu|android/.test(n)) return 'phone';
        if (/pc|laptop|macbook|windows|desktop/.test(n)) return 'pc';
        return k || 'bt';
    }
    function loadSaved() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '{}'); } catch (e) { return {}; } }
    function saveDevice(addr, name, kind) {
        if (!addr) return;
        var f = loadSaved(), prev = f[addr] || {}, nm = name || prev.name || addr, kd = guessKind(nm, kind || prev.kind);
        f[addr] = { name: nm, addr: addr, kind: kd, ts: Date.now() };
        devs[addr] = { name: nm, addr: addr, kind: kd, saved: true };
        try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); } catch (e) {}
    }
    function forgetDevice(addr) {
        var f = loadSaved(); delete f[addr]; delete devs[addr]; delete connected[addr];
        try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); } catch (e) {}
        render(); toast('Dispositivo eliminado');
    }
    function onNetEvent(d) {
        if (!d || !d.type) return;
        if (d.type === 'device' && d.addr) {
            var kd = guessKind(d.name, d.kind);
            devs[d.addr] = { addr: d.addr, name: d.name || d.addr, kind: kd, near: true, bonded: !!d.bonded };
            if (d.connected) connected[d.addr] = { name: d.name || d.addr, kind: kd };
            if (d.bonded) saveDevice(d.addr, d.name, kd);
            render();
        } else if (d.type === 'scanDone') { scanning = false; render(); }
        else if (d.type === 'peer') {
            var a = d.addr || d.name || 'peer';
            if (d.state === 'open') {
                var kp = guessKind(d.name, d.kind);
                connected[a] = { name: d.name || a, kind: kp };
                saveDevice(a, d.name || a, kp); toast('Conectado con ' + (d.name || a));
            } else if (d.state === 'closed' || d.state === 'error') {
                delete connected[a]; if (d.state === 'error' && d.msg) toast('Aviso BT: ' + d.msg);
            }
            render();
        }
    }

    function hydrateAll() {
        var saved = loadSaved();
        Object.keys(saved).forEach(function (a) {
            var s = saved[a];
            devs[a] = { addr: a, name: s.name || a, kind: guessKind(s.name, s.kind), saved: true };
        });
        if (!N) { render(); return Promise.resolve(); }
        return N.devices().then(function (r) {
            ((r && r.bonded) || []).forEach(function (x) {
                if (!x || !x.addr) return;
                var kd = guessKind(x.name, x.kind);
                devs[x.addr] = { addr: x.addr, name: x.name || x.addr, kind: kd, bonded: true, saved: true };
                if (x.connected) connected[x.addr] = { name: x.name || x.addr, kind: kd };
                saveDevice(x.addr, x.name, kd);
            });
            render();
        }).catch(function () { render(); });
    }

    function doScan(fromUser) {
        if (!N) return;
        scanning = true; render();
        hydrateAll().then(function () { return N.scan(!!fromUser); }).catch(function (err) {
            scanning = false; render();
            toast('Activa el Bluetooth y permisos de ubicación (' + String((err && err.message) || err || '') + ')');
        });
    }

    function catOf(kd) {
        if (kd === 'audio') return 'audio';
        if (kd === 'keyboard' || kd === 'mouse' || kd === 'input') return 'input';
        if (kd === 'phone' || kd === 'pc') return 'phone';
        return 'other';
    }

    function rowHtml(it) {
        var isConn = !!connected[it.addr], m = KIND_META[it.kind] || KIND_META.bt;
        var stTxt = isConn ? 'Conectado' : (it.near ? 'Cercano disponible' : (it.bonded ? 'Emparejado' : 'Guardado'));
        return '<div class="btm-row' + (isConn ? ' on' : '') + '" data-addr="' + esc(it.addr) + '">' +
            '<div class="btm-ico-wrap"><i class="bi ' + m.ico + ' btm-ico"></i></div>' +
            '<div class="btm-info"><b>' + esc(it.name || it.addr) + '</b><small>' + m.lbl + ' · ' + stTxt + '</small></div>' +
            '<div class="btm-row-acts">' +
                (isConn
                    ? '<button class="tribal-btn tribal-btn-xs" data-act="chat" data-addr="' + esc(it.addr) + '" title="Chatear"><i class="bi bi-chat-dots-fill"></i></button>' +
                      '<button class="tribal-btn tribal-btn-xs" data-act="rc" title="Control remoto"><i class="bi bi-controller"></i></button>' +
                      '<button class="tribal-btn tribal-btn-xs danger" data-act="disc" title="Desconectar"><i class="bi bi-x-circle"></i></button>'
                    : '<button class="tribal-btn tribal-btn-xs primary" data-act="conn" data-addr="' + esc(it.addr) + '" data-name="' + esc(it.name || it.addr) + '" data-kind="' + esc(it.kind) + '">Conectar</button>') +
                '<button class="tribal-btn tribal-btn-xs" data-act="forget" data-addr="' + esc(it.addr) + '" title="Olvidar"><i class="bi bi-trash3"></i></button>' +
            '</div></div>';
    }

    function render() {
        if (!ov) return;
        var all = Object.keys(devs).map(function (a) { return devs[a]; });
        var counts = { all: all.length, audio: 0, input: 0, phone: 0 };
        all.forEach(function (it) { var c = catOf(it.kind); if (counts[c] != null) counts[c]++; });
        ov.querySelectorAll('#btm-kfilters button').forEach(function (b) {
            var kf = b.getAttribute('data-kf'), sp = b.querySelector('em');
            if (sp) sp.textContent = counts[kf] || 0;
            b.classList.toggle('on', kf === kFilter);
        });
        var connN = Object.keys(connected).length, visLeft = Math.max(0, Math.round((visibleUntil - Date.now()) / 1000));
        ov.querySelector('#btm-status').textContent = (scanning ? '📡 Escaneando dispositivos cercanos… ' : '') +
            (visLeft > 0 ? '👁 Visible (' + visLeft + 's) · ' : '') + (connN ? connN + ' conectado(s) · ' : '') + all.length + ' dispositivo(s) encontrados';
        var filtered = all.filter(function (it) { return kFilter === 'all' || catOf(it.kind) === kFilter; });
        filtered.sort(function (a, b) { return (connected[b.addr] ? 1 : 0) - (connected[a.addr] ? 1 : 0); });
        ov.querySelector('#btm-list').innerHTML = filtered.length ? filtered.map(rowHtml).join('')
            : '<div class="btm-empty"><i class="bi bi-bluetooth"></i><p>No hay dispositivos en esta vista.</p><small>Toca «Buscar cercanos» para escanear o «Ajustes BT» para vincular audífonos, teclado o mouse nuevos.</small></div>';
    }

    function sendBtFile(file) {
        if (!file || !deps || !deps.store) return;
        toast('Preparando «' + file.name + '» para enviar por Bluetooth…');
        deps.store.add(file).then(function (meta) {
            if (deps.reload) deps.reload();
            return deps.store.shareBluetooth ? deps.store.shareBluetooth(meta) : (deps.store.share ? deps.store.share(meta) : null);
        }).catch(function () { toast('No se pudo enviar el archivo por Bluetooth'); });
    }

    function open(d) {
        deps = d || {};
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = document.createElement('div');
        ov.className = 'tribal-overlay tribal-p2p-ov';
        ov.innerHTML = '<div class="tribal-p2p tribal-links">' +
            '<div class="tribal-p2p-head">' +
                '<button class="tribal-ctrl lk-back" id="btm-back"><i class="bi bi-arrow-left"></i><span>Volver</span></button>' +
                '<i class="bi bi-bluetooth"></i><strong>Administrador Bluetooth</strong>' +
                '<button class="tribal-btn tribal-btn-xs" id="btm-sys" style="margin-left:auto"><i class="bi bi-gear-fill"></i> Ajustes BT</button>' +
            '</div>' +
            '<div class="lk-body btm-body">' +
                '<button class="btm-hero-chat" id="btm-gochat">' +
                    '<div class="btm-hero-ico"><i class="bi bi-chat-dots-fill"></i></div>' +
                    '<div class="btm-hero-txt"><strong>Ir a chatear con la tribu</strong><span>Abre el chat Bluetooth multi-equipo con voz, fotos y canciones</span></div>' +
                    '<i class="bi bi-chevron-right"></i>' +
                '</button>' +
                '<div class="btm-grid-tiles">' +
                    '<button class="btm-tile" id="btm-scan"><i class="bi bi-radar"></i><span>Buscar cercanos</span></button>' +
                    '<button class="btm-tile" id="btm-vis"><i class="bi bi-broadcast"></i><span>Hacerme visible</span></button>' +
                    '<button class="btm-tile" id="btm-sendf"><i class="bi bi-file-earmark-arrow-up"></i><span>Enviar archivo BT</span></button>' +
                    '<button class="btm-tile" id="btm-rc"><i class="bi bi-controller"></i><span>Control remoto</span></button>' +
                '</div>' +
                '<input type="file" id="btm-file-in" hidden>' +
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
        ov.querySelector('#btm-back').onclick = close;
        ov.querySelector('#btm-scan').onclick = function () { doScan(true); };
        ov.querySelector('#btm-sys').onclick = function () { if (N && N.openSettings) N.openSettings(); };
        ov.querySelector('#btm-vis').onclick = function () {
            if (!N) return;
            N.invite().then(function () { visibleUntil = Date.now() + 300000; toast('Ahora eres visible por 5 minutos'); render(); }).catch(function () { toast('Activa los permisos Bluetooth en Ajustes'); });
        };
        ov.querySelector('#btm-sendf').onclick = function () { ov.querySelector('#btm-file-in').click(); };
        ov.querySelector('#btm-file-in').onchange = function () { var f = this.files && this.files[0]; this.value = ''; if (f) sendBtFile(f); };
        ov.querySelector('#btm-gochat').onclick = function () { close(); if (window.TribalBtChat) window.TribalBtChat.open(deps); };
        ov.querySelector('#btm-rc').onclick = function () { close(); if (window.TribalRemote) window.TribalRemote.open(deps); };
        ov.querySelector('#btm-kfilters').onclick = function (e) { var b = e.target.closest('[data-kf]'); if (b) { kFilter = b.getAttribute('data-kf'); render(); } };
        ov.querySelector('#btm-list').onclick = function (e) {
            var b = e.target.closest('[data-act]'); if (!b) return;
            var act = b.getAttribute('data-act'), addr = b.getAttribute('data-addr'), nm = b.getAttribute('data-name'), kd = b.getAttribute('data-kind');
            if (act === 'conn' && N) { saveDevice(addr, nm, kd); toast('Conectando con ' + (nm || addr) + '…'); N.connect(addr).catch(function () { toast('No se pudo conectar'); }); }
            else if (act === 'disc' && N) N.close().then(function () { delete connected[addr]; render(); });
            else if (act === 'forget') forgetDevice(addr);
            else if (act === 'chat') { close(); if (window.TribalBtChat) window.TribalBtChat.open(deps); }
            else if (act === 'rc') { close(); if (window.TribalRemote) window.TribalRemote.open(deps); }
        };
        if (N) N.init(onNetEvent).then(function () { doScan(false); });
    }
    function close() { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); ov = null; }
    return { open: open, close: close };
})();
