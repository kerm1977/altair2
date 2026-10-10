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
            });
            // restaurar marcas + abrir nota al tocarlas
            function noteFor(m) {
                F.noteDlg(ui, meta, deps, m, function (act) {
                    if (act === 'del') {
                        var ms = F.marks(meta), idx = ms.indexOf(m);
                        if (idx >= 0) ms.splice(idx, 1);
                        try { rend.annotations.remove(m.cfi, 'highlight'); } catch (e) {}
                    }
                    F.save(meta, deps);
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
                                    width: r.width },
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
                unmark: function (m) {
                    var ms = F.marks(meta), idx = ms.indexOf(m);
                    if (idx >= 0) ms.splice(idx, 1);
                    try { rend.annotations.remove(m.cfi, 'highlight'); } catch (e) {}
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
                    // pasar hojas con el dedo dentro del iframe del epub
                    var tx = 0, ty = 0, on = false;
                    d.addEventListener('touchstart', function (e) {
                        if (e.touches.length === 1) {
                            tx = e.touches[0].clientX;
                            ty = e.touches[0].clientY;
                            on = true;
                        }
                    }, { passive: true });
                    d.addEventListener('touchend', function (e) {
                        if (!on) return;
                        on = false;
                        var dx = e.changedTouches[0].clientX - tx;
                        var dy = e.changedTouches[0].clientY - ty;
                        if (Math.abs(dx) > 60 && Math.abs(dy) < 45 &&
                            ui.navStep) {
                            ui.navStep(dx < 0 ? 1 : -1);
                        }
                    }, { passive: true });
                });
            } catch (e) {}
            R.wireNav(ui, function (d) {
                var pg = ui.el.querySelector('#tr-page');
                pg.className = 'tribal-reader-page flip-' + (d > 0 ? 'next' : 'prev');
                d > 0 ? rend.next() : rend.prev();
            });
        }).catch(function () {
            deps.toast('No se pudo abrir el EPUB');
            window.TribalReader.close();
        });
    }
    return { open: open };
})();
