// ============================================================================
// ARCHIVO: media/btchatbadge.js
// RESPONSABILIDAD: insignia de mensajes BT sin leer sobre el botón del sol.
//   - Se suscribe a TribalBtNet aunque el chat esté cerrado: cada mensaje
//     entrante sube el contador y vibra (patrón largo si es un "aviso" 🔔).
//   - Tocar la insignia abre el chat (dispara el botón del menú de opciones).
//   - Al arrancar, si el chat está activado ('tribu_btchat_on'), pone el
//     transporte en escucha sin abrir la UI — "siempre escuchando".
// API: window.TribalBtBadge.{clear(), unread()}
// ============================================================================
window.TribalBtBadge = (function () {
    'use strict';
    var N = window.TribalBtNet;
    var el = null, n = 0;

    function openChat() {
        clear();
        var b = document.getElementById('vm-btchat');
        if (b) { b.click(); return; }                 // ruta normal (con deps)
        if (window.TribalBtChat)                      // respaldo si el menú no existe aún
            window.TribalBtChat.open({ toast: function () {} });
    }
    function hookSun() {
        var sun = document.getElementById('sun-btchat');
        if (sun && !sun._btHooked) {                  // el sol SIEMPRE abre el chat
            sun._btHooked = true;
            sun.addEventListener('click', function () { openChat(); });
            sun.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openChat(); } });
        }
        return sun;
    }
    function ensure() {
        var wrap = hookSun() || document.getElementById('media-fab-wrap');
        if (!wrap) return el;
        if (!el) {
            el = document.createElement('button');
            el.className = 'fab-btbadge';
            el.type = 'button';
            el.title = 'Mensajes del chat Bluetooth';
            el.innerHTML = '<i class="bi bi-bluetooth"></i><b>0</b>';
            el.hidden = true;
            el.addEventListener('click', function (e) {
                e.stopPropagation();
                openChat();
            });
            wrap.appendChild(el);
        }
        return el;
    }
    function paint() {
        if (!ensure()) return;
        el.hidden = n <= 0;
        el.querySelector('b').textContent = n > 99 ? '99+' : n;
    }
    function chatOpen() {
        var ov = document.querySelector('.tribal-btchat-ov');
        return !!(ov && !ov.hidden);
    }
    function buzz(pat) {
        try { if (navigator.vibrate) navigator.vibrate(pat); } catch (e) {}
    }

    // cada evento del transporte (suscripción propia, vive siempre)
    function onEvt(d) {
        if (!d || d.type !== 'msg') return;
        var m;
        try { m = JSON.parse(d.msg); } catch (e) { return; }
        var ping = m.k === 'ping';
        if (chatOpen()) return;                    // el chat ya lo está viendo
        n++; paint();
        buzz(ping ? [0, 200, 120, 200, 120, 400] : [0, 180, 90, 180]);
    }

    function clear() { n = 0; paint(); }
    function unread() { return n; }

    // arranque: chat activado → suscribirse + escuchar sin abrir la UI
    function boot() {
        var on;
        try { on = localStorage.getItem('tribu_btchat_on') !== '0'; }
        catch (e) { on = true; }
        N.init(onEvt);
        hookSun();                                   // aunque no haya badge aún
        if (on && N.isNative()) N.listen().catch(function () {});
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    return { clear: clear, unread: unread };
})();
