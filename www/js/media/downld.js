// == media/downld.js (<=200): descargar → formatos por tipo → Descargas/TRIBALs
window.TribalDownld = (function () {
    'use strict';
    function extOf(m) {
        var s = (m.name || '') + ' ' + (m.path || '') + ' ' + (m.builtin || '');
        var x = /(\.[a-z0-9]{2,5})\b/i.exec(s);
        return x ? x[1].toLowerCase() : '';
    }
    function base(m) { return (m.name || 'archivo').replace(/\.[^.]+$/, ''); }
    var TXT_EXT = { '.txt': 1, '.epub': 1, '.pdf': 1 };

    // Formatos ofrecidos según tipo de archivo
    function formatsFor(m) {
        var ext = extOf(m);
        var orig = { id: 'orig', label: 'Original (' + (ext || m.mime || 'archivo') + ')' };
        if (m.kind === 'image') return [
            { id: 'png', label: 'PNG (sin pérdida)' },
            { id: 'jpg', label: 'JPG (ligero)' }, orig];
        if (m.kind === 'audio') return [
            { id: 'mp3-320', label: 'MP3 · 320 kbps' },
            { id: 'mp3-192', label: 'MP3 · 192 kbps' },
            { id: 'mp3-128', label: 'MP3 · 128 kbps' }, orig];
        if (m.kind === 'video')
            return [{ id: 'mp4', label: 'MP4 / H.264 (tiempo real)' }, orig];
        if (m.kind === 'doc') {
            var out = [];
            if (TXT_EXT[ext]) out.push(
                { id: 'txt', label: 'TXT (texto extraído)' },
                { id: 'pdf', label: 'PDF (documento paginado)' });
            out.push(orig);
            return out;
        }
        return [orig];
    }

    function blobOf(m) {
        return window.MediaStore.getURL(m).then(function (u) {
            if (!u) throw new Error('sin datos');
            return fetch(u).then(function (r) {
                if (!r.ok) throw new Error('http ' + r.status);
                return r.blob();
            });
        });
    }
    function toText(b) { return b.text ? b.text() : Promise.resolve(''); }
    function st(p, onStatus) { onStatus('Convirtiendo ' + Math.round(p * 100) + '%…'); }

    function imgTo(m, fmt, onStatus) {
        onStatus('Cargando imagen…');
        return window.MediaStore.getURL(m).then(function (u) {
            return new Promise(function (res, rej) {
                var im = new Image();
                im.onload = function () { res(im); };
                im.onerror = function () { rej(new Error('No se pudo leer')); };
                im.src = u;
            });
        }).then(function (im) {
            onStatus('Convirtiendo…');
            var c = document.createElement('canvas');
            c.width = im.naturalWidth; c.height = im.naturalHeight;
            c.getContext('2d').drawImage(im, 0, 0);
            return new Promise(function (res, rej) {
                c.toBlob(function (b) {
                    b ? res({ blob: b, ext: '.' + fmt })
                      : rej(new Error('toBlob falló'));
                }, fmt === 'jpg' ? 'image/jpeg' : 'image/png', 0.92);
            });
        });
    }

    function vidToMp4(m, onStatus) {
        onStatus('Renderizando video en tiempo real…');
        return window.MediaStore.getURL(m).then(function (u) {
            return new Promise(function (res, rej) {
                window.TribalVidFX.renderExport({
                    url: u, from: 0, to: null, speed: 1,
                    plain: true, scale: 0, bitrate: 5000000
                }, function (p) { st(p, onStatus); }, function (blob, err) {
                    if (err || !blob) return rej(new Error(String(err || 'falló')));
                    res({ blob: blob,
                        ext: blob.type.indexOf('mp4') >= 0 ? '.mp4' : '.webm' });
                });
            });
        });
    }

    function pdfText(url, onStatus) {
        var L = window.pdfjsLib;
        if (!L) return Promise.reject(new Error('pdf.js no disponible'));
        L.GlobalWorkerOptions.workerSrc = 'js/vendor/pdf.worker.min.js';
        return L.getDocument(url).promise.then(function (pdf) {
            var out = [], chain = Promise.resolve();
            for (var i = 1; i <= pdf.numPages; i++) (function (pg) {
                chain = chain.then(function () {
                    onStatus('Extrayendo texto pág. ' + pg + '/' + pdf.numPages);
                    return pdf.getPage(pg).then(function (p) {
                        return p.getTextContent();
                    }).then(function (tc) {
                        out.push(tc.items.map(function (x) { return x.str; }).join(' '));
                    });
                });
            })(i);
            return chain.then(function () { return out.join('\n\n'); });
        });
    }
    function epubText(blob, onStatus) {
        var EP = window.ePub && (window.ePub.default || window.ePub);
        if (!EP) return Promise.reject(new Error('epub.js no disponible'));
        var book = EP(blob);
        return book.loaded.spine.then(function (spine) {
            var out = [], chain = Promise.resolve();
            (spine.items || []).forEach(function (it, idx) {
                chain = chain.then(function () {
                    onStatus('Extrayendo texto (' + (idx + 1) + ')…');
                    return it.load(book.load.bind(book)).then(function (doc) {
                        var t = (doc && doc.body && doc.body.textContent || '').trim();
                        if (t) out.push(t);
                    }).catch(function () {});
                });
            });
            return chain.then(function () { return out.join('\n\n'); });
        });
    }

    function docText(m, onStatus) {
        var ext = extOf(m);
        if (ext === '.txt') return blobOf(m).then(toText);
        if (ext === '.pdf') return window.MediaStore.getURL(m)
            .then(function (u) { return pdfText(u, onStatus); });
        if (ext === '.epub') return blobOf(m)
            .then(function (b) { return epubText(b, onStatus); });
        return Promise.reject(new Error('Sin extractor para ' + ext));
    }

    function txtToPdf(m, onStatus) {
        var IO = window.TribalNotepadIO;
        if (!IO || !IO.docToPdfBlob)
            return Promise.reject(new Error('motor PDF no disponible'));
        return docText(m, onStatus).then(function (txt) {
            var html = String(txt || ' ').split(/\n{2,}/).map(function (p) {
                return '<p>' + p.replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/\n/g, '<br>') + '</p>';
            }).join('');
            onStatus('Componiendo PDF…');
            return IO.docToPdfBlob({
                title: base(m), html: html,
                createdAt: Date.now(), updatedAt: Date.now(), lineHeight: '1.5'
            }).then(function (b) { return { blob: b, ext: '.pdf' }; });
        });
    }

    // produce(m, fmtId, onStatus) → { blob, ext }
    function produce(m, fmt, onStatus) {
        if (fmt === 'orig') {
            return blobOf(m).then(function (b) {
                var ext = extOf(m) || '.bin';
                return { blob: new Blob([b], { type: m.mime || b.type }), ext: ext };
            });
        }
        if (m.kind === 'image') return imgTo(m, fmt, onStatus);
        if (m.kind === 'audio') return blobOf(m).then(function (b) {
            return window.TribalConvert.convert(b, fmt,
                function (p) { st(p, onStatus); });
        });
        if (m.kind === 'video') return vidToMp4(m, onStatus);
        if (m.kind === 'doc') {
            if (fmt === 'pdf') return txtToPdf(m, onStatus);
            return docText(m, onStatus).then(function (t) {
                return { blob: new Blob([t], { type: 'text/plain' }), ext: '.txt' };
            });
        }
        return Promise.reject(new Error('Formato no soportado'));
    }

    // Escribe en Descargas/TRIBALs (nativo) o dispara <a download> (web)
    function saveToDevice(blob, name) {
        var IO = window.SonoStoreIO, P = window.Capacitor && window.Capacitor.Plugins;
        if (IO && IO.isNative() && IO.nativeWriteCache) {
            return IO.nativeWriteCache(name, blob).then(function (p) {
                var TN = P && P.TribalNative;
                if (TN && TN.saveToDownloads) return TN.saveToDownloads({
                    path: p, name: name,
                    mime: blob.type || 'application/octet-stream'
                });
                return P.Filesystem.getUri({ path: p, directory: 'CACHE' })
                    .then(function (r) {
                        return P.Share.share({ files: [r.uri], title: name });
                    });
            });
        }
        var u = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = u; a.download = name;
        document.body.appendChild(a);
        a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(u); }, 5000);
        return Promise.resolve();
    }

    return { formatsFor: formatsFor, produce: produce, saveToDevice: saveToDevice };
})();
