// === media/btremote.js (<= 200 líneas): Control Remoto & Trackpad BT + Wi-Fi ===
window.TribalRemote = (function () {
    'use strict';
    var N = window.TribalBtNet;
    var ov = null, deps = {}, mode = 'both', tab = 'pad', targetIp = '', showDevs = false;
    var btDevs = {}, btPeers = {}, wifiNets = [], wifiDevs = {}, wifiInfo = {};
    var curEl = null, curX = 180, curY = 260, hideCurT = null;

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function toast(m) { if (deps && deps.toast) deps.toast(m); }
    function activeMedia() {
        var S = (deps && deps.sono) || window.Sono;
        if (!S) return document.getElementById('media-audio');
        return (S.videoOv && !S.videoOv.hidden && S.videoEl) ? S.videoEl : S.audio;
    }

    function moveVirtualCursor(dx, dy) {
        if (!curEl) { curEl = document.createElement('div'); curEl.id = 'rc-virtual-cursor'; document.body.appendChild(curEl); }
        curX = Math.max(8, Math.min(window.innerWidth - 16, curX + dx * 1.4));
        curY = Math.max(8, Math.min(window.innerHeight - 16, curY + dy * 1.4));
        curEl.style.transform = 'translate(' + Math.round(curX) + 'px,' + Math.round(curY) + 'px)';
        curEl.classList.add('on'); clearTimeout(hideCurT);
        hideCurT = setTimeout(function () { if (curEl) curEl.classList.remove('on'); }, 3500);
    }
    function clickAtCursor(btnType) {
        if (btnType === 'mclick') return execLocal('toggle');
        var target = document.elementFromPoint(curX, curY);
        if (!target) return execLocal(btnType === 'rclick' ? 'next' : 'toggle');
        if (btnType === 'rclick') target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: curX, clientY: curY }));
        else target.click();
    }
    function execLocal(cmd, data) {
        if (cmd === 'move' && data) return moveVirtualCursor(data.dx || 0, data.dy || 0);
        if (cmd === 'lclick' || cmd === 'mclick' || cmd === 'rclick') return clickAtCursor(cmd);
        var S = (deps && deps.sono) || window.Sono, el = activeMedia();
        if (!el) return;
        if (cmd === 'toggle') {
            if (!el.src && S && S.items && S.items.length) {
                var a0 = S.items.filter(function (x) { return x.kind === 'audio'; })[0];
                if (a0 && S.playAudio) return S.playAudio(a0);
            }
            el.paused ? el.play().catch(function () {}) : el.pause();
        } else if (cmd === 'prev' && S && S.stepAudio) S.stepAudio(-1);
        else if (cmd === 'next' && S && S.stepAudio) S.stepAudio(1);
        else if (cmd === 'volup') { el.muted = false; el.volume = Math.min(1, (el.volume || 0) + 0.1); }
        else if (cmd === 'voldn') el.volume = Math.max(0, (el.volume || 1) - 0.1);
        else if (cmd === 'mute') el.muted = !el.muted;
        else if (cmd === 'seekf') el.currentTime = Math.min(el.duration || 99999, (el.currentTime || 0) + 10);
        else if (cmd === 'seekb') el.currentTime = Math.max(0, (el.currentTime || 0) - 10);
        else if (cmd === 'stop') { el.pause(); el.currentTime = 0; }
        else if (cmd === 'shuf' && S && S.prefs) { S.prefs.shuffle = !S.prefs.shuffle; if (S.savePrefs) S.savePrefs(); }
        else if (cmd === 'rep' && S && S.prefs) { S.prefs.repeat = S.prefs.repeat === 'off' ? 'all' : (S.prefs.repeat === 'all' ? 'one' : 'off'); if (S.savePrefs) S.savePrefs(); }
    }
    function sendPkt(pkt) {
        pkt.k = 'rc';
        if ((mode === 'bt' || mode === 'both') && N) N.send(pkt).catch(function () {});
        if ((mode === 'wifi' || mode === 'both') && N && N.wifiSend) N.wifiSend(pkt, targetIp || '255.255.255.255').catch(function () {});
        if (mode === 'local') execLocal(pkt.cmd, pkt);
    }
    function onNetEvt(d) {
        if (!d || !d.type) return;
        if (d.type === 'msg') { try { var m = JSON.parse(d.msg); if (m && m.k === 'rc') execLocal(m.cmd, m); } catch (e) {} }
        else if (d.type === 'device' && d.addr) { btDevs[d.addr] = { addr: d.addr, name: d.name || d.addr, kind: d.kind || 'bt' }; if (d.connected) btPeers[d.addr] = d.name || d.addr; renderDevs(); }
        else if (d.type === 'wifiDevice' && d.ip) { wifiDevs[d.ip] = { ip: d.ip, name: d.name || d.ip }; if (!targetIp) targetIp = d.ip; renderDevs(); }
        else if (d.type === 'peer') { var a = d.addr || d.name || 'peer'; if (d.state === 'open') { btPeers[a] = d.name || a; btDevs[a] = { addr: a, name: d.name || a }; } else delete btPeers[a]; renderDevs(); }
    }
    function refreshAll(fromUser) {
        if (!N) return;
        var saved = N.favs ? N.favs() : {};
        Object.keys(saved).forEach(function (a) { btDevs[a] = { addr: a, name: saved[a].name || a }; });
        N.listen().catch(function () {});
        N.devices().then(function (r) {
            ((r && r.bonded) || []).forEach(function (x) { if (x && x.addr) { btDevs[x.addr] = x; if (x.connected) btPeers[x.addr] = x.name || x.addr; } });
            renderDevs(); return N.scan(!!fromUser);
        }).catch(function () {});
        N.wifiScan().then(function (w) { wifiInfo = w || {}; wifiNets = (w && w.networks) || []; renderDevs(); }).catch(function () {});
    }

    function renderDevs() {
        if (!ov) return;
        var pCount = Object.keys(btPeers).length, wCount = Object.keys(wifiDevs).length;
        var stBtn = ov.querySelector('#rc-dev-toggle'), box = ov.querySelector('#rc-dev-drawer');
        if (stBtn) {
            stBtn.innerHTML = '<i class="bi bi-broadcast-pin"></i><span>' +
                (pCount ? pCount + ' BT conectado(s)' : Object.keys(btDevs).length + ' BT reconocidos') + ' · ' +
                (wifiInfo.currentSsid ? wifiInfo.currentSsid : (wifiNets.length + ' Wi-Fi/Hotspots')) +
                (wCount ? ' (' + wCount + ' en red)' : '') + '</span><i class="bi bi-chevron-' + (showDevs ? 'up' : 'down') + '"></i>';
        }
        if (!box) return;
        box.hidden = !showDevs;
        var html = '<div class="rc-dev-actions">' +
            '<button type="button" class="tribal-btn tribal-btn-xs primary" id="rc-scan-now"><i class="bi bi-radar"></i> Buscar BT y Hotspots</button>' +
            '<button type="button" class="tribal-btn tribal-btn-xs" id="rc-vis-now"><i class="bi bi-broadcast"></i> Hacerme visible</button>' +
            '<button type="button" class="tribal-btn tribal-btn-xs" id="rc-wifi-cfg"><i class="bi bi-wifi"></i> Wi-Fi / Hotspot</button>' +
        '</div>';
        Object.keys(btDevs).forEach(function (a) {
            var d = btDevs[a], isC = !!btPeers[a], fav = N.isFav(a);
            html += '<div class="btm-row' + (isC ? ' on' : '') + '"><i class="bi bi-bluetooth btm-ico"></i><div class="btm-info"><b>' + esc(d.name || a) + '</b><small>' + (fav ? '★ Favorito auto · ' : '') + (isC ? 'Conectado' : 'Disponible') + '</small></div>' +
                '<button class="tribal-ctrl np-doc-fav' + (fav ? ' on' : '') + '" data-rfav="' + esc(a) + '" data-rname="' + esc(d.name || a) + '"><i class="bi ' + (fav ? 'bi-star-fill' : 'bi-star') + '"></i></button>' +
                '<button class="tribal-btn tribal-btn-xs ' + (isC ? '' : 'primary') + '" data-rconn="' + esc(a) + '" data-rname="' + esc(d.name || a) + '">' + (isC ? 'Activo' : 'Conectar') + '</button></div>';
        });
        Object.keys(wifiDevs).forEach(function (ip) {
            var wd = wifiDevs[ip], on = targetIp === ip;
            html += '<div class="btm-row' + (on ? ' on' : '') + '"><i class="bi bi-router-fill btm-ico"></i><div class="btm-info"><b>' + esc(wd.name) + '</b><small>Equipo en Wi-Fi / Hotspot (' + esc(ip) + ')</small></div><button class="tribal-btn tribal-btn-xs primary" data-rip="' + esc(ip) + '">' + (on ? 'Conectado' : 'Usar IP') + '</button></div>';
        });
        wifiNets.slice(0, 6).forEach(function (w) {
            html += '<div class="btm-row' + (w.connected ? ' on' : '') + '"><i class="bi ' + (w.hotspot ? 'bi-broadcast-pin' : 'bi-wifi') + ' btm-ico"></i><div class="btm-info"><b>' + esc(w.ssid) + '</b><small>' + (w.hotspot ? 'Hotspot' : 'Wi-Fi') + ' · ' + (w.level || 0) + '%' + (w.connected ? ' · Conectada' : '') + '</small></div><button class="tribal-btn tribal-btn-xs" data-rwifi="1">' + (w.connected ? 'Activa' : 'Conectar') + '</button></div>';
        });
        box.innerHTML = html;
    }

    function initListener(sono) { if (sono) deps.sono = sono; if (N) N.init(onNetEvt); }

    function open(d) {
        deps = d || deps || {}; initListener(deps.sono);
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = document.createElement('div');
        ov.className = 'tribal-overlay tribal-p2p-ov';
        ov.innerHTML = '<div class="tribal-p2p tribal-links rc-shell">' +
            '<div class="tribal-p2p-head">' +
                '<button class="tribal-ctrl lk-back" id="rc-back"><i class="bi bi-arrow-left"></i><span>Volver</span></button>' +
                '<i class="bi bi-controller"></i><strong>Control Remoto & Trackpad</strong>' +
                '<button class="tribal-btn tribal-btn-xs" id="rc-btmgr" style="margin-left:auto"><i class="bi bi-bluetooth"></i> Todo BT/Wi-Fi</button>' +
            '</div>' +
            '<div class="lk-body rc-body">' +
                '<button type="button" class="rc-dev-bar" id="rc-dev-toggle"></button>' +
                '<div class="rc-dev-drawer" id="rc-dev-drawer" hidden></div>' +
                '<div class="rc-top-pills">' +
                    '<div class="rc-seg" id="rc-tabs"><button type="button" class="on" data-t="pad"><i class="bi bi-hand-index-thumb"></i> Trackpad Táctil</button><button type="button" data-t="btns"><i class="bi bi-disc"></i> Mandos Multimedia</button></div>' +
                    '<div class="rc-seg" id="rc-modes"><button type="button" class="on" data-m="both">BT + Wi-Fi</button><button type="button" data-m="bt">Bluetooth</button><button type="button" data-m="wifi">Wi-Fi / Hotspot</button><button type="button" data-m="local">Local</button></div>' +
                '</div>' +
                '<div id="rc-view-pad" class="rc-track-wrap">' +
                    '<div class="rc-trackpad" id="rc-surface"><div class="rc-touch-dot" id="rc-dot"></div><div class="rc-pad-hint"><i class="bi bi-arrows-move"></i><span>Área táctil completa · Desliza y toca</span></div></div>' +
                    '<div class="rc-mouse-btns"><button type="button" class="rc-mbtn" data-c="lclick"><i class="bi bi-mouse"></i><span>Izquierda</span></button><button type="button" class="rc-mbtn rc-mcenter" data-c="mclick"><i class="bi bi-play-pause"></i><span>Central</span></button><button type="button" class="rc-mbtn" data-c="rclick"><i class="bi bi-three-dots"></i><span>Derecha</span></button></div>' +
                '</div>' +
                '<div id="rc-view-btns" class="rc-dpad-wrap" hidden>' +
                    '<div class="rc-wheel"><button type="button" class="rc-w-up" data-c="volup"><i class="bi bi-volume-up-fill"></i></button><button type="button" class="rc-w-left" data-c="prev"><i class="bi bi-skip-backward-fill"></i></button><button type="button" class="rc-w-ok" data-c="toggle"><i class="bi bi-play-pause"></i></button><button type="button" class="rc-w-right" data-c="next"><i class="bi bi-skip-forward-fill"></i></button><button type="button" class="rc-w-down" data-c="voldn"><i class="bi bi-volume-down-fill"></i></button></div>' +
                    '<div class="rc-quick-row"><button type="button" data-c="mute"><i class="bi bi-volume-mute-fill"></i><span>Mute</span></button><button type="button" data-c="seekb"><i class="bi bi-rewind-fill"></i><span>-10s</span></button><button type="button" data-c="stop"><i class="bi bi-stop-fill"></i><span>Stop</span></button><button type="button" data-c="seekf"><i class="bi bi-fast-forward-fill"></i><span>+10s</span></button><button type="button" data-c="rep"><i class="bi bi-repeat"></i><span>Repetir</span></button><button type="button" data-c="shuf"><i class="bi bi-shuffle"></i><span>Azar</span></button></div>' +
                '</div>' +
            '</div></div>';
        (deps.mount || document.body).appendChild(ov);
        ov.querySelector('#rc-back').onclick = close;
        ov.querySelector('#rc-btmgr').onclick = function () { close(); if (window.TribalBtMgr) window.TribalBtMgr.open(deps); };
        ov.querySelector('#rc-dev-toggle').onclick = function () { showDevs = !showDevs; renderDevs(); };
        ov.querySelector('#rc-dev-drawer').onclick = function (e) {
            if (e.target.closest('#rc-scan-now')) return refreshAll(true);
            if (e.target.closest('#rc-vis-now') && N) return N.invite().then(function () { toast('Visible por 5 min'); });
            if (e.target.closest('#rc-wifi-cfg') && N) return N.openWifiSettings();
            var fv = e.target.closest('[data-rfav]');
            if (fv && N) { var on = N.toggleFav(fv.getAttribute('data-rfav'), fv.getAttribute('data-rname'), 'bt'); toast(on ? '★ Favorito auto-conectable' : 'Quitado de favoritos'); renderDevs(); return; }
            var cn = e.target.closest('[data-rconn]');
            if (cn && N) { var ad = cn.getAttribute('data-rconn'), nm = cn.getAttribute('data-rname'); N.setFav(ad, nm, 'bt', true); toast('Conectando con ' + nm + '…'); N.connect(ad); renderDevs(); return; }
            var ipB = e.target.closest('[data-rip]');
            if (ipB) { targetIp = ipB.getAttribute('data-rip'); toast('Conectado a Wi-Fi IP ' + targetIp); renderDevs(); return; }
            if (e.target.closest('[data-rwifi]') && N) N.openWifiSettings();
        };
        ov.querySelector('#rc-tabs').onclick = function (e) {
            var b = e.target.closest('[data-t]'); if (!b) return;
            tab = b.getAttribute('data-t');
            ov.querySelectorAll('#rc-tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
            ov.querySelector('#rc-view-pad').hidden = tab !== 'pad';
            ov.querySelector('#rc-view-btns').hidden = tab !== 'btns';
        };
        ov.querySelector('#rc-modes').onclick = function (e) {
            var b = e.target.closest('[data-m]'); if (!b) return;
            mode = b.getAttribute('data-m');
            ov.querySelectorAll('#rc-modes button').forEach(function (x) { x.classList.toggle('on', x === b); });
        };
        ov.addEventListener('click', function (e) { var b = e.target.closest('[data-c]'); if (b) sendPkt({ cmd: b.getAttribute('data-c') }); });
        wireTrackpad(ov.querySelector('#rc-surface'), ov.querySelector('#rc-dot'));
        refreshAll(false);
    }

    function wireTrackpad(surf, dot) {
        var down = false, lx = 0, ly = 0, moved = false, t0 = 0;
        surf.addEventListener('pointerdown', function (e) {
            down = true; moved = false; t0 = Date.now(); lx = e.clientX; ly = e.clientY;
            var r = surf.getBoundingClientRect();
            dot.style.left = (e.clientX - r.left) + 'px'; dot.style.top = (e.clientY - r.top) + 'px';
            dot.classList.add('on'); try { surf.setPointerCapture(e.pointerId); } catch (er) {}
        });
        surf.addEventListener('pointermove', function (e) {
            if (!down) return;
            var dx = e.clientX - lx, dy = e.clientY - ly;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
            lx = e.clientX; ly = e.clientY;
            var r = surf.getBoundingClientRect();
            dot.style.left = Math.max(12, Math.min(r.width - 12, e.clientX - r.left)) + 'px';
            dot.style.top = Math.max(12, Math.min(r.height - 12, e.clientY - r.top)) + 'px';
            sendPkt({ cmd: 'move', dx: Math.round(dx), dy: Math.round(dy) });
        });
        function up() { if (!down) return; down = false; dot.classList.remove('on'); if (!moved && Date.now() - t0 < 280) sendPkt({ cmd: 'lclick' }); }
        surf.addEventListener('pointerup', up); surf.addEventListener('pointercancel', up);
    }

    function close() { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); ov = null; }
    return { open: open, close: close, initListener: initListener, execLocal: execLocal };
})();
