// ============================================================================
// ARCHIVO: media/batch.js
// RESPONSABILIDAD: renombrado en lote — página completa en dos pasos.
//   Página 1: lista ordenada 1..N de la vista actual con checkbox por fila.
//   Página 2: solo los seleccionados — nombre viejo, nombre nuevo editable,
//     patrón (base+desde+cifras), modo «sustituir» o «crear copia» en una
//     colección aparte, e «Iniciar» con progreso fila por fila.
// ============================================================================
window.Sono.register('batch', function (S) {
    'use strict';
    var $ = S.$;
    var viewMenu = $('view-menu');
    var ov = $('batch-overlay');
    var page1 = $('batch-page1'), page2 = $('batch-page2');
    var batchList = null, selList = null, running = false;

    function batchExt(name) {
        var d = String(name).lastIndexOf('.');
        return d > 0 ? name.slice(d) : '';
    }
    function batchName(base, n) {
        var pad = String(n).padStart(+$('batch-digits').value, '0');
        return base ? base + '_' + pad : pad;
    }
    function mode() {
        var r = ov.querySelector('input[name="batch-mode"]:checked');
        return r ? r.value : 'replace';
    }
    function selChecked() {
        var ids = {};
        $('batch-list').querySelectorAll('input:checked').forEach(function (c) {
            ids[c.value] = true;
        });
        return batchList.filter(function (m) { return ids[m.id]; });
    }

    // ----------------------------------------------------------- página 1 --
    function renderPage1() {
        $('batch-info').textContent =
            'Marca qué archivos se renombran (' + batchList.length +
            ' en esta vista). Dentro de una colección solo se tocan los de esa carpeta.';
        $('batch-list').innerHTML = batchList.map(function (m) {
            return '<li class="tribal-batch-li">' +
                '<label><input type="checkbox" value="' + m.id + '" checked>' +
                '<i class="bi ' + S.KIND_ICON[m.kind] + '"></i>' +
                '<span>' + S.esc(m.name) + '</span></label></li>';
        }).join('');
    }

    // ----------------------------------------------------------- página 2 --
    function renderPage2() {
        var n = +$('batch-start').value || 0;
        var base = $('batch-base').value.trim();
        $('batch-info2').textContent =
            selList.length + ' elemento(s) a renombrar. Edita cada nombre ' +
            'o aplica el patrón a todos; «Iniciar» muestra el progreso aquí.';
        $('batch-run').innerHTML = selList.map(function (m, i) {
            var nuevo = batchName(base, n + i) + batchExt(m.name);
            return '<li class="tribal-batch-li" data-id="' + m.id + '">' +
                '<span class="bt-old" title="' + S.esc(m.name) + '">' +
                    S.esc(m.name) + '</span>' +
                '<input class="bt-new" value="' + S.esc(nuevo) + '">' +
                '<span class="bt-st">pendiente</span></li>';
        }).join('');
        updPreview();
    }
    function applyPattern() {
        var n = +$('batch-start').value || 0;
        var base = $('batch-base').value.trim();
        $('batch-run').querySelectorAll('.tribal-batch-li').forEach(function (li, i) {
            var m = selList[i];
            li.querySelector('.bt-new').value =
                batchName(base, n + i) + batchExt(m.name);
        });
        updPreview();
    }
    function updPreview() {
        var first = $('batch-run').querySelector('.bt-new');
        var inputs = $('batch-run').querySelectorAll('.bt-new');
        if (!inputs.length) { $('batch-preview').textContent = ''; return; }
        var m = mode();
        $('batch-preview').textContent =
            'Vista previa: ' + first.value + '  …  ' +
            inputs[inputs.length - 1].value +
            (m === 'copy' ? '  ·  copias a la carpeta «' +
                $('batch-col').value.trim() + '»' : '  ·  sustituye el original');
    }

    // --------------------------------------------------------- ejecución ---
    function ensureCol(name) {
        return window.MediaStore.listCollections().then(function (cols) {
            var c = cols.filter(function (x) {
                return x.name.toLowerCase() === name.toLowerCase();
            })[0];
            return c ? c.id : window.MediaStore.createCollection(name)
                .then(function (x) { return x.id; });
        });
    }
    function copyItem(m, newName, colId) {
        return window.MediaStore.getURL(m).then(function (u) {
            if (!u) throw new Error('sin datos');
            return fetch(u);
        }).then(function (r) {
            if (!r.ok) throw new Error('lectura HTTP ' + r.status);
            return r.blob();
        }).then(function (b) {
            return window.MediaStore.add(
                new File([b], newName, { type: m.mime || b.type || '' }));
        }).then(function (meta) {
            if (colId) return window.MediaStore
                .toggleInCollection(meta.id, colId).then(function () {
                    return meta;
                });
            return meta;
        });
    }
    function run() {
        if (running || !selList) return;
        var m = mode();
        var colName = $('batch-col').value.trim() || 'renombrados';
        var rows = {};
        $('batch-run').querySelectorAll('.tribal-batch-li').forEach(function (li) {
            rows[li.dataset.id] = li;
        });
        var todos = selList.map(function (it) {
            return { m: it, nuevo: rows[it.id].querySelector('.bt-new').value.trim() };
        });
        var bad = todos.filter(function (t) { return !t.nuevo; });
        if (bad.length) return S.showToast('Hay ' + bad.length + ' nombre(s) vacío(s)');
        running = true;
        $('batch-ok').disabled = true;
        var done = 0, ok = 0, fail = 0;
        var tick = function () {
            $('batch-preview').textContent =
                'Progreso: ' + done + '/' + todos.length +
                ' · ' + ok + ' ok · ' + fail + ' con error';
        };
        tick();
        var colP = m === 'copy' ? ensureCol(colName) : Promise.resolve(null);
        var chain = colP;
        todos.forEach(function (t) {
            chain = chain.then(function (colId) {
                var st = rows[t.m.id].querySelector('.bt-st');
                st.className = 'bt-st run';
                st.textContent = 'renombrando…';
                var p = (m === 'copy')
                    ? copyItem(t.m, t.nuevo, colId)
                    : window.MediaStore.rename(t.m.id, t.nuevo);
                return p.then(function () {
                    done++; ok++;
                    st.className = 'bt-st ok';
                    st.textContent = '✓ listo';
                    tick();
                }).catch(function (e) {
                    done++; fail++;
                    st.className = 'bt-st err';
                    st.title = String(e && e.message || e);
                    st.textContent = '✗ ' + String(e && e.message || e).slice(0, 40);
                    tick();
                });
            });
        });
        chain.then(function () {
            running = false;
            $('batch-ok').disabled = false;
            S.showToast(ok + ' renombrado(s)' +
                (fail ? ' · ' + fail + ' con error' : '') +
                (m === 'copy' ? ' — copias en «' + colName + '»' : ''));
            S.reload();
        });
    }

    // ------------------------------------------------------------ eventos --
    $('vm-batch').addEventListener('click', function () {
        viewMenu.hidden = true;
        var list = S.filtered();
        if (!list.length) return S.showToast('No hay archivos en esta vista');
        batchList = list; selList = null; running = false;
        page1.hidden = false; page2.hidden = true;
        ov.hidden = false;
        if (window.TribalState) TribalState.opened('batch');
        renderPage1();
    });
    $('batch-all').addEventListener('click', function () {
        $('batch-list').querySelectorAll('input').forEach(function (c) { c.checked = true; });
    });
    $('batch-none').addEventListener('click', function () {
        $('batch-list').querySelectorAll('input').forEach(function (c) { c.checked = false; });
    });
    $('batch-next').addEventListener('click', function () {
        var sel = selChecked();
        if (!sel.length) return S.showToast('Marca al menos un archivo');
        selList = sel;
        page1.hidden = true; page2.hidden = false;
        renderPage2();
        setTimeout(function () { $('batch-base').focus(); }, 60);
    });
    $('batch-back').addEventListener('click', function () {
        if (running) return;
        page2.hidden = true; page1.hidden = false;
    });
    $('batch-apply').addEventListener('click', applyPattern);
    [$('batch-base'), $('batch-start'), $('batch-digits'), $('batch-col')]
        .forEach(function (el) {
            el.addEventListener('input', updPreview);
            el.addEventListener('change', updPreview);
        });
    ov.querySelectorAll('input[name="batch-mode"]').forEach(function (r) {
        r.addEventListener('change', function () {
            $('batch-colf').hidden = mode() !== 'copy';
            updPreview();
        });
    });
    $('batch-ok').addEventListener('click', run);
    $('batch-cancel').addEventListener('click', function () {
        if (running) return;
        ov.hidden = true;
        batchList = selList = null;
        if (window.TribalState) TribalState.closed('batch');
    });
});
