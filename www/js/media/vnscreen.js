// === media/vnscreen.js — grabación de pantalla + sonido ==================
// Android (APK): servicio nativo MediaProjection → MP4 H.264/AAC; sigue con la
// app minimizada o la pantalla apagada y se detiene desde la notificación.
// Preview web: getDisplayMedia + MediaRecorder (para ver el flujo en :8787).
// El resultado va a la biblioteca: video MP4 → sección Videos (descargar,
// compartir, convertir, comprimir… como cualquier video) o solo audio → MP3.
// API: TribalVScreen.{native,start,pause,resume,stop,cancel,peek,minimize,
//                     fileBlob,drop,save}
window.TribalVScreen = (function () {
    'use strict';
    var rec, stream, extra, chunks = [], mime = '', onEnd = null;

    function R() {
        var C = window.Capacitor;
        return C && C.Plugins && C.Plugins.TribalRec && C.isNativePlatform &&
            C.isNativePlatform() ? C.Plugins.TribalRec : null;
    }
    function native() { return !!R(); }
    function supported() {
        return native() || !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
    }

    function release() {
        [stream, extra].forEach(function (s) {
            if (s) s.getTracks().forEach(function (t) { t.stop(); });
        });
        stream = extra = rec = null;
    }

    // endCb: la pantalla dejó de compartirse por fuera de la app (solo web)
    function start(endCb) {
        onEnd = endCb || null;
        if (native()) return R().screenStart();
        if (!supported()) return Promise.reject(new Error('Grabación de pantalla no disponible'));
        return navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
            .then(function (ds) {
                var mic = ds.getAudioTracks().length ? Promise.resolve(null) :
                    navigator.mediaDevices.getUserMedia({ audio: true }).catch(function () { return null; });
                return mic.then(function (m) {
                    if (m) { extra = m; m.getAudioTracks().forEach(function (t) { ds.addTrack(t); }); }
                    stream = ds; chunks = [];
                    mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
                        .filter(function (x) {
                            try { return MediaRecorder.isTypeSupported(x); } catch (e) { return false; }
                        })[0] || '';
                    rec = new MediaRecorder(ds, mime ? { mimeType: mime } : undefined);
                    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
                    ds.getVideoTracks()[0].onended = function () {
                        if (rec && rec.state !== 'inactive' && onEnd) onEnd();
                    };
                    rec.start(500);
                });
            });
    }
    function pause() {
        if (native()) return R().screenPause();
        try { rec.pause(); } catch (e) {}
        return Promise.resolve();
    }
    function resume() {
        if (native()) return R().screenResume();
        try { rec.resume(); } catch (e) {}
        return Promise.resolve();
    }
    function minimize() { return native() ? R().minimize() : Promise.resolve(); }

    // nativo: {live,paused,durMs,rel}; web: solo si hay grabación viva
    function peek() {
        if (native()) return R().screenPeek();
        return Promise.resolve({ live: !!(rec && rec.state !== 'inactive') });
    }

    // MP4 de filesDir/recs → Blob (sin base64: fetch por convertFileSrc)
    function fileBlob(r) {
        if (!r || !r.rel) return Promise.resolve(null);
        var C = window.Capacitor;
        return C.Plugins.Filesystem.getUri({ path: r.rel, directory: 'DATA' })
            .then(function (u) { return fetch(C.convertFileSrc(u.uri)); })
            .then(function (x) { return x.blob(); })
            .then(function (b) {
                return { blob: new Blob([b], { type: 'video/mp4' }), durMs: r.durMs || 0,
                         ext: 'mp4', rel: r.rel };
            });
    }
    // → {blob, durMs, ext, rel?}  (o null si no quedó nada)
    function stop() {
        if (native()) return R().screenStop().then(fileBlob);
        return new Promise(function (res) {
            function fin() {
                var ext = /mp4/.test(mime) ? 'mp4' : 'webm';
                var blob = new Blob(chunks, { type: (mime || 'video/webm').split(';')[0] });
                release(); res(blob.size ? { blob: blob, durMs: 0, ext: ext } : null);
            }
            if (!rec || rec.state === 'inactive') return fin();
            rec.onstop = fin;
            try { rec.stop(); } catch (e) { fin(); }
        });
    }
    function drop(rel) {                         // borra el MP4 temporal nativo
        if (rel && native()) window.Capacitor.Plugins.Filesystem
            .deleteFile({ path: rel, directory: 'DATA' }).catch(function () {});
    }
    function cancel() {
        if (native()) return R().screenCancel();
        if (rec && rec.state !== 'inactive') { rec.onstop = null; try { rec.stop(); } catch (e) {} }
        release(); chunks = [];
        return Promise.resolve();
    }

    function nextN(deps) {
        var n = 0;
        (deps.items || []).forEach(function (m) {
            var x = /^grabaci[oó]n de pantalla\s+(\d+)/i.exec(m.name || '');
            if (x) n = Math.max(n, +x[1]);
        });
        return n + 1;
    }
    // res = resultado de stop(); fmt 'mp4' → Videos · 'mp3' → solo audio en Grabaciones
    function save(deps, res, fmt, audioName, done) {
        var dur = (res.durMs || 0) / 1000;
        function put(file, info) {
            return deps.store.add(file).then(function (m) {
                if (m && deps.store.updateInfo) {
                    if (!info.dur && dur) info.dur = dur;
                    deps.store.updateInfo(m.id, info);
                }
                deps.toast('«' + file.name + '» guardada en ' + (info.vn ? 'Grabaciones' : 'Videos'));
                var p = deps.reload ? deps.reload() : null;
                return p && p.then ? p : null;
            });
        }
        function asVideo() {
            var nm = 'Grabación de pantalla ' + nextN(deps) + '.' + res.ext;
            return put(new File([res.blob], nm, { type: 'video/' + res.ext }), { scr: 1 });
        }
        var job = fmt === 'mp3' && window.TribalConvert ?
            (deps.toast('Convirtiendo a MP3…'),
             window.TribalConvert.convert(res.blob, 'mp3-192').then(function (o) {
                return put(new File([o.blob], audioName + '.mp3', { type: 'audio/mpeg' }),
                    { vn: 1, scr: 1 });
             }).catch(function () {
                deps.toast('No se pudo extraer el audio — se guarda el video');
                return asVideo();
             })) : asVideo();
        return job.then(function () { drop(res.rel); if (done) done(); });
    }

    return { native: native, supported: supported, start: start, pause: pause,
             resume: resume, stop: stop, cancel: cancel, peek: peek,
             minimize: minimize, fileBlob: fileBlob, drop: drop, save: save };
})();
