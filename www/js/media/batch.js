// ============================================================================
// ARCHIVO: media/batch.js
// RESPONSABILIDAD: renombrado en lote con selección individual.
//   - Checklist de la vista actual (biblioteca / colección / favoritos)
//   - Nombre base + número inicial + cifras (2-8), conserva extensiones
//   - Vista previa del patrón antes de aplicar
// ============================================================================
window.Sono.register('batch', function (S) {
    'use strict';
    var $ = S.$;
    var viewMenu = $('view-menu');
    var batchOv = $('batch-overlay'), batchBase = $('batch-base'),
        batchStart = $('batch-start'), batchDigits = $('batch-digits'),
        batchPreview = $('batch-preview'), batchList = null;

    function batchExt(name) {
        var d = String(name).lastIndexOf('.');
        return d > 0 ? name.slice(d) : '';
    }
    function batchName(base, n) {
        var pad = String(n).padStart(+batchDigits.value, '0');
        return base ? base + '_' + pad : pad;
    }
    function batchChecked() {
        var ids = {};
        $('batch-list').querySelectorAll('input:checked').forEach(function (c) {
            ids[c.value] = true;
        });
        return batchList.filter(function (m) { return ids[m.id]; });
    }
    function updBatchPreview() {
        if (!batchList || !batchList.length) return;
        var sel = batchChecked();
        if (!sel.length) { batchPreview.textContent = 'Marca al menos un archivo'; return; }
        var n = +batchStart.value || 0;
        var ext = batchExt(sel[0].name);
        batchPreview.textContent = 'Vista previa: ' +
            batchName(batchBase.value.trim(), n) + ext + '  …  ' +
            batchName(batchBase.value.trim(), n + sel.length - 1) + ext;
    }
    [batchBase, batchStart, batchDigits].forEach(function (el) {
        el.addEventListener('input', updBatchPreview);
        el.addEventListener('change', updBatchPreview);
    });
    $('batch-list').addEventListener('change', updBatchPreview);
    $('batch-all').addEventListener('click', function () {
        $('batch-list').querySelectorAll('input').forEach(function (c) { c.checked = true; });
        updBatchPreview();
    });
    $('batch-none').addEventListener('click', function () {
        $('batch-list').querySelectorAll('input').forEach(function (c) { c.checked = false; });
        updBatchPreview();
    });
    $('vm-batch').addEventListener('click', function () {
        viewMenu.hidden = true;
        var list = S.filtered();
        if (!list.length) return S.showToast('No hay archivos en esta vista');
        batchList = list;
        $('batch-info').textContent =
            'Marca qué archivos se renombran (' + list.length + ' en esta vista). ' +
            'Dentro de una colección solo se tocan los de esa carpeta.';
        $('batch-list').innerHTML = list.map(function (m) {
            return '<div class="tribal-col-row">' +
                '<label class="tribal-col-check on">' +
                    '<input type="checkbox" value="' + m.id + '" checked> ' +
                    '<i class="bi ' + S.KIND_ICON[m.kind] + '"></i>' +
                    '<span>' + S.esc(m.name) + '</span></label></div>';
        }).join('');
        batchOv.hidden = false;
        updBatchPreview();
        setTimeout(function () { batchBase.focus(); }, 60);
    });
    $('batch-cancel').addEventListener('click', function () {
        batchOv.hidden = true;
        batchList = null;
    });
    $('batch-ok').addEventListener('click', function () {
        if (!batchList) return;
        var sel = batchChecked();
        if (!sel.length) return S.showToast('Marca al menos un archivo');
        var n = +batchStart.value || 0;
        var base = batchBase.value.trim();
        var chain = Promise.resolve(), count = 0;
        sel.forEach(function (m, i) {
            chain = chain.then(function () {
                return window.MediaStore.rename(m.id,
                    batchName(base, n + i) + batchExt(m.name));
            }).then(function () { count++; }).catch(function () {});
        });
        chain.then(function () {
            batchOv.hidden = true;
            batchList = null;
            S.showToast(count + ' archivo(s) renombrados');
            S.reload();
        });
    });
});
