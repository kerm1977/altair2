// ============================================================================
// ARCHIVO: media/shelf.js
// RESPONSABILIDAD: estantería de libros de TRIBALs.
//   - Portadas automáticas: EPUB (cover embebida via epub.js), PDF (página 1
//     renderizada a miniatura), TXT (icono por defecto)
//   - Persistencia: la portada se guarda como 'art' del item (saveArtwork)
//     para no volver a extraerla
//   - searchCover: buscador online de portadas (Open Library API) con
//     overlay de resultados — tocar una la descarga y guarda
//   API: TribalShelf.coverFor(meta, img, urlFor) / .searchCover(meta, S)
// ============================================================================
window.TribalShelf = (function () {
    'use strict';
    var extracting = {};

    function extOf(n) {
        var d = String(n || '').lastIndexOf('.');
        return d > 0 ? n.slice(d + 1).toLowerCase() : '';
    }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function markFail(meta) {
        window.MediaStore.updateInfo(meta.id, { noCover: true }).catch(function () {});
    }

    // ---- extracción local ---------------------------------------------------
    function epubCover(url) {
        if (!window.ePub) return Promise.resolve(null);
        return fetch(url).then(function (r) { return r.arrayBuffer(); })
            .then(function (buf) {
                var EP = window.ePub.default || window.ePub;
                var book = EP(buf);
                return book.coverUrl().then(function (cu) {
                    if (!cu) return null;
                    return fetch(cu).then(function (r) { return r.blob(); });
                });
            }).catch(function () { return null; });
    }
    function pdfCover(url) {
        if (!window.pdfjsLib) return Promise.resolve(null);
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdf.worker.min.js';
        return pdfjsLib.getDocument(url).promise
            .then(function (pdf) { return pdf.getPage(1); })
            .then(function (pg) {
                var w0 = pg.getViewport({ scale: 1 }).width;
                var vp = pg.getViewport({ scale: 220 / w0 });
                var cv = document.createElement('canvas');
                cv.width = vp.width; cv.height = vp.height;
                return pg.render({ canvasContext: cv.getContext('2d'), viewport: vp })
                    .promise.then(function () {
                        return new Promise(function (res) { cv.toBlob(res, 'image/jpeg', 0.8); });
                    });
            }).catch(function () { return null; });
    }

    function coverFor(meta, img, urlFor) {
        function put(u) {
            img.src = u;
            var ic = img.parentElement && img.parentElement.querySelector('.kind-icon');
            if (ic) ic.style.display = 'none';
        }
        window.MediaStore.getArtURL(meta).then(function (u) {
            if (u) { put(u); return; }
            if ((meta.info && meta.info.noCover) || extracting[meta.id]) {
                var p = extracting[meta.id];
                if (p) p.then(function (u2) { if (u2 && img.isConnected) put(u2); });
                return;
            }
            extracting[meta.id] = new Promise(function (resolve) {
                urlFor(meta, function (u2) {
                    if (!u2) { markFail(meta); return resolve(null); }
                    var ext = extOf(meta.name);
                    var job = (ext === 'epub' || meta.mime === 'application/epub+zip')
                        ? epubCover(u2)
                        : (ext === 'pdf' || meta.mime === 'application/pdf')
                            ? pdfCover(u2) : Promise.resolve(null);
                    job.then(function (blob) {
                        if (!blob) { markFail(meta); return resolve(null); }
                        window.MediaStore.saveArtwork(meta.id, blob).then(function () {
                            window.MediaStore.getArtURL(meta).then(function (u3) {
                                if (u3 && img.isConnected) put(u3);
                                resolve(u3);
                            });
                        });
                    });
                });
            });
        });
    }

    // ---- búsqueda online de portadas (Open Library) --------------------------
    function searchCover(meta, S) {
        var ov = document.createElement('div');
        ov.className = 'tribal-overlay tribal-cover-ov';
        var q = meta.name.replace(/\.[^.]+$/, '');
        ov.innerHTML =
            '<div class="tribal-dialog tribal-cover-dlg">' +
                '<h4><i class="bi bi-image"></i> Portada del libro</h4>' +
                '<div class="tr-cover-search">' +
                    '<input id="tc-q" type="text" value="' + esc(q) + '">' +
                    '<button class="tribal-btn tribal-btn-icon" id="tc-go">' +
                        '<i class="bi bi-search"></i></button></div>' +
                '<div class="tr-cover-grid" id="tc-grid">' +
                    '<p class="tribal-p2p-err">Busca por título…</p></div>' +
                '<button class="tribal-btn" id="tc-close">Cerrar</button>' +
            '</div>';
        (S.root || document.body).appendChild(ov);
        var grid = ov.querySelector('#tc-grid');
        function kill() { ov.remove(); }
        ov.querySelector('#tc-close').addEventListener('click', kill);
        ov.addEventListener('click', function (e) { if (e.target === ov) kill(); });
        function doSearch() {
            grid.innerHTML = '<p class="tribal-p2p-err">Buscando…</p>';
            fetch('https://openlibrary.org/search.json?title=' +
                  encodeURIComponent(ov.querySelector('#tc-q').value.trim()) +
                  '&limit=8&fields=cover_i,title')
                .then(function (r) { return r.json(); })
                .then(function (d) {
                    var docs = (d.docs || []).filter(function (x) { return x.cover_i; });
                    grid.innerHTML = docs.length ? docs.map(function (x) {
                        return '<img class="tr-cover-pick" loading="lazy" src="' +
                            'https://covers.openlibrary.org/b/id/' + x.cover_i +
                            '-M.jpg" data-cov="' + x.cover_i + '" alt="">';
                    }).join('') : '<p class="tribal-p2p-err">Sin portadas</p>';
                })
                .catch(function () {
                    grid.innerHTML = '<p class="tribal-p2p-err">Sin conexión</p>';
                });
        }
        ov.querySelector('#tc-go').addEventListener('click', doSearch);
        ov.querySelector('#tc-q').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') doSearch();
        });
        grid.addEventListener('click', function (e) {
            var img = e.target.closest('.tr-cover-pick');
            if (!img) return;
            fetch('https://covers.openlibrary.org/b/id/' + img.dataset.cov + '-L.jpg')
                .then(function (r) { return r.blob(); })
                .then(function (blob) {
                    return window.MediaStore.saveArtwork(meta.id, blob);
                })
                .then(function (m2) {
                    if (m2 && m2.info) meta.info = m2.info;   // meta vivo
                    S.showToast('Portada guardada');
                    kill();
                    S.render();
                })
                .catch(function () { S.showToast('No se pudo descargar'); });
        });
        doSearch();
    }

    return { coverFor: coverFor, searchCover: searchCover };
})();
