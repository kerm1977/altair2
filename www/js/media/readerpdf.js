// ============================================================================
// ARCHIVO: media/readerpdf.js
// RESPONSABILIDAD: lector PDF de TRIBALs (pdf.js vendored).
//   - Modo página: render a canvas (fiel al documento)
//   - Modo texto puro: extrae el texto de la página y lo REFLOWEA — permite
//     A−/A+ (tamaño de fuente real, no zoom), marcas de color y nota
//   API: TribalReaderPdf.open(meta, deps, url)
// ============================================================================
window.TribalReaderPdf = (function () {
    'use strict';

    function open(meta, deps, url) {
        if (!window.pdfjsLib) return deps.toast('Visor PDF no disponible');
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdf.worker.min.js';
        pdfjsLib.getDocument(url).promise.then(function (pdf) {
            var R = window.TribalReader, F = window.TribalReaderFx;
            var ii = F.info(meta);
            var total = pdf.numPages;
            var cur = Math.min((ii.page || 1) - 1, total - 1);
            var mode = ii.pdfMode || 'page';          // 'page' | 'txt'
            var textCache = {};                        // texto extraído por página

            var body = '<div class="tribal-reader-page" id="tr-page">' +
                '<canvas id="tr-canvas"></canvas>' +
                '<pre class="tribal-reader-txt" id="tr-text" hidden></pre></div>';
            var ui = R.shell(meta, deps, 'PDF', total, body);
            var canvas = ui.el.querySelector('#tr-canvas');
            var pre = ui.el.querySelector('#tr-text');
            // botón de modo en la barra de look
            var row = ui.el.querySelector('#tr-look');
            var mbtn = document.createElement('button');
            mbtn.className = 'tribal-btn tribal-btn-xs';
            mbtn.id = 'tr-pdfmode';
            row.appendChild(mbtn);

            function pageMarks() {
                return F.marks(meta).map(function (m, idx) {
                    if (m.cfi != null || m.p !== cur) return null;
                    return { s: m.s, e: m.e, c: m.c, n: m.n, _i: idx };
                }).filter(Boolean);
            }
            function paintModeBtn() {
                mbtn.innerHTML = mode === 'page'
                    ? '<i class="bi bi-file-font"></i> Ver como texto'
                    : '<i class="bi bi-file-earmark-pdf"></i> Ver como página';
            }
            function show(n, dir) {
                cur = Math.max(0, Math.min(total - 1, n));
                var pg = ui.el.querySelector('#tr-page');
                pg.className = 'tribal-reader-page flip-' + (dir || 'next');
                ui.counter.textContent = 'Pág. ' + (cur + 1) + ' / ' + total;
                ii.page = cur + 1;
                ii.pdfMode = mode;
                F.save(meta, deps);
                pdf.getPage(cur + 1).then(function (p) {
                    if (mode === 'page') {
                        canvas.hidden = false;
                        pre.hidden = true;
                        // zoom real del documento: A−/A+ escala el canvas y el
                        // contenedor scrollea — la interfaz no se toca
                        var zoom = (ii.fontSize || 100) / 100;
                        var w = ui.el.clientWidth - 40;
                        var scale = Math.min(2, w /
                            p.getViewport({ scale: 1 }).width) * zoom;
                        var vp = p.getViewport({ scale: scale });
                        canvas.width = vp.width;
                        canvas.height = vp.height;
                        pg.style.display = zoom > 1.01 ? 'block' : 'flex';
                        canvas.style.margin = zoom > 1.01 ? '0 auto' : 'auto';
                        p.render({ canvasContext: canvas.getContext('2d'),
                                   viewport: vp });
                    } else {
                        canvas.hidden = true;
                        pre.hidden = false;
                        pre.style.fontSize = (0.95 * (ii.fontSize || 100) / 100) + 'rem';
                        if (textCache[cur] == null) {
                            pre.textContent = 'Extrayendo texto…';
                            p.getTextContent().then(function (tc) {
                                textCache[cur] = tc.items
                                    .map(function (it) { return it.str; }).join(' ');
                                show(cur, 'none');
                            });
                        } else {
                            pre.innerHTML = F.renderMarked(textCache[cur], pageMarks());
                        }
                    }
                });
            }
            mbtn.addEventListener('click', function () {
                mode = mode === 'page' ? 'txt' : 'page';
                paintModeBtn();
                show(cur, 'none');
            });
            paintModeBtn();
            F.initLook(ui, meta, deps, {
                applyLook: function () {
                    pre.style.fontSize = (0.95 * (ii.fontSize || 100) / 100) + 'rem';
                }
            });
            F.bindSel(ui, meta, deps, {
                getSel: function () {
                    if (mode !== 'txt') return null;
                    return F.selOffsets(pre);
                },
                mark: function (sel, color) {
                    var m = { p: cur, s: sel.s, e: sel.e, c: color, n: '' };
                    F.marks(meta).push(m);
                    F.save(meta, deps);
                    show(cur, 'none');
                    deps.toast('Marcado');
                    return m;
                },
                unmark: function (m) {
                    var idx = F.marks(meta).indexOf(m);
                    if (idx >= 0) F.marks(meta).splice(idx, 1);
                },
                changed: function () { F.save(meta, deps); show(cur, 'none'); }
            });
            pre.addEventListener('click', function (e) {
                var mk = e.target.closest('mark.tr-hl');
                if (!mk) return;
                var m = F.marks(meta)[+mk.dataset.mi];
                if (!m) return;
                F.noteDlg(ui, meta, deps, m, function (act) {
                    if (act === 'del') F.marks(meta).splice(+mk.dataset.mi, 1);
                    F.save(meta, deps);
                    show(cur, 'none');
                });
            });
            // A−/A+ en modo página = zoom real del canvas
            F.watchFont(ui, function () {
                if (mode === 'page') show(cur, 'next');
            });
            window.TribalReaderBm.bind(ui, meta, deps, function () {
                return { page: cur + 1,
                         txt: 'Pág. ' + (cur + 1) + ' / ' + total };
            });
            R.wireNav(ui, function (d) { show(cur + d, d > 0 ? 'next' : 'prev'); });
            show(cur, 'none');
        }).catch(function () {
            deps.toast('No se pudo abrir el PDF');
            window.TribalReader.close();
        });
    }
    return { open: open };
})();
