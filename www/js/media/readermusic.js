// ============================================================================
// ARCHIVO: media/readermusic.js
// RESPONSABILIDAD: música ambiental mientras se lee (lector de TRIBALs).
//   - Botón 🎵 en la barra del lector → panel con las canciones de la tribu
//   - Agrupadas por colección (primero las colecciones, luego sueltas)
//   - Toca una → suena con el mismo mini-player (sigue bajo el overlay)
//   - Muestra la pista actual + botón ⏹ para detenerla
//   deps extra: deps.items, deps.play(meta), deps.audio (elemento <audio>)
//   API: TribalReaderMusic.attach(ui, deps)
// ============================================================================
window.TribalReaderMusic = (function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // volumen de la música de lectura — persiste entre sesiones
    var VOL_KEY = 'tribu_readermusic_vol';
    function getVol() {
        var v = parseFloat(localStorage.getItem(VOL_KEY));
        return isNaN(v) ? 1 : Math.max(0, Math.min(1, v));
    }
    function setVol(deps, v) {
        v = Math.max(0, Math.min(1, v));
        if (deps.audio) deps.audio.volume = v;
        try { localStorage.setItem(VOL_KEY, String(v)); } catch (e) {}
    }

    function attach(ui, deps) {
        var btn = ui.el.querySelector('#tr-music-btn');
        var panel = ui.el.querySelector('#tr-music');
        if (!btn || !panel || !deps.play) return;
        if (deps.audio) deps.audio.volume = getVol();
        btn.addEventListener('click', function () {
            panel.hidden = !panel.hidden;
            if (!panel.hidden) paint();
        });
        function paint() {
            var cols = window.MediaStore.listCollections();
            var auds = (deps.items || []).filter(function (m) {
                return m.kind === 'audio';
            });
            var now = deps.audio && deps.audio.dataset.current;
            var playing = !deps.audio || deps.audio.paused ? null : now;
            var cur = auds.filter(function (m) { return m.id === now; })[0];

            var html = '<div class="tr-music-vol">' +
                '<i class="bi bi-volume-down-fill"></i>' +
                '<input type="range" min="0" max="100" data-mvol ' +
                    'value="' + Math.round(getVol() * 100) + '" ' +
                    'title="Volumen de la música">' +
                '<i class="bi bi-volume-up-fill"></i></div>' +
                '<div class="tr-music-now">' +
                (cur ?
                    '<span class="tr-music-track"><i class="bi bi-music-note-beamed"></i> ' +
                        esc(cur.name) + '</span>' +
                    '<button class="tribal-btn tribal-btn-xs" data-mstop>' +
                        '<i class="bi bi-stop-fill"></i> Parar</button>' :
                    '<span class="tr-music-muted">Sin música de lectura</span>') +
                '</div>';
            if (auds.length) {
                var used = {};
                cols.forEach(function (c) {
                    var inCol = auds.filter(function (m) {
                        return m.cols && m.cols.indexOf(c.id) >= 0;
                    });
                    if (!inCol.length) return;
                    inCol.forEach(function (m) { used[m.id] = 1; });
                    html += '<p class="tr-music-col"><i class="bi bi-folder2"></i> ' +
                        esc(c.name) + '</p>' + inCol.map(rowHtml).join('');
                });
                var loose = auds.filter(function (m) { return !used[m.id]; });
                if (loose.length) {
                    html += '<p class="tr-music-col"><i class="bi bi-stars"></i> Sin colección</p>' +
                        loose.map(rowHtml).join('');
                }
            } else {
                html += '<p class="tribal-p2p-err">No hay música en la tribu</p>';
            }
            panel.innerHTML = html;

            function rowHtml(m) {
                return '<button class="tr-music-song' +
                    (m.id === playing ? ' on' : '') + '" data-msong="' + m.id + '">' +
                    '<i class="bi ' + (m.id === playing ? 'bi-pause-fill' : 'bi-play-fill') +
                    '"></i><span>' + esc(m.name) + '</span></button>';
            }
        }
        panel.addEventListener('input', function (e) {
            if (e.target.matches('[data-mvol]'))
                setVol(deps, e.target.value / 100);
        });
        panel.addEventListener('click', function (e) {
            var stop = e.target.closest('[data-mstop]');
            if (stop) {
                if (deps.audio) deps.audio.pause();
                paint();
                return;
            }
            var b = e.target.closest('[data-msong]');
            if (!b) return;
            var m = (deps.items || []).filter(function (x) {
                return x.id === b.dataset.msong;
            })[0];
            if (!m) return;
            if (deps.audio && deps.audio.dataset.current === m.id && !deps.audio.paused) {
                deps.audio.pause();
            } else {
                deps.play(m);
            }
            setTimeout(paint, 120);
        });
    }

    return { attach: attach };
})();
