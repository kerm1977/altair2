// ============================================================================
// ARCHIVO: media/readerepub.js
// RESPONSABILIDAD: lector EPUB de TRIBALs (epub.js vendored).
//   - Paginación nativa del formato + marcador CFI persistente
//   - A−/A+ real (rend.themes.fontSize) + temas claro/sepia/noche
//   - Marcas de color con nota via annotations (persisten entre páginas)
//   API: TribalReaderEpub.open(meta, deps, url)
// ============================================================================
window.TribalReaderEpub = (function () {
    'use strict';

    function open(meta, deps, url) {
        if (!window.ePub) return deps.toast('Visor EPUB no disponible');
        fetch(url).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
            var R = window.TribalReader, F = window.TribalReaderFx;
            var ii = F.info(meta);
            var EP = window.ePub.default || window.ePub;
            var book = EP(buf);
            var body = '<div class="tribal-reader-page" id="tr-page">' +
                '<div id="tr-epub"></div></div>';
            var ui = R.shell(meta, deps, 'EPUB', null, body);
            var rend = book.renderTo('tr-epub', {
                width: '100%', height: '100%', flow: 'paginated', spread: 'none'
            });
            rend.themes.register('light', { body: {
                color: '#3a2c1c', background: '#f7f1e3' } });
            rend.themes.register('sepia', { body: {
                color: '#4a3a26', background: '#e9dcbe' } });
            rend.themes.register('dark', { body: {
                color: '#ece4d4', background: '#14100c' } });
            // papel: café sobre café — alto contraste cálido, amigable
            // para daltonismo (sin distinciones rojo/verde)
            rend.themes.register('papel', { body: {
                color: '#46311c', background: '#d8c096' } });
            F.initLook(ui, meta, deps, {
                applyLook: function (i) {
                    rend.themes.select(i.theme || 'light');
                    rend.themes.fontSize((i.fontSize || 100) + '%');
                }
            });
            var saved = ii.epubCfi;
            rend.display(saved || undefined);
            rend.on('relocated', function (loc) {
                ui.counter.textContent = loc.start.percentage
                    ? Math.round(loc.start.percentage * 100) + '%' : '…';
                if (loc.start.cfi) {
                    ii.epubCfi = loc.start.cfi;
                    F.save(meta, deps);
                }
                if (window.TribalReaderBm)              // 🔖 solo en la hoja
                    window.TribalReaderBm.sync(ui, meta, // marcada
                        { cfi: loc.start.cfi });
            });
            // quitar marca en 3 capas — annotations.remove puede fallar en
            // silencio y dejar el <mark> pintado + el registro interno (la
            // marca "volvía" al pasar de página). La cirugía DOM es
            // infalible: desenvuelve los spans de ESTA cfi ahora mismo.
            function dropMark(m) {
                var ms = F.marks(meta), idx = ms.indexOf(m);
                if (idx >= 0) ms.splice(idx, 1);
                // 1) API oficial — dos firmas por si el vendor difiere
                try { rend.annotations.remove(m.cfi, 'highlight'); } catch (e) {}
                try { rend.annotations.remove(m.cfi); } catch (e) {}
                // 2) registro interno del gestor — si sobrevive, la marca
                //    se repinta sola en la siguiente renderización
                try {
                    var ann = rend.annotations && rend.annotations._annotations;
                    if (ann) Object.keys(ann).forEach(function (k) {
                        if (k === m.cfi ||
                            (ann[k] && ann[k].cfiRange === m.cfi))
                            delete ann[k];
                    });
                    var bs = rend.annotations && rend.annotations._annotationsBySectionIndex;
                    if (bs) Object.keys(bs).forEach(function (si) {
                        bs[si] = bs[si].filter(function (a) {
                            return !a || a.cfiRange !== m.cfi;
                        });
                    });
                } catch (e) {}
                // 3) cirugía DOM: desenvolver los <mark data-epubcfi> de
                //    esta marca en el iframe — desaparece en tiempo real
                try {
                    var ifrs = ui.el.querySelectorAll('#tr-epub iframe');
                    for (var i = 0; i < ifrs.length; i++) {
                        var d = ifrs[i].contentDocument;
                        if (!d) continue;
                        var els = d.querySelectorAll(
                            '[data-epubcfi="' + m.cfi + '"]');
                        for (var k2 = els.length - 1; k2 >= 0; k2--) {
                            var el = els[k2], par = el.parentNode;
                            while (el.firstChild)
                                par.insertBefore(el.firstChild, el);
                            par.removeChild(el);
                        }
                    }
                } catch (e) {}
                F.save(meta, deps);
            }
            // restaurar marcas + abrir nota al tocarlas
            function noteFor(m) {
                F.noteDlg(ui, meta, deps, m, function (act) {
                    if (act === 'del') dropMark(m);
                    else F.save(meta, deps);
                });
            }
            function paint(m) {
                rend.annotations.highlight(m.cfi, m, function () {
                    noteFor(m);
                }, 'tr-epubhl', { fill: F.COLORS[m.c] || '#ffd54a',
                                  'fill-opacity': '0.45' });
            }
            book.ready.then(function () { F.marks(meta).forEach(paint); });
            // selección → menú contextual (el selection va dentro del iframe)
            F.bindSel(ui, meta, deps, {
                onSelected: function (cb) {
                    rend.on('selected', function (cfiRange, contents) {
                        var txt = contents.window.getSelection().toString();
                        if (!txt) return;
                        var r;
                        try { r = contents.range(cfiRange).getBoundingClientRect(); }
                        catch (e) { r = { left: 0, top: 0, width: 0 }; }
                        var ifr = ui.el.querySelector('#tr-epub iframe');
                        var fr = ifr ? ifr.getBoundingClientRect()
                                     : { left: 0, top: 0 };
                        cb({ text: txt,
                            rect: { left: fr.left + r.left, top: fr.top + r.top,
                                    width: r.width,
                                    bottom: fr.top + (r.bottom || r.top + 40) },
                            payload: { cfi: cfiRange } });
                    });
                },
                mark: function (sel, color) {
                    var m = { cfi: sel.payload.cfi, c: color, n: '',
                              t: sel.text.slice(0, 80) };
                    F.marks(meta).push(m);
                    F.save(meta, deps);
                    paint(m);
                    deps.toast('Marcado');
                    return m;
                },
                unmark: function (m) { dropMark(m); },
                // ⊘: quita las marcas que tocan la selección — por cfi
                // exacto o por contención de texto (selección dentro de la
                // marca o cubriéndola)
                unmarkSel: function (sel) {
                    var n = 0;
                    F.marks(meta).slice().forEach(function (m) {
                        if (!m.cfi) return;
                        var same = m.cfi === (sel.payload && sel.payload.cfi);
                        var text = m.t && sel.text &&
                            (sel.text.indexOf(m.t) >= 0 ||
                             m.t.indexOf(sel.text) >= 0);
                        if (same || text) { dropMark(m); n++; }
                    });
                    return n;
                },
                changed: function () { F.save(meta, deps); }
            });
            // marcador: long-press 1 s — en el contorno y dentro del iframe
            var bm = window.TribalReaderBm.bind(ui, meta, deps, function () {
                return { cfi: ii.epubCfi, txt: 'Posición guardada' };
            });
            try {
                rend.hooks.content.register(function (contents) {
                    var d = contents && contents.document;
                    if (!d) return;
                    bm.attachTo(d.documentElement);
                    // pasar hojas con el dedo dentro del iframe del epub —
                    // se reengancha en cada página via hooks.content
                    if (window.TribalReaderSwipe) window.TribalReaderSwipe.bindDoc(d, ui);
                });
            } catch (e) {}
            R.wireNav(ui, function (d) {
                var pg = ui.el.querySelector('#tr-page');
                if (window.TribalReaderSwipe)
                    window.TribalReaderSwipe.flip(pg, d);
                else pg.className = 'tribal-reader-page flip-' +
                    (d > 0 ? 'next' : 'prev');
                d > 0 ? rend.next() : rend.prev();
            });
        }).catch(function () {
            deps.toast('No se pudo abrir el EPUB');
            window.TribalReader.close();
        });
    }
    return { open: open };
})();
