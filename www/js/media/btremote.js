// ============================================================================
// ARCHIVO: media/btremote.js (<= 200 líneas)
// RESPONSABILIDAD: Control Remoto Multimedia por Bluetooth y Wi-Fi.
//   - Envía y recibe comandos multimedia (play, pause, toggle, prev, next,
//     volup, voldn, mute, seekf, seekb, stop, repeat, shuffle)
//   - Por Bluetooth: usa TribalBtNet (RFCOMM entre dispositivos TRIBALs)
//   - Por Wi-Fi / Red local: BroadcastChannel + WebSocket / HTTP local opcional
// ============================================================================
window.TribalRemote = (function () {
    'use strict';

    var N = window.TribalBtNet;
    var ov = null, deps = {}, mode = 'both', wifiUrl = '', ws = null, bc = null;
    var WIFI_KEY = 'tribu_remote_wifi';
    try { wifiUrl = localStorage.getItem(WIFI_KEY) || ''; } catch (e) {}

    function activeMedia() {
        var S = (deps && deps.sono) || window.Sono;
        if (!S) return document.getElementById('media-audio');
        return (S.videoOv && !S.videoOv.hidden && S.videoEl) ? S.videoEl : S.audio;
    }

    // Ejecuta un comando recibido sobre el reproductor local de TRIBALs
    function execLocal(cmd) {
        var S = (deps && deps.sono) || window.Sono;
        var el = activeMedia();
        if (!el) return;
        if (cmd === 'toggle') {
            if (!el.src && S && S.items && S.items.length) {
                var a0 = S.items.filter(function (x) { return x.kind === 'audio'; })[0];
                if (a0 && S.playAudio) return S.playAudio(a0);
            }
            el.paused ? el.play().catch(function () {}) : el.pause();
        } else if (cmd === 'play') { el.play().catch(function () {}); }
        else if (cmd === 'pause') { el.pause(); }
        else if (cmd === 'prev' && S && S.stepAudio) { S.stepAudio(-1); }
        else if (cmd === 'next' && S && S.stepAudio) { S.stepAudio(1); }
        else if (cmd === 'volup') { el.muted = false; el.volume = Math.min(1, (el.volume || 0) + 0.1); }
        else if (cmd === 'voldn') { el.volume = Math.max(0, (el.volume || 1) - 0.1); }
        else if (cmd === 'mute') { el.muted = !el.muted; }
        else if (cmd === 'seekf') { el.currentTime = Math.min(el.duration || 99999, (el.currentTime || 0) + 10); }
        else if (cmd === 'seekb') { el.currentTime = Math.max(0, (el.currentTime || 0) - 10); }
        else if (cmd === 'stop') { el.pause(); el.currentTime = 0; }
        else if (cmd === 'shuf' && S && S.prefs) { S.prefs.shuffle = !S.prefs.shuffle; if (S.savePrefs) S.savePrefs(); }
        else if (cmd === 'rep' && S && S.prefs) {
            S.prefs.repeat = S.prefs.repeat === 'off' ? 'all' : (S.prefs.repeat === 'all' ? 'one' : 'off');
            if (S.savePrefs) S.savePrefs();
        }
    }

    function sendCmd(cmd) {
        var pkt = { k: 'rc', cmd: cmd, ts: Date.now() };
        if (mode === 'bt' || mode === 'both') {
            if (N) N.send(pkt).catch(function () {});
        }
        if (mode === 'wifi' || mode === 'both') {
            if (bc) { try { bc.postMessage(pkt); } catch (e) {} }
            if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(pkt)); } catch (e) {} }
            if (wifiUrl && /^https?:\/\//i.test(wifiUrl) && window.fetch) {
                fetch(wifiUrl.replace(/\/$/, '') + '/rc?cmd=' + encodeURIComponent(cmd), { method: 'POST', mode: 'no-cors' }).catch(function () {});
            }
        }
        if (mode === 'local') execLocal(cmd);
    }

    function connectWifi(url) {
        wifiUrl = String(url || '').trim();
        try { localStorage.setItem(WIFI_KEY, wifiUrl); } catch (e) {}
        if (ws) { try { ws.close(); } catch (e) {} ws = null; }
        if (/^wss?:\/\//i.test(wifiUrl) && window.WebSocket) {
            try {
                ws = new WebSocket(wifiUrl);
                ws.onmessage = function (ev) {
                    try { var d = JSON.parse(ev.data); if (d && d.k === 'rc') execLocal(d.cmd); } catch (e) {}
                };
            } catch (e) {}
        }
    }

    function initListener(sono) {
        if (sono) deps.sono = sono;
        if (N) {
            N.init(function (d) {
                if (!d || d.type !== 'msg') return;
                try {
                    var m = JSON.parse(d.msg);
                    if (m && m.k === 'rc' && m.cmd) execLocal(m.cmd);
                } catch (e) {}
            });
        }
        if ('BroadcastChannel' in window && !bc) {
            bc = new BroadcastChannel('tribu-wifi-rc');
            bc.onmessage = function (ev) {
                var d = ev.data;
                if (d && d.k === 'rc' && d.cmd) execLocal(d.cmd);
            };
        }
        if (wifiUrl) connectWifi(wifiUrl);
    }

    function open(d) {
        deps = d || deps || {};
        initListener(deps.sono);
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = document.createElement('div');
        ov.className = 'tribal-overlay tribal-p2p-ov';
        ov.innerHTML = '<div class="tribal-p2p tribal-links">' +
            '<div class="tribal-p2p-head">' +
                '<button class="tribal-ctrl lk-back" id="rc-back"><i class="bi bi-arrow-left"></i><span>Volver</span></button>' +
                '<i class="bi bi-controller"></i><strong>Control Remoto (BT + Wi-Fi)</strong>' +
            '</div>' +
            '<div class="lk-body rc-body">' +
                '<div class="rc-modes">' +
                    '<button class="tribal-btn tribal-btn-xs primary" data-m="both"><i class="bi bi-broadcast"></i> BT + Wi-Fi</button>' +
                    '<button class="tribal-btn tribal-btn-xs" data-m="bt"><i class="bi bi-bluetooth"></i> Solo Bluetooth</button>' +
                    '<button class="tribal-btn tribal-btn-xs" data-m="wifi"><i class="bi bi-wifi"></i> Solo Wi-Fi</button>' +
                    '<button class="tribal-btn tribal-btn-xs" data-m="local"><i class="bi bi-phone"></i> Este equipo</button>' +
                '</div>' +
                '<div class="rc-wifi-bar">' +
                    '<input type="text" id="rc-wifi-in" class="tribal-input" placeholder="IP/WebSocket Wi-Fi opcional (ej. ws://192.168.1.50:8080)" value="' + wifiUrl.replace(/"/g, '&quot;') + '">' +
                    '<button class="tribal-btn tribal-btn-xs" id="rc-btmgr"><i class="bi bi-bluetooth"></i> Equipos BT</button>' +
                '</div>' +
                '<div class="rc-pad">' +
                    '<button class="rc-btn" data-c="voldn" title="Bajar volumen"><i class="bi bi-volume-down-fill"></i><span>Vol -</span></button>' +
                    '<button class="rc-btn" data-c="mute" title="Silenciar"><i class="bi bi-volume-mute-fill"></i><span>Mute</span></button>' +
                    '<button class="rc-btn" data-c="volup" title="Subir volumen"><i class="bi bi-volume-up-fill"></i><span>Vol +</span></button>' +
                    '<button class="rc-btn" data-c="prev" title="Anterior"><i class="bi bi-skip-backward-fill"></i><span>Anterior</span></button>' +
                    '<button class="rc-btn rc-play" data-c="toggle" title="Play / Pausa"><i class="bi bi-play-pause"></i><span>Play/Pausa</span></button>' +
                    '<button class="rc-btn" data-c="next" title="Siguiente"><i class="bi bi-skip-forward-fill"></i><span>Siguiente</span></button>' +
                    '<button class="rc-btn" data-c="seekb" title="Retroceder 10s"><i class="bi bi-rewind-fill"></i><span>-10s</span></button>' +
                    '<button class="rc-btn" data-c="stop" title="Detener"><i class="bi bi-stop-fill"></i><span>Stop</span></button>' +
                    '<button class="rc-btn" data-c="seekf" title="Adelantar 10s"><i class="bi bi-fast-forward-fill"></i><span>+10s</span></button>' +
                    '<button class="rc-btn" data-c="rep" title="Repetir"><i class="bi bi-repeat"></i><span>Repetir</span></button>' +
                    '<button class="rc-btn" data-c="shuf" title="Aleatorio"><i class="bi bi-shuffle"></i><span>Aleatorio</span></button>' +
                '</div>' +
            '</div></div>';
        (deps.mount || document.body).appendChild(ov);
        ov.querySelector('#rc-back').onclick = close;
        ov.querySelector('#rc-btmgr').onclick = function () { close(); if (window.TribalBtMgr) window.TribalBtMgr.open(deps); };
        ov.querySelector('#rc-wifi-in').onchange = function () { connectWifi(this.value); };
        ov.querySelector('.rc-modes').onclick = function (e) {
            var b = e.target.closest('[data-m]'); if (!b) return;
            mode = b.getAttribute('data-m');
            ov.querySelectorAll('.rc-modes button').forEach(function (x) { x.classList.toggle('primary', x === b); });
        };
        ov.querySelector('.rc-pad').onclick = function (e) {
            var b = e.target.closest('[data-c]'); if (!b) return;
            sendCmd(b.getAttribute('data-c'));
        };
    }

    function close() { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); ov = null; }
    return { open: open, close: close, initListener: initListener, execLocal: execLocal };
})();
