// ============================================================================
// ARCHIVO: media/btchatvoice.js
// RESPONSABILIDAD: notas de voz del chat tribal.
//   MediaRecorder sobre el micrófono → Blob audio → dataURL para enviar
//   como mensaje 'aud'. En Android WebView el formato suele salir
//   audio/webm (opus) o audio/mp4 según el dispositivo.
// API: window.TribalBtVoice.{rec():bool, start(), stop() → Promise<dataURL>,
//       cancel()}
// ============================================================================
window.TribalBtVoice = (function () {
    'use strict';

    var rec = null, chunks = [], stream = null;

    function supported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
                  window.MediaRecorder);
    }

    // mime preferido según lo que acepte el MediaRecorder del dispositivo
    function pickMime() {
        var list = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
        for (var i = 0; i < list.length; i++) {
            try {
                if (window.MediaRecorder.isTypeSupported &&
                    MediaRecorder.isTypeSupported(list[i])) return list[i];
            } catch (e) {}
        }
        return '';
    }

    function start() {
        if (!supported()) return Promise.reject(new Error('sin micrófono'));
        if (rec && rec.state === 'recording') return Promise.resolve();
        return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
            stream = s;
            chunks = [];
            var mime = pickMime();
            rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
            rec.ondataavailable = function (e) {
                if (e.data && e.data.size) chunks.push(e.data);
            };
            rec.start();
        });
    }

    function release() {
        if (stream) {
            stream.getTracks().forEach(function (t) { t.stop(); });
            stream = null;
        }
    }

    // stop → Promise<dataURL> (audio listo para mandar como mensaje)
    function stop() {
        return new Promise(function (resolve, reject) {
            if (!rec || rec.state !== 'recording') {
                release();
                return reject(new Error('no estaba grabando'));
            }
            rec.onstop = function () {
                var blob = new Blob(chunks,
                    { type: rec.mimeType || 'audio/webm' });
                release();
                var r = new FileReader();
                r.onload = function () { resolve({ data: r.result, mime: blob.type }); };
                r.onerror = function () { reject(r.error); };
                r.readAsDataURL(blob);
            };
            rec.stop();
        });
    }

    function cancel() {
        try { if (rec && rec.state === 'recording') rec.stop(); } catch (e) {}
        chunks = [];
        release();
    }

    return {
        supported: supported,
        recording: function () { return !!(rec && rec.state === 'recording'); },
        start: start,
        stop: stop,
        cancel: cancel
    };
})();
