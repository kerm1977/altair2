// === media/btchatnet.js (<= 200 líneas): Transporte Bluetooth + Wi-Fi/Hotspot ===
window.TribalBtNet = (function () {
    'use strict';

    var P = (window.Capacitor && window.Capacitor.Plugins) || {};
    var BT = P.TribalBt || null;
    var nativeOn = !!(BT && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    var FAV_KEY = 'tribu_btfavs', PERM_OK_KEY = 'tribu_bt_perm_ok';
    var cbs = [], bc = null, tabId = 'tab_' + Math.random().toString(36).slice(2, 9);
    var fakePeers = {}, autoTried = {};

    function emit(d) { cbs.forEach(function (f) { try { f(d); } catch (e) {} }); }
    function isNative() { return nativeOn; }
    function favs() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '{}'); } catch (e) { return {}; } }
    function saveFavs(map) { try { localStorage.setItem(FAV_KEY, JSON.stringify(map || {})); } catch (e) {} }
    function isFav(addr) { var f = favs(); return !!(addr && f[addr] && f[addr].fav !== false); }

    function setFav(addr, name, kind, favFlag) {
        if (!addr) return;
        var f = favs(), prev = f[addr] || {};
        f[addr] = {
            name: name || prev.name || addr, addr: addr,
            kind: kind || prev.kind || 'bt',
            fav: favFlag == null ? true : !!favFlag, ts: Date.now()
        };
        saveFavs(f);
    }
    function toggleFav(addr, name, kind) {
        var next = !isFav(addr);
        setFav(addr, name, kind, next);
        return next;
    }

    function autoConnectIfFav(addr, connected) {
        if (!addr || connected || !isFav(addr)) return;
        var last = autoTried[addr] || 0;
        if (Date.now() - last < 45000) return;
        autoTried[addr] = Date.now();
        connect(addr).catch(function () {});
    }

    function init(callback) {
        if (callback && cbs.indexOf(callback) < 0) cbs.push(callback);
        if (nativeOn) {
            if (!init._native) {
                init._native = true;
                BT.addListener('bt', function (d) {
                    if (d && d.type === 'device' && d.addr) autoConnectIfFav(d.addr, d.connected);
                    emit(d);
                });
                listen().catch(function () {});
            }
            return Promise.resolve();
        }
        if ('BroadcastChannel' in window && !bc) {
            bc = new BroadcastChannel('tribu-btchat');
            bc.onmessage = function (e) {
                var d = e.data || {};
                if (d.from === tabId) return;
                if (d.type === 'hello') {
                    fakePeers[d.from] = { name: d.name, addr: d.from, kind: 'phone', connected: true };
                    emit({ type: 'device', name: d.name + ' (cerca)', addr: d.from, kind: 'phone', connected: true });
                    post({ type: 'hi-back', to: d.from, name: 'Tribu ' + tabId.slice(-4) });
                } else if (d.type === 'hi-back' && d.to === tabId) {
                    fakePeers[d.from] = { name: d.name, addr: d.from, kind: 'phone', connected: true };
                    emit({ type: 'device', name: d.name + ' (cerca)', addr: d.from, kind: 'phone', connected: true });
                } else if (d.type === 'peer' && (d.to === tabId || !d.to)) {
                    emit({ type: 'peer', state: d.state, name: d.name, addr: d.from });
                } else if (d.type === 'msg' && (d.to === tabId || !d.to)) {
                    emit({ type: 'msg', msg: d.msg, from: d.from });
                }
            };
        }
        return Promise.resolve();
    }

    function post(o) { o.from = tabId; if (bc) bc.postMessage(o); }

    function ensurePerms() {
        if (!nativeOn || !BT.ensurePerms) return Promise.resolve();
        return BT.ensurePerms().then(function () {
            try { localStorage.setItem(PERM_OK_KEY, '1'); } catch (e) {}
        });
    }

    function devices() {
        if (nativeOn) {
            return BT.devices().then(function (r) {
                ((r && r.bonded) || []).forEach(function (x) {
                    if (x && x.addr) autoConnectIfFav(x.addr, x.connected);
                });
                return r;
            });
        }
        return Promise.resolve({
            enabled: true,
            bonded: Object.keys(fakePeers).map(function (k) { return fakePeers[k]; })
        });
    }

    function scan(userGesture) {
        if (nativeOn) {
            return ensurePerms().then(function () {
                listen().catch(function () {});
                return BT.scan();
            });
        }
        post({ type: 'hello', name: 'Tribu ' + tabId.slice(-4) });
        if (userGesture && navigator.bluetooth && navigator.bluetooth.requestDevice) {
            navigator.bluetooth.requestDevice({ acceptAllDevices: true })
                .then(function (dev) {
                    var a = dev.id || dev.name || 'ble_dev';
                    var nm = dev.name || ('Bluetooth ' + String(a).slice(0, 6));
                    fakePeers[a] = { name: nm, addr: a, kind: 'bt', bonded: true, connected: true };
                    setFav(a, nm, 'bt', true);
                    emit({ type: 'device', name: nm, addr: a, kind: 'bt', bonded: true, connected: true });
                    emit({ type: 'peer', state: 'open', name: nm, addr: a, kind: 'bt' });
                }).catch(function () {});
        }
        setTimeout(function () { emit({ type: 'scanDone' }); }, 800);
        return Promise.resolve();
    }

    function invite() {
        if (nativeOn) {
            return ensurePerms().then(function () {
                listen().catch(function () {});
                return BT.discoverable();
            });
        }
        post({ type: 'hello', name: 'Tribu ' + tabId.slice(-4) });
        return Promise.resolve();
    }

    function listen() { return nativeOn ? BT.listen() : Promise.resolve(); }
    function enable() { return (nativeOn && BT.requestEnable) ? BT.requestEnable() : Promise.resolve(); }

    function connect(addr) {
        if (nativeOn) return BT.connect({ addr: addr });
        var nm = (fakePeers[addr] && fakePeers[addr].name) || (favs()[addr] && favs()[addr].name) || addr;
        emit({ type: 'peer', state: 'open', name: nm, addr: addr });
        post({ type: 'peer', state: 'open', name: 'Tribu ' + tabId.slice(-4) });
        return Promise.resolve();
    }

    function setOn(on) { return (nativeOn && BT.setOn) ? BT.setOn({ on: !!on }) : Promise.resolve(); }
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
    function pause(on) { return (nativeOn && BT.pauseListen) ? BT.pauseListen({ pause: !!on }) : Promise.resolve(); }

    function wifiScan() {
        if (nativeOn && BT.wifiScan) {
            return ensurePerms().then(function () { return BT.wifiScan(); });
        }
        post({ type: 'hello', name: 'Tribu Wi-Fi ' + tabId.slice(-4) });
        var conn = navigator.connection || {};
        return Promise.resolve({
            ip: location.hostname || '127.0.0.1',
            enabled: navigator.onLine !== false,
            hotspotOn: false,
            currentSsid: conn.type === 'wifi' ? 'Red Wi-Fi activa' : (navigator.onLine ? 'Red local conectada' : ''),
            networks: [
                { ssid: 'Red Local / Hotspot TRIBALs', bssid: 'local', level: 95, secure: true, hotspot: true, connected: true }
            ]
        });
    }

    function wifiSend(obj, toIp) {
        var s = JSON.stringify(obj);
        post({ type: 'msg', msg: s });
        if (nativeOn && BT.wifiSend) return BT.wifiSend({ msg: s, ip: toIp || '255.255.255.255' });
        return Promise.resolve();
    }

    return {
        isNative: isNative, init: init, devices: devices, scan: scan, invite: invite,
        listen: listen, enable: enable, connect: connect, send: send, close: close,
        setOn: setOn, pause: pause, ensurePerms: ensurePerms,
        favs: favs, isFav: isFav, setFav: setFav, toggleFav: toggleFav,
        wifiScan: wifiScan, wifiSend: wifiSend,
        openSettings: function () { return (nativeOn && BT.openBtSettings) ? BT.openBtSettings() : scan(true); },
        openWifiSettings: function () { return (nativeOn && BT.openWifiSettings) ? BT.openWifiSettings() : Promise.resolve(); },
        openHotspotSettings: function () { return (nativeOn && BT.openHotspotSettings) ? BT.openHotspotSettings() : Promise.resolve(); }
    };
})();
