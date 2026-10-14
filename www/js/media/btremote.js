// ============================================================================
// ARCHIVO: media/btremote.js (<= 200 líneas)
// RESPONSABILIDAD: Control Remoto Multimedia + Trackpad Táctil (BT y Wi-Fi)
//   - Vista Trackpad: superficie táctil completa + 3 botones abajo
//     (Izquierda, Central, Derecha) para Bluetooth y Wi-Fi
//   - Vista Mandos: rueda direccional + botones de reproducción
// ============================================================================
window.TribalRemote = (function () {
    'use strict';

    var N = window.TribalBtNet;
    var ov = null, deps = {}, mode = 'both', tab = 'pad', bc = null;
    var curEl = null, curX = 180, curY = 260, hideCurT = null;

    function activeMedia() {
        var S = (deps && deps.sono) || window.Sono;
        if (!S) return document.getElementById('media-audio');
        return (S.videoOv && !S.videoOv.hidden && S.videoEl) ? S.videoEl : S.audio;
    }

    function moveVirtualCursor(dx, dy) {
        if (!curEl) {
            curEl = document.createElement('div');
            curEl.id = 'rc-virtual-cursor';
            document.body.appendChild(curEl);
        }
        curX = Math.max(8, Math.min(window.innerWidth - 16, curX + dx * 1.4));
        curY = Math.max(8, Math.min(window.innerHeight - 16, curY + dy * 1.4));
        curEl.style.transform = 'translate(' + Math.round(curX) + 'px,' + Math.round(curY) + 'px)';
        curEl.classList.add('on');
        clearTimeout(hideCurT);
        hideCurT = setTimeout(function () { if (curEl) curEl.classList.remove('on'); }, 3500);
    }

    function clickAtCursor(btnType) {
        if (btnType === 'mclick') return execLocal('toggle');
        var target = document.elementFromPoint(curX, curY);
        if (!target) return execLocal(btnType === 'rclick' ? 'next' : 'toggle');
        if (btnType === 'rclick') {
            target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: curX, clientY: curY }));
        } else target.click();
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
        else if (cmd === 'rep' && S && S.prefs) {
            S.prefs.repeat = S.prefs.repeat === 'off' ? 'all' : (S.prefs.repeat === 'all' ? 'one' : 'off');
            if (S.savePrefs) S.savePrefs();
        }
    }

    function sendPkt(pkt) {
        pkt.k = 'rc';
        if ((mode === 'bt' || mode === 'both') && N) N.send(pkt).catch(function () {});
        if ((mode === 'wifi' || mode === 'both') && bc) { try { bc.postMessage(pkt); } catch (e) {} }
        if (mode === 'local') execLocal(pkt.cmd, pkt);
    }

    function initListener(sono) {
        if (sono) deps.sono = sono;
        if (N) {
            N.init(function (d) {
                if (!d || d.type !== 'msg') return;
                try { var m = JSON.parse(d.msg); if (m && m.k === 'rc') execLocal(m.cmd, m); } catch (e) {}
            });
        }
        if ('BroadcastChannel' in window && !bc) {
            bc = new BroadcastChannel('tribu-wifi-rc');
            bc.onmessage = function (ev) { var d = ev.data; if (d && d.k === 'rc') execLocal(d.cmd, d); };
        }
    }

    function open(d) {
        deps = d || deps || {};
        initListener(deps.sono);
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = document.createElement('div');
        ov.className = 'tribal-overlay tribal-p2p-ov';
        ov.innerHTML = '<div class="tribal-p2p tribal-links rc-shell">' +
            '<div class="tribal-p2p-head">' +
                '<button class="tribal-ctrl lk-back" id="rc-back"><i class="bi bi-arrow-left"></i><span>Volver</span></button>' +
                '<i class="bi bi-controller"></i><strong>Control Remoto & Trackpad</strong>' +
                '<button class="tribal-btn tribal-btn-xs" id="rc-btmgr" style="margin-left:auto"><i class="bi bi-bluetooth"></i> Equipos BT</button>' +
            '</div>' +
            '<div class="lk-body rc-body">' +
                '<div class="rc-top-pills">' +
                    '<div class="rc-seg" id="rc-tabs">' +
                        '<button type="button" class="on" data-t="pad"><i class="bi bi-hand-index-thumb"></i> Trackpad Táctil</button>' +
                        '<button type="button" data-t="btns"><i class="bi bi-disc"></i> Mandos Multimedia</button>' +
                    '</div>' +
                    '<div class="rc-seg" id="rc-modes">' +
                        '<button type="button" class="on" data-m="both">BT + Wi-Fi</button>' +
                        '<button type="button" data-m="bt">Bluetooth</button>' +
                        '<button type="button" data-m="wifi">Wi-Fi</button>' +
                        '<button type="button" data-m="local">Local</button>' +
                    '</div>' +
                '</div>' +
                '<div id="rc-view-pad" class="rc-track-wrap">' +
                    '<div class="rc-trackpad" id="rc-surface">' +
                        '<div class="rc-touch-dot" id="rc-dot"></div>' +
                        '<div class="rc-pad-hint"><i class="bi bi-arrows-move"></i><span>Área táctil completa · Desliza y toca</span></div>' +
                    '</div>' +
                    '<div class="rc-mouse-btns">' +
                        '<button type="button" class="rc-mbtn" data-c="lclick"><i class="bi bi-mouse"></i><span>Izquierda</span></button>' +
                        '<button type="button" class="rc-mbtn rc-mcenter" data-c="mclick"><i class="bi bi-play-pause"></i><span>Central</span></button>' +
                        '<button type="button" class="rc-mbtn" data-c="rclick"><i class="bi bi-three-dots"></i><span>Derecha</span></button>' +
                    '</div>' +
                '</div>' +
                '<div id="rc-view-btns" class="rc-dpad-wrap" hidden>' +
                    '<div class="rc-wheel">' +
                        '<button type="button" class="rc-w-up" data-c="volup"><i class="bi bi-volume-up-fill"></i></button>' +
                        '<button type="button" class="rc-w-left" data-c="prev"><i class="bi bi-skip-backward-fill"></i></button>' +
                        '<button type="button" class="rc-w-ok" data-c="toggle"><i class="bi bi-play-pause"></i></button>' +
                        '<button type="button" class="rc-w-right" data-c="next"><i class="bi bi-skip-forward-fill"></i></button>' +
                        '<button type="button" class="rc-w-down" data-c="voldn"><i class="bi bi-volume-down-fill"></i></button>' +
                    '</div>' +
                    '<div class="rc-quick-row">' +
                        '<button type="button" data-c="mute"><i class="bi bi-volume-mute-fill"></i><span>Mute</span></button>' +
                        '<button type="button" data-c="seekb"><i class="bi bi-rewind-fill"></i><span>-10s</span></button>' +
                        '<button type="button" data-c="stop"><i class="bi bi-stop-fill"></i><span>Stop</span></button>' +
                        '<button type="button" data-c="seekf"><i class="bi bi-fast-forward-fill"></i><span>+10s</span></button>' +
                        '<button type="button" data-c="rep"><i class="bi bi-repeat"></i><span>Repetir</span></button>' +
                        '<button type="button" data-c="shuf"><i class="bi bi-shuffle"></i><span>Azar</span></button>' +
                    '</div>' +
                '</div>' +
            '</div></div>';
        (deps.mount || document.body).appendChild(ov);
        ov.querySelector('#rc-back').onclick = close;
        ov.querySelector('#rc-btmgr').onclick = function () { close(); if (window.TribalBtMgr) window.TribalBtMgr.open(deps); };
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
        ov.addEventListener('click', function (e) {
            var b = e.target.closest('[data-c]');
            if (b) sendPkt({ cmd: b.getAttribute('data-c') });
        });
        wireTrackpad(ov.querySelector('#rc-surface'), ov.querySelector('#rc-dot'));
    }

    function wireTrackpad(surf, dot) {
        var down = false, lx = 0, ly = 0, moved = false, t0 = 0;
        surf.addEventListener('pointerdown', function (e) {
            down = true; moved = false; t0 = Date.now();
            lx = e.clientX; ly = e.clientY;
            var r = surf.getBoundingClientRect();
            dot.style.left = (e.clientX - r.left) + 'px';
            dot.style.top = (e.clientY - r.top) + 'px';
            dot.classList.add('on');
            try { surf.setPointerCapture(e.pointerId); } catch (er) {}
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
        function up() {
            if (!down) return;
            down = false; dot.classList.remove('on');
            if (!moved && Date.now() - t0 < 280) sendPkt({ cmd: 'lclick' });
        }
        surf.addEventListener('pointerup', up);
        surf.addEventListener('pointercancel', up);
    }

    function close() { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); ov = null; }
    return { open: open, close: close, initListener: initListener, execLocal: execLocal };
})();
