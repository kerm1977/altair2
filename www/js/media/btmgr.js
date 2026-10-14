// === media/btmgr.js (<= 200 líneas): Administrador Bluetooth universal ===
window.TribalBtMgr = (function () {
    'use strict';
    var N = window.TribalBtNet, FAV_KEY = 'tribu_btfavs';
    var ov = null, deps = {}, near = {}, bonded = {}, connected = {}, scanning = false, kFilter = 'all';

    var KIND_META = {
        audio:    { ico: 'bi-headphones',    lbl: 'Audífonos / Audio' },
        keyboard: { ico: 'bi-keyboard-fill', lbl: 'Teclado BT' },
        mouse:    { ico: 'bi-mouse2-fill',   lbl: 'Mouse / Trackpad' },
        input:    { ico: 'bi-controller',    lbl: 'Control / Periférico' },
        phone:    { ico: 'bi-phone-fill',    lbl: 'Teléfono' },
        pc:       { ico: 'bi-laptop',        lbl: 'Computadora' },
        wear:     { ico: 'bi-smartwatch',    lbl: 'Reloj / Wearable' },
        bt:       { ico: 'bi-bluetooth',     lbl: 'Dispositivo BT' }
    };

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function toast(m) { if (deps && deps.toast) deps.toast(m); }
    function guessKind(name, k) {
        if (k && k !== 'bt') return k;
        var n = String(name || '').toLowerCase();
        if (/airpod|buds|headphone|speaker|audifon|auricular|jbl|sony|bose|sound|parlante/.test(n)) return 'audio';
        if (/keyb|teclado/.test(n)) return 'keyboard';
        if (/mouse|raton|trackpad/.test(n)) return 'mouse';
        if (/gamepad|xbox|playstation|controller|control/.test(n)) return 'input';
        if (/galaxy|iphone|redmi|moto|pixel|phone|tribu/.test(n)) return 'phone';
        return k || 'bt';
    }
    function loadSaved() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '{}'); } catch (e) { return {}; } }
    function saveDevice(addr, name, kind) {
        if (!addr) return;
        var f = loadSaved(), prev = f[addr] || {};
        f[addr] = { name: name || prev.name || addr, kind: guessKind(name || prev.name, kind || prev.kind), ts: Date.now() };
        try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); } catch (e) {}
    }
    function forgetDevice(addr) {
        var f = loadSaved(); delete f[addr];
        try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); } catch (e) {}
        render(); toast('Dispositivo olvidado');
    }

    function onNetEvent(d) {
        if (!d || !d.type) return;
        if (d.type === 'device' && d.addr) {
            near[d.addr] = { addr: d.addr, name: d.name || d.addr, kind: guessKind(d.name, d.kind) };
            render();
        } else if (d.type === 'scanDone') {
            scanning = false; render();
        } else if (d.type === 'peer') {
            if (d.state === 'open') {
                var k = d.addr || d.name || 'peer';
                connected[k] = { name: d.name || k, kind: guessKind(d.name, d.kind) };
                if (d.addr) saveDevice(d.addr, d.name, d.kind);
                toast('Conectado: ' + (d.name || k));
            } else {
                if (d.addr) delete connected[d.addr]; else connected = {};
            }
            render();
        }
    }

    function refreshBonded() {
        if (!N) return Promise.resolve();
        return N.devices().then(function (r) {
            bonded = {};
            ((r && r.bonded) || []).forEach(function (x) {
                if (x && x.addr) {
                    var kd = guessKind(x.name, x.kind);
                    bonded[x.addr] = { addr: x.addr, name: x.name || x.addr, kind: kd };
                    saveDevice(x.addr, x.name, kd);
                }
            });
            render();
        }).catch(function () {});
    }

    function doScan() {
        if (!N) return;
        scanning = true; near = {}; render();
        N.ensurePerms().then(refreshBonded).then(function () { return N.scan(); }).catch(function () {
            scanning = false; render(); toast('Activa el Bluetooth para buscar');
        });
    }

    function passFilter(kd) {
        if (kFilter === 'all') return true;
        if (kFilter === 'input') return kd === 'keyboard' || kd === 'mouse' || kd === 'input';
        return kd === kFilter;
    }

    function rowHtml(addr, name, kd, tag, isConn, isSaved) {
        var m = KIND_META[kd] || KIND_META.bt;
        return '<div class="btm-row' + (isConn ? ' on' : '') + '" data-addr="' + esc(addr) + '">' +
            '<i class="bi ' + m.ico + ' btm-ico"></i>' +
            '<div class="btm-info"><b>' + esc(name || addr) + '</b><small>' + m.lbl + ' · ' + tag + '</small></div>' +
            (isConn
                ? '<button class="tribal-btn tribal-btn-xs" data-act="chat" data-addr="' + esc(addr) + '"><i class="bi bi-chat-dots-fill"></i></button>' +
                  '<button class="tribal-btn tribal-btn-xs danger" data-act="disc"><i class="bi bi-x-circle"></i></button>'
                : '<button class="tribal-btn tribal-btn-xs primary" data-act="conn" data-addr="' + esc(addr) + '" data-name="' + esc(name || addr) + '" data-kind="' + esc(kd) + '">Conectar</button>') +
            (isSaved ? '<button class="tribal-btn tribal-btn-xs" data-act="forget" data-addr="' + esc(addr) + '" title="Olvidar"><i class="bi bi-trash3"></i></button>' : '') +
        '</div>';
    }

    function render() {
        if (!ov) return;
        var st = ov.querySelector('#btm-status'), box = ov.querySelector('#btm-list');
        var connKeys = Object.keys(connected);
        st.textContent = scanning ? 'Buscando audífonos, teclados, mouses y teléfonos cercanos…'
            : (connKeys.length ? connKeys.length + ' dispositivo(s) conectado(s)' : 'Listo para emparejar o conectar cualquier dispositivo Bluetooth');
        var saved = loadSaved(), seen = {}, html = '';
        if (connKeys.length) {
            html += '<h6 class="btm-sec">Conectados ahora</h6>';
            connKeys.forEach(function (a) {
                seen[a] = 1; var c = connected[a], kd = guessKind(c.name, c.kind);
                if (passFilter(kd)) html += rowHtml(a, c.name, kd, 'Conectado', true, !!saved[a]);
            });
        }
        var nearKeys = Object.keys(near).filter(function (a) { return !seen[a] && passFilter(near[a].kind); });
        if (nearKeys.length) {
            html += '<h6 class="btm-sec">Dispositivos cercanos detectados</h6>';
            nearKeys.forEach(function (a) { seen[a] = 1; html += rowHtml(a, near[a].name, near[a].kind, 'Disponible', false, !!saved[a]); });
        }
        var savedKeys = Object.keys(saved).concat(Object.keys(bonded)).filter(function (a) {
            if (seen[a]) return false; seen[a] = 1;
            var kd = guessKind((saved[a] && saved[a].name) || (bonded[a] && bonded[a].name), (saved[a] && saved[a].kind) || (bonded[a] && bonded[a].kind));
            return passFilter(kd);
        });
        if (savedKeys.length) {
            html += '<h6 class="btm-sec">Recordados y emparejados</h6>';
            savedKeys.forEach(function (a) {
                var nm = (saved[a] && saved[a].name) || (bonded[a] && bonded[a].name) || a;
                var kd = guessKind(nm, (saved[a] && saved[a].kind) || (bonded[a] && bonded[a].kind));
                html += rowHtml(a, nm, kd, 'Guardado', false, true);
            });
        }
        box.innerHTML = html || '<p class="np-hint">No hay dispositivos en esta categoría. Toca «Buscar cerca» o «Audífonos/Teclado».</p>';
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
            '</div>' +
            '<div class="lk-body btm-body">' +
                '<button class="btm-hero-chat" id="btm-gochat">' +
                    '<div class="btm-hero-ico"><i class="bi bi-chat-dots-fill"></i></div>' +
                    '<div class="btm-hero-txt"><strong>Ir a chatear con la tribu</strong>' +
                        '<span>Abre el chat Bluetooth multi-equipo con voz, fotos y canciones</span></div>' +
                    '<i class="bi bi-chevron-right"></i>' +
                '</button>' +
                '<div class="btm-grid-tiles">' +
                    '<button class="btm-tile" id="btm-scan"><i class="bi bi-radar"></i><span>Buscar cerca</span></button>' +
                    '<button class="btm-tile" id="btm-pair"><i class="bi bi-headphones"></i><span>Audífonos/Teclado</span></button>' +
                    '<button class="btm-tile" id="btm-vis"><i class="bi bi-broadcast"></i><span>Hacer visible</span></button>' +
                    '<button class="btm-tile" id="btm-rc"><i class="bi bi-controller"></i><span>Control remoto</span></button>' +
                '</div>' +
                '<div class="rc-seg" id="btm-kfilters">' +
                    '<button type="button" class="on" data-kf="all">Todos</button>' +
                    '<button type="button" data-kf="audio"><i class="bi bi-headphones"></i> Audio</button>' +
                    '<button type="button" data-kf="input"><i class="bi bi-keyboard"></i> Teclado/Mouse</button>' +
                    '<button type="button" data-kf="phone"><i class="bi bi-phone"></i> Teléfonos</button>' +
                '</div>' +
                '<p class="btm-status-bar" id="btm-status">Iniciando Bluetooth…</p>' +
                '<div id="btm-list" class="btm-list"></div>' +
            '</div></div>';
        (deps.mount || document.body).appendChild(ov);
        ov.querySelector('#btm-back').onclick = close;
        ov.querySelector('#btm-scan').onclick = doScan;
        ov.querySelector('#btm-pair').onclick = function () { if (N && N.openSettings) N.openSettings(); };
        ov.querySelector('#btm-vis').onclick = function () { if (N) N.invite().then(function () { toast('Visible por 5 minutos'); }); };
        ov.querySelector('#btm-gochat').onclick = function () { close(); if (window.TribalBtChat) window.TribalBtChat.open(deps); };
        ov.querySelector('#btm-rc').onclick = function () { close(); if (window.TribalRemote) window.TribalRemote.open(deps); };
        ov.querySelector('#btm-kfilters').onclick = function (e) {
            var b = e.target.closest('[data-kf]'); if (!b) return;
            kFilter = b.getAttribute('data-kf');
            ov.querySelectorAll('#btm-kfilters button').forEach(function (x) { x.classList.toggle('on', x === b); });
            render();
        };
        ov.querySelector('#btm-list').onclick = function (e) {
            var b = e.target.closest('[data-act]'); if (!b) return;
            var act = b.getAttribute('data-act'), addr = b.getAttribute('data-addr'), nm = b.getAttribute('data-name'), kd = b.getAttribute('data-kind');
            if (act === 'conn' && N) { saveDevice(addr, nm, kd); toast('Conectando con ' + (nm || addr) + '…'); N.connect(addr).catch(function () { toast('No se pudo conectar'); }); }
            else if (act === 'disc' && N) N.close().then(function () { connected = {}; render(); });
            else if (act === 'forget') forgetDevice(addr);
            else if (act === 'chat') { close(); if (window.TribalBtChat) window.TribalBtChat.open(deps); }
        };
        if (N) N.init(onNetEvent).then(doScan);
    }
    function close() { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); ov = null; }
    return { open: open, close: close };
})();
