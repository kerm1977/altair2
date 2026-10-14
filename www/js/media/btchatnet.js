// ============================================================================
// ARCHIVO: media/btchatnet.js
// RESPONSABILIDAD: transporte del chat tribal.
//   APK → plugin nativo TribalBt (RFCOMM): permisos, scan, listen, connect,
//         send/close + eventos 'bt'.
//   Web → BroadcastChannel 'tribu-btchat' (permite probar entre pestañas del
//         mismo navegador; los "dispositivos" son las demás pestañas).
// API: window.TribalBtNet.{isNative,init(cb),devices(),scan(),invite(),
//       listen(),connect(addr),send(obj),close(),on(evt)}
// Eventos al cb: device|scanDone|peer|msg|error
// ============================================================================
window.TribalBtNet = (function () {
    'use strict';

    var P = (window.Capacitor && window.Capacitor.Plugins) || {};
    var BT = P.TribalBt || null;
    var nativeOn = !!(BT && window.Capacitor.isNativePlatform &&
                      window.Capacitor.isNativePlatform());
    var cbs = [];                 // varios suscriptores (chat + badge)
    var bc = null, tabId = 'tab_' + Math.random().toString(36).slice(2, 9);
    var fakePeers = {};

    function emit(d) { cbs.forEach(function (f) { try { f(d); } catch (e) {} }); }
    function isNative() { return nativeOn; }

    // init: suscribe un callback; engancha listener nativo o canal web 1 vez
    function init(callback) {
        if (callback && cbs.indexOf(callback) < 0) cbs.push(callback);
        if (nativeOn) {
            if (!init._native) {
                init._native = true;
                return BT.addListener('bt', function (d) { emit(d); });
            }
            return Promise.resolve();
        }
        // web: BroadcastChannel entre pestañas
        if ('BroadcastChannel' in window && !bc) {
            bc = new BroadcastChannel('tribu-btchat');
            bc.onmessage = function (e) {
                var d = e.data || {};
                if (d.from === tabId) return;          // eco propio
                if (d.type === 'hello') {              // otra pestaña se anuncia
                    fakePeers[d.from] = { name: d.name, addr: d.from };
                    emit({ type: 'device', name: d.name + ' (web)', addr: d.from });
                    post({ type: 'hi-back', to: d.from, name: 'Tribu ' + tabId.slice(-4) });
                } else if (d.type === 'hi-back' && d.to === tabId) {
                    fakePeers[d.from] = { name: d.name, addr: d.from };
                    emit({ type: 'device', name: d.name + ' (web)', addr: d.from });
                } else if (d.type === 'peer' && (d.to === tabId || !d.to)) {
                    emit({ type: 'peer', state: d.state, name: d.name });
                } else if (d.type === 'msg' && (d.to === tabId || !d.to)) {
                    emit({ type: 'msg', msg: d.msg });
                }
            };
        }
        return Promise.resolve();
    }

    function post(o) {
        o.from = tabId;
        if (o.type === 'hi-back' || o.to) o.to = o.to;
        if (bc) bc.postMessage(o);
    }

    // lista de emparejados (nativo) o pestañas conocidas (web)
    function devices() {
        if (nativeOn) return BT.devices();
        return Promise.resolve({
            enabled: true,
            bonded: Object.keys(fakePeers).map(function (k) { return fakePeers[k]; })
        });
    }

    function scan() {
        if (nativeOn) return BT.scan();
        fakePeers = {};
        post({ type: 'hello', name: 'Tribu ' + tabId.slice(-4) });
        setTimeout(function () { emit({ type: 'scanDone' }); }, 1500);
        return Promise.resolve();
    }

    // "invitación": hacer visible (nativo) / re-anunciarse (web)
    function invite() {
        if (nativeOn) return BT.discoverable();
        post({ type: 'hello', name: 'Tribu ' + tabId.slice(-4) });
        return Promise.resolve();
    }

    function listen() {
        if (nativeOn) return BT.listen();
        return Promise.resolve();
    }

    // diálogo del sistema para encender el Bluetooth (nativo; web = no-op)
    function enable() {
        if (nativeOn && BT.requestEnable) return BT.requestEnable();
        return Promise.resolve();
    }

    function connect(addr) {
        if (nativeOn) return BT.connect({ addr: addr });
        // web: la conexión es el canal entero — "conectar" = marcar abierto
        emit({ type: 'peer', state: 'open', name: (fakePeers[addr] || {}).name || addr });
        post({ type: 'peer', state: 'open', name: 'Tribu ' + tabId.slice(-4) });
        return Promise.resolve();
    }

    // encender/apagar el chat: en nativo arranca o mata el servicio de escucha
    function setOn(on) {
        if (nativeOn && BT.setOn) return BT.setOn({ on: !!on });
        return Promise.resolve();
    }

    // obj → JSON string por el socket / canal
    function send(obj) {
        var s = JSON.stringify(obj);
        if (nativeOn) return BT.send({ msg: s });
        post({ type: 'msg', msg: s });
        return Promise.resolve();
    }

    function close() {
        if (nativeOn) return BT.close();
        post({ type: 'peer', state: 'closed' });
        return Promise.resolve();
    }

    // silenciar la escucha sin apagar el chat (nativo: cierra el server socket)
    function pause(on) {
        if (nativeOn && BT.pauseListen) return BT.pauseListen({ pause: !!on });
        return Promise.resolve();
    }

    return {
        isNative: isNative,
        init: init,
        devices: devices,
        scan: scan,
        invite: invite,
        listen: listen,
        enable: enable,
        connect: connect,
        send: send,
        close: close,
        setOn: setOn,
        pause: pause,
        openSettings: function () {
            if (nativeOn && BT.openBtSettings) return BT.openBtSettings();
            if (navigator.bluetooth && navigator.bluetooth.requestDevice) {
                return navigator.bluetooth.requestDevice({ acceptAllDevices: true })
                    .then(function (dev) {
                        var a = dev.id || dev.name || 'ble_dev';
                        fakePeers[a] = { name: dev.name || 'Dispositivo BT', addr: a, kind: 'bt' };
                        emit({ type: 'device', name: dev.name || 'Dispositivo BT', addr: a, kind: 'bt' });
                        emit({ type: 'peer', state: 'open', name: dev.name || 'Dispositivo BT', addr: a, kind: 'bt' });
                    }).catch(function () {});
            }
            return Promise.resolve();
        },
        ensurePerms: function () {
            return nativeOn && BT.ensurePerms ? BT.ensurePerms()
                                             : Promise.resolve();
        }
    };
})();
