// ============================================================================
// ARCHIVO: media/btmgr.js (<= 200 líneas)
// RESPONSABILIDAD: Administrador Bluetooth completo de TRIBALs.
//   - Busca dispositivos cercanos, lista emparejados y recordados (tribu_btfavs)
//   - Conecta, desconecta, recuerda automáticamente, permite olvidar y activar BT
//   - Botón directo «Ir a chatear» que abre el Chat Bluetooth existente
//   - Botón directo al Control Remoto Multimedia
// ============================================================================
window.TribalBtMgr = (function () {
    'use strict';

    var N = window.TribalBtNet;
    var FAV_KEY = 'tribu_btfavs';
    var ov = null, deps = {}, near = {}, bonded = {}, connected = {}, scanning = false;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function toast(m) { if (deps && deps.toast) deps.toast(m); }
    function loadSaved() {
        try { return JSON.parse(localStorage.getItem(FAV_KEY) || '{}'); }
        catch (e) { return {}; }
    }
    function saveDevice(addr, name) {
        if (!addr) return;
        var f = loadSaved();
        f[addr] = { name: name || (f[addr] && f[addr].name) || addr, ts: Date.now() };
        try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); } catch (e) {}
    }
    function forgetDevice(addr) {
        var f = loadSaved();
        delete f[addr];
        try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); } catch (e) {}
        render();
        toast('Dispositivo olvidado');
    }

    function onNetEvent(d) {
        if (!d || !d.type) return;
        if (d.type === 'device' && d.addr) {
            near[d.addr] = { addr: d.addr, name: d.name || d.addr };
            render();
        } else if (d.type === 'scanDone') {
            scanning = false;
            render();
        } else if (d.type === 'peer') {
            if (d.state === 'open') {
                var k = d.addr || d.name || 'peer';
                connected[k] = d.name || k;
                if (d.addr) saveDevice(d.addr, d.name);
                toast('Conectado con ' + (d.name || k));
            } else {
                if (d.addr) delete connected[d.addr];
                else connected = {};
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
                    bonded[x.addr] = { addr: x.addr, name: x.name || x.addr };
                    saveDevice(x.addr, x.name);
                }
            });
            render();
        }).catch(function () {});
    }

    function doScan() {
        if (!N) return;
        scanning = true;
        near = {};
        render();
        N.ensurePerms().then(function () {
            return refreshBonded();
        }).then(function () {
            return N.scan();
        }).catch(function () {
            scanning = false;
            render();
            toast('Activa el Bluetooth para buscar dispositivos');
        });
    }

    function rowHtml(addr, name, tag, isConn, isSaved) {
        return '<div class="btm-row' + (isConn ? ' on' : '') + '" data-addr="' + esc(addr) + '">' +
            '<i class="bi bi-bluetooth btm-ico"></i>' +
            '<div class="btm-info"><b>' + esc(name || addr) + '</b>' +
            '<small>' + esc(addr) + ' · ' + tag + '</small></div>' +
            (isConn
                ? '<button class="tribal-btn tribal-btn-xs" data-act="chat" data-addr="' + esc(addr) + '"><i class="bi bi-chat-dots-fill"></i> Chatear</button>' +
                  '<button class="tribal-btn tribal-btn-xs danger" data-act="disc"><i class="bi bi-x-circle"></i></button>'
                : '<button class="tribal-btn tribal-btn-xs primary" data-act="conn" data-addr="' + esc(addr) + '" data-name="' + esc(name || addr) + '">Conectar</button>') +
            (isSaved ? '<button class="tribal-btn tribal-btn-xs" data-act="forget" data-addr="' + esc(addr) + '" title="Olvidar"><i class="bi bi-trash3"></i></button>' : '') +
        '</div>';
    }

    function render() {
        if (!ov) return;
        var st = ov.querySelector('#btm-status');
        var box = ov.querySelector('#btm-list');
        var connKeys = Object.keys(connected);
        st.textContent = scanning ? 'Buscando dispositivos Bluetooth cercanos…'
            : (connKeys.length ? connKeys.length + ' conectado(s)' : 'Listo para conectar');
        var saved = loadSaved(), seen = {}, html = '';
        if (connKeys.length) {
            html += '<h6 class="btm-sec">Conectados ahora</h6>';
            connKeys.forEach(function (a) {
                seen[a] = 1;
                html += rowHtml(a, connected[a], 'Conectado', true, !!saved[a]);
            });
        }
        var nearKeys = Object.keys(near).filter(function (a) { return !seen[a]; });
        if (nearKeys.length) {
            html += '<h6 class="btm-sec">Cercanos detectados</h6>';
            nearKeys.forEach(function (a) {
                seen[a] = 1;
                html += rowHtml(a, near[a].name, 'Cerca', false, !!saved[a]);
            });
        }
        var savedKeys = Object.keys(saved).concat(Object.keys(bonded)).filter(function (a) {
            if (seen[a]) return false;
            seen[a] = 1;
            return true;
        });
        if (savedKeys.length) {
            html += '<h6 class="btm-sec">Recordados y emparejados</h6>';
            savedKeys.forEach(function (a) {
                var nm = (saved[a] && saved[a].name) || (bonded[a] && bonded[a].name) || a;
                html += rowHtml(a, nm, 'Recordado', false, true);
            });
        }
        box.innerHTML = html || '<p class="np-hint">No se ven dispositivos aún. Toca «Buscar dispositivos» o «Hacerme visible».</p>';
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
            '<div class="lk-body">' +
                '<div class="btm-actions">' +
                    '<button class="tribal-btn primary" id="btm-gochat"><i class="bi bi-chat-dots-fill"></i> Ir a chatear</button>' +
                    '<button class="tribal-btn" id="btm-scan"><i class="bi bi-search"></i> Buscar dispositivos</button>' +
                    '<button class="tribal-btn" id="btm-vis"><i class="bi bi-broadcast"></i> Hacerme visible</button>' +
                    '<button class="tribal-btn" id="btm-rc"><i class="bi bi-controller"></i> Control remoto</button>' +
                    '<button class="tribal-btn" id="btm-en"><i class="bi bi-power"></i> Activar BT</button>' +
                '</div>' +
                '<p class="np-hint" id="btm-status">Iniciando Bluetooth…</p>' +
                '<div id="btm-list" class="btm-list"></div>' +
            '</div></div>';
        (deps.mount || document.body).appendChild(ov);
        ov.querySelector('#btm-back').onclick = close;
        ov.querySelector('#btm-scan').onclick = doScan;
        ov.querySelector('#btm-vis').onclick = function () { if (N) N.invite().then(function () { toast('Visible por 5 minutos'); }); };
        ov.querySelector('#btm-en').onclick = function () { if (N) N.enable().then(doScan); };
        ov.querySelector('#btm-gochat').onclick = function () { close(); if (window.TribalBtChat) window.TribalBtChat.open(deps); };
        ov.querySelector('#btm-rc').onclick = function () { close(); if (window.TribalRemote) window.TribalRemote.open(deps); };
        ov.querySelector('#btm-list').onclick = function (e) {
            var b = e.target.closest('[data-act]'); if (!b) return;
            var act = b.getAttribute('data-act'), addr = b.getAttribute('data-addr'), nm = b.getAttribute('data-name');
            if (act === 'conn' && N) { saveDevice(addr, nm); toast('Conectando con ' + (nm || addr) + '…'); N.connect(addr).catch(function () { toast('No se pudo conectar'); }); }
            else if (act === 'disc' && N) N.close().then(function () { connected = {}; render(); });
            else if (act === 'forget') forgetDevice(addr);
            else if (act === 'chat') { close(); if (window.TribalBtChat) window.TribalBtChat.open(deps); }
        };
        if (N) N.init(onNetEvent).then(doScan);
    }
    function close() { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); ov = null; }
    return { open: open, close: close };
})();
