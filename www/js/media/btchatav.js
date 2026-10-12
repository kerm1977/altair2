// ============================================================================
// ARCHIVO: media/btchatav.js
// RESPONSABILIDAD: avatar del chat tribal — el círculo de la cabecera.
//   - Toque → selector de imagen → se encoge a 96px JPEG → IndexedDB
//     ('tribu_chat_db') → queda como "mi cara".
//   - El avatar se manda al peer (mensaje k:'av' desde btchat.js) y el suyo
//     queda guardado como 'avatar_peer' — la cabecera muestra su cara.
// API: TribalBtAvatar.{mount(btn), mine(cb), setPeer(url)}
// ============================================================================
window.TribalBtAvatar = (function () {
    'use strict';
    var me = null, peer = null, el = null, idb = null;

    function dbi() {
        if (idb) return Promise.resolve(idb);
        return new Promise(function (res) {
            try {
                var r = indexedDB.open('tribu_chat_db', 1);
                r.onupgradeneeded = function () {
                    r.result.createObjectStore('kv'); };
                r.onsuccess = function () { idb = r.result; res(idb); };
                r.onerror = function () { res(null); };
            } catch (e) { res(null); }
        });
    }
    function put(k, v) {
        dbi().then(function (x) {
            if (!x) return;
            try { x.transaction('kv', 'readwrite').objectStore('kv').put(v, k); }
            catch (e) {}
        });
    }
    function get(k, cb) {
        dbi().then(function (x) {
            if (!x) return cb(null);
            try {
                var rq = x.transaction('kv').objectStore('kv').get(k);
                rq.onsuccess = function () { cb(rq.result || null); };
                rq.onerror = function () { cb(null); };
            } catch (e) { cb(null); }
        });
    }

    // la cara que se ve: la del peer si estamos conectados, si no la mía
    function paint() {
        if (!el) return;
        var url = peer || me;
        el.style.backgroundImage = url ? 'url(' + url + ')' : '';
        el.classList.toggle('hasimg', !!url);
    }

    // cualquier foto → JPEG 96×96 (chico para viajar por Bluetooth)
    function shrink(file, cb) {
        var fr = new FileReader();
        fr.onload = function () {
            var im = new Image();
            im.onload = function () {
                var c = document.createElement('canvas');
                c.width = c.height = 96;
                var s = Math.max(96 / im.width, 96 / im.height);
                c.getContext('2d').drawImage(im,
                    (96 - im.width * s) / 2, (96 - im.height * s) / 2,
                    im.width * s, im.height * s);
                cb(c.toDataURL('image/jpeg', 0.75));
            };
            im.onerror = function () { cb(null); };
            im.src = fr.result;
        };
        fr.readAsDataURL(file);
    }

    function mount(btn) {
        el = btn;
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*'; inp.hidden = true;
        document.body.appendChild(inp);
        inp.addEventListener('change', function () {
            var f = this.files && this.files[0]; this.value = '';
            if (!f) return;
            shrink(f, function (url) {
                if (!url) return;
                me = url; put('avatar_me', url); paint();
            });
        });
        el.addEventListener('click', function (e) {
            e.stopPropagation(); inp.click();
        });
        get('avatar_me', function (v) { me = v; paint(); });
        get('avatar_peer', function (v) { peer = v; paint(); });
    }

    function mine(cb) {
        if (me) return cb(me);
        get('avatar_me', function (v) { me = v; cb(v || ''); });
    }
    function setPeer(url) {
        if (!url) return;
        peer = url; put('avatar_peer', url); paint();
    }
    return { mount: mount, mine: mine, setPeer: setPeer };
})();
