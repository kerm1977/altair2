// === media/vnotesrow.js — fila de nota guardada ==========================
// Todo a la mano en cada fila:
//   línea 1: nombre · ▶ escuchar · ✎ renombrar · ⬇ exportar MP3 · 🗑 (3 pasos)
//   línea 2: 🔊 volumen (0–200%) · select de filtros EQ
// Volumen y filtro se guardan en info.{vvol,veq}, se aplican en vivo al
// reproducir (vnotesplay) y se hornean en la exportación (TribalVDSP).
// API:  r = TribalVRow.row(m); TribalVRow.attach(r, m, ctx)
//       ctx = { deps, play(rw), refresh() }
// =========================================================================
window.TribalVRow = (function () {
    'use strict';
    function esc(s) {
        var E = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
        return String(s || '').replace(/[&<>"]/g, function (c) { return E[c]; });
    }
    function ext(m) { return (/\.[^.]+$/.exec(m.name || '') || [''])[0]; }
    function eqOf(m) { return (m.info && m.info.veq) || 'normal'; }
    function volOf(m) {
        var v = m.info && m.info.vvol; return v == null ? 1 : +v; }
    function eqOpts(sel) {
        return (window.TribalEQ.PRESETS || []).map(function (p) {
            return '<option value="' + p.id + '"' +
                (p.id === sel ? ' selected' : '') + '>' + p.label +
                '</option>'; }).join('');
    }
    function fmtDate(t) {
        if (!t) return '—';
        try {
            return new Date(t).toLocaleString('es', { day: '2-digit', month: 'short',
                year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch (e) { return new Date(t).toLocaleString(); }
    }
    function fmtDur(s) {
        if (!(s > 0)) return '--:--';
        s = Math.round(s);
        var h = (s / 3600) | 0, mm = ((s % 3600) / 60) | 0, ss = s % 60;
        return (h ? h + ':' + ('0' + mm).slice(-2) : mm) + ':' + ('0' + ss).slice(-2);
    }
    function row(m) {
        var r = document.createElement('div'); r.className = 'vn-row';
        var pc = Math.round(volOf(m) * 100);
        r.innerHTML =
            '<div class="vn-r1"><i class="bi bi-mic"></i>' +
            '<span class="vn-name">' + esc(m.name) + '</span>' +
            '<button data-play title="Escuchar"><i class="bi ' +
            'bi-play-circle"></i></button>' +
            '<button data-ren title="Renombrar"><i class="bi ' +
            'bi-pencil"></i></button>' +
            '<button data-exp title="Exportar a MP3"><i class="bi ' +
            'bi-download"></i></button>' +
            '<button data-del class="danger" title="Eliminar"><i class="bi ' +
            'bi-trash3"></i></button></div>' +
            '<div class="vn-meta"><span><i class="bi bi-calendar3"></i>' +
            fmtDate(m.addedAt) + '</span><span><i class="bi bi-stopwatch"></i>' +
            fmtDur(m.info && m.info.dur) + '</span></div>' +
            '<div class="vn-ctl"><i class="bi bi-volume-up-fill"></i>' +
            '<input type="range" class="vn-vol" min="0" max="200" step="5" ' +
            'value="' + pc + '"><span class="vn-vpc">' + pc + '%</span>' +
            '<i class="bi bi-sliders"></i><select class="vn-eq">' +
            eqOpts(eqOf(m)) + '</select></div>';
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
    // volumen + filtro: persisten en info y se aplican en vivo si suena
    function wireFx(rw, m, ctx) {
        var sl = rw.querySelector('.vn-vol'),
            pc = rw.querySelector('.vn-vpc'),
            eq = rw.querySelector('.vn-eq');
        function apply() {
            if (!m.info) m.info = {};
            m.info.veq = eq.value; m.info.vvol = sl.value / 100;
            pc.textContent = sl.value + '%';
            if (ctx.deps.store.updateInfo)
                ctx.deps.store.updateInfo(m.id,
                    { veq: eq.value, vvol: sl.value / 100 });
            if (window.TribalVNotePlay && TribalVNotePlay.setFx)
                TribalVNotePlay.setFx(eq.value, sl.value / 100);
        }
        sl.addEventListener('input', apply);
        eq.addEventListener('change', apply);
    }
    // exportar: render offline con filtro + volumen → MP3 320 → tribu + descarga
    function exportNote(m, ctx) {
        var deps = ctx.deps, D = window.TribalVDSP;
        deps.toast('Exportando «' + m.name + '»…');
        deps.urlFor(m, function (u) {
            if (!u) return deps.toast('No se pudo leer el audio');
            fetch(u).then(function (r) { return r.blob(); }).then(D.decode)
            .then(function (buf) {
                return D.render(buf, { eq: eqOf(m), vol: volOf(m) },
                    [], 0, buf.duration); })
            .then(function (out) {
                return window.TribalConvert.convert(D.wav(out), 'mp3-320'); })
            .then(function (r) {
                var base = m.name.replace(/\.[^.]+$/, '') + ' (fx)' + r.ext;
                var f = new File([r.blob], base, { type: r.blob.type });
                return deps.store.add(f).then(function (added) {
                    if (added && deps.store.updateInfo)
                        return deps.store.updateInfo(added.id, { vn: 1 });
                }).then(function () {
                    var a = document.createElement('a');
                    a.href = URL.createObjectURL(r.blob); a.download = base;
                    document.body.appendChild(a); a.click(); a.remove();
                    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
                    deps.toast('«' + base + '» exportado y guardado');
                    if (deps.reload) deps.reload();
                });
            }).catch(function (e) {
                deps.toast('Error: ' + (e && e.message || e)); });
        });
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
        rw.querySelector('[data-ren]').onclick = function () {
            renMode(rw, m, ctx); };
        rw.querySelector('[data-exp]').onclick = function () {
            exportNote(m, ctx); };
        rw.querySelector('[data-del]').onclick = function () {
            delMode(rw, m, ctx, 0); };
        wireFx(rw, m, ctx);
    }
    return { row: row, attach: attach };
})();
