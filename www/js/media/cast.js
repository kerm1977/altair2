// ============================================================================
// ARCHIVO: media/cast.js (<= 200 líneas)
// RESPONSABILIDAD: Transmitir (Cast) imágenes, audios y videos a Chromecast,
//   Smart TVs, DLNA/Miracast y receptores de presentación.
//   - RemotePlayback API (Chromecast directo para audio y video)
//   - Presentation API (proyección de imagen, audio y video en 2ª pantalla)
//   - Cast nativo de Android (Settings.ACTION_CAST_SETTINGS / Miracast / TV)
//   - Envío a apps receptoras (Google Home, Web Video Caster, VLC, Smart View)
// ============================================================================
window.TribalCast = (function () {
    'use strict';

    var ov = null;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Convierte una imagen en un stream de video en vivo (canvas.captureStream)
    // para que RemotePlayback API de Chromecast también pueda transmitir fotos
    function promptRemotePlayback(meta, S, toast) {
        S.urlFor(meta, function (u) {
            if (!u) return toast('No se pudo leer el archivo');
            var el;
            if (meta.kind === 'audio') {
                if (S.audio.dataset.current !== meta.id) S.playAudio(meta);
                el = S.audio;
            } else if (meta.kind === 'video') {
                if (S.videoOv.hidden) S.openItem(meta);
                el = S.videoEl;
            } else if (meta.kind === 'image') {
                if (S.imageOv.hidden) S.openItem(meta);
                el = document.createElement('video');
                el.muted = true; el.playsInline = true;
                var img = new Image();
                img.onload = function () {
                    var c = document.createElement('canvas');
                    c.width = img.naturalWidth || 1280;
                    c.height = img.naturalHeight || 720;
                    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                    if (c.captureStream) {
                        el.srcObject = c.captureStream(1);
                        el.play().catch(function () {});
                    }
                    tryRemote(el, u, toast);
                };
                img.src = u;
                return;
            }
            if (el) tryRemote(el, u, toast);
        });
    }

    function tryRemote(el, url, toast) {
        try { el.disableRemotePlayback = false; } catch (e) {}
        if (el.remote && typeof el.remote.prompt === 'function') {
            el.remote.prompt().then(function () {
                toast('Conectado al dispositivo Cast');
            }).catch(function () {
                tryPresentation(url, toast);
            });
            return;
        }
        if (el.webkitShowPlaybackTargetPicker) {
            try { el.webkitShowPlaybackTargetPicker(); return; } catch (e) {}
        }
        tryPresentation(url, toast);
    }

    function tryPresentation(url, toast) {
        var PR = window.PresentationRequest;
        if (PR) {
            try {
                var req = new PR([url]);
                req.start().then(function () {
                    toast('Transmitiendo a pantalla externa');
                }).catch(function () {
                    openAndroidCast(toast);
                });
                return;
            } catch (e) {}
        }
        openAndroidCast(toast);
    }

    function openAndroidCast(toast) {
        var P = window.Capacitor && window.Capacitor.Plugins;
        if (P && P.TribalNative && P.TribalNative.openCastSettings) {
            P.TribalNative.openCastSettings().then(function () {
                toast('Elige tu Chromecast o Smart TV en la lista');
            }).catch(function () {
                toast('No se encontró pantalla Cast activa');
            });
            return;
        }
        toast('En navegador: usa el menú Cast de Chrome o conecta un Chromecast en tu red');
    }

    function open(meta, S) {
        if (!meta) return;
        var toast = (S && S.showToast) || function () {};
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = document.createElement('div');
        ov.className = 'np-modal-bd';
        ov.innerHTML = '<div class="np-modal-card np-ctx-card">' +
            '<strong><i class="bi bi-cast"></i> Transmitir «' + esc(meta.name) + '»</strong>' +
            '<p class="np-hint">Envía esta ' +
                (meta.kind === 'audio' ? 'canción/audio' : (meta.kind === 'video' ? 'película/video' : 'imagen')) +
                ' a Chromecast, Google TV, Smart TV, DLNA o pantalla inalámbrica.</p>' +
            '<div class="np-ctx-grid np-doc-acts">' +
                '<button type="button" data-cast="chromecast"><i class="bi bi-cast"></i> Chromecast / Remote Playback</button>' +
                '<button type="button" data-cast="screen"><i class="bi bi-tv"></i> Smart TV / Pantalla inalámbrica Android</button>' +
                '<button type="button" data-cast="app"><i class="bi bi-share"></i> Enviar a app Cast / DLNA / VLC</button>' +
            '</div>' +
            '<div class="np-modal-acts">' +
                '<button type="button" class="tribal-btn" id="tc-cast-x">Cerrar</button>' +
            '</div>' +
        '</div>';
        ((S && S.root) || document.body).appendChild(ov);

        function close() {
            if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
            ov = null;
        }
        ov.querySelector('#tc-cast-x').onclick = close;
        ov.onclick = function (e) {
            if (e.target === ov) { close(); return; }
            var b = e.target.closest('[data-cast]');
            if (!b) return;
            var act = b.getAttribute('data-cast');
            close();
            if (act === 'chromecast') {
                promptRemotePlayback(meta, S, toast);
            } else if (act === 'screen') {
                if (meta.kind === 'audio') S.playAudio(meta);
                else S.openItem(meta);
                openAndroidCast(toast);
            } else if (act === 'app') {
                if (window.MediaStore && window.MediaStore.share) {
                    toast('Elige tu app de Cast / TV…');
                    window.MediaStore.share(meta).catch(function () {});
                }
            }
        };
    }

    return { open: open };
})();
