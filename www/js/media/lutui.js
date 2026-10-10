// ============================================================================
// ARCHIVO: media/lutui.js
// RESPONSABILIDAD: diálogo de LUTs .cube del editor de video.
//   - Lista de LUTs guardadas (activar / desactivar / borrar)
//   - Cargar un .cube desde el dispositivo (parsea media-lut.js)
//   El badge "activa" lo muestra vx-lut-st en el ⋮ del visor.
// ============================================================================
window.Sono.register('lutui', function (S) {
    'use strict';
    var $ = S.$;
    var pMenu = S.pMenu;

    var lutOv = $('lut-overlay'), lutList = $('lut-list'), lutFile = $('lut-file');
    function syncLutBadge() {
        var l = window.TribalVidFX.getLUT();
        $('vx-lut-st').textContent = l ? l.name : '';
    }
    function renderLutList() {
        var all = window.TribalVidFX.listLUTs(), names = Object.keys(all);
        var cur = window.TribalVidFX.getLUT();
        var html = '<div class="tribal-col-row">' +
            '<button class="tribal-col-check' + (!cur ? ' on' : '') + '" data-lut="">' +
                '<i class="bi ' + (!cur ? 'bi-check-circle-fill' : 'bi-circle') + '"></i>' +
                '<span>Sin LUT</span></button></div>';
        names.forEach(function (n) {
            var on = cur && cur.name === n;
            html += '<div class="tribal-col-row">' +
                '<button class="tribal-col-check' + (on ? ' on' : '') + '" data-lut="' + S.esc(n) + '">' +
                    '<i class="bi ' + (on ? 'bi-check-circle-fill' : 'bi-circle') + '"></i>' +
                    '<span>' + S.esc(n) + '</span></button>' +
                '<button class="tribal-col-del" data-lutdel="' + S.esc(n) + '">' +
                    '<i class="bi bi-trash3"></i></button></div>';
        });
        lutList.innerHTML = html;
    }
    $('vx-lut').addEventListener('click', function () {
        pMenu.hidden = true;
        renderLutList();
        lutOv.hidden = false;
    });
    lutList.addEventListener('click', function (e) {
        var del = e.target.closest('[data-lutdel]');
        if (del) {
            S.confirm('Eliminar LUT',
                '¿Borrar la LUT «' + del.dataset.lutdel + '»?', 'Eliminar', function () {
                var cur = window.TribalVidFX.getLUT();
                if (cur && cur.name === del.dataset.lutdel) window.TribalVidFX.setLUT(null);
                window.TribalVidFX.deleteLUTFile(del.dataset.lutdel);
                renderLutList(); syncLutBadge();
            });
            return;
        }
        var b = e.target.closest('[data-lut]');
        if (!b) return;
        var name = b.dataset.lut;
        if (!name) { window.TribalVidFX.setLUT(null); }
        else if (!window.TribalVidFX.setLUT(name)) {
            return S.showToast('Ese .cube no se pudo interpretar');
        }
        renderLutList(); syncLutBadge();
        S.showToast(name ? 'LUT activa: ' + name : 'LUT desactivada');
    });
    $('lut-load').addEventListener('click', function () { lutFile.click(); });
    lutFile.addEventListener('change', function () {
        var f = lutFile.files && lutFile.files[0];
        lutFile.value = '';
        if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
            var text = String(rd.result || '');
            if (!window.TribalVidFX.parseLUT(text)) {
                return S.showToast('No parece un .cube válido (falta LUT_3D_SIZE)');
            }
            var name = f.name.replace(/\.cube$/i, '');
            window.TribalVidFX.saveLUTFile(name, text);
            window.TribalVidFX.setLUT(name);
            renderLutList(); syncLutBadge();
            S.showToast('LUT «' + name + '» cargada');
        };
        rd.readAsText(f);
    });
    $('lut-ok').addEventListener('click', function () { lutOv.hidden = true; });
    syncLutBadge();
});
