// ============================================================================
// ARCHIVO: media/scan.js
// RESPONSABILIDAD: diálogo del Escáner de dispositivo.
//   - APK: TribalScanPlugin recorre el almacenamiento (interno + SD) y los
//     hallazgos entran al índice por REFERENCIA (meta.ref, sin copiar) —
//     cero duplicados en disco y cada item conserva su ruta real.
//   - Web/desktop: el navegador no puede recorrer el disco → «Elegir
//     carpeta» importa lo seleccionado (IndexedDB, igual que subir).
//   API: TribalScan.open(deps) · TribalScan.openLocation (delega a scanio)
// ============================================================================
window.TribalScan = (function () {
    'use strict';

    var IO = window.TribalScanIO;
    var ov = null, listenerH = null;

    function close() {
        if (listenerH) { try { listenerH.remove(); } catch (e) {} }
        listenerH = null;
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = null;
    }

    function open(deps) {
        close();
        var toast = deps.toast || function () {};
        var isN = deps.store.isNative();

        ov = document.createElement('div');
        ov.className = 'tribal-overlay';
        ov.innerHTML =
            '<div class="tribal-dialog tscan-dialog">' +
                '<h4><i class="bi bi-binoculars"></i> Escanear dispositivo</h4>' +
                '<p class="tscan-desc">' + (isN
                    ? 'Recorre el almacenamiento (interno y tarjeta SD) y carga ' +
                      'los archivos a sus secciones SIN copiarlos ni duplicarlos.'
                    : 'En el navegador no puedo recorrer el disco, pero puedes ' +
                      'elegir una carpeta y cargo su contenido.') + '</p>' +
                '<div class="tscan-kinds">' +
                    '<label><input type="checkbox" data-kind="audio" checked> 🎵 Música y audio</label>' +
                    '<label><input type="checkbox" data-kind="video" checked> 🎬 Videos</label>' +
                    '<label><input type="checkbox" data-kind="image" checked> 🖼️ Fotos e imágenes</label>' +
                    '<label><input type="checkbox" data-kind="doc" checked> 📄 Documentos</label>' +
                '</div>' +
                '<div class="tscan-status" id="tscan-st"></div>' +
                '<div class="tribal-dialog-actions">' +
                    '<button class="tribal-btn" id="tscan-cancel">Cancelar</button>' +
                    '<button class="tribal-btn primary" id="tscan-go">' +
                        '<i class="bi bi-search"></i> ' + (isN ? 'Escanear' : 'Elegir carpeta') +
                    '</button>' +
                '</div>' +
                '<input type="file" id="tscan-dir" webkitdirectory hidden>' +
            '</div>';
        (deps.mount || document.body).appendChild(ov);
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });

        var st = ov.querySelector('#tscan-st');
        var go = ov.querySelector('#tscan-go');
        var cancel = ov.querySelector('#tscan-cancel');
        var dirIn = ov.querySelector('#tscan-dir');

        function say(t) { st.textContent = t; }
        function kinds() {
            var out = [];
            ov.querySelectorAll('input[data-kind]:checked').forEach(function (c) {
                out.push(c.dataset.kind);
            });
            return out;
        }
        function busy(on, label) {
            go.disabled = on;
            cancel.textContent = on ? 'Detener' : 'Cancelar';
            go.innerHTML = on ? label : '<i class="bi bi-search"></i> ' +
                (isN ? 'Escanear' : 'Elegir carpeta');
        }

        var scanning = false;
        cancel.addEventListener('click', function () {
            var P = IO.plug();
            if (scanning && P && P.cancel) {
                P.cancel();
                say('Deteniendo…');
            } else close();
        });

        go.addEventListener('click', function () {
            if (!kinds().length) return toast('Elige al menos una sección');
            if (isN) runNative(); else dirIn.click();
        });

        // ------------------------------ nativo ------------------------------
        function runNative() {
            var P = IO.plug();
            if (!P || !P.scan) {
                say('El escáner nativo no está en este APK — reinstala la versión nueva.');
                return;
            }
            scanning = true;
            busy(true, 'Explorando…');
            say('Recorriendo el almacenamiento…');
            var pl = P.addListener('scanProgress', function (p) {
                say('🔥 ' + (p.found || 0) + ' encontrados — ' + (p.dir || ''));
            });
            if (pl && pl.then) pl.then(function (h) { listenerH = h; });

            P.scan({ kinds: kinds(), maxPerKind: 5000 }).then(function (r) {
                scanning = false;
                busy(false);
                if (r && r.needAccess) {
                    say('Android no deja leer todo el almacenamiento. ' +
                        'Activa «Acceso a todos los archivos» para TRIBALs y vuelve a escanear.');
                    var TN = window.Capacitor.Plugins.TribalNative;
                    if (TN && TN.openAllFilesAccess) TN.openAllFilesAccess().catch(function () {});
                    return;
                }
                var files = (r && r.files) || [];
                if (!files.length) {
                    say(r && r.cancelled
                        ? 'Escaneo detenido. No se agregó nada.'
                        : 'No se encontraron archivos nuevos en las secciones elegidas.');
                    return;
                }
                var res = deps.store.addRefs(files);
                report(res);
            }).catch(function (e) {
                scanning = false;
                busy(false);
                say('El escaneo falló: ' + (e && e.message || e));
            });
        }

        // resumen por sección de lo que realmente entró al índice
        function report(res) {
            deps.store.list().then(function (items) {
                var por = {};
                items.slice(0, res.added).forEach(function (m) {
                    por[m.kind] = (por[m.kind] || 0) + 1;
                });
                var partes = [];
                if (por.audio) partes.push(por.audio + ' en Música');
                if (por.video) partes.push(por.video + ' en Videos');
                if (por.image) partes.push(por.image + ' en Fotos');
                if (por.doc) partes.push(por.doc + ' en Documentos');
                if (por.other) partes.push(por.other + ' en Otros');
                say('✅ ' + res.added + ' archivos cargados' +
                    (partes.length ? ' — ' + partes.join(' · ') : '') +
                    (res.skipped ? ' (' + res.skipped + ' ya estaban)' : ''));
                if (res.added && deps.reload) deps.reload();
            });
        }

        // ------------------------------- web --------------------------------
        dirIn.addEventListener('change', function () {
            var files = Array.prototype.slice.call(dirIn.files || []);
            dirIn.value = '';
            if (!files.length) return;
            var want = kinds();
            busy(true, 'Importando…');
            var n = 0;
            (function next(i) {
                if (i >= files.length) {
                    busy(false);
                    say('✅ ' + n + ' archivos cargados de la carpeta elegida');
                    if (n && deps.reload) deps.reload();
                    return;
                }
                var f = files[i];
                if (want.indexOf(deps.store.kindFromMime(f.type, f.name)) < 0)
                    return next(i + 1);
                say('Importando ' + (i + 1) + '/' + files.length + ' — ' + f.name);
                deps.store.add(f).then(function () { n++; next(i + 1); })
                    .catch(function () { next(i + 1); });
            })(0);
        });
    }

    // la API pública mantiene openLocation/exists delegando a scanio —
    // media-meta.js ya llama TribalScan.openLocation
    return {
        open: open, close: close,
        openLocation: IO.openLocation,
        exists: IO.exists
    };
})();
