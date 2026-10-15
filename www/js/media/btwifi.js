// === media/btwifi.js (<=200): Analizador Wi-Fi y Hotspot ===
// Vista Wi-Fi: redes reales en rango (señal, 🔒/abierta, hotspot, conectada),
// conectar con contraseña, recordar con etiqueta, olvidar.
// Vista Hotspot: estado del hotspot del teléfono, IP local, red actual,
// equipos TRIBALs descubiertos en la LAN y accesos a los ajustes nativos.
window.TribalBtWifi = (function () {
    'use strict';
    var N = null, FAV_KEY = 'tribu_btfavs';
    function net() { if (!N) N = window.TribalBtNet; return N; }
    var ov = null, deps = {}, nets = [], info = {}, lanDevs = {}, tab = 'wifi', busy = false;
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function toast(m) { if (deps && deps.toast) deps.toast(m); }
    function status(t) { if (ov) { var el = ov.querySelector('#btw-status'); if (el) el.textContent = t; } }
    function favs() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '{}'); } catch (e) { return {}; } }
    function wFav(ssid) { var f = favs()[ssid]; return (f && f.kind === 'wifi' && f.fav !== false) ? f : null; }

    // eventos del motor: 'wifiNets' (broadcast SCAN_RESULTS_AVAILABLE) y 'wifiDevice' (UDP)
    function onEvt(d) { if (!d || !d.type || !ov) return;
        if (d.type === 'wifiNets') { nets = d.networks || []; busy = false; render(); }
        else if (d.type === 'wifiDevice' && d.ip) { lanDevs[d.ip] = { ip: d.ip, name: d.name || d.ip }; render(); } }

    // Analizar: pide permisos, conecta el oído y dispara wifiScan() nativo
    function scan() { var n = net(); if (!n) return status('Motor no cargado');
        busy = true; status('📶 Analizando Wi-Fi y Hotspot…'); render();
        n.ensurePerms().then(function () { return n.init(onEvt); })
            .then(function () { return n.wifiScan(); })
            .then(function (w) {
                info = w || {}; nets = (w && w.networks) || []; busy = false; render();
                if (w && w.locationOn === false) status('⚠ Ubicación apagada — Android la exige para listar redes Wi-Fi cercanas');
                else if (w && w.enabled === false) status('⚠ Wi-Fi apagado — enciéndelo desde Ajustes Wi-Fi');
                else status(nets.length + ' redes detectadas' + (info.currentSsid ? ' · Conectado a «' + info.currentSsid + '»' : ' · sin conexión'));
            }).catch(function (e) { busy = false; status('Error al escanear Wi-Fi: ' + e); render(); }); }

    function askPass(ssid, sec, cb) { if (!sec) return cb('');
        var p = window.prompt('Contraseña Wi-Fi para «' + ssid + '» (deja vacío si es abierta):');
        if (p == null) return; cb(p); }
    function join(ssid, pass) { var n = net(); if (!n) return; status('Conectando a «' + ssid + '»…');
        n.wifiConnect({ ssid: ssid, pass: pass }).then(function (r) {
            toast('Wi-Fi «' + ssid + '»: ' + (r && r.remember === 'ok' ? 'recordada · ' : '') + 'conexión solicitada al sistema');
            setTimeout(scan, 2500);
        }).catch(function (e) { var m = String(e && e.message || e);
            if (/wifi_apagado/.test(m)) { status('Wi-Fi apagado'); if (n.openWifiSettings) n.openWifiSettings(); }
            else status('No se pudo conectar: ' + m); }); }
    function connect(ssid, sec) { var fv = wFav(ssid);
        if (fv) return join(ssid, fv.pass || '');
        askPass(ssid, sec, function (p) { join(ssid, p); }); }
    function remember(ssid, sec) { var cur = wFav(ssid), n = net(); if (!n) return;
        if (cur) { n.setFav(ssid, ssid, 'wifi', false); if (n.wifiForget) n.wifiForget(ssid);
            toast('«' + ssid + '» olvidada'); render(); return; }
        var label = window.prompt('¿Con qué nombre recuerdo esta red? (Casa, Aeropuerto, Restaurante…)', '');
        if (label == null) return;
        askPass(ssid, sec, function (p) {
            n.setFav(ssid, ssid, 'wifi', true, { label: label || '', pass: p || '' });
            n.wifiConnect({ ssid: ssid, pass: p || '' }).catch(function () {});
            toast('★ «' + (label || ssid) + '» recordada — se une sola al estar en rango'); render(); }); }

    function sigIco(l) { return l >= 70 ? 'bi-wifi' : (l >= 40 ? 'bi-wifi-2' : 'bi-wifi-1'); }
    function rowWifi(w) { var fv = wFav(w.ssid);
        var tag = (w.hotspot ? '📡 Hotspot móvil' : 'Red Wi-Fi') + ' · ' + (w.level || 0) + '%' +
            (w.secure ? ' · 🔒' : ' · abierta') + (w.connected ? ' · Conectada' : '') +
            (fv ? ' · ★ «' + esc(fv.label || 'recordada') + '»' : '');
        return '<div class="btm-row' + (w.connected ? ' on' : '') + '"><div class="btm-ico-wrap"><i class="bi ' + sigIco(w.level || 0) + ' btm-ico"></i></div>' +
            '<div class="btm-info"><b>' + esc(fv && fv.label ? fv.label : w.ssid) + '</b><small>' + tag + '</small></div>' +
            '<div class="btm-row-acts"><button class="tribal-ctrl np-doc-fav' + (fv ? ' on' : '') + '" data-act="wrem" data-ssid="' + esc(w.ssid) + '" data-sec="' + (w.secure ? 1 : 0) + '" title="Recordar red"><i class="bi ' + (fv ? 'bi-star-fill' : 'bi-star') + '"></i></button>' +
            '<button class="tribal-btn tribal-btn-xs ' + (w.connected ? '' : 'primary') + '" data-act="wconn" data-ssid="' + esc(w.ssid) + '" data-sec="' + (w.secure ? 1 : 0) + '">' + (w.connected ? 'Activa' : 'Conectar') + '</button></div></div>'; }
    function render() { if (!ov) return;
        ov.querySelectorAll('#btw-tabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-t') === tab); });
        var html = '';
        if (tab === 'wifi') {
            var wf = favs();
            Object.keys(wf).forEach(function (ssid) { var f = wf[ssid]; if (!f || f.kind !== 'wifi' || f.fav === false) return;
                if (nets.some(function (x) { return x.ssid === ssid; })) return;
                html += '<div class="btm-row"><div class="btm-ico-wrap"><i class="bi bi-wifi-off btm-ico"></i></div><div class="btm-info"><b>★ ' + esc(f.label || ssid) + '</b><small>Red recordada (' + esc(ssid) + ') · fuera de rango ahora</small></div>' +
                    '<div class="btm-row-acts"><button class="tribal-ctrl np-doc-fav on" data-act="wrem" data-ssid="' + esc(ssid) + '" data-sec="1"><i class="bi bi-star-fill"></i></button></div></div>'; });
            html += nets.map(rowWifi).join('');
            if (!html) html = '<div class="btm-empty"><i class="bi bi-wifi"></i><p>' + (busy ? 'Analizando…' : 'Sin redes detectadas.') + '</p><small>Toca «Analizar» para un escaneo nuevo.</small></div>';
        } else {
            var hs = info.hotspotOn ? 'ACTIVO — tu teléfono comparte internet' : 'Apagado';
            html = '<div class="btm-row' + (info.hotspotOn ? ' on' : '') + '"><div class="btm-ico-wrap"><i class="bi bi-broadcast-pin btm-ico"></i></div>' +
                '<div class="btm-info"><b>Tu Hotspot: ' + hs + '</b><small>IP local: ' + esc(info.ip || '0.0.0.0') + (info.currentSsid ? ' · En red «' + esc(info.currentSsid) + '»' : '') + '</small></div>' +
                '<div class="btm-row-acts"><button class="tribal-btn tribal-btn-xs" data-act="hset"><i class="bi bi-gear-fill"></i> Ajustes</button></div></div>';
            var lan = Object.keys(lanDevs);
            if (lan.length) html += '<p class="btm-status-bar">Equipos TRIBALs en tu red (' + lan.length + '):</p>' +
                lan.map(function (ip) { var wd = lanDevs[ip];
                    return '<div class="btm-row on"><div class="btm-ico-wrap"><i class="bi bi-router-fill btm-ico"></i></div><div class="btm-info"><b>' + esc(wd.name) + '</b><small>Wi-Fi / Hotspot · ' + esc(ip) + '</small></div>' +
                        '<div class="btm-row-acts"><button class="tribal-btn tribal-btn-xs primary" data-act="rc">Control remoto</button></div></div>'; }).join('');
            else html += '<div class="btm-empty"><i class="bi bi-broadcast-pin"></i><p>Ningún equipo TRIBALs detectado en la red.</p><small>Otro teléfono con TRIBALs en el mismo Wi-Fi/Hotspot aparece aquí solo.</small></div>';
        }
        ov.querySelector('#btw-list').innerHTML = html; }

    function open(d, which) { deps = d || {}; tab = which === 'hotspot' ? 'hotspot' : 'wifi';
        if (!N) N = window.TribalBtNet;
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = document.createElement('div');
        ov.className = 'tribal-overlay tribal-p2p-ov';
        ov.innerHTML = '<div class="tribal-p2p tribal-links"><div class="tribal-p2p-head">' +
                '<button class="tribal-ctrl lk-back" id="btw-back"><i class="bi bi-arrow-left"></i><span>Volver</span></button>' +
                '<i class="bi bi-wifi"></i><strong>Analizador Wi-Fi / Hotspot</strong>' +
                '<button class="tribal-btn tribal-btn-xs" id="btw-again" style="margin-left:auto"><i class="bi bi-arrow-clockwise"></i> Analizar</button></div>' +
            '<div class="lk-body btm-body">' +
                '<div class="btm-cats" id="btw-tabs">' +
                    '<button type="button" class="btm-cat" data-t="wifi"><i class="bi bi-wifi"></i><span>Redes Wi-Fi</span></button>' +
                    '<button type="button" class="btm-cat" data-t="hotspot"><i class="bi bi-broadcast-pin"></i><span>Hotspot / Red local</span></button></div>' +
                '<p class="btm-status-bar" id="btw-status">Analizando…</p>' +
                '<div class="btm-grid-tiles">' +
                    '<button class="btm-tile" id="btw-wset"><i class="bi bi-gear-fill"></i><span>Ajustes Wi-Fi</span></button>' +
                    '<button class="btm-tile" id="btw-hset"><i class="bi bi-broadcast-pin"></i><span>Ajustes Hotspot</span></button>' +
                    '<button class="btm-tile" id="btw-mgr"><i class="bi bi-bluetooth"></i><span>Administrador BT</span></button>' +
                    '<button class="btm-tile" id="btw-rc"><i class="bi bi-controller"></i><span>Control remoto</span></button></div>' +
                '<div id="btw-list" class="btm-list"></div>' +
            '</div></div>';
        (deps.mount || document.body).appendChild(ov);
        ov.querySelector('#btw-back').onclick = close;
        ov.querySelector('#btw-again').onclick = scan;
        ov.querySelector('#btw-tabs').onclick = function (e) { var b = e.target.closest('[data-t]'); if (b) { tab = b.getAttribute('data-t'); render(); } };
        ov.querySelector('#btw-wset').onclick = function () { var n = net(); if (n && n.openWifiSettings) n.openWifiSettings(); };
        ov.querySelector('#btw-hset').onclick = function () { var n = net(); if (n && n.openHotspotSettings) n.openHotspotSettings(); };
        ov.querySelector('#btw-mgr').onclick = function () { close(); if (window.TribalBtMgr) window.TribalBtMgr.open(deps); };
        ov.querySelector('#btw-rc').onclick = function () { close(); if (window.TribalRemote) window.TribalRemote.open(deps); };
        ov.querySelector('#btw-list').onclick = function (e) {
            var b = e.target.closest('[data-act]'); if (!b) return;
            var act = b.getAttribute('data-act'), ssid = b.getAttribute('data-ssid'), sec = b.getAttribute('data-sec') === '1';
            if (act === 'wconn' && ssid) connect(ssid, sec);
            else if (act === 'wrem' && ssid) remember(ssid, sec);
            else if (act === 'hset') { var n = net(); if (n && n.openHotspotSettings) n.openHotspotSettings(); }
            else if (act === 'rc') { close(); if (window.TribalRemote) window.TribalRemote.open(deps); }
        };
        scan();
    }
    function close() { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); ov = null; }
    return { open: open, close: close };
})();
