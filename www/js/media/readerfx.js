// ============================================================================
// ARCHIVO: media/readerfx.js
// RESPONSABILIDAD: herramientas de lectura de TRIBALs.
//   - Tamaño de fuente con reflow (A− / A+)
//   - Temas claro / sepia / noche + atenuador (slider que oscurece)
//   - Marcas de color (amarillo/celeste/rosado/verde) con nota persistente
//   - Menú contextual de selección: copiar, nota, compartir, marcar
//   Persistencia: meta.info.{fontSize,theme,dim,marks} via store.updateInfo
//   API: TribalReaderFx.{initLook, bindSel, noteDlg, renderMarked, selOffsets,
//        applyLook}
// ============================================================================
window.TribalReaderFx = (function () {
    'use strict';
    var COLORS = { y: '#ffd54a', c: '#7ad7ff', p: '#ff9ecb', g: '#9be59b' };

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function info(meta) { meta.info = meta.info || {}; return meta.info; }
    function marks(meta) {
        var i = info(meta);
        i.marks = i.marks || [];
        return i.marks;
    }
    function save(meta, deps) {
        deps.store.updateInfo(meta.id, info(meta)).catch(function () {});
    }

    // ---- tamaño / tema / atenuador ----------------------------------------
    function applyLook(ui, meta, deps) {
        var i = info(meta);
        var reader = ui.el.querySelector('.tribal-reader');
        reader.classList.remove('tr-sepia', 'tr-dark');
        if (i.theme && i.theme !== 'light') reader.classList.add('tr-' + i.theme);
        var dim = ui.el.querySelector('#tr-dim');
        var lay = ui.el.querySelector('#tr-dimlay');
        if (dim) dim.value = i.dim || 0;
        if (lay) lay.style.opacity = ((i.dim || 0) / 100);
        var fp = ui.el.querySelector('#tr-fpct');
        if (fp) fp.textContent = (i.fontSize || 100) + '%';
        if (deps.hooks && deps.hooks.applyLook) deps.hooks.applyLook(i);
    }

    // hooks = { applyLook(info) }  → el módulo aplica fuente/tema a su visor
    function initLook(ui, meta, deps, hooks) {
        var i = info(meta);
        deps.hooks = hooks || {};
        var btn = ui.el.querySelector('#tr-look-btn');
        var row = ui.el.querySelector('#tr-look');
        if (btn) btn.addEventListener('click', function () {
            row.hidden = !row.hidden;
        });
        function bump(d) {
            i.fontSize = Math.max(50, Math.min(250, (i.fontSize || 100) + d));
            save(meta, deps);
            applyLook(ui, meta, deps);
            ui.el.dispatchEvent(new CustomEvent('tr:font'));
        }
        row.querySelector('#tr-fminus').addEventListener('click', function () { bump(-10); });
        row.querySelector('#tr-fplus').addEventListener('click', function () { bump(10); });
        row.querySelectorAll('[data-tr-theme]').forEach(function (b) {
            b.addEventListener('click', function () {
                i.theme = b.dataset.trTheme;
                save(meta, deps);
                applyLook(ui, meta, deps);
            });
        });
        row.querySelector('#tr-dim').addEventListener('input', function () {
            i.dim = +this.value;
            save(meta, deps);
            var lay = ui.el.querySelector('#tr-dimlay');
            if (lay) lay.style.opacity = (i.dim / 100);
        });
        applyLook(ui, meta, deps);
    }

    // cb cuando cambia el tamaño de fuente (el PDF lo usa para el zoom)
    function watchFont(ui, cb) {
        ui.el.addEventListener('tr:font', cb);
    }

    // ---- offsets de selección dentro de un contenedor de texto --------------
    function selOffsets(container) {
        var sel = window.getSelection();
        if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
        var r = sel.getRangeAt(0);
        if (!container.contains(r.commonAncestorContainer)) return null;
        var pre = document.createRange();
        pre.selectNodeContents(container);
        pre.setEnd(r.startContainer, r.startOffset);
        var s = pre.toString().length;
        var e = s + sel.toString().length;
        return { s: s, e: e, text: sel.toString(), rect: r.getBoundingClientRect() };
    }

    // ---- menú contextual de selección ---------------------------------------
    // provider: { getSel()|onSelected(cb):{text,rect,payload}, mark(sel,color),
    //             changed() }
    function bindSel(ui, meta, deps, provider) {
        var pop = document.createElement('div');
        pop.className = 'tr-selpop';
        pop.hidden = true;
        pop.innerHTML =
            '<button data-a="copy" title="Copiar"><i class="bi bi-clipboard"></i></button>' +
            '<button data-a="share" title="Compartir"><i class="bi bi-share"></i></button>' +
            '<button data-a="note" title="Nota"><i class="bi bi-pencil-square"></i></button>' +
            '<i class="tr-dot tr-dot-y" data-a="y"></i>' +
            '<i class="tr-dot tr-dot-c" data-a="c"></i>' +
            '<i class="tr-dot tr-dot-p" data-a="p"></i>' +
            '<i class="tr-dot tr-dot-g" data-a="g"></i>';
        ui.el.appendChild(pop);
        var cur = null;
        function show(sel) {
            cur = sel;
            var r = cur.rect;
            pop.style.left = Math.max(8, Math.min(
                window.innerWidth - 230, r.left + r.width / 2 - 112)) + 'px';
            pop.style.top = Math.max(56, r.top - 48) + 'px';
            pop.hidden = false;
        }
        if (provider.onSelected) {
            provider.onSelected(function (sel) { if (sel) show(sel); });
        } else {
            ['mouseup', 'touchend'].forEach(function (ev) {
                ui.el.addEventListener(ev, function () {
                    setTimeout(function () {
                        var s = provider.getSel();
                        if (!s || !s.text) { pop.hidden = true; return; }
                        show(s);
                    }, 10);
                });
            });
        }
        // tocar fuera del popup lo oculta
        ui.el.addEventListener('click', function (e) {
            if (!pop.hidden && !pop.contains(e.target) &&
                !e.target.closest('mark.tr-hl')) pop.hidden = true;
        });
        pop.addEventListener('mousedown', function (e) { e.preventDefault(); });
        pop.addEventListener('click', function (e) {
            var b = e.target.closest('[data-a]');
            if (!b || !cur) return;
            var a = b.dataset.a;
            pop.hidden = true;
            if (a === 'copy') {
                navigator.clipboard.writeText(cur.text)
                    .then(function () { deps.toast('Copiado'); });
            } else if (a === 'share') {
                var t = cur.text + ' — «' + meta.name + '»';
                if (navigator.share) navigator.share({ text: t }).catch(function () {});
                else navigator.clipboard.writeText(t)
                    .then(function () { deps.toast('Texto copiado para compartir'); });
            } else if (a === 'note') {
                var mk = provider.mark(cur, 'y');
                if (mk) noteDlg(ui, meta, deps, mk, function (act) {
                    if (act === 'del' && provider.unmark) provider.unmark(mk);
                    if (provider.changed) provider.changed();
                });
            } else if (COLORS[a]) {
                provider.mark(cur, a);
            }
            var sel = window.getSelection();
            if (sel) sel.removeAllRanges();
            cur = null;
        });
    }

    // ---- diálogo de nota sobre una marca ------------------------------------
    // markObj = la marca guardada (tiene .n y .c); onDone('save'|'remove')
    function noteDlg(ui, meta, deps, markObj, onDone) {
        var old = ui.el.querySelector('.tr-notedlg');
        if (old) old.remove();
        var d = document.createElement('div');
        d.className = 'tr-notedlg';
        d.innerHTML =
            '<div class="tr-notedlg-card">' +
                '<textarea placeholder="Nota sobre este marcado…">' +
                    esc(markObj.n || '') + '</textarea>' +
                '<div class="tr-notedlg-btns">' +
                    '<button class="tribal-btn tribal-btn-xs" data-nd="save">' +
                        '<i class="bi bi-check2"></i> Guardar</button>' +
                    '<button class="tribal-btn tribal-btn-xs tr-danger" data-nd="del">' +
                        '<i class="bi bi-trash3"></i> Quitar marca</button>' +
                    '<button class="tribal-btn tribal-btn-xs" data-nd="x">Cerrar</button>' +
                '</div></div>';
        ui.el.appendChild(d);
        d.addEventListener('click', function (e) {
            var b = e.target.closest('[data-nd]');
            if (!b) return;
            var act = b.dataset.nd;
            if (act === 'save') markObj.n = d.querySelector('textarea').value.trim();
            d.remove();
            if (onDone) onDone(act);
        });
    }

    // ---- render de texto con marcas (formato {s,e,c,n} absoluto o por página)
    // ms = marcas que aplican a este bloque, ya con offsets relativos al bloque
    function renderMarked(text, ms) {
        ms = (ms || []).slice().sort(function (a, b) { return a.s - b.s; });
        var out = '', pos = 0;
        ms.forEach(function (m) {
            if (m.s < pos || m.e > text.length || m.e <= m.s) return;
            out += esc(text.slice(pos, m.s)) +
                '<mark class="tr-hl tr-hl-' + m.c + '" data-mi="' + m._i + '">' +
                esc(text.slice(m.s, m.e)) + '</mark>';
            pos = m.e;
        });
        return out + esc(text.slice(pos));
    }

    return { COLORS: COLORS, esc: esc, info: info, marks: marks, save: save,
             initLook: initLook, applyLook: applyLook, selOffsets: selOffsets,
             bindSel: bindSel, noteDlg: noteDlg, renderMarked: renderMarked,
             watchFont: watchFont };
})();
