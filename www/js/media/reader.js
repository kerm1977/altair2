// ============================================================================
// ARCHIVO: media/reader.js
// RESPONSABILIDAD: shell del lector de libros de TRIBALs (offline-first).
//   - Barra superior: cerrar, look (Aa), compartir, eliminar
//   - Fila "look": A−/A+ tamaño de fuente, temas ☀/sepia/noche, atenuador
//   - Capa atenuadora (tr-dimlay) sobre el cuerpo
//   - Despacha por formato: TribalReaderTxt / TribalReaderPdf /
//     TribalReaderEpub (módulos separados)
//   API: TribalReader.open(meta, deps) / shell() / wireNav() / close()
//   deps = { mount, urlFor, store, toast, confirm, onDeleted }
// ============================================================================
window.TribalReader = (function () {
    'use strict';

    var ov = null, closing = false;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function close() {
        if (closing) return;
        closing = true;
        if (ov && ov._idle) clearTimeout(ov._idle);
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = null;
        closing = false;
    }

    function extOf(name) {
        var d = String(name || '').lastIndexOf('.');
        return d > 0 ? name.slice(d + 1).toLowerCase() : '';
    }

    function shell(meta, deps, tag, total, body) {
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = document.createElement('div');
        ov.className = 'tribal-overlay tribal-reader-ov';
        ov.innerHTML =
            '<div class="tribal-reader">' +
                '<div class="tribal-reader-bar">' +
                    '<button class="tribal-ctrl" id="tr-close"><i class="bi bi-x-lg"></i></button>' +
                    '<span class="tribal-reader-title">' + esc(meta.name) + '</span>' +
                    '<span class="tribal-reader-tag">' + tag + '</span>' +
                    '<span class="tr-bm" id="tr-bm" hidden>' +
                        '<i class="bi bi-bookmark-fill"></i></span>' +
                    '<button class="tribal-ctrl" id="tr-look-btn" title="Lectura">' +
                        '<i class="bi bi-type"></i></button>' +
                    '<button class="tribal-ctrl" id="tr-music-btn" title="Música de lectura">' +
                        '<i class="bi bi-music-note-beamed"></i></button>' +
                    '<button class="tribal-ctrl" id="tr-share" title="Compartir">' +
                        '<i class="bi bi-share"></i></button>' +
                    '<button class="tribal-ctrl" id="tr-del" title="Eliminar">' +
                        '<i class="bi bi-trash3"></i></button>' +
                '</div>' +
                '<div class="tr-look" id="tr-look" hidden>' +
                    '<button class="tribal-ctrl" id="tr-fminus" title="Letra más chica">' +
                        '<i class="bi bi-dash-lg"></i></button>' +
                    '<b class="tr-look-label" id="tr-fpct">100%</b>' +
                    '<button class="tribal-ctrl" id="tr-fplus" title="Letra más grande">' +
                        '<i class="bi bi-plus-lg"></i></button>' +
                    '<span class="tr-look-sep"></span>' +
                    '<button class="tribal-ctrl" data-tr-theme="light" title="Claro">' +
                        '<i class="bi bi-sun"></i></button>' +
                    '<button class="tribal-ctrl" data-tr-theme="sepia" title="Sepia">' +
                        '<i class="bi bi-circle-half"></i></button>' +
                    '<button class="tribal-ctrl" data-tr-theme="dark" title="Noche">' +
                        '<i class="bi bi-moon"></i></button>' +
                    '<button class="tribal-ctrl" data-tr-theme="papel" ' +
                        'title="Papel · lectura accesible">' +
                        '<i class="bi bi-eyeglasses"></i></button>' +
                    '<input type="range" id="tr-dim" min="0" max="60" ' +
                        'value="0" title="Oscurecer el texto">' +
                '</div>' +
                '<div class="tr-music" id="tr-music" hidden></div>' +
                '<div class="tribal-reader-body">' + body +
                    '<div class="tr-dimlay" id="tr-dimlay"></div></div>' +
                '<div class="tribal-reader-nav">' +
                    '<button class="tribal-btn" id="tr-prev"><i class="bi bi-chevron-left"></i> Anterior</button>' +
                    '<span class="tribal-reader-count" id="tr-count">' +
                        (total ? 'Pág. 1 / ' + total : '') + '</span>' +
                    '<button class="tribal-btn" id="tr-next">Siguiente <i class="bi bi-chevron-right"></i></button>' +
                '</div>' +
            '</div>' +
            '<button class="tr-chrome-fab" id="tr-fab" title="Herramientas">' +
                '<i class="bi bi-book-half"></i></button>';
        (deps.mount || document.body).appendChild(ov);
        if (window.TribalReaderMusic) {
            window.TribalReaderMusic.attach({ el: ov }, deps);
        }

        var counter = ov.querySelector('#tr-count');
        ov.querySelector('#tr-close').addEventListener('click', close);
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
        ov.querySelector('#tr-share').addEventListener('click', function () {
            deps.store.share(meta).catch(function () {
                deps.toast('No se pudo compartir');
            });
        });
        ov.querySelector('#tr-del').addEventListener('click', function () {
            deps.confirm('Eliminar libro',
                '¿Devolver «' + meta.name + '» a las cenizas? No hay vuelta atrás.',
                'Eliminar', function () {
                deps.store.remove(meta.id).then(function () {
                    close();
                    deps.toast('Libro eliminado');
                    if (deps.onDeleted) deps.onDeleted();
                });
            });
        });

        // ---- auto-ocultar interfaz: 5 s sin tocar → solo texto + fab --------
        // el fab se atenúa tras 30 s más sin tocarlo (apenas visible);
        // tocarlo lo despierta y reabre las herramientas
        var fab = ov.querySelector('#tr-fab');
        function armDim() {
            clearTimeout(ov._dim);
            ov._dim = setTimeout(function () {
                if (ov.classList.contains('tr-clean'))
                    fab.classList.add('tr-fab-dim');
            }, 30000);
        }
        function armIdle() {
            clearTimeout(ov._idle);
            ov._idle = setTimeout(function () {
                ov.classList.add('tr-clean');
                fab.classList.remove('tr-fab-dim');
                armDim();
            }, 5000);
        }
        fab.addEventListener('click', function (e) {
            e.stopPropagation();
            fab.classList.remove('tr-fab-dim');
            clearTimeout(ov._dim);
            ov.classList.remove('tr-clean');
            armIdle();
        });
        // cualquier interacción con la interfaz visible reinicia los 5 s
        ov.addEventListener('pointerdown', function () {
            if (!ov.classList.contains('tr-clean')) armIdle();
        });
        armIdle();
        return { el: ov, counter: counter, deps: deps, meta: meta };
    }

    function wireNav(ui, step) {
        // si el paso quedó «al borde» (devuelve false: primera/última página)
        // → pasar al documento anterior/siguiente de la tribu
        var nav = function (d) {
            var r = step(d);
            if (r === false && ui.deps && ui.deps.nextDoc) {
                ui.deps.nextDoc(d, ui.meta);
            }
        };
        ui.navStep = nav;   // epub lo usa dentro de su iframe
        ui.el.querySelector('#tr-prev').addEventListener('click', function () { nav(-1); });
        ui.el.querySelector('#tr-next').addEventListener('click', function () { nav(1); });
        ui.el.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowLeft') nav(-1);
            if (e.key === 'ArrowRight') nav(1);
        });
        ui.el.tabIndex = 0;
        ui.el.focus();
        // pasar hojas con el dedo + efecto "página viva" (readerswipe.js):
        // enganchado al overlay entero → sirve también con barras ocultas
        if (window.TribalReaderSwipe) window.TribalReaderSwipe.bind(ui, nav);
    }

    return {
        esc: esc, close: close, shell: shell, wireNav: wireNav,
        isOpen: function () { return !!ov; },
        open: function (meta, deps) {
            var ext = extOf(meta.name);
            if (['pdf', 'epub', 'txt'].indexOf(ext) < 0 &&
                !(meta.mime === 'application/pdf' || meta.mime === 'application/epub+zip' ||
                  meta.mime === 'text/plain')) {
                return deps.toast('Formato de libro no soportado');
            }
            deps.urlFor(meta, function (u) {
                if (!u) return deps.toast('No se pudo abrir el libro');
                if (ext === 'pdf' || meta.mime === 'application/pdf')
                    window.TribalReaderPdf.open(meta, deps, u);
                else if (ext === 'epub' || meta.mime === 'application/epub+zip')
                    window.TribalReaderEpub.open(meta, deps, u);
                else window.TribalReaderTxt.open(meta, deps, u);
            });
        }
    };
})();
