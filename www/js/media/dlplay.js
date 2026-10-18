// ============================================================================
// ARCHIVO: media/dlplay.js — reproductor inline y miniaturas del descargador
// RESPONSABILIDAD: playInline() monta un <video> en PRIMER PLANO dentro de la
// página (el visor tribal monta en S.root, debajo del overlay — se oía pero
// no se veía). metaFor() encuentra el meta de la descarga y lo re-registra
// si el índice lo perdió pero el archivo sigue en tribu_dl. fillThumb()
// genera el primer frame del video con el sondeo del core, cacheado por id
// de descarga (refresh() corre cada segundo durante la cola).
// API: TribalDlPlay.make(deps) → { play, fillThumb, metaFor }
// ============================================================================
window.TribalDlPlay = (function () {
    'use strict';

    function make(deps, ov) {
        var thumbCache = {};
        function el(s) { var r = ov && ov(); return r ? r.querySelector(s) : null; }
        function say(t) { var s = el('.dg-status'); if (s) s.textContent = t; }

        // metas que apuntan al MISMO archivo de tribu_dl — por basename:
        // el plugin puede haber registrado /data/user/0/… y /data/data/…
        // (symlink del mismo archivo) como dos metas distintos
        function metasFor(e) {
            var idx = (window.MediaStore && MediaStore._index)
                ? MediaStore._index() : [], hits = [];
            var base = e.path ? String(e.path).split('/').pop() : null;
            idx.forEach(function (x) {
                if (e.metaId && x.id === e.metaId) return hits.push(x);
                if (!base || !x.path) return;
                if (x.path === e.path) return hits.unshift(x);
                if (x.path.indexOf('tribu_dl') >= 0 &&
                    String(x.path).split('/').pop() === base) hits.push(x);
            });
            return hits;
        }

        // meta de la descarga; si el índice lo perdió pero el archivo sigue
        // en tribu_dl → se re-registra sobre la marcha y queda en Videos.
        // Y si hay metas gemelos del mismo archivo → queda solo el primero.
        function metaFor(e) {
            var hits = metasFor(e), m = hits[0] || null;
            for (var i = 1; i < hits.length; i++) {
                try { MediaStore.remove(hits[i].id); } catch (x) {}
            }
            if (!m && e.path) {
                try {
                    MediaStore.addRefs([{ path: e.path, name: e.name,
                        size: e.size || 0,
                        mime: window.TribalDlList.mimeOf(e.name) }]);
                    m = metasFor(e)[0] || null;
                } catch (x) {}
            }
            return m;
        }

        function play(m) {
            var root = ov && ov();
            if (!root) return;
            var old = root.querySelector('.dg-play');
            if (old) old.parentNode.removeChild(old);
            // si el archivo ya no está en disco, decirlo claro en vez de
            // dejar un <video> cargando en infinito
            var FS = window.Capacitor && Capacitor.Plugins &&
                     Capacitor.Plugins.Filesystem;
            if (m.path && FS && FS.stat) {
                FS.stat({ path: 'file://' + m.path }).then(function () {
                    openPlayer(m);
                }).catch(function () {
                    say('✖ el archivo ya no está en el dispositivo');
                });
                return;
            }
            openPlayer(m);
        }

        function openPlayer(m) {
            deps.urlFor(m, function (url) {
                if (!url || !ov() || !ov().isConnected)
                    return say('no pude leer el archivo');
                var p = document.createElement('div');
                p.className = 'dg-play';
                p.innerHTML =
                    '<button class="dg-play-x">‹</button>' +
                    '<div class="dg-play-name">' + (m.name || '') + '</div>' +
                    '<video class="dg-play-v" controls autoplay playsinline' +
                    ' src="' + url + '"></video>';
                ov().appendChild(p);
                var v = p.querySelector('video');
                v.addEventListener('error', function () {
                    say('✖ el archivo no se pudo reproducir');
                });
                p.querySelector('.dg-play-x').addEventListener('click',
                    function () {
                        v.pause(); v.removeAttribute('src'); v.load();
                        p.parentNode.removeChild(p);
                    });
            });
        }

        function paintThumb(box, data) {
            if (!box.isConnected) return;
            var img = document.createElement('img');
            img.src = data; img.alt = '';
            box.insertBefore(img, box.firstChild);
            var ic = box.querySelector('i');
            if (ic) ic.style.display = 'none';
        }
        function fillThumb(box, e) {
            var data = thumbCache[e.id];
            if (data) return paintThumb(box, data);
            if (data === 0) return;                // ya falló antes
            var m = metaFor(e), S = deps.sono;
            if (!m || !S || !S.videoThumb) return;
            deps.urlFor(m, function (u) {
                if (!u) { thumbCache[e.id] = 0; return; }
                S.videoThumb(u, function (d) {
                    thumbCache[e.id] = d || 0;
                    if (d) paintThumb(box, d);
                });
            });
        }

        // re-registro masivo: si el índice se perdió (limpieza, datos
        // borrados) pero los archivos siguen en tribu_dl, al abrir el
        // descargador vuelven a la biblioteca solos. stat() primero —
        // un meta de un archivo ya muerto sería una tarjeta inerte.
        function healAll(onHeal) {
            var L = window.TribalDlLog; if (!L) return;
            var FS = window.Capacitor && Capacitor.Plugins &&
                     Capacitor.Plugins.Filesystem;
            L.list().forEach(function (e) {
                if (e.status !== 'ok' || !e.path || metasFor(e).length)
                    return;
                if (FS && FS.stat) {
                    FS.stat({ path: 'file://' + e.path }).then(function () {
                        if (metaFor(e) && onHeal) onHeal(e);
                    }).catch(function () {});   // el archivo ya no existe
                } else if (metaFor(e) && onHeal) onHeal(e);
            });
        }

        return { play: play, fillThumb: fillThumb, metaFor: metaFor,
                 healAll: healAll };
    }

    return { make: make };
})();
