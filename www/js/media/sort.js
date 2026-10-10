// ============================================================================
// ARCHIVO: media/sort.js
// RESPONSABILIDAD: ordenamiento de la biblioteca de TRIBALs.
//   - Selector "Ordenar por" en el ⋮ general: A–Z, Z–A, tamaño, formato,
//     colección. Persiste en localStorage (tribu_sort).
//   - S.sortList(list): aplica el orden a la lista filtrada (música, videos,
//     fotos, libros — todo pasa por S.filtered).
//   - En modo 'col' la tarjeta muestra a qué colección pertenece el archivo.
// ============================================================================
window.Sono.register('sort', function (S) {
    'use strict';
    var $ = S.$;

    S.sortMode = localStorage.getItem('tribu_sort') || 'az';

    function extOf(n) {
        var d = String(n || '').lastIndexOf('.');
        return d > 0 ? n.slice(d + 1).toLowerCase() : '';
    }
    function byName(a, b) {
        return String(a.name || '').localeCompare(String(b.name || ''), 'es',
            { numeric: true, sensitivity: 'base' });
    }
    function firstCol(m) {
        if (!m.cols || !m.cols.length) return '\uffff'; // sin colección al final
        return (S.collectionName(m.cols[0]) || '').toLowerCase();
    }

    S.sortList = function (list) {
        var out = list.slice();
        if (S.sortMode === 'za')
            out.sort(function (a, b) { return byName(b, a); });
        else if (S.sortMode === 'size')
            out.sort(function (a, b) { return (b.size || 0) - (a.size || 0) || byName(a, b); });
        else if (S.sortMode === 'size-asc')
            out.sort(function (a, b) { return (a.size || 0) - (b.size || 0) || byName(a, b); });
        else if (S.sortMode === 'fmt')
            out.sort(function (a, b) {
                return extOf(a.name).localeCompare(extOf(b.name)) || byName(a, b);
            });
        else if (S.sortMode === 'col')
            out.sort(function (a, b) {
                return firstCol(a).localeCompare(firstCol(b)) || byName(a, b);
            });
        else out.sort(byName);
        return out;
    };

    // nombres de las colecciones de un archivo (para mostrar bajo el nombre)
    S.colNames = function (m) {
        return (m.cols || []).map(S.collectionName).filter(Boolean).join(', ');
    };

    // selector dentro del ⋮ general
    var sel = $('vm-sort');
    sel.value = S.sortMode;
    sel.addEventListener('change', function () {
        S.sortMode = sel.value;
        localStorage.setItem('tribu_sort', S.sortMode);
        $('view-menu').hidden = true;
        S.render();
        S.showToast('Orden: ' + sel.options[sel.selectedIndex].text);
    });
    sel.addEventListener('click', function (e) { e.stopPropagation(); });
});
