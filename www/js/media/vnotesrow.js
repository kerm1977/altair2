// === media/vnotesrow.js — fila de nota guardada ==========================
// Escuchar · editar · renombrar (input inline) · eliminar con 3
// confirmaciones seguidas. API:
//   r = TribalVRow.row(m); TribalVRow.attach(r, m, ctx)
//   ctx = { deps, play(rw), edit(), refresh() }
// =========================================================================
window.TribalVRow = (function () {
    'use strict';
    function esc(s) {
        var E = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
        return String(s || '').replace(/[&<>"]/g, function (c) { return E[c]; });
    }
    function ext(m) { return (/\.[^.]+$/.exec(m.name || '') || [''])[0]; }
    function row(m) {
        var r = document.createElement('div'); r.className = 'vn-row';
        r.innerHTML = '<i class="bi bi-mic"></i><span class="vn-name">' +
            esc(m.name) + '</span><button data-play title="Escuchar">' +
            '<i class="bi bi-play-circle"></i></button><button data-edit ' +
            'title="Editar"><i class="bi bi-sliders"></i></button><button ' +
            'data-ren title="Renombrar"><i class="bi bi-pencil"></i></button>' +
            '<button data-del class="danger" title="Eliminar"><i class="bi ' +
            'bi-trash3"></i></button>';
        return r;
    }
    function ib(a, cls, ic, lb) {
        return '<button data-a="' + a + '" class="' + cls + '"><i class="bi ' +
            'bi-' + ic + '"></i>' + (lb ? ' ' + lb : '') + '</button>';
    }
    function restore(rw, m, ctx) {
        var r2 = row(m); rw.className = r2.className;
        rw.innerHTML = r2.innerHTML; attach(rw, m, ctx);
    }
    // ---- renombrar ------------------------------------------------------
    function renMode(rw, m, ctx) {
        rw.classList.add('vn-busy');
        rw.innerHTML = '<i class="bi bi-pencil"></i><input class="vn-renin" ' +
            'value="' + esc((m.name || '').replace(/\.[^.]+$/, '')) + '">' +
            ib('ok', 'ok', 'check2') + ib('x', '', 'x-lg');
        var inp = rw.querySelector('.vn-renin'); inp.focus(); inp.select();
        function go() {
            var n = inp.value.trim();
            if (!n) return restore(rw, m, ctx);
            ctx.deps.store.rename(m.id, n + ext(m)).then(function () {
                m.name = n + ext(m);
                if (ctx.deps.reload) ctx.deps.reload();
                restore(rw, m, ctx);
            });
        }
        rw.querySelector('[data-a="ok"]').onclick = go;
        rw.querySelector('[data-a="x"]').onclick = function () {
            restore(rw, m, ctx); };
        inp.onkeydown = function (e) {
            if (e.key === 'Enter') go();
            if (e.key === 'Escape') restore(rw, m, ctx); };
    }
    // ---- eliminar: 3 pasos ----------------------------------------------
    var DEL = ['¿Eliminar esta nota?', 'Esta acción no se puede deshacer.',
               'Última advertencia — se borra para siempre.'];
    function delMode(rw, m, ctx, step) {
        rw.classList.add('vn-busy');
        rw.innerHTML = '<i class="bi bi-exclamation-triangle"></i>' +
            '<span class="vn-name vn-delq">' + esc(DEL[step]) + '</span>' +
            ib('ok', 'danger', 'trash3', step === 2 ? 'Eliminar' : 'Sí') +
            ib('x', '', 'arrow-left', 'Cancelar');
        rw.querySelector('[data-a="ok"]').onclick = function () {
            if (step < 2) return delMode(rw, m, ctx, step + 1);
            if (window.TribalVNotePlay) TribalVNotePlay.stop();
            ctx.deps.store.remove(m.id).then(function () {
                var p = ctx.deps.reload ? ctx.deps.reload() : null;
                if (ctx.deps.toast) ctx.deps.toast('«' + m.name + '» eliminada');
                if (p && p.then) p.then(ctx.refresh);    // la lista se
                else ctx.refresh();                       // repinta con items frescos
            });
        };
        rw.querySelector('[data-a="x"]').onclick = function () {
            restore(rw, m, ctx); };
    }
    function attach(rw, m, ctx) {
        rw.querySelector('[data-play]').onclick = function () { ctx.play(rw); };
        rw.querySelector('[data-edit]').onclick = function () { ctx.edit(); };
        rw.querySelector('[data-ren]').onclick = function () {
            renMode(rw, m, ctx); };
        rw.querySelector('[data-del]').onclick = function () {
            delMode(rw, m, ctx, 0); };
    }
    return { row: row, attach: attach };
})();
