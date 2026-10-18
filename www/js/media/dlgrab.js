// ============================================================================
// ARCHIVO: media/dlgrab.js — descargador de video/audio de internet
// RESPONSABILIDAD: pega un enlace de cualquier sitio (YouTube, Vimeo, redes,
// páginas) y baja el MP4 o el audio MP3 con yt-dlp corriendo EN EL TELÉFONO
// (TribalDl nativo). El archivo queda guardado y registrado en la biblioteca
// (grupo «descargas» por procedencia). Solo funciona en el APK — en la
// preview web muestra el aviso.
// API: TribalDlGrab.open(deps) / close()
// ============================================================================
window.TribalDlGrab = (function () {
    'use strict';
    var ov = null, deps = {}, busy = false, listener = null;
    var $ = function (id) { return ov ? ov.querySelector('#' + id) : null; };

    function plug() { return window.Capacitor &&
        Capacitor.Plugins && Capacitor.Plugins.TribalDl; }
    function toast(t) { (deps.toast || function () {})(t); }
    function say(t) { var el = $('dg-state'); if (el) el.textContent = t; }
    function bar(p) {
        var el = $('dg-fill');
        if (el) el.style.width = Math.max(0, Math.min(100, p)) + '%';
    }
    function mimeOf(name) {
        var ext = (name.split('.').pop() || '').toLowerCase();
        var m = { mp4: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm',
                  mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4',
                  ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav' };
        return m[ext] || 'application/octet-stream';
    }

    function setBusy(on) {
        busy = on;
        ['dg-url', 'dg-vid', 'dg-aud'].forEach(function (id) {
            var b = $(id); if (b) b.disabled = on;
        });
        var c = $('dg-cancel'); if (c) c.hidden = !on;
    }

    function grab(audio) {
        var url = ($('dg-url').value || '').trim();
        if (!url) return say('Pega primero el enlace del video');
        if (!/^https?:\/\//i.test(url))
            return say('Eso no parece un enlace — debe empezar con http');
        setBusy(true); bar(0);
        say('conectando…');
        plug().dlStart({ url: url, audio: audio }).then(function (r) {
            return window.MediaStore.addRefs([{
                path: r.path, name: r.name, size: r.size,
                mime: mimeOf(r.name), mtime: Date.now()
            }]).then(function () {
                var mb = (r.size / 1048576);
                say('✔ «' + r.name + '» ya está en la tribu (' +
                    mb.toFixed(1) + ' MB)');
                bar(100);
                if (deps.reload) deps.reload();
                toast('⬇ ' + (audio ? 'Audio' : 'Video') + ' descargado');
            });
        }).catch(function (e) {
            say('✖ ' + String((e && e.message) || e || 'falló la descarga'));
        }).then(function () { setBusy(false); });
    }

    function close() {
        if (listener && listener.remove) { listener.remove(); listener = null; }
        if (busy) { try { plug().dlCancel(); } catch (e) {} busy = false; }
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = null;
        if (window.TribalState) TribalState.closed('dl');
    }

    function open(d) {
        close();
        deps = d || {};
        if (window.TribalState) TribalState.opened('dl');
        ov = document.createElement('div');
        ov.className = 'tribal-overlay lk-overlay dg-overlay';
        ov.innerHTML =
            '<div class="lk-panel vn-panel"><div class="lk-head">' +
            '<h3><i class="bi bi-cloud-arrow-down-fill"></i> Descargar de internet</h3>' +
            '<button class="lk-x" id="dg-x"><i class="bi bi-x-lg"></i></button></div>' +
            '<div class="lk-body dg-body">' +
            '<p class="dg-hint">Pega el enlace del video — YouTube, Vimeo, ' +
                'X/Twitter, Facebook, TikTok y miles de sitios más.</p>' +
            '<div class="dg-urlrow">' +
            '<input id="dg-url" type="url" inputmode="url" ' +
                'placeholder="https://…" autocomplete="off">' +
            '<button id="dg-paste" title="Pegar"><i class="bi bi-clipboard"></i></button>' +
            '</div>' +
            '<div class="dg-btns">' +
            '<button id="dg-vid"><i class="bi bi-camera-video-fill"></i>' +
                'Video MP4</button>' +
            '<button id="dg-aud"><i class="bi bi-music-note-beamed"></i>' +
                'Solo audio MP3</button>' +
            '</div>' +
            '<div class="dg-prog"><div class="dg-fill" id="dg-fill"></div></div>' +
            '<p class="dg-state" id="dg-state"></p>' +
            '<button id="dg-cancel" class="tribal-btn" hidden>' +
                '<i class="bi bi-stop-circle"></i> Cancelar descarga</button>' +
            (plug() ? '' :
                '<p class="dg-warn">⚠ La descarga corre en el teléfono — ' +
                'disponible solo en el APK instalado.</p>') +
            '</div></div>';
        (deps.mount || document.body).appendChild(ov);

        if (plug()) {
            plug().addListener('dlProgress', function (p) {
                if (p.pct >= 0) bar(p.pct);
                if (p.line) say(p.line.length > 120
                    ? p.line.slice(0, 120) + '…' : p.line);
            }).then(function (h) { listener = h; });
        }
        $('dg-x').addEventListener('click', close);
        ov.addEventListener('click', function (e) {
            if (e.target === ov && !busy) close();
        });
        $('dg-vid').addEventListener('click', function () { grab(false); });
        $('dg-aud').addEventListener('click', function () { grab(true); });
        $('dg-cancel').addEventListener('click', function () {
            plug().dlCancel(); setBusy(false); say('descarga cancelada');
        });
        $('dg-paste').addEventListener('click', function () {
            if (navigator.clipboard && navigator.clipboard.readText) {
                navigator.clipboard.readText().then(function (t) {
                    if (t) $('dg-url').value = t.trim();
                }).catch(function () {});
            }
        });
    }

    return { open: open, close: close };
})();
