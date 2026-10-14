// ============================================================================
// ARCHIVO: media-slidecfg.js
// RESPONSABILIDAD: diálogo de configuración del slideshow.
//   - Acordeones: Fotos / Música / Ajustes
//   - Restaura y persiste los ajustes (media-slideshow.js, tribu_slide_cfg)
//   - Botones: Iniciar · Video · GIF · WebP
//   Extiende window.TribalSlide (estado en _x).
// ============================================================================
(function () {
    'use strict';
    var TS = window.TribalSlide;
    if (!TS) return;
    var _x = TS._x;

    // -------------------------------------------------------- configuración
    function openConfig(d) {
        _x.deps = d;
        if (!d.images.length) {
            return d.toast('Primero sube fotografías a la tribu');
        }
        var esc = _x.esc, shell = _x.shell, close = _x.close, saveCfg = _x.saveCfg;

        var el = shell(d.mount,
            '<div class="tribal-dialog tslide-dialog">' +
                '<h4>Slideshow</h4>' +

                '<details class="tslide-acc" open>' +
                    '<summary><i class="bi bi-images"></i> Fotos <b id="ts-count-sel"></b></summary>' +
                    '<div class="tslide-photos" id="ts-photos"></div>' +
                    '<button class="tribal-btn tribal-btn-xs" id="ts-addphotos">' +
                        '<i class="bi bi-plus-lg"></i> Agregar fotos del dispositivo</button>' +
                    '<input type="file" id="ts-addphotos-in" accept="image/*" multiple hidden>' +
                '</details>' +

                '<details class="tslide-acc">' +
                    '<summary><i class="bi bi-music-note-beamed"></i> Música</summary>' +
                    '<select class="tribal-select" id="ts-song"></select>' +
                '</details>' +

                '<details class="tslide-acc">' +
                    '<summary><i class="bi bi-sliders"></i> Ajustes</summary>' +
                    '<label class="tslide-label">Transición</label>' +
                    '<select class="tribal-select" id="ts-fx">' +
                        '<option value="fade">Fundido (fade in / out)</option>' +
                        '<option value="flash">Flash (parpadeo)</option>' +
                        '<option value="slide">Deslizar</option>' +
                        '<option value="zoom">Zoom suave</option>' +
                        '<option value="rand">Aleatorio</option>' +
                    '</select>' +
                    '<div class="tslide-sec">' +
                        '<span>Duración del efecto · <b id="ts-fxsecs-label">0.9 s</b></span>' +
                        '<input type="range" id="ts-fxsecs" min="0.3" max="3" step="0.1" value="0.9">' +
                    '</div>' +
                    '<div class="tslide-sec">' +
                        '<span>Tiempo por foto · <b id="ts-secs-label">5 s</b></span>' +
                        '<input type="range" id="ts-secs" min="1" max="30" step="1" value="5">' +
                    '</div>' +
                    '<label class="tslide-label">Formato</label>' +
                    '<select class="tribal-select" id="ts-orient">' +
                        '<option value="auto">Automático (según las fotos)</option>' +
                        '<option value="h">Horizontal (16:9)</option>' +
                        '<option value="v">Vertical (9:16)</option>' +
                        '<option value="s">Cuadrado (1:1)</option>' +
                    '</select>' +
                    '<label class="tslide-label">Calidad de exportación</label>' +
                    '<select class="tribal-select" id="ts-q">' +
                        '<option value="alta">Alta (HD)</option>' +
                        '<option value="media" selected>Media</option>' +
                        '<option value="baja">Baja (más liviano)</option>' +
                    '</select>' +
                    '<label class="tslide-check">' +
                        '<input type="checkbox" id="ts-loop" checked>' +
                        '<span>Bucle — repite la secuencia sin parar</span>' +
                    '</label>' +
                '</details>' +

                '<div class="tribal-dialog-actions">' +
                    '<button class="tribal-btn" id="ts-cancel">Cancelar</button>' +
                    '<button class="tribal-btn primary" id="ts-play">' +
                        '<i class="bi bi-play-fill"></i> Iniciar</button>' +
                '</div>' +
                '<div class="tribal-dialog-actions" style="margin-top:8px">' +
                    '<button class="tribal-btn tslide-export" id="ts-export" style="margin-top:0">' +
                        '<i class="bi bi-filetype-mp4"></i> Exportar MP4</button>' +
                '</div>' +
            '</div>');

        var list = el.querySelector('#ts-photos');
        list.innerHTML = d.images.map(function (m) {
            return '<label class="tslide-photo">' +
                '<input type="checkbox" value="' + m.id + '" checked>' +
                '<i class="bi bi-image"></i><span>' + esc(m.name) + '</span>' +
            '</label>';
        }).join('');

        function syncCount() {
            var n = list.querySelectorAll('input:checked').length;
            el.querySelector('#ts-count-sel').textContent = n + ' sel.';
        }
        syncCount();
        list.addEventListener('change', syncCount);

        // agregar fotos con el administrador propio (sin picker del sistema):
        // se importan a la tribu y aparecen aquí ya marcadas
        function addPhotoLabels(metas) {
            metas.forEach(function (m) {
                if (!m || d.images.some(function (x) { return x.id === m.id; }))
                    return;
                d.images.push(m);
                list.insertAdjacentHTML('beforeend',
                    '<label class="tslide-photo">' +
                        '<input type="checkbox" value="' + m.id + '" checked>' +
                        '<i class="bi bi-image"></i><span>' + esc(m.name) +
                        '</span></label>');
            });
            syncCount();
        }
        var addBtn = el.querySelector('#ts-addphotos');
        var addIn = el.querySelector('#ts-addphotos-in');
        addBtn.addEventListener('click', function () {
            addIn.click();
        });
        addIn.addEventListener('change', function () {
            var files = Array.prototype.slice.call(addIn.files || []);
            addIn.value = '';
            if (!files.length) return;
            var metas = [], chain = Promise.resolve();
            files.forEach(function (f) {
                chain = chain.then(function () {
                    return d.store.add(f).then(function (m) {
                        if (m) metas.push(m);
                    }).catch(function () {});
                });
            });
            chain.then(function () {
                if (metas.length) {
                    addPhotoLabels(metas);
                    d.toast(metas.length + ' foto(s) agregadas');
                }
            });
        });

        var sel = el.querySelector('#ts-song');
        sel.innerHTML = '<option value="">Sin música</option>' +
            d.audios.map(function (m) {
                return '<option value="' + m.id + '">' + esc(m.name) + '</option>';
            }).join('');

        var secsIn = el.querySelector('#ts-secs'), fxIn = el.querySelector('#ts-fxsecs');
        secsIn.addEventListener('input', function () {
            el.querySelector('#ts-secs-label').textContent = secsIn.value + ' s';
        });
        fxIn.addEventListener('input', function () {
            el.querySelector('#ts-fxsecs-label').textContent = (+fxIn.value).toFixed(1) + ' s';
        });

        // ---- restaurar ajustes guardados (persisten al cerrar la app) ----
        var cfg = {};
        try { cfg = JSON.parse(localStorage.getItem(_x.CFG_KEY) || '{}'); } catch (e) {}
        if (cfg.effect) el.querySelector('#ts-fx').value = cfg.effect;
        if (cfg.orient) el.querySelector('#ts-orient').value = cfg.orient;
        if (cfg.quality) el.querySelector('#ts-q').value = cfg.quality;
        if (cfg.secs) {
            secsIn.value = cfg.secs;
            el.querySelector('#ts-secs-label').textContent = cfg.secs + ' s';
        }
        if (cfg.fxSecs) {
            fxIn.value = cfg.fxSecs;
            el.querySelector('#ts-fxsecs-label').textContent = (+cfg.fxSecs).toFixed(1) + ' s';
        }
        el.querySelector('#ts-loop').checked = cfg.loop !== false;
        if (cfg.songId) sel.value = cfg.songId;
        if (cfg.photoIds && cfg.photoIds.length) {
            list.querySelectorAll('input').forEach(function (c) {
                c.checked = cfg.photoIds.indexOf(c.value) >= 0;
            });
            syncCount();
        }

        el.querySelector('#ts-cancel').addEventListener('click', close);
        _x.ov.addEventListener('click', function (e) { if (e.target === _x.ov) close(); });

        function collect() {
            var out = [];
            list.querySelectorAll('input:checked').forEach(function (c) {
                var m = d.images.filter(function (x) { return x.id === c.value; })[0];
                if (m) out.push(m);
            });
            return out;
        }
        function song() {
            var v = sel.value;
            return v ? d.audios.filter(function (x) { return x.id === v; })[0] : null;
        }
        function readOpts() {
            _x.photos = collect();
            _x.secs = parseInt(secsIn.value, 10) || 5;
            _x.fxSecs = parseFloat(fxIn.value) || 0.9;
            if (_x.fxSecs >= _x.secs) _x.fxSecs = Math.max(0.3, _x.secs - 0.5);
            _x.loop = el.querySelector('#ts-loop').checked;
            _x.effect = el.querySelector('#ts-fx').value;
            _x.orient = el.querySelector('#ts-orient').value;
            _x.quality = el.querySelector('#ts-q').value;
            saveCfg(sel.value);
            return _x.photos.length > 0;
        }

        el.querySelector('#ts-play').addEventListener('click', function () {
            if (!readOpts()) return d.toast('Marca al menos una foto');
            if (d.onBeforeStart) d.onBeforeStart(); // detiene música/video
            _x.startStage(song());
        });
        el.querySelector('#ts-export').addEventListener('click', function () {
            if (!readOpts()) return d.toast('Marca al menos una foto');
            if (d.onBeforeStart) d.onBeforeStart();
            _x.exportVideo(song());
        });
    }

    _x.openConfig = openConfig;
})();
