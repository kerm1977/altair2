// === media/vnmode.js — selector de qué grabar en Notas de audio ==========
// Al tocar el micrófono: Micrófono · Llamada · Pantalla y sonido, y luego el
// formato (audio: MP3 o MP4/M4A · pantalla: video MP4 o solo audio MP3).
// Si Android reporta una llamada en curso, «Llamada» sale sugerida.
// API: TribalVMode.pick(ov, cb)  →  cb({ mode:'mic'|'call'|'screen',
//                                        fmt:'mp3'|'m4a'|'mp4' })
window.TribalVMode = (function () {
    'use strict';
    var MODES = [
        { id: 'mic', ico: 'bi-mic-fill', t: 'Micrófono', d: 'Tu voz o el ambiente' },
        { id: 'call', ico: 'bi-telephone-fill', t: 'Llamada', d: 'Con el altavoz activado' },
        { id: 'screen', ico: 'bi-display', t: 'Pantalla y sonido',
          d: 'Lo que pasa en el celular (videoconferencia, apps…)' }
    ];
    var FMT = {
        audio: [{ id: 'mp3', t: 'MP3', d: 'Compatible con todo' },
                { id: 'm4a', t: 'MP4 (M4A)', d: 'Audio AAC, más liviano' }],
        screen: [{ id: 'mp4', t: 'Video MP4', d: 'H.264 con sonido · va a Videos' },
                 { id: 'mp3', t: 'Solo audio MP3', d: 'Sin imagen · va a Grabaciones' }]
    };
    var NOTE = {
        call: 'Android no deja a ninguna app capturar el audio de la línea: ' +
              'pon la llamada en <b>altavoz</b> y se graba por el micrófono. ' +
              'Avisa a la otra persona — en muchos países se requiere su consentimiento.',
        screen: 'Android pedirá permiso para grabar la pantalla. La app se ' +
                'minimizará: detén desde la notificación <b>■ Detener</b>. ' +
                'El sonido entra por el micrófono.'
    };

    function REC() {
        var C = window.Capacitor;
        return C && C.Plugins && C.Plugins.TribalRec && C.isNativePlatform &&
            C.isNativePlatform() ? C.Plugins.TribalRec : null;
    }
    function btn(attr, v, ico, t, d, cls) {
        return '<button ' + attr + '="' + v + '"' + (cls ? ' class="' + cls + '"' : '') + '>' +
            (ico ? '<i class="bi ' + ico + '"></i>' : '') +
            '<b>' + t + '</b><small>' + d + '</small></button>';
    }

    function pick(ov, cb) {
        var box = ov.querySelector('#vn-mode');
        if (!box) {
            box = document.createElement('div');
            box.id = 'vn-mode'; box.className = 'vn-ask vn-mode';
            var ask = ov.querySelector('#vn-ask');
            ask.parentNode.insertBefore(box, ask);
        }
        var inCall = false, mode = null;
        function close() { box.hidden = true; box.innerHTML = ''; }

        function step1() {
            box.innerHTML = '<p><i class="bi bi-record-circle"></i> ¿Qué quieres grabar?</p>' +
                '<div class="vn-mode-btns">' + MODES.map(function (m) {
                    var sug = m.id === 'call' && inCall;
                    return btn('data-m', m.id, m.ico, m.t + (sug ? ' · en llamada' : ''),
                        m.d, sug ? 'sug' : '');
                }).join('') + '</div>' +
                '<div class="vn-ask-btns"><button data-m="x">Cancelar</button></div>';
            box.hidden = false;
        }
        function step2() {
            var list = mode === 'screen' ? FMT.screen : FMT.audio;
            box.innerHTML = '<p><i class="bi bi-file-earmark-music"></i> ¿En qué formato?</p>' +
                '<div class="vn-mode-btns">' + list.map(function (f) {
                    return btn('data-f', f.id, '', f.t, f.d);
                }).join('') + '</div>' +
                (NOTE[mode] ? '<p class="vn-mode-note">' + NOTE[mode] + '</p>' : '') +
                '<div class="vn-ask-btns"><button data-m="back">' +
                '<i class="bi bi-arrow-left"></i> Volver</button></div>';
        }
        box.onclick = function (e) {
            var m = e.target.closest('[data-m]'), f = e.target.closest('[data-f]');
            if (m) {
                var v = m.getAttribute('data-m');
                if (v === 'x') return close();
                if (v === 'back') return step1();
                mode = v; return step2();
            }
            if (f) { var fmt = f.getAttribute('data-f'); close(); cb({ mode: mode, fmt: fmt }); }
        };
        step1();
        var R = REC();
        if (R && R.callMode) R.callMode().then(function (r) {
            inCall = !!(r && r.inCall);
            if (inCall && !box.hidden && !mode) step1();
        }).catch(function () {});
    }
    return { pick: pick };
})();
