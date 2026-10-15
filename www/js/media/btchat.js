// media/btchat.js — chat tribal BT multi-peer (UI WhatsApp/grupo). k=text|img|aud|vid|voz|doc|del|ping|av
window.TribalBtChat = (function () {
    'use strict';
    var N = window.TribalBtNet;
    var ov = null, deps = {}, devs = {}, msgs = [], peers = {}, open_ = false,
        groupOn = false, replyTo = null, paused = false;
    var MAX_FILE = 8 * 1024 * 1024, ON_KEY = 'tribu_btchat_on',
        CHUNK = 120 * 1024,            // media se trocea: el bridge muere con frames MB+
        parts = {},                    // reensamblaje entrante: id → {…}
        flushing = false;              // drenando el buzón persistente
    var EMOJI_RE = /((?:[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u231A\u231B\u23E9-\u23EC\u23F0\u23F3\u25FD\u25FE\u2614\u2615\u2648-\u2653\u267F\u2693\u26A1\u26AA\u26AB\u26BD\u26BE\u26C4\u26C5\u26CE\u26D4\u26EA\u26F2\u26F3\u26F5\u26FA\u26FD\u2702\u2705\u2708-\u270D\u270F\u2712\u2716\u271D\u2721\u2728\u2733\u2734\u2744\u2747\u274C\u274E\u2753-\u2755\u2757\u2763\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934\u2935\u2B05-\u2B07\u2B1B\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299]|\uFE0F|\u200D|\u20E3)+)/g;
    function bigEmojis(html) {   // emoji → span grande (3× la fuente del chat)
        return html.replace(EMOJI_RE, function (g) { return '<span class="btc-big">' + g + '</span>'; }); }
    var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' },
        INVITE = '🔥 Te invito a mi conversación Bluetooth en TRIBALs — activa tu Bluetooth y búscame cerca 📡';

    function $(id) { return document.getElementById(id); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
    function toast(m) { if (deps.toast) deps.toast(m); }
    function mid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function sys(text) { var m = { id: mid(), ts: Date.now(), k: 'sys', text: text };
        msgs.push(m); if (window.TribalBtDb) TribalBtDb.put(m); appendMsg(m); }
    function on(id, fn) { $(id).addEventListener('click', fn); }
    function myName() { try { var n = localStorage.getItem('tribu_btname'); if (n) return n;
        n = 'Tribu ' + Math.random().toString(36).slice(2, 6); localStorage.setItem('tribu_btname', n); return n;
        } catch (e) { return 'Tribu'; } }
    function tag(o) { o.n = myName(); o.tribal = 1;
        if (N.tribalId) o.tid = N.tribalId();
        if (groupOn) o.g = 1; return o; }
    function nPeers() { return Object.keys(peers).length; }
    function nColor(n) { var h = 0, pal = ['#f0b429', '#2a9d8f', '#e06a2e', '#a3b18a', '#e76f51', '#c77dff', '#5e8c61', '#d4a373'];
        for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; return pal[h % pal.length]; }
    // cita estilo WhatsApp: remitente + etiqueta textual del contenido
    function quoteOf(m) { var l = m.k === 'text' ? m.text : m.k === 'img' ? '📷 Foto'
        : m.k === 'vid' ? '🎬 ' + (m.name || 'video') : m.k === 'aud' ? '🎵 ' + (m.name || 'audio')
        : m.k === 'voz' ? '🎤 Nota de voz' : '📄 ' + (m.name || 'documento');
        return { id: m.id, n: m.me ? myName() : (m.n || 'La tribu'), t: l }; }
    function setReply(m) {
        replyTo = m || null; var b = $('btc-reply'); if (!b) return; b.hidden = !m; if (!m) return;
        var n = m.me ? 'Tú' : (m.n || 'La tribu'), e = $('btc-reply-n');
        e.textContent = n; e.style.color = nColor(m.me ? myName() : n);
        $('btc-reply-t').textContent = quoteOf(m).t; $('btc-text').focus(); }
    function takeQ() { var q = replyTo ? quoteOf(replyTo) : null; setReply(null); return q; }
    function peersLabel() { var n = nPeers();
        return !n ? 'escuchando · toca para ver' : n === 1 ? 'conectado · toca para ver' : n + ' en la tribu · toca para ver'; }
    function chatTitle() { return (groupOn || nPeers() > 1) ? 'Grupo tribal (' + nPeers() + ')' : 'Chat tribal'; }

    function build() {
        if (ov) return;
        ov = document.createElement('div');
        ov.className = 'tribal-overlay tribal-btchat-ov';
        ov.innerHTML =
            '<div class="tribal-btchat"><div class="btchat-head">' +
            '<button id="btc-back" class="btchat-btn" title="Volver">‹</button>' +
            '<div class="btchat-title" id="btc-tstat"><span id="btc-title">Chat tribal</span>' +
            '<small id="btc-status">buscando…</small></div>' +
            '<button id="btc-menu" class="btchat-btn"><i class="bi bi-three-dots-vertical"></i></button>' +
            '<button id="btc-close" class="btchat-btn"><i class="bi bi-x-lg"></i></button>' +
            '<div id="btc-dd" class="btchat-dd" hidden>' +
            '<button id="btc-scan"><i class="bi bi-search"></i>Buscar cerca</button>' +
            '<button id="btc-mgr"><i class="bi bi-bluetooth"></i>Administrador Bluetooth</button>' +
            '<button id="btc-rc"><i class="bi bi-controller"></i>Control remoto</button>' +
            '<button id="btc-pause"><i class="bi bi-pause-circle"></i><span id="btc-pause-lb">Pausar escucha</span></button>' +
            '<button id="btc-invite"><i class="bi bi-megaphone"></i>Hacerme visible</button>' +
            '<button id="btc-ping"><i class="bi bi-bell"></i>Notificación</button>' +
            '<button id="btc-grp"><i class="bi bi-people"></i><span id="btc-grp-lb">Conversación grupal</span></button>' +
            '<button id="btc-lib"><i class="bi bi-music-note-beamed"></i>Enviar de mi biblioteca</button>' +
            '<button id="btc-exp"><i class="bi bi-download"></i>Exportar chat (JSON)</button>' +
            '<button id="btc-imp"><i class="bi bi-upload"></i>Importar chat (JSON)</button>' +
            '<button id="btc-wipe"><i class="bi bi-trash3"></i>Limpiar el chat</button>' +
            '<button id="btc-share"><i class="bi bi-share"></i>Invitar por WhatsApp…</button>' +
            '<button id="btc-onoff"><i class="bi bi-power"></i><span id="btc-onoff-lb">Apagar chat</span></button></div></div>' +
            '<div id="btc-devices" class="btchat-devs" hidden></div>' +
            '<div id="btc-list" class="btchat-msgs"></div>' +
            '<div class="btchat-emojis" id="btc-emojis" hidden></div>' +
            '<div id="btc-reply" class="btchat-reply" hidden>' +
            '<div class="btchat-reply-q"><b id="btc-reply-n"></b><span id="btc-reply-t"></span></div>' +
            '<button id="btc-reply-x" class="btchat-btn flat"><i class="bi bi-x-lg"></i></button></div>' +
            '<div class="btchat-inputbar">' +
            '<button id="btc-emobtn" class="btchat-btn flat"><i class="bi bi-emoji-smile"></i></button>' +
            '<button id="btc-cam" class="btchat-btn flat" title="Cámara"><i class="bi bi-camera-fill"></i></button>' +
            '<button id="btc-attach" class="btchat-btn flat"><i class="bi bi-paperclip"></i></button>' +
            '<input id="btc-camfile" type="file" accept="image/*" capture hidden>' +
            '<input id="btc-file" type="file" hidden' +
            ' accept="image/*,audio/*,video/*,application/pdf,application/epub+zip,text/plain,application/msword,.gif,.webp,.mp3,.m4a,.aac,.ogg,.oga,.wav,.flac,.opus,.wma,.mp4,.mkv,.webm,.mov,.pdf,.epub,.txt,.mobi,.doc,.docx,.rtf,.odt">' +
            '<input id="btc-text" class="tribal-input" placeholder="Escribe a la tribu…" autocomplete="off">' +
            '<button id="btc-mic" class="btchat-btn flat"><i class="bi bi-mic"></i></button>' +
            '<button id="btc-send" class="tribal-btn sm"><i class="bi bi-send-fill"></i></button></div>' +
            '<div id="btc-delsh" class="btc-delsh" hidden>' +
            '<button id="btc-del-all"><i class="bi bi-trash3"></i>Eliminar para todos</button>' +
            '<button id="btc-del-me"><i class="bi bi-trash"></i>Eliminar para mí</button>' +
            '<button id="btc-del-x"><i class="bi bi-x-lg"></i>Cancelar</button></div>' +
            '<div id="btc-connpop" class="btc-connpop" hidden>' +
            '<i class="bi bi-bluetooth"></i><div class="btc-connpop-t">' +
            '<b id="btc-conn-n"></b><span>se conectó al chat</span></div></div></div>';
        document.body.appendChild(ov);
        if (window.TribalBtAvatar && $('btc-ava')) TribalBtAvatar.mount($('btc-ava'));
        window.TribalBtEmoji.mount($('btc-emojis'), function (e) {
            var t = $('btc-text'); t.value += e; t.focus(); });
        on('btc-close', close);
        on('btc-back', function () { showChat(); });
        on('btc-tstat', function () {          // tocar el título despliega/peers
            if ($('btc-devices').hidden) showDevs(); else showChat(); });
        $('btc-devices').addEventListener('click', function (e) {
            if (!e.target.closest('.btc-dev')) showChat(); });  // área vacía → oculta
        on('btc-menu', function (e) { e.stopPropagation(); $('btc-dd').hidden = !$('btc-dd').hidden; });
        document.addEventListener('click', function () {
            var dd = $('btc-dd'); if (dd) dd.hidden = true;
            var sh = $('btc-delsh'); if (sh) sh.hidden = true; });
        on('btc-del-all', function () { doDelete(delId, true); });
        on('btc-del-me', function () { doDelete(delId, false); });
        on('btc-del-x', function () { $('btc-delsh').hidden = true; });
        on('btc-scan', doScan); on('btc-share', shareInvite); on('btc-grp', toggleGroup);
        on('btc-mgr', function () { if (window.TribalBtMgr) window.TribalBtMgr.open(deps); });
        on('btc-rc', function () { if (window.TribalRemote) window.TribalRemote.open(deps); });
        on('btc-pause', function () {           // mute: frena scan + escucha
            paused = !paused;
            $('btc-pause-lb').textContent = paused ? 'Reanudar escucha' : 'Pausar escucha';
            status(paused ? 'escucha en pausa' : peersLabel());
            N.pause(paused).catch(function () {}); });
        on('btc-lib', function () { if (window.TribalBtLib) TribalBtLib.open(); });
        on('btc-exp', function () { if (window.TribalBtDb) TribalBtDb.exportJson(msgs, toast); });
        on('btc-imp', function () {
            if (!window.TribalBtDb) return;
            TribalBtDb.importJson(function (all, n) {
                if (!all) { toast(n || 'No se pudo importar'); return; }
                msgs = all; if (!$('btc-list').hidden) renderMsgs();
                toast(n + ' mensaje(s) importado(s)'); }); });
        on('btc-wipe', function () { msgs = []; renderMsgs(); if (window.TribalBtDb) TribalBtDb.clear(); });
        on('btc-invite', function () { N.invite().then(function () { toast('Visible 5 min — invita a la tribu'); }).catch(function () { toast('No se pudo hacer visible'); }); });
        on('btc-ping', function () { N.send(tag({ k: 'ping', id: mid() }))
            .then(function () { sys('🔔 Enviaste un aviso a la tribu'); })
            .catch(function () { toast('Nadie conectado todavía'); }); });
        on('btc-onoff', function () { setOn(localStorage.getItem(ON_KEY) === '0'); });
        on('btc-emobtn', function () { $('btc-emojis').hidden = !$('btc-emojis').hidden; });
        on('btc-reply-x', function () { setReply(null); });
        on('btc-send', sendText); on('btc-mic', toggleVoice);
        on('btc-attach', function () { $('btc-file').click(); });
        on('btc-cam', function () { $('btc-camfile').click(); });   // selfie/foto
        $('btc-text').addEventListener('keydown', function (e) { if (e.key === 'Enter') sendText(); });
        $('btc-file').addEventListener('change', function () { var f = this.files && this.files[0]; this.value = ''; if (f) sendFile(f); });
        $('btc-camfile').addEventListener('change', function () { var f = this.files && this.files[0]; this.value = ''; if (f) sendFile(f); }); }

    // interruptor del chat: persiste y arranca/mata el servicio de escucha
    function setOn(on) { try { localStorage.setItem(ON_KEY, on ? '1' : '0'); } catch (e) {}
        var lb = $('btc-onoff-lb'); if (lb) lb.textContent = on ? 'Apagar chat' : 'Encender chat';
        if (on) { status(peersLabel()); N.setOn(true); doScan(); }
        else { status('apagado'); devs = {}; renderDevs(); N.setOn(false); } }
    // modo grupo: quedo visible/escuchando; los peers que se conecten ven a todos
    function toggleGroup() { groupOn = !groupOn;
        var lb = $('btc-grp-lb'); if (lb) lb.textContent = groupOn ? 'Chat 1 a 1' : 'Conversación grupal';
        if (groupOn) { toast('Grupo: quedas visible — la tribu se conecta a ti'); N.invite().catch(function () {}); }
        $('btc-title').textContent = chatTitle(); }
    // invitación por WhatsApp/Telegram/etc: hoja de compartir con texto
    function shareInvite() {
        var P = window.Capacitor && window.Capacitor.Plugins; if (P && P.Share && P.Share.share)
            P.Share.share({ title: 'Chat tribal', text: INVITE }).catch(function () {});
        else if (navigator.share) navigator.share({ text: INVITE }).catch(function () {});
        else { try { navigator.clipboard.writeText(INVITE); } catch (e) {}
            toast('Invitación copiada — pégala donde quieras'); } }
    // 🎤 nota de voz: un toque graba (el botón pulsa), otro toque envía
    function toggleVoice() {
        var V = window.TribalBtVoice, btn = $('btc-mic');
        if (!V || !V.supported()) return toast('Sin micrófono en este dispositivo');
        if (!V.recording()) { V.start().then(function () { btn.classList.add('rec'); toast('Grabando… toca 🎤 para enviar'); })
            .catch(function () { toast('Permiso de micrófono denegado'); }); return; }
        btn.classList.remove('rec');
        V.stop().then(function (r) { var q = takeQ(),
            m = push({ k: 'voz', name: 'Nota de voz', mime: r.mime, data: r.data, q: q });
            deliver(tag({ k: 'voz', name: 'Nota de voz', mime: r.mime, data: r.data, id: m.id, q: q }), m);
        }).catch(function () { toast('Grabación vacía'); }); }
    function status(t) { if (ov) $('btc-status').textContent = t; }
    // favoritos: los peers que alguna vez se conectaron quedan guardados —
    // la lista muestra en línea / desconectados aunque no estén cerca
    var FAV_KEY = 'tribu_btfavs';
    function favs() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '{}'); } catch (e) { return {}; } }
    function saveFav(addr, name) {
        if (!addr) return; var f = favs();
        f[addr] = { name: name || 'la tribu', ts: Date.now() };
        try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); } catch (e) {} }
    // modal de conexión: aviso limpio que se oculta solo a los ~2.6s
    function connModal(name) {
        var p = $('btc-connpop'); if (!p) return;
        $('btc-conn-n').textContent = name || 'La tribu';
        p.hidden = false; clearTimeout(p._t);
        p._t = setTimeout(function () { p.hidden = true; }, 2600); }
    function showDevs() { $('btc-list').hidden = true; $('btc-devices').hidden = false; renderDevs(); }
    function showChat(name) {  // entra a la conversación
        $('btc-devices').hidden = true; $('btc-list').hidden = false;
        if (name) $('btc-title').textContent = name; renderMsgs(); }
    function devHtml(d, st, btn) {
        return '<div class="btc-dev ' + st + '"><i class="bi ' +
            (d.kind === 'wifi' ? 'bi-wifi' : 'bi-bluetooth') + '"></i><span>' +
            esc(d.name || d.addr) + '</span>' +
            (st === 'on' ? '<small class="btc-on">en línea</small>'
                : '<button class="tribal-btn sm btc-conn" data-addr="' + esc(d.addr) +
                  '" data-kind="' + esc(d.kind || 'bt') + '">' + btn + '</button>') + '</div>'; }
    function renderDevs() {
        var seen = {}, on = Object.keys(peers), fav = favs(), html = '';
        if (on.length) {                              // EN LÍNEA (conectados)
            html += '<div class="btchat-count on">' + on.length + ' en línea</div>' +
                on.map(function (a) { seen[a] = 1;
                    return devHtml({ name: peers[a], addr: a }, 'on'); }).join(''); }
        var near = Object.keys(devs).map(function (k) { return devs[k]; })
            .filter(function (d) { return !seen[d.addr]; });
        near.forEach(function (d) { seen[d.addr] = 1; });
        var off = Object.keys(fav).filter(function (a) { return !seen[a]; });
        if (near.length) html += '<div class="btchat-count">' + near.length + ' cerca</div>' +   // CERCA (descubiertos)
            near.map(function (d) {
                return devHtml(d, 'near', d.kind === 'wifi' ? 'Invitar' : 'Conectar'); }).join('');
        if (off.length) html += '<div class="btchat-count">Guardados · desconectados</div>' +     // FAVORITOS offline
            off.map(function (a) { return devHtml({ name: fav[a].name, addr: a }, 'off', 'Conectar'); }).join('');
        $('btc-devices').innerHTML = html || '<p class="btc-empty">Nadie cerca aún — ⋮ → "Buscar cerca"</p>'; }
    // me invitan por Wi-Fi → confirmo → acepto por UDP + abro el canal TCP
    function handleInvite(m, fromIp) {
        var who = m.n || fromIp || 'La tribu';
        var yes = function () {
            if (N.wifiAccept) N.wifiAccept(fromIp, m.id).catch(function () {});
            toast('Aceptaste — abriendo canal Wi-Fi…');
            if (fromIp) N.connect(fromIp).catch(function () {}); };
        if (deps.confirm) deps.confirm('Invitación tribal 📡',
            who + ' te invita a conversar por Wi-Fi. ¿Aceptar?', 'Aceptar', yes);
        else yes(); }
    // invitación Wi-Fi: UDP al equipo → él acepta → su TCP llega a mi oído
    function inviteWifi(ip, name) {
        if (!N.wifiInvite) return;
        status('invitando a ' + (name || ip) + '…');
        N.wifiInvite(ip).then(function () {
            toast('📡 Invitación enviada a ' + (name || ip));
        }).catch(function () { toast('No se pudo invitar'); }); }
    document.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('.btc-conn');
        if (!b) return;
        if (b.dataset.kind === 'wifi') { inviteWifi(b.dataset.addr, null); return; }
        status('conectando…'); N.connect(b.dataset.addr); });
    function doScan() { if (paused) { status('escucha en pausa'); return; }
        devs = {}; renderDevs(); status('escaneando…');
        N.scan().catch(function (e) { status('error'); toast(String(e)); }); }
    // mi avatar (si hay) viaja al peer recién conectado
    function sendAv() { if (!window.TribalBtAvatar) return;
        TribalBtAvatar.mine(function (a) { if (a) N.send(tag({ k: 'av', id: mid(), data: a })).catch(function () {}); }); }
    // auto-conexión: un dispositivo al alcance → intento directo (1 vez/5min
    // por equipo — reconecta tras una caída sin spamear; un no-TRIBALs falla solo)
    var tried = {};
    function autoConnect(addr) {
        if (paused || !addr || peers[addr]) return;
        var t = tried[addr];
        if (t && Date.now() - t < 300000) return;
        tried[addr] = Date.now();
        N.connect(addr).catch(function () {}); }
    function onEvt(d) {  // device|scanDone|peer|msg
        if (!d || !d.type) return;
        if (d.type === 'device') { devs[d.addr] = { name: d.name, addr: d.addr };
            if (!$('btc-devices').hidden) renderDevs();
            status(Object.keys(devs).length + ' cerca · escuchando');
            autoConnect(d.addr); }
        else if (d.type === 'scanDone') { status(Object.keys(devs).length + ' cerca · escuchando'); }
        else if (d.type === 'wifiDevice' && d.ip) {   // TRIBALs visto en la LAN/hotspot
            devs[d.ip] = { name: d.name || d.ip, addr: d.ip, kind: 'wifi' };
            if (!$('btc-devices').hidden) renderDevs();
            status(Object.keys(devs).length + ' cerca · escuchando'); }
        else if (d.type === 'hotspot') {   // mi red tribal cambió de estado
            status(d.state === 'on' ? '📡 Red tribal activa — comparte los datos' : peersLabel()); }
        else if (d.type === 'peer') {
            if (d.state === 'open') { peers[d.addr || d.name || 'peer'] = d.name || 'la tribu';
                saveFav(d.addr, d.name); connModal(d.name);
                status(peersLabel()); $('btc-title').textContent = chatTitle() === 'Chat tribal' ? (d.name || 'Chat tribal') : chatTitle();
                showChat(); sendAv(); flushOutbox(); }
            else { var nm = (d.addr && peers[d.addr]) || d.name;
                if (d.addr) delete peers[d.addr]; else peers = {};
                if (nPeers()) { status(peersLabel()); $('btc-title').textContent = chatTitle(); }
                else { status(d.state === 'error' ? 'error de conexión' :
                    (nm ? nm + ' desconectada' : 'desconectado · toca para ver'));
                    $('btc-title').textContent = 'Chat tribal'; }
                if (d.state === 'error') toast(d.msg || 'Error de conexión');
                if (!$('btc-devices').hidden) renderDevs();
                N.listen().catch(function () {}); } }
        else if (d.type === 'msg') {
            var m; try { m = JSON.parse(d.msg); } catch (e) { return; } m.me = false;
            var fromIp = d.from && String(d.from).indexOf('.') > 0 ? d.from : '';
            if (fromIp && !m.tribal) return;        // blindaje: solo paquetes TRIBALs por Wi-Fi
            if (m.k === 'rc') return;                 // comando de control remoto multimedia
            if (m.k === 'winvite') { handleInvite(m, fromIp); return; }
            if (m.k === 'waccept') { toast('📡 ' + (m.n || 'La tribu') + ' aceptó — conectando…'); return; }
            if (m.k === 'wdecline') { toast((m.n || 'La tribu') + ' rechazó la invitación'); return; }
            if (m.k === 'mhead') {                    // cabecera de media troceada
                parts[m.id] = { k: m.mk, name: m.name, mime: m.mime, tot: m.tot,
                    q: m.q, who: m.n, got: 0, p: [], t: Date.now() };
                for (var stale in parts)              // purga de envíos a medio hacer
                    if (Date.now() - parts[stale].t > 180000) delete parts[stale];
                return; }
            if (m.k === 'mpart') {                    // trozo i/n → reensamblar
                var c = parts[m.id]; if (!c) return;
                if (!c.p[m.i]) { c.p[m.i] = m.s; c.got++; }
                if (c.got !== c.tot) return;
                var full = { k: c.k, name: c.name, mime: c.mime, q: c.q, n: c.who,
                    data: c.p.join(''), id: m.id, me: false, ts: Date.now() };
                delete parts[m.id];
                if (msgs.some(function (x) { return x.id === m.id; })) return;
                if (!$('btc-devices').hidden) showChat();
                msgs.push(full); if (window.TribalBtDb) TribalBtDb.put(full);
                appendMsg(full); return; }
            if (m.id && msgs.some(function (x) { return x.id === m.id; })) return;  // eco del relay
            if (m.k === 'del') { msgs = msgs.filter(function (x) { return x.id !== m.id; });
                if (window.TribalBtDb) TribalBtDb.del(m.id); renderMsgs(); }
            else if (m.k === 'ping') sys('🔔 ' + (m.n || 'La tribu') + ' te llama — conéctate');
            else if (m.k === 'av') { if (window.TribalBtAvatar) TribalBtAvatar.setPeer(m.data); }
            else { if (!$('btc-devices').hidden) showChat();   // saca el lienzo
                msgs.push(m); if (window.TribalBtDb) TribalBtDb.put(m); appendMsg(m); } }
    }
    function bubbleHtml(m) {
        if (m.k === 'sys') return '<div class="btc-sys">' + esc(m.text) + '</div>';
        var body = '', nm = '<small>' + esc(m.name) + '</small>',
            qt = m.q ? '<div class="btc-quote" data-qid="' + esc(m.q.id) + '"><b style="color:' +
                nColor(m.q.n || '') + '">' + esc(m.q.n) + '</b><span>' + esc(m.q.t) + '</span></div>' : '';
        if (m.k === 'text') body = bigEmojis(esc(m.text));
        else if (m.k === 'img') body = '<img class="btc-media" loading="lazy" src="' + m.data + '">';
        else if (m.k === 'aud' || m.k === 'voz') body =
            (m.k === 'voz' ? '<span class="btc-voz">🎤</span>' : '') +
            '<audio controls preload="none" src="' + m.data + '"></audio>' + nm;
        else if (m.k === 'vid') body =
            '<video controls preload="none" class="btc-media" src="' + m.data + '"></video>' + nm;
        else body = '<a class="btc-doc" href="' + m.data + '" download="' + esc(m.name) + '">📄 ' + esc(m.name) + '</a>';
        return '<div class="btc-msg ' + (m.me ? 'me' : 'peer') + '" data-id="' + m.id + '">' +
            ((!m.me && m.n) ? '<b class="btc-nm" style="color:' + nColor(m.n) + '">' + esc(m.n) + '</b>' : '') +
            qt + body +
            '<button class="btc-rep" title="Responder"><i class="bi bi-reply"></i></button>' +
            '<button class="btc-del" title="Eliminar">🗑</button>' +
            '<time>' + new Date(m.ts).toLocaleTimeString().slice(0, 5) +
            (m.pending ? ' <i class="btc-wait" title="En espera">⏳</i>' : '') +
            '</time></div>'; }
    function scrollEnd() { var el = $('btc-list'); el.scrollTop = el.scrollHeight; }
    function renderMsgs() {           // reconstruye todo (carga, borrar, limpiar)
        $('btc-list').innerHTML = msgs.map(bubbleHtml).join(''); scrollEnd(); }
    function appendMsg(m) {           // un mensaje nuevo: solo agrega la burbuja
        $('btc-list').insertAdjacentHTML('beforeend', bubbleHtml(m)); scrollEnd(); }
    var delId = null;
    function doDelete(id, everyone) {          // everyone → manda 'del' a la tribu
        if (!id) return; var mine = false;
        msgs = msgs.filter(function (x) { if (x.id !== id) return true; mine = x.me; });
        if (window.TribalBtDb) TribalBtDb.del(id);
        renderMsgs(); $('btc-delsh').hidden = true;
        if (window.TribalBtOutbox) TribalBtOutbox.del(id);   // si estaba en espera, sale del buzón
        if (everyone && mine) N.send(tag({ k: 'del', id: id })).catch(function () {}); }
    document.addEventListener('click', function (e) {  // 🗑 → hoja "para todos / para mí"
        var b = e.target.closest && e.target.closest('.btc-del'); if (!b) return;
        var box = b.closest('.btc-msg'); if (!box) return;
        e.stopImmediatePropagation();          // que el cierre-global no la oculte ya
        delId = box.dataset.id;
        var m = msgs.filter(function (x) { return x.id === delId; })[0];
        $('btc-del-all').hidden = !(m && m.me);  // solo mis mensajes pueden borrarse en ambos
        $('btc-delsh').hidden = false; });
    document.addEventListener('click', function (e) {  // ↩ responder · tocar cita
        var r = e.target.closest && e.target.closest('.btc-rep'), m, t;
        if (r) { var bx = r.closest('.btc-msg');
            if (bx) m = msgs.filter(function (x) { return x.id === bx.dataset.id; })[0];
            if (m) setReply(m); return; }
        var q = e.target.closest && e.target.closest('.btc-quote');
        if (!q || !q.dataset.qid) return;
        t = $('btc-list').querySelector('[data-id="' + q.dataset.qid + '"]');
        if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.add('flash');
            setTimeout(function () { t.classList.remove('flash'); }, 1200); } });
    function push(m) {
        m.id = mid(); m.ts = Date.now(); m.me = true;
        if (!$('btc-devices').hidden) showChat();
        msgs.push(m); if (window.TribalBtDb) TribalBtDb.put(m); appendMsg(m); return m; }
    // marca ⏳ en la burbuja propia (persiste en el historial hasta entregarse)
    function markWait(id, on) {
        var m = msgs.filter(function (x) { return x.id === id; })[0];
        if (!m) return;
        m.pending = on ? 1 : 0;
        if (window.TribalBtDb) TribalBtDb.put(m);
        var el = $('btc-list').querySelector('[data-id="' + id + '"] time');
        if (el) el.innerHTML = new Date(m.ts).toLocaleTimeString().slice(0, 5) +
            (on ? ' <i class="btc-wait" title="En espera">⏳</i>' : ''); }
    // sin peer conectado (o si el socket rechaza) → buzón persistente
    function queuePkt(pkt, m) {
        if (window.TribalBtOutbox)
            TribalBtOutbox.put({ id: pkt.id, pkt: pkt, ts: Date.now() });
        if (m) markWait(m.id, true);
        toast('⏳ En espera — se entregará al conectar'); }
    // media >CHUNK: mhead + mpart×n — si muere a mitad, se reenvía entera
    function sendChunked(pkt, onFail, onDone) {
        var id = pkt.id, n = Math.ceil(pkt.data.length / CHUNK);
        N.send(tag({ k: 'mhead', id: id, mk: pkt.k, name: pkt.name,
                mime: pkt.mime, tot: n, q: pkt.q }))
         .then(function () {
            var i = 0;
            (function next() {
                if (i >= n) { if (onDone) onDone(); return; }
                N.send(tag({ k: 'mpart', id: id, i: i,
                    s: pkt.data.slice(i * CHUNK, (i + 1) * CHUNK) }))
                 .then(function () { i++; setTimeout(next, 25); })
                 .catch(function () { if (onFail) onFail(); });
            })(); })
         .catch(function () { if (onFail) onFail(); }); }
    // punto único de salida: directo si hay tribu, al buzón si no
    function deliver(pkt, m) {
        if (!nPeers()) return queuePkt(pkt, m);
        var data = pkt.data;
        if (!data || data.length <= CHUNK) {
            N.send(pkt).catch(function () { queuePkt(pkt, m); });
            return; }
        sendChunked(pkt, function () { queuePkt(pkt, m); }); }
    // al conectar alguien: drena el buzón en orden (texto directo,
    // media re-troceada); si el socket cae se detiene hasta la próxima
    function flushOutbox() {
        var OB = window.TribalBtOutbox;
        if (!OB || flushing) return;
        OB.all(function (list) {
            if (!list.length) return;
            flushing = true;
            var i = 0, sent = 0;
            (function next() {
                if (i >= list.length) {
                    flushing = false;
                    if (sent) sys('📦 ' + sent + ' mensaje(s) en espera entregado(s)');
                    return; }
                var e = list[i++], pkt = e.pkt;
                var done = function (ok) {
                    if (!ok) { flushing = false; return; }   // socket caído
                    sent++; OB.del(e.id); markWait(e.id, false);
                    setTimeout(next, 60); };
                if (!pkt.data || pkt.data.length <= CHUNK)
                    N.send(pkt).then(function () { done(true); })
                     .catch(function () { done(false); });
                else sendChunked(pkt, function () { done(false); },
                                 function () { done(true); });
            })(); }); }
    function sendText() {
        var t = $('btc-text'), v = t.value.trim();
        if (!v) return; t.value = ''; var q = takeQ();
        var m = push({ k: 'text', text: v, q: q });
        deliver(tag({ k: 'text', text: v, id: m.id, q: q }), m); }
    function sendFile(f) {
        if (f.size > MAX_FILE) return toast('Máximo 8 MB por Bluetooth');
        // MIME del picker puede venir vacío → respaldo por extensión (gif, etc.)
        var ext = (String(f.name).match(/\.([a-z0-9]+)$/i) || [0, ''])[1].toLowerCase(),
            t = f.type || '';
        var k = /^image\//.test(t) || /^(gif|webp|png|jpe?g|bmp|avif|svg)$/.test(ext) ? 'img'
              : /^audio\//.test(t) || /^(mp3|m4a|aac|ogg|oga|wav|flac|opus|wma)$/.test(ext) ? 'aud'
              : /^video\//.test(t) || /^(mp4|mkv|webm|mov|3gp)$/.test(ext) ? 'vid' : 'doc';
        var r = new FileReader();
        r.onload = function () { toast('Enviando ' + f.name + '…'); sendMedia(k, f.name, f.type, r.result); };
        r.readAsDataURL(f); }
    // envía un archivo ya leído como dataURL (📎 o biblioteca → TribalBtLib).
    // >CHUNK → mhead + mpart×n: un frame de varios MB no sobrevive al bridge
    // nativo ni fluye por RFCOMM; los trozos sí, y se reensamblan al llegar.
    function sendMedia(k, name, mime, data) {
        var q = takeQ(), m = push({ k: k, name: name, mime: mime, data: data, q: q });
        deliver(tag({ k: k, name: name, mime: mime, data: data, id: m.id, q: q }), m); }
    function open(d) {
        deps = d || {}; build(); ov.hidden = false;
        if (window.TribalBtBadge) TribalBtBadge.clear();
        if (open_) { N.listen().catch(function () {}); flushOutbox(); return; }  // sigue en escucha
        open_ = true;                            // historial persistente
        if (window.TribalBtDb) TribalBtDb.load(function (h) {
            msgs = h || []; if (!$('btc-list').hidden) renderMsgs(); });
        N.ensurePerms().then(function () { return N.init(onEvt); }).then(function () {
            var lb = $('btc-onoff-lb'), off = localStorage.getItem(ON_KEY) === '0';
            if (lb) lb.textContent = off ? 'Encender chat' : 'Apagar chat';
            if (off) { status('apagado'); renderDevs(); return; }
            // invitación recibida con el chat cerrado (la guardó la insignia)
            var inv = window.__btcInv;
            if (inv && Date.now() - inv.at < 90000) {
                window.__btcInv = null; handleInvite(inv.m, inv.from); }
            status(peersLabel()); N.listen().catch(function () {}); doScan();
            N.devices().then(function (r) {
                (r.bonded || []).forEach(function (x) { devs[x.addr] = x; autoConnect(x.addr); }); renderDevs();
                if (r.enabled || !N.isNative()) return;
                // BT apagado al entrar: avisar y preguntar si activarlo —
                // una sola vez por apertura, no en bucle
                status('bluetooth desconectado');
                var ask = function () {
                    N.enable().then(function () {
                        N.listen().catch(function () {});
                        sys('📡 Chat tribal escuchando');
                        status(peersLabel());
                        setTimeout(doScan, 2500);   // dar tiempo al sistema
                    }).catch(function () { toast('No se pudo activar el Bluetooth'); });
                };
                if (deps.confirm) deps.confirm('Bluetooth desconectado',
                    'El chat necesita el Bluetooth encendido para escuchar a la tribu. ¿Activarlo?',
                    'Activar', ask);
                else toast('Bluetooth desconectado — actívalo para el chat'); }); }); }
    function close() { ov.hidden = true; if (window.TribalBtVoice) window.TribalBtVoice.cancel(); }
    return { open: open, close: close, sendMedia: sendMedia };
})();
