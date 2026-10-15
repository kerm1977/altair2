// ============================================================================
// ARCHIVO: media/imgeditmem.js  (<=200 líneas)
// RESPONSABILIDAD: memoria del editor de imágenes.
//   - Historial deshacer/rehacer (pila de estados JSON, máx. 40 pasos)
//   - Borrador persistente en localStorage por imagen: si la app se cierra
//     a media edición, al reabrir el editor se restaura el estado exacto
//     (filtros, recorte, capas, transformaciones, imagen ya recortada)
//   - Los stickers de la tribu se guardan por id (iid) y se recargan
//   API: push/undo/redo/save/restore/clear
// ============================================================================
window.TribalImgEditMem = (function () {
    'use strict';
    var KEY = 'tribu_ie_draft_';

    // ---- serializar --------------------------------------------------------
    function packOv(o) {
        return { ty: o.ty, str: o.str || null, iid: o.iid || null,
                 x: o.x, y: o.y, s: o.s, f: o.f || null, c: o.c || null,
                 rot: o.rot || 0, fh: o.fh ? 1 : 0, fv: o.fv ? 1 : 0,
                 name: o.name || '' };
    }
    function pack(E) {
        var s = E.st;
        var imgData = null;
        if (E.imgSrc && E.imgSrc !== 'orig') {
            // el dataURL del recorte horneado puede ser enorme: si pesa más
            // de ~2.5 MB se reexporta en JPEG compacto para que quepa
            if (E.imgSrc.length > 2500000) {
                try {
                    var c = document.createElement('canvas');
                    var sc = Math.min(1, 1200 / Math.max(E.img.width, E.img.height));
                    c.width = Math.max(1, E.img.width * sc);
                    c.height = Math.max(1, E.img.height * sc);
                    c.getContext('2d').drawImage(E.img, 0, 0, c.width, c.height);
                    E.imgSrc = c.toDataURL('image/jpeg', .82);
                } catch (e) {}
            }
            imgData = E.imgSrc;
        }
        return JSON.stringify({
            img: imgData,
            st: { br: s.br, co: s.co, sa: s.sa, r: s.r, g: s.g, b: s.b,
                  sharp: s.sharp, blur: s.blur, edgeBlur: s.edgeBlur,
                  vig: s.vig, vx: s.vx, vy: s.vy, flipH: s.flipH,
                  flipV: s.flipV, rot: s.rot, zoom: s.zoom, crop: s.crop,
                  ovs: s.ovs.map(packOv) }
        });
    }

    // ---- aplicar un estado (async: recarga la imagen y los stickers) -------
    function unpack(E, js, done) {
        var d;
        try { d = JSON.parse(js); } catch (e) { return done(false); }
        var st = d.st || {};
        Object.keys(st).forEach(function (k) {
            if (k !== 'ovs') E.st[k] = st[k];
        });
        E.st.ovs = st.ovs || [];
        E.st.sel = null; E.sel = null;
        E.cropBox = null; E.cropRatio = null;
        var seq = Promise.resolve();
        if (d.img && d.img !== E.imgSrc) {          // base ya recortada
            seq = seq.then(function () {
                return new Promise(function (res) {
                    var im = new Image();
                    im.onload = function () { E.img = im; E.imgSrc = d.img; res(); };
                    im.onerror = function () { res(); };
                    im.src = d.img;
                });
            });
        }
        E.st.ovs.forEach(function (o) {             // stickers = fotos tribu
            if (o.iid && !o.img) {
                seq = seq.then(function () {
                    return new Promise(function (res) {
                        var m = (E.deps.items || []).filter(function (x) {
                            return x.id === o.iid; })[0];
                        if (!m) return res();
                        E.deps.urlFor(m, function (u) {
                            if (!u) return res();
                            var im = new Image();
                            im.onload = function () { o.img = im; res(); };
                            im.onerror = function () { res(); };
                            im.src = u;
                        });
                    });
                });
            }
        });
        seq.then(function () {
            if (window.TribalImgEditTouch) window.TribalImgEditTouch.placeCropDiv(E);
            if (window.TribalImgEditUI) window.TribalImgEditUI.sync(E);
            E.render();
            done(true);
        });
    }

    // ---- historial ---------------------------------------------------------
    function push(E) {
        E.hist.u.push(pack(E));
        if (E.hist.u.length > 40) E.hist.u.shift();
        E.hist.r = [];
    }
    function undo(E) {
        if (!E.hist || E.hist.u.length < 2) return;
        E.hist.r.push(E.hist.u.pop());
        unpack(E, E.hist.u[E.hist.u.length - 1], function () {});
        save(E);
    }
    function redo(E) {
        if (!E.hist || !E.hist.r.length) return;
        var js = E.hist.r.pop();
        E.hist.u.push(js);
        unpack(E, js, function () {});
        save(E);
    }

    // ---- borrador anti-cierre ----------------------------------------------
    function save(E) {
        clearTimeout(E._dTimer);
        E._dTimer = setTimeout(function () {
            try { localStorage.setItem(KEY + E.meta.id, pack(E)); } catch (e) {}
        }, 500);
    }
    function restore(E, done) {
        var js = null;
        try { js = localStorage.getItem(KEY + E.meta.id); } catch (e) {}
        if (!js) return done(false);
        unpack(E, js, done);
    }
    function clear(id) {
        try { localStorage.removeItem(KEY + id); } catch (e) {}
    }

    return { push: push, undo: undo, redo: redo,
             save: save, restore: restore, clear: clear };
})();
