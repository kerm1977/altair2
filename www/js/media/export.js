// ============================================================================
// ARCHIVO: media/export.js
// RESPONSABILIDAD: exportación y capturas del video.
//   - Indicador REC con pausa/reanudar/cancelar
//   - Exportar a MP4 / cortar fragmento A–B / GIF / proxy
//   - Todo pasa por TribalVidFX.renderExport / captureGIF (tiempo real)
//   Exporta en S: doExport, saveMediaBlob
// ============================================================================
window.Sono.register('export', function (S) {
    'use strict';
    var $ = S.$;
    var videoEl = S.videoEl, pMenu = S.pMenu;
    var recEl = $('video-rec'), recLabel = $('video-rec-label');

    // controles del indicador REC: pausar/reanudar y cancelar
    $('video-rec-pause').addEventListener('click', function () {
        if (!S.recHandle) return;
        if (S.recHandle.isPaused && S.recHandle.isPaused()) {
            S.recHandle.resume();
            this.querySelector('i').className = 'bi bi-pause-fill';
        } else {
            S.recHandle.pause();
            this.querySelector('i').className = 'bi bi-play-fill';
        }
    });
    $('video-rec-stop').addEventListener('click', function () {
        if (S.recHandle && S.recHandle.stop) S.recHandle.stop();
        $('video-rec-pause').querySelector('i').className = 'bi bi-pause-fill';
    });

    // URL del ORIGINAL (aunque la vista previa use proxy)
    function origUrl(cb) {
        var m = S.byId(S.activeItemId);
        if (!m) return cb(null);
        S.urlFor(m, cb);
    }

    S.saveMediaBlob = function (blob, name, info, okMsg) {
        var f = new File([blob], name, { type: blob.type });
        return window.MediaStore.add(f).then(function (item) {
            var p = info ? window.MediaStore.updateInfo(item.id, info) : Promise.resolve();
            return p.then(function () {
                S.showToast(okMsg);
                S.reload();
            });
        });
    };

    // Exportación completa: transformaciones + filtros + sticker + LUT +
    // velocidad + fundido en bordes. En tiempo real.
    S.doExport = function (from, to, suffix, plain, scale) {
        if (S.recording) return S.showToast('Ya hay una exportación en curso');
        origUrl(function (u) {
            if (!u) return S.showToast('No se pudo leer el video');
            S.recording = true;
            recEl.hidden = false;
            S.recHandle = window.TribalVidFX.renderExport({
                url: u, from: from, to: to,
                speed: plain ? 1 : videoEl.playbackRate,
                plain: !!plain, scale: scale || 0,
                bitrate: 6000000
            }, function (pct) {
                recLabel.textContent = '● REC ' + Math.round(pct * 100) + '%';
            }, function (blob, err) {
                S.recording = false;
                S.recHandle = null;
                recEl.hidden = true;
                if (err || !blob) return S.showToast(err || 'No se pudo exportar');
                var ext = blob.type.indexOf('mp4') >= 0 ? '.mp4' : '.webm';
                S.saveMediaBlob(blob, 'video_' + Date.now() + suffix + ext, null,
                    'Guardado en la tribu (' + ext + ')');
            });
            if (!S.recHandle) { S.recording = false; recEl.hidden = true; }
        });
    };

    // ----------------------------------------- capturas / cortes / GIF / proxy
    $('vx-shot').addEventListener('click', function () {
        pMenu.hidden = true;
        window.TribalVidFX.screenshot(function (blob) {
            if (!blob) return S.showToast('No se pudo capturar el fotograma');
            S.saveMediaBlob(blob, 'foto_' + Date.now() + '.png', null,
                'Fotograma guardado en Fotos');
        });
    });
    $('vx-cut').addEventListener('click', function () {
        pMenu.hidden = true;
        if (S.loopA == null || S.loopB == null) {
            return S.showToast('Marca primero A y B en «Repetir fragmento»');
        }
        S.showToast('Exportando el fragmento en tiempo real…');
        S.doExport(S.loopA, S.loopB, '_corte');
    });
    $('vx-mp4').addEventListener('click', function () {
        pMenu.hidden = true;
        S.showToast('Exportando el video en tiempo real…');
        S.doExport(0, null, '_conv');
    });
    $('vx-gif').addEventListener('click', function () {
        pMenu.hidden = true;
        if (S.recording) return S.showToast('Ya hay una exportación en curso');
        if (S.loopA == null || S.loopB == null) {
            return S.showToast('Marca primero A y B en «Repetir fragmento»');
        }
        origUrl(function (u) {
            if (!u) return S.showToast('No se pudo leer el video');
            S.recording = true;
            recEl.hidden = false;
            S.recHandle = window.TribalVidFX.captureGIF({
                url: u, from: S.loopA, to: S.loopB
            }, function (p, comp) {
                recLabel.textContent = p < 0
                    ? '● GIF ' + Math.round(comp * 100) + '%'
                    : '● REC ' + Math.round(p * 100) + '%';
            }, function (blob, err) {
                S.recording = false;
                S.recHandle = null;
                recEl.hidden = true;
                if (err || !blob) return S.showToast(err || 'No se pudo crear el GIF');
                var f = new File([blob], 'gif_' + Date.now() + '.gif', { type: 'image/gif' });
                window.MediaStore.add(f).then(function () {
                    S.showToast('GIF guardado en Fotos');
                    S.reload();
                });
            });
            if (!S.recHandle) { S.recording = false; recEl.hidden = true; }
        });
    });

    // proxy: diálogo con resoluciones (para celulares poco potentes)
    var proxyOv = $('proxy-overlay');
    $('vx-proxy').addEventListener('click', function () {
        pMenu.hidden = true;
        var m = S.byId(S.activeItemId);
        if (!m || m.kind !== 'video') return;
        if (S.findProxy(m.id)) return S.showToast('Este video ya tiene proxy');
        proxyOv.hidden = false;
    });
    $('proxy-cancel').addEventListener('click', function () { proxyOv.hidden = true; });
    proxyOv.addEventListener('click', function (e) {
        var b = e.target.closest('[data-proxy]');
        if (!b) { if (e.target === proxyOv) proxyOv.hidden = true; return; }
        proxyOv.hidden = true;
        var scale = +b.dataset.proxy;
        var m = S.byId(S.activeItemId);
        if (!m || S.recording) return;
        origUrl(function (u) {
            if (!u) return S.showToast('No se pudo leer el video');
            S.recording = true;
            recEl.hidden = false;
            S.showToast('Generando proxy ' + scale + 'p en tiempo real…');
            S.recHandle = window.TribalVidFX.renderExport({
                url: u, from: 0, to: null, speed: 1, plain: true,
                scale: scale, bitrate: scale >= 480 ? 1500000 : 800000
            }, function (pct) {
                recLabel.textContent = '● PROXY ' + Math.round(pct * 100) + '%';
            }, function (blob, err) {
                S.recording = false;
                S.recHandle = null;
                recEl.hidden = true;
                if (err || !blob) return S.showToast(err || 'No se pudo crear el proxy');
                var ext = blob.type.indexOf('mp4') >= 0 ? '.mp4' : '.webm';
                S.saveMediaBlob(blob, 'proxy_' + scale + 'p_' + m.name + ext,
                    { isProxy: true, proxyOf: m.id },
                    'Proxy ' + scale + 'p listo — la vista previa lo usará');
            });
            if (!S.recHandle) { S.recording = false; recEl.hidden = true; }
        });
    });
});
