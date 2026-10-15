// ============================================================================
// ARCHIVO: media/readertxt.js
// RESPONSABILIDAD: lector TXT de TRIBALs.
//   - Paginado propio que REFLOWEA con el tamaño de fuente (A− / A+)
//   - Marcas de color persistentes (offsets absolutos del texto) + nota
//   - Menú contextual de selección (via TribalReaderFx)
//   API: TribalReaderTxt.open(meta, deps, url)
// ============================================================================
window.TribalReaderTxt = (function () {
    'use strict';

    function open(meta, deps, url) {
        fetch(url).then(function (r) { return r.text(); }).then(function (txt) {
            var R = window.TribalReader, F = window.TribalReaderFx;
            var ii = F.info(meta);

            var body = '<div class="tribal-reader-page" id="tr-page">' +
                '<pre class="tribal-reader-txt" id="tr-text"></pre></div>';
            var ui = R.shell(meta, deps, 'TXT', null, body);
            var pre = ui.el.querySelector('#tr-text');

            var pages = [], cur = 0;
            function paginate() {
                var per = Math.max(300, Math.round(1400 * 100 / (ii.fontSize || 100)));
                pages = [];
                for (var i = 0; i < txt.length; i += per) {
                    pages.push({ s: i, t: txt.slice(i, i + per) });
                }
                if (!pages.length) pages = [{ s: 0, t: '(vacío)' }];
            }
            function pageMarks() {
                var st = pages[cur].s, en = st + pages[cur].t.length;
                return F.marks(meta).map(function (m, idx) {
                    if (m.cfi != null || m.s >= en || m.e <= st) return null;
                    var r = { s: Math.max(0, m.s - st), e: Math.min(pages[cur].t.length, m.e - st),
                              c: m.c, n: m.n, _i: idx };
                    return r;
                }).filter(Boolean);
            }
            function show(n, dir) {
                if (n < 0 || n > pages.length - 1) return false;  // borde → doc vecino
                cur = n;
                var pg = ui.el.querySelector('#tr-page');
                if (window.TribalReaderSwipe)
                    window.TribalReaderSwipe.flip(pg,
                        dir === 'prev' ? -1 : (dir === 'next' ? 1 : 0));
                else pg.className = 'tribal-reader-page flip-' + (dir || 'next');
                pre.style.fontSize = (0.95 * (ii.fontSize || 100) / 100) + 'rem';
                pre.innerHTML = F.renderMarked(pages[cur].t, pageMarks());
                ui.counter.textContent = 'Pág. ' + (cur + 1) + ' / ' + pages.length;
                ii.off = pages[cur].s;
                ii.page = cur;
                F.save(meta, deps);
                if (window.TribalReaderBm)             // la cinta 🔖 solo en
                    window.TribalReaderBm.sync(ui, meta, { page: cur });
            }                                        // la hoja marcada
            F.initLook(ui, meta, deps, {
                applyLook: function () {
                    var keep = pages.length ? pages[cur].s : (ii.off || 0);
                    paginate();
                    cur = 0;
                    while (cur < pages.length - 1 && pages[cur].s <= keep &&
                           pages[cur + 1].s <= keep) cur++;
                    show(cur, 'none');
                }
            });
            F.bindSel(ui, meta, deps, {
                getSel: function () {
                    var s = F.selOffsets(pre);
                    if (!s) return null;
                    s.payload = { s: pages[cur].s + s.s, e: pages[cur].s + s.e };
                    return s;
                },
                mark: function (sel, color) {
                    var m = { s: sel.payload.s, e: sel.payload.e, c: color, n: '',
                              t: sel.text.slice(0, 160) };
                    F.marks(meta).push(m);
                    F.save(meta, deps);
                    show(cur, 'none');
                    deps.toast('Marcado en ' + color);
                    return m;
                },
                unmark: function (m) {
                    var idx = F.marks(meta).indexOf(m);
                    if (idx < 0) return;
                    F.marks(meta).splice(idx, 1);
                    F.save(meta, deps);
                    show(cur, 'none');            // repinta YA — el color se
                },                              // quita en el momento
                // ⊘: quita TODAS las marcas que tocan la selección actual
                unmarkSel: function (sel) {
                    var s = sel.payload.s, e = sel.payload.e, n = 0;
                    F.marks(meta).slice().forEach(function (m) {
                        if (m.s != null && m.s < e && m.e > s) {
                            var i = F.marks(meta).indexOf(m);
                            if (i >= 0) { F.marks(meta).splice(i, 1); n++; }
                        }
                    });
                    if (n) { F.save(meta, deps); show(cur, 'none'); }
                    return n;
                },
                changed: function () { F.save(meta, deps); show(cur, 'none'); }
            });
            // tocar una marca → nota / quitar
            pre.addEventListener('click', function (e) {
                var mk = e.target.closest('mark.tr-hl');
                if (!mk) return;
                var m = F.marks(meta)[+mk.dataset.mi];
                if (!m) return;
                F.noteDlg(ui, meta, deps, m, function (act) {
                    if (act === 'del') {                    // por objeto — el
                        var i = F.marks(meta).indexOf(m);   // índice render
                        if (i >= 0) F.marks(meta).splice(i, 1); // puede ser viejo
                    }
                    F.save(meta, deps);
                    show(cur, 'none');
                });
            });
            // marcador: long-press 1 s guarda la página exacta
            window.TribalReaderBm.bind(ui, meta, deps, function () {
                return { page: cur, off: pages[cur].s,
                         txt: 'Pág. ' + (cur + 1) + ' / ' + pages.length };
            });
            R.wireNav(ui, function (d) { show(cur + d, d > 0 ? 'next' : 'prev'); });
            paginate();
            cur = 0;
            while (cur < pages.length - 1 && (ii.off || 0) >= pages[cur + 1].s) cur++;
            show(cur, 'none');
        });
    }
    return { open: open };
})();
