// ============================================================================
// ARCHIVO: media/player.js
// RESPONSABILIDAD: reproducción en TRIBALs.
//   - openItem / openFull (doble clic → vinilo / visores / fullscreen)
//   - Mini-player de audio: play/pausa, prev/next, barra, cola, repeat/shuffle
//   - Visores de video e imagen (abrir/cerrar, exclusividad de audio)
//   - (El visualizador naranja vive en el vinilo: media-vinyl.js)
//   Exporta en S: openItem, openFull, closeVideo, closeImage, playAudio,
//                 stepAudio, updateCover
// ============================================================================
window.Sono.register('player', function (S) {
    'use strict';
    var $ = S.$;
    var audio = S.audio, videoEl = S.videoEl, videoOv = S.videoOv, imageOv = S.imageOv;

    // ---------------------------------------------------------------- open
    // Abre el vinilo tribal (vista completa de la canción: sol/disco girando,
    // play grande, prev/next — pensado para usar en carro)
    S.openVinyl = function (m) {
        if (!m || m.kind !== 'audio') return;
        window.MediaStore.getArtURL(m).then(function (u) {
            window.TribalVinyl.open({
                meta: m, el: audio, artUrl: u, mount: S.root,
                prefs: S.prefs,
                onPref: function () { S.savePrefs(); if (S.syncModes) S.syncModes(); },
                onPrev: function () { S.stepAudio(-1); },
                onNext: function () { S.stepAudio(1); }
            });
        });
    };

    S.openItem = function (m) {
        S.activeItemId = m.id;
        if (m.kind === 'audio') {
            S.playAudio(m);
            S.openVinyl(m);   // un tap → vista completa de la canción
            return;
        }
        if (m.kind === 'doc') return S.openReader(m);
        // prioridad: una sola fuente sonando — la música cede al video/visor
        audio.pause();
        var px = m.kind === 'video' ? S.findProxy(m.id) : null;
        S.urlFor(px || m, function (u) {
            if (!u) return S.showToast('No se pudo abrir el archivo');
            if (m.kind === 'video') {
                S.videoTitle.textContent = (m.info && m.info.titulo) || m.name;
                $('vf-proxy-badge').hidden = !px;
                videoEl.src = u;
                videoEl.playbackRate = S.prefs.speed;
                videoOv.hidden = false;
                videoEl.play().catch(function () {});
            } else {
                S.imageTitle.textContent = (m.info && m.info.titulo) || m.name;
                S.imageItem = m;   // para el menú por long-press
                S.imageEl.src = u;
                imageOv.hidden = false;
            }
        });
    };

    // Archivo de un torrent (WebTorrent file) — se reproduce con el mismo
    // player, descargando en paralelo (renderTo = streaming con seek).
    S.playP2P = function (f) {
        var ext = String(f.name || '').split('.').pop().toLowerCase();
        var isVid = ['mp4','webm','mkv','mov','avi','3gp'].indexOf(ext) >= 0;
        var isAud = ['mp3','wav','ogg','m4a','aac','flac','opus'].indexOf(ext) >= 0;
        var isImg = ['jpg','jpeg','png','gif','webp','bmp','heic'].indexOf(ext) >= 0;
        audio.pause();
        if (isVid) {
            S.videoTitle.textContent = f.name;
            $('vf-proxy-badge').hidden = true;
            videoOv.hidden = false;
            try { f.renderTo(videoEl, { autoplay: true }); }
            catch (e) { S.showToast('Aún no se puede reproducir'); }
        } else if (isAud) {
            f.getBlobURL(function (e, u) {
                if (e || !u) return S.showToast('Esperando datos del torrent…');
                audio.src = u;
                audio.dataset.current = 'p2p:' + f.name;
                S.pTitle.textContent = f.name;
                var bg = $('player-badges');
                if (bg) bg.textContent = 'P2P ' +
                    (f.progress < 1 ? Math.round(f.progress * 100) + '%' : '✓');
                if (window.TribalEQ) TribalEQ.attach(audio, S.prefs.eq);
                audio.play().catch(function () {});
            });
        } else if (isImg) {
            f.getBlobURL(function (e, u) {
                if (e || !u) return S.showToast('Esperando datos del torrent…');
                S.imageTitle.textContent = f.name;
                S.imageItem = null;   // p2p no tiene meta en el store
                S.imageEl.src = u;
                imageOv.hidden = false;
            });
        }
    };

    // doble clic → pantalla completa tribal
    // (el fullscreen se pide aquí, dentro del gesto del doble clic)
    S.openFull = function (m) {
        S.goFullscreen(S.root);
        if (m.kind === 'audio') {
            if (audio.dataset.current !== m.id) S.playAudio(m);
            S.openVinyl(m);
        } else {
            S.openItem(m);
        }
    };

    // ---------------------------------------------------------------- audio
    S.updateCover = function (m) {
        S.pCover.innerHTML = '<i class="bi bi-soundwave"></i>';
        if (!window.MediaStore.getArtURL) return;
        window.MediaStore.getArtURL(m).then(function (u) {
            if (u && audio.dataset.current === m.id) {
                S.pCover.innerHTML = '<img src="' + S.esc(u) + '" alt="">';
            }
        });
    };

    S.playAudio = function (m) {
        S.activeItemId = m.id;
        // prioridad: una sola fuente sonando — el video cede a la música
        if (!videoOv.hidden) S.closeVideo(); else videoEl.pause();
        S.queue = S.items.filter(function (x) { return x.kind === 'audio'; });
        S.queueIdx = S.queue.indexOf(m);
        S.urlFor(m, function (u) {
            if (!u) return S.showToast('No se pudo abrir el audio');
            audio.src = u;
            audio.dataset.current = m.id;
            audio.playbackRate = S.prefs.speed;
            window.TribalEQ.ensure(audio);
            audio.play().catch(function () {});
            S.pTitle.textContent = (m.info && m.info.titulo) || m.name;
            S.updateCover(m);
            S.player.classList.remove('d-none');
            S.root.classList.add('has-player');
            if (window.TribalVinyl.isOpen()) {
                window.MediaStore.getArtURL(m).then(function (art) {
                    window.TribalVinyl.setMeta(m, art);
                });
            }
            S.render();
        });
    };

    S.stepAudio = function (dir) {
        if (!S.queue.length) return;
        if (S.prefs.shuffle && S.queue.length > 1) {
            var n;
            do { n = Math.floor(Math.random() * S.queue.length); } while (n === S.queueIdx);
            S.queueIdx = n;
        } else {
            S.queueIdx = (S.queueIdx + dir + S.queue.length) % S.queue.length;
        }
        S.playAudio(S.queue[S.queueIdx]);
    };

    function syncPlayIcon() {
        S.pToggle.innerHTML = audio.paused
            ? '<i class="bi bi-play-fill"></i>'
            : '<i class="bi bi-pause-fill"></i>';
    }

    // tocar la carátula o la info del mini-player → vista completa (modo carro)
    function openCurrentVinyl() {
        var id = audio.dataset.current;
        if (!id) return;
        var m = (S.queue || []).filter(function (x) { return x.id === id; })[0];
        if (m) S.openVinyl(m);
    }
    S.pCover.addEventListener('click', openCurrentVinyl);
    S.player.querySelector('.tribal-player-info').addEventListener('click', function (e) {
        if (e.target.closest('#player-progress')) return; // la barra hace seek
        openCurrentVinyl();
    });

    S.pToggle.addEventListener('click', function () {
        if (!audio.src) return;
        audio.paused ? audio.play() : audio.pause();
    });
    $('player-prev').addEventListener('click', function () { S.stepAudio(-1); });
    $('player-next').addEventListener('click', function () { S.stepAudio(1); });
    $('player-close').addEventListener('click', function () {
        audio.pause(); audio.removeAttribute('src'); audio.load();
        delete audio.dataset.current;
        window.TribalVinyl.close();
        S.player.classList.add('d-none');
        S.root.classList.remove('has-player');
        S.render();
    });

    audio.addEventListener('play', syncPlayIcon);
    audio.addEventListener('pause', function () { syncPlayIcon(); S.render(); });
    audio.addEventListener('ended', function () {
        if (S.prefs.repeat === 'one') {
            audio.currentTime = 0;
            audio.play().catch(function () {});
            return;
        }
        if (S.prefs.repeat === 'off' && !S.prefs.shuffle && S.queueIdx >= S.queue.length - 1) {
            S.render();
            return;
        }
        S.stepAudio(1);
    });
    audio.addEventListener('loadedmetadata', function () {
        S.pDur.textContent = S.fmtTime(audio.duration);
    });
    audio.addEventListener('timeupdate', function () {
        if (S.loopA != null && S.loopB != null && audio.currentTime >= S.loopB) {
            audio.currentTime = S.loopA;
        }
        S.pCur.textContent = S.fmtTime(audio.currentTime);
        if (audio.duration) S.pFill.style.width = (audio.currentTime / audio.duration * 100) + '%';
    });
    videoEl.addEventListener('timeupdate', function () {
        if (S.loopA != null && S.loopB != null && videoEl.currentTime >= S.loopB) {
            videoEl.currentTime = S.loopA;
        }
    });
    S.pProg.addEventListener('click', function (e) {
        if (!audio.duration) return;
        var r = S.pProg.getBoundingClientRect();
        audio.currentTime = (e.clientX - r.left) / r.width * audio.duration;
    });

    // el visualizador naranja vive en el vinilo fullscreen (media-vinyl.js)
    audio.playbackRate = S.prefs.speed;
    videoEl.playbackRate = S.prefs.speed;

    // ------------------------------------------------------------- overlays
    S.closeVideo = function () {
        videoEl.pause();
        videoEl.removeAttribute('src');
        videoEl.load();
        videoOv.hidden = true;
        S.exitFull();
    };
    S.closeImage = function () {
        S.imageEl.removeAttribute('src');
        S.imageItem = null;
        imageOv.hidden = true;
        S.exitFull();
    };
    $('video-close').addEventListener('click', S.closeVideo);
    $('image-close').addEventListener('click', S.closeImage);
    videoOv.addEventListener('click', function (e) { if (e.target === videoOv) S.closeVideo(); });
    imageOv.addEventListener('click', function (e) { if (e.target === imageOv) S.closeImage(); });

    // doble clic sobre el video → pantalla completa con sticker/texto incluidos
    videoEl.addEventListener('dblclick', function () {
        S.goFullscreen(videoEl.parentElement);
    });
    // si el botón nativo de pantalla completa de los controles del video se
    // activa solo sobre el <video>, lo redirigimos al stage completo para que
    // sticker y texto sigan visibles dentro del fullscreen
    document.addEventListener('fullscreenchange', function () {
        if (document.fullscreenElement === videoEl) {
            var stage = videoEl.closest('.vf-stage') || videoEl.parentElement;
            document.exitFullscreen().then(function () {
                S.goFullscreen(stage);
            }).catch(function () {});
        }
    });
});
