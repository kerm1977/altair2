// ftpsel.js — selección múltiple en la web del servidor LAN
// Check ○/● por card → barra de acciones: Descargar lote / Renombrar /
// Eliminar (modal de 3 pasos) / Limpiar. Colabora con TpLink (ftplink.js).
window.TpSel = (function () {
    'use strict';
    var sel = {}, bar = null;
    var list = document.getElementById('list');
    var modal = document.getElementById('tpdel');
    var T1 = document.getElementById('tpdel-t1'), T2 = document.getElementById('tpdel-t2'),
        NO = document.getElementById('tpdel-no'), YES = document.getElementById('tpdel-yes');
    var delQ = [], delNames = [], delStep = 0;

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function count() { return Object.keys(sel).length; }
    function items() { return (window.TpLink && TpLink.items()) || []; }
    function find(id) { return items().filter(function (x) { return x.i === id; })[0]; }
    function toast(t) {
        var prog = document.getElementById('prog'), pt = document.getElementById('progtxt'),
            pb = document.getElementById('progbar');
        prog.hidden = false; pb.style.width = '100%'; pt.textContent = t;
        setTimeout(function () { prog.hidden = true; pb.style.width = '0'; }, 2400);
    }

    function ensureBar() {
        if (bar) return;
        bar = document.createElement('div');
        bar.className = 'tp-selbar'; bar.id = 'tpselbar'; bar.hidden = true;
        list.parentNode.insertBefore(bar, list);
        bar.addEventListener('click', function (e) {
            var b = e.target.closest('[data-a]'); if (!b) return;
            var a = b.getAttribute('data-a');
            if (a === 'clr') { sel = {}; refresh(); }
            else if (a === 'dl') batchDownload();
            else if (a === 'ren') batchRename();
            else if (a === 'del') openDel(Object.keys(sel), null);
        });
    }

    function refresh() {
        ensureBar();
        list.querySelectorAll('[data-sel]').forEach(function (b) {
            var on = !!sel[b.getAttribute('data-sel')];
            b.textContent = on ? '●' : '○';
            var c = b.closest('.tp-card'); if (c) c.classList.toggle('sel', on);
        });
        var n = count();
        bar.hidden = !n;
        if (n) bar.innerHTML = '<b>● ' + n + ' elegido(s)</b>' +
            '<button class="tp-btn" data-a="dl">⬇ Descargar</button>' +
            (n === 1 ? '<button class="tp-btn ghost" data-a="ren">✎ Renombrar</button>' : '') +
            '<button class="tp-btn danger" data-a="del">🗑 Eliminar</button>' +
            '<button class="tp-btn ghost" data-a="clr">Limpiar</button>';
    }

    /* ---- borrado con modal de 3 pasos (individual o por lote) ---- */
    var STEPS = [
        { t1: '¿Eliminar %s?', t2: '%n — paso 1 de 3', y: 'Continuar →' },
        { t1: 'Se borrará del dispositivo', t2: 'No solo sale de la lista — se elimina del teléfono. Paso 2 de 3', y: 'Sí, continuar →' },
        { t1: '⚠ Último paso — sin retorno', t2: '%n se eliminará definitivamente. ¿Estás realmente seguro?', y: '🗑 Eliminar para siempre' }];
    function openDel(ids, single) {
        delQ = ids.slice(); delStep = 0;
        delNames = single ? [single] : ids.map(function (id) { var m = find(id); return m ? m.n : id; });
        paintDel(); modal.hidden = false;
    }
    function paintDel() { var s = STEPS[delStep];
        var names = delNames.length === 1 ? '«' + delNames[0] + '»' : delNames.length + ' archivos';
        T1.innerHTML = '<b>' + s.t1.replace('%s', esc(names)) + '</b>';
        T2.textContent = s.t2.replace('%n', names);
        YES.innerHTML = s.y; YES.className = 'tp-btn ' + (delStep === 2 ? 'danger' : '');
        NO.innerHTML = delStep === 0 ? 'Cancelar' : '← Volver'; }
    NO.onclick = function () {          // paso 0 cancela; pasos 1-2 retroceden
        if (delStep === 0) { modal.hidden = true; } else { delStep--; paintDel(); } };
    YES.onclick = function () {
        delStep++;
        if (delStep < 3) return paintDel();
        modal.hidden = true; delStep = 0;
        var n = delQ.length, done = 0;
        delQ.forEach(function (id) {
            fetch('/del?i=' + encodeURIComponent(id), { method: 'POST' })
                .then(function () { if (++done === n) {
                    sel = {}; toast('🗑 ' + (n === 1 ? '«' + delNames[0] + '»' : n + ' archivos') + ' eliminado(s) de la tribu');
                    setTimeout(TpLink.load, 900); } })
                .catch(function () { if (++done === n) setTimeout(TpLink.load, 900); });
        });
    };

    /* ---- descargar y renombrar ---- */
    function batchDownload() {
        var ix = 0, ids = Object.keys(sel);
        (function next() {
            if (ix >= ids.length) { sel = {}; refresh(); return; }
            var m = find(ids[ix++]); if (!m) return next();
            var a = document.createElement('a');
            a.href = '/dl?p=' + encodeURIComponent(m.p) + '&n=' + encodeURIComponent(m.n);
            a.download = m.n; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(next, 350);      // espacio para que el navegador encole cada descarga
        })();
    }
    function doRename(id, oldName) {
        var nw = window.prompt('Nuevo nombre para «' + oldName + '»:', oldName);
        if (nw == null || !(nw = nw.trim()) || nw === oldName) return;
        fetch('/ren?i=' + encodeURIComponent(id) + '&n=' + encodeURIComponent(nw), { method: 'POST' })
            .then(function () { toast('✎ Renombrado a «' + nw + '»'); setTimeout(TpLink.load, 700); })
            .catch(function () { toast('No se pudo renombrar'); });
    }
    function batchRename() {
        var id = Object.keys(sel)[0], m = find(id);
        if (m) { sel = {}; refresh(); doRename(id, m.n); }
    }

    /* ---- clicks en cards: check, renombrar, eliminar ---- */
    list.addEventListener('click', function (e) {
        var s = e.target.closest('[data-sel]');
        if (s) { var id = s.getAttribute('data-sel'); if (sel[id]) delete sel[id]; else sel[id] = 1; return refresh(); }
        var r = e.target.closest('[data-reni]');
        if (r) return doRename(r.getAttribute('data-reni'), r.getAttribute('data-deln'));
        var d = e.target.closest('[data-deli]');
        if (d) openDel([d.getAttribute('data-deli')], d.getAttribute('data-deln'));
    });

    return { refresh: refresh };
})();
