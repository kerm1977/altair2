// ============================================================================
// ARCHIVO: media/multisel.js
// RESPONSABILIDAD: selección múltiple de TRIBALs.
//   - ⋮ de tarjeta → "Selección múltiple": modo checkboxes sobre TODAS las
//     tarjetas (música, videos, fotos, libros) — tocar marca/desmarca
//   - Barra flotante con contador + Eliminar + salir
//   - Eliminar = modal de CONFIRMACIÓN EN TRES PASOS con advertencias
//     escalonadas (1/3 aviso → 2/3 irreversible → 3/3 última advertencia)
//   API: S.msStart(id) · S.msExit() · S.msToggle(id) · S.msMode · S.msSel
// ============================================================================
window.Sono.register('multisel', function (S) {
    'use strict';
    var $ = S.$;

    S.msMode = false;
    S.msSel = {};      // id → true

    function count() { return Object.keys(S.msSel).length; }

    function syncBar() {
        $('media-msbar').hidden = !S.msMode;
        var n = count();
        $('ms-count').textContent = n + ' seleccionado' + (n === 1 ? '' : 's');
    }

    S.msStart = function (firstId) {
        S.msMode = true;
        S.msSel = {};
        if (firstId) S.msSel[firstId] = true;   // la tarjeta del ⋮ ya queda marcada
        syncBar();
        S.render();
    };

    S.msExit = function () {
        S.msMode = false;
        S.msSel = {};
        syncBar();
        S.render();
    };

    S.msToggle = function (id) {
        if (S.msSel[id]) delete S.msSel[id]; else S.msSel[id] = true;
        // solo repinto esa tarjeta: no hace falta re-render completo
        var card = S.grid.querySelector('.tribal-card[data-id="' + id + '"], .tribal-row[data-id="' + id + '"]');
        if (card) {
            card.classList.toggle('ms-on', !!S.msSel[id]);
            var ic = card.querySelector('.ms-check');
            if (ic) ic.className = 'ms-check bi ' + (S.msSel[id] ? 'bi-check-square-fill' : 'bi-square');
        }
        syncBar();
    };

    // ------------------------------------------------- eliminación masiva --
    // modal de tres pasos con advertencias cada vez más fuertes
    function confirm3(n, done) {
        var step = 0;
        var ov = document.createElement('div');
        ov.className = 'tribal-overlay tribal-msdel-ov';
        (S.root || document.body).appendChild(ov);
        var steps = [
            ['Eliminación múltiple', '⚠️ Vas a eliminar ' + n +
                ' archivo' + (n > 1 ? 's' : '') + ' de la tribu.',
             'Continuar', false],
            ['¿Estás seguro?', '⚠️⚠️ Los ' + n + ' archivos se borrarán ' +
                'para siempre. Esto NO se puede deshacer.',
             'Sí, eliminar', false],
            ['ÚLTIMA ADVERTENCIA', '🛑 Punto de no retorno: pulsa el botón ' +
                'rojo para borrar definitivamente los ' + n + ' archivos.',
             'ELIMINAR DEFINITIVAMENTE', true]
        ];
        function kill() { ov.remove(); }
        function draw() {
            var s = steps[step];
            ov.innerHTML = '<div class="tribal-dialog">' +
                '<h4><i class="bi bi-exclamation-triangle-fill"></i> ' + s[0] +
                    ' <span class="ms-step">' + (step + 1) + '/3</span></h4>' +
                '<p>' + s[1] + '</p>' +
                '<div class="tribal-dialog-actions">' +
                    '<button class="tribal-btn" id="msd-cancel">Cancelar</button>' +
                    '<button class="tribal-btn ' + (s[3] ? 'danger' : 'primary') +
                        '" id="msd-ok">' + s[2] + '</button>' +
                '</div></div>';
            ov.querySelector('#msd-cancel').addEventListener('click', kill);
            ov.querySelector('#msd-ok').addEventListener('click', function () {
                step++;
                if (step < steps.length) draw();
                else { kill(); done(); }
            });
        }
        ov.addEventListener('click', function (e) { if (e.target === ov) kill(); });
        draw();
    }

    function deleteAll(ids) {
        // soltar lo que esté sonando / abierto si va en la lista
        if (ids.indexOf(S.audio.dataset.current) >= 0) {
            $('player-close').click();
            if (window.TribalVinyl) window.TribalVinyl.close();
        }
        if (S.imageItem && ids.indexOf(S.imageItem.id) >= 0) S.closeImage();
        var seq = Promise.resolve(), n = 0;
        ids.forEach(function (id) {
            if (S.urlCache[id]) {
                try { URL.revokeObjectURL(S.urlCache[id]); } catch (e) {}
                delete S.urlCache[id];
            }
            var px = S.findProxy ? S.findProxy(id) : null;
            seq = seq.then(function () {
                return window.MediaStore.remove(id);
            }).then(function () {
                n++;
                return px ? window.MediaStore.remove(px.id) : null;
            });
        });
        seq.then(function () {
            S.msExit();
            S.showToast(n + ' archivo' + (n === 1 ? '' : 's') +
                ' devuelto' + (n === 1 ? '' : 's') + ' a las cenizas');
            S.reload();
        }).catch(function () {
            S.msExit();
            S.showToast('Se eliminaron ' + n + ' antes del error');
            S.reload();
        });
    }

    // ------------------------------------------- carátula en lote -----------
    // aplica la misma imagen como carátula a TODAS las seleccionadas
    function applyBatchArt(file) {
        var ids = Object.keys(S.msSel);
        if (!ids.length) return S.showToast('Nada seleccionado');
        S.showToast('Poniendo carátula a ' + ids.length + ' archivo(s)…');
        var seq = Promise.resolve(), ok = 0;
        ids.forEach(function (id) {
            seq = seq.then(function () {
                return window.MediaStore.saveArtwork(id, file);
            }).then(function (m2) {
                var m = S.byId(id);
                if (m && m2 && m2.info) m.info = m2.info;
                ok++;
            }).catch(function () {});
        });
        seq.then(function () {
            S.showToast('Carátula aplicada a ' + ok + ' archivo(s)');
            S.render();
        });
    }
    $('ms-art-input').addEventListener('change', function () {
        var f = $('ms-art-input').files[0];
        $('ms-art-input').value = '';
        if (f) applyBatchArt(f);
    });
    $('ms-art').addEventListener('click', function () {
        if (!count()) return S.showToast('Nada seleccionado');
        $('ms-art-input').click();
    });

    // long-press sobre una tarjeta EN modo selección → menú contextual
    // (la implementación vive en msctx.js para mantener este archivo chico)
    S.msLongPress = function () {
        if (!S.msMode || !count()) return;
        if (window.TribalMsCtx) window.TribalMsCtx.open(S, count);
    };

    // ------------------------------------------------------------ cableado --
    $('ms-exit').addEventListener('click', S.msExit);
    // seleccionar todo / deseleccionar — sobre la vista filtrada actual
    if ($('ms-all')) $('ms-all').addEventListener('click', function () {
        (S.filtered() || []).forEach(function (m) { S.msSel[m.id] = true; });
        syncBar();
        S.render();
    });
    if ($('ms-none')) $('ms-none').addEventListener('click', function () {
        S.msSel = {};
        syncBar();
        S.render();
    });
    // enviar las seleccionadas a una colección (o a varias marcando checks)
    $('ms-col').addEventListener('click', function () {
        var ids = Object.keys(S.msSel);
        if (!ids.length) return S.showToast('Nada seleccionado');
        S.openColAssign(ids);
    });
    $('ms-del').addEventListener('click', function () {
        var n = count();
        if (!n) return S.showToast('Nada seleccionado');
        confirm3(n, function () { deleteAll(Object.keys(S.msSel)); });
    });
    // enviar las seleccionadas al servidor LAN (marca info.ftp + enciende)
    $('ms-ftp').addEventListener('click', function () {
        var ids = Object.keys(S.msSel);
        if (!ids.length) return S.showToast('Nada seleccionado');
        if (!window.TribalFtp) return S.showToast('Solo disponible en el APK');
        window.TribalFtp.share(ids, true).then(function (n) {
            S.showToast('📡 ' + n + ' archivo' + (n === 1 ? '' : 's') +
                ' ya sale' + (n === 1 ? '' : 'n') + ' por el servidor');
        });
        S.msExit();
    });
});
