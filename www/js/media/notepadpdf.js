// ============================================================================
// ARCHIVO: media/notepadpdf.js
// RESPONSABILIDAD: Persistencia (IndexedDB + localStorage respaldo) y
//   exportación del Bloc de Notas WYSIWYG a PDF, TXT, WhatsApp y Bluetooth.
//   API: window.TribalNotepadIO
// ============================================================================
window.TribalNotepadIO = (function () {
    'use strict';

    var DB_NAME = 'tribu-notepad-db';
    var STORE = 'notes';
    var LS_FALLBACK = 'tribu_notepad_v1';

    function openDB() {
        return new Promise(function (resolve, reject) {
            if (!window.indexedDB) return reject(new Error('no idb'));
            var req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = function (e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = function (e) { resolve(e.target.result); };
            req.onerror = function (e) { reject(e.target.error); };
        });
    }

    function sortNotes(arr) {
        arr.sort(function (a, b) {
            var fa = a && a.fav ? 1 : 0;
            var fb = b && b.fav ? 1 : 0;
            if (fb !== fa) return fb - fa;
            return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
        return arr;
    }

    function list() {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE, 'readonly');
                var req = tx.objectStore(STORE).getAll();
                req.onsuccess = function () {
                    db.close();
                    resolve(sortNotes(req.result || []));
                };
                req.onerror = function (e) { db.close(); reject(e.target.error); };
            });
        }).catch(function () {
            try {
                var arr = JSON.parse(localStorage.getItem(LS_FALLBACK) || '[]');
                return sortNotes(arr);
            } catch (e) { return []; }
        });
    }

    function save(note) {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).put(note);
                tx.oncomplete = function () { db.close(); resolve(note); };
                tx.onerror = function (e) { db.close(); reject(e.target.error); };
            });
        }).catch(function () {
            try {
                var arr = JSON.parse(localStorage.getItem(LS_FALLBACK) || '[]');
                var idx = -1;
                for (var i = 0; i < arr.length; i++) {
                    if (arr[i].id === note.id) { idx = i; break; }
                }
                if (idx >= 0) arr[idx] = note; else arr.push(note);
                localStorage.setItem(LS_FALLBACK, JSON.stringify(arr));
            } catch (e) {}
            return note;
        });
    }

    function remove(id) {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).delete(id);
                tx.oncomplete = function () { db.close(); resolve(); };
                tx.onerror = function (e) { db.close(); reject(e.target.error); };
            });
        }).catch(function () {
            try {
                var arr = JSON.parse(localStorage.getItem(LS_FALLBACK) || '[]');
                arr = arr.filter(function (x) { return x.id !== id; });
                localStorage.setItem(LS_FALLBACK, JSON.stringify(arr));
            } catch (e) {}
        });
    }

    // Hora local exacta del dispositivo
    function fmtDateTime(ms) {
        if (!ms) return '—';
        var d = new Date(ms);
        function z(n) { return n < 10 ? '0' + n : '' + n; }
        return z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear() +
            ' · ' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds());
    }

    function safeFileName(title, ext) {
        var base = String(title || 'Nota').trim()
            .replace(/[\\/:*?"<>|]+/g, '_')
            .replace(/\s+/g, ' ')
            .slice(0, 60) || 'Nota';
        return base + ext;
    }

    // Convierte el HTML de la nota a texto plano estructurado
    function docToTxt(note) {
        var tmp = document.createElement('div');
        tmp.innerHTML = note.html || '';
        tmp.querySelectorAll('hr').forEach(function (hr) {
            hr.replaceWith('\n----------------------------------------\n');
        });
        tmp.querySelectorAll('li').forEach(function (li) {
            li.insertAdjacentText('afterbegin', '• ');
            li.insertAdjacentText('beforeend', '\n');
        });
        tmp.querySelectorAll('blockquote').forEach(function (bq) {
            bq.insertAdjacentText('afterbegin', '« ');
            bq.insertAdjacentText('beforeend', ' »\n');
        });
        tmp.querySelectorAll('h1,h2,h3,h4,h5,h6,p,div,br').forEach(function (el) {
            if (el.tagName === 'BR') el.replaceWith('\n');
            else el.insertAdjacentText('beforeend', '\n');
        });
        tmp.querySelectorAll('a').forEach(function (a) {
            var href = a.getAttribute('href');
            if (href && a.textContent.indexOf(href) < 0) {
                a.insertAdjacentText('beforeend', ' (' + href + ')');
            }
        });
        var body = (tmp.innerText || tmp.textContent || '')
            .replace(/\n{3,}/g, '\n\n').trim();
        var head = (note.title || 'Sin título') + '\r\n' +
            'Creado: ' + fmtDateTime(note.createdAt) + '\r\n' +
            'Actualizado: ' + fmtDateTime(note.updatedAt) + '\r\n' +
            '========================================\r\n\r\n';
        return head + body.replace(/\r?\n/g, '\r\n');
    }

    // Empaqueta un array de dataURLs JPEG (páginas A4) en un PDF multipágina válido
    function jpegsToPdfBlob(pages) {
        var parts = [];
        var offsets = [0];
        var len = 0;
        function pushStr(s) {
            var u8 = new Uint8Array(s.length);
            for (var i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i) & 0xFF;
            parts.push(u8);
            len += u8.length;
        }
        function pushBytes(u8) {
            parts.push(u8);
            len += u8.length;
        }
        function startObj(id) {
            offsets[id] = len;
            pushStr(id + ' 0 obj\n');
        }
        function endObj() {
            pushStr('\nendobj\n');
        }

        pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');
        var n = pages.length;
        // Obj 1: Catalog, Obj 2: Pages
        // Por cada página i (0..n-1):
        //   pageObj = 3 + i*3
        //   contentObj = 4 + i*3
        //   imgObj = 5 + i*3
        startObj(1);
        pushStr('<< /Type /Catalog /Pages 2 0 R >>');
        endObj();

        var kids = [];
        for (var i = 0; i < n; i++) kids.push((3 + i * 3) + ' 0 R');
        startObj(2);
        pushStr('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>');
        endObj();

        for (var p = 0; p < n; p++) {
            var pg = pages[p];
            var pageObj = 3 + p * 3;
            var contentObj = 4 + p * 3;
            var imgObj = 5 + p * 3;

            startObj(pageObj);
            pushStr('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] ' +
                '/Resources << /XObject << /Im0 ' + imgObj + ' 0 R >> >> ' +
                '/Contents ' + contentObj + ' 0 R >>');
            endObj();

            var streamCmd = 'q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';
            startObj(contentObj);
            pushStr('<< /Length ' + streamCmd.length + ' >>\nstream\n' + streamCmd + 'endstream');
            endObj();

            startObj(imgObj);
            pushStr('<< /Type /XObject /Subtype /Image /Width ' + pg.w +
                ' /Height ' + pg.h + ' /ColorSpace /DeviceRGB ' +
                '/BitsPerComponent 8 /Filter /DCTDecode /Length ' + pg.bytes.length +
                ' >>\nstream\n');
            pushBytes(pg.bytes);
            pushStr('\nendstream');
            endObj();
        }

        var totalObjs = 2 + n * 3;
        var xrefPos = len;
        pushStr('xref\n0 ' + (totalObjs + 1) + '\n');
        pushStr('0000000000 65535 f \n');
        for (var k = 1; k <= totalObjs; k++) {
            var off = String(offsets[k] || 0);
            while (off.length < 10) off = '0' + off;
            pushStr(off + ' 00000 n \n');
        }
        pushStr('trailer\n<< /Size ' + (totalObjs + 1) + ' /Root 1 0 R >>\nstartxref\n' +
            xrefPos + '\n%%EOF');
        return new Blob(parts, { type: 'application/pdf' });
    }

    function dataUrlToBytes(dataUrl) {
        var b64 = dataUrl.split(',')[1] || '';
        var bin = atob(b64);
        var u8 = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return u8;
    }

    function loadImg(src) {
        return new Promise(function (resolve) {
            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () { resolve(img); };
            img.onerror = function () { resolve(null); };
            img.src = src;
        });
    }

    // Renderiza el documento WYSIWYG en páginas A4 y devuelve Promise<Blob> PDF
    function docToPdfBlob(note) {
        var W = 1240, H = 1754, M = 96;
        var pages = [];
        var canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        var ctx = canvas.getContext('2d');
        var y = M;

        function newPage() {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, W, H);
            y = M;
        }
        function commitPage() {
            var url = canvas.toDataURL('image/jpeg', 0.9);
            pages.push({ w: W, h: H, bytes: dataUrlToBytes(url) });
        }
        function ensureSpace(need) {
            if (y + need > H - M) {
                commitPage();
                newPage();
            }
        }

        newPage();
        // Cabecera: Título + Fechas de creación y actualización
        ctx.fillStyle = '#1a120b';
        ctx.font = 'bold 44px sans-serif';
        y = drawWrappedText(ctx, note.title || 'Sin título', M, y, W - M * 2, 54, 'left');
        y += 10;
        ctx.fillStyle = '#6e5a4f';
        ctx.font = '22px sans-serif';
        ctx.fillText('Creado: ' + fmtDateTime(note.createdAt) +
            '   ·   Actualizado: ' + fmtDateTime(note.updatedAt), M, y + 22);
        y += 42;
        ctx.strokeStyle = '#d8b48a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(M, y);
        ctx.lineTo(W - M, y);
        ctx.stroke();
        y += 32;

        var holder = document.createElement('div');
        holder.innerHTML = note.html || '';
        // El interlineado guardado es una CLAVE (-2…2): se traduce al factor visual
        var LHMAP = { '-2': 0.4, '-1.5': 0.85, '-1.25': 0.95, '1': 1.15,
            '1.25': 1.35, '1.5': 1.55, '2': 2.0 };
        var lhMult = LHMAP[String(note.lineHeight)] || parseFloat(note.lineHeight);
        if (!(lhMult > 0.2)) lhMult = 1.35;

        function drawWrappedText(c, text, x, startY, maxW, lineH, align) {
            var words = String(text || '').split(/\s+/);
            var line = '';
            var curY = startY;
            function flushLine(ln) {
                ensureSpace(lineH + 8);
                curY = y;
                var drawX = x;
                var tw = c.measureText(ln).width;
                if (align === 'center') drawX = x + (maxW - tw) / 2;
                else if (align === 'right') drawX = x + maxW - tw;
                c.fillText(ln, drawX, curY + lineH * 0.8);
                y += lineH;
            }
            for (var i = 0; i < words.length; i++) {
                var w = words[i];
                if (!w) continue;
                var test = line ? (line + ' ' + w) : w;
                if (c.measureText(test).width > maxW && line) {
                    flushLine(line);
                    line = w;
                } else {
                    line = test;
                }
            }
            if (line) flushLine(line);
            return y;
        }

        var nodes = Array.prototype.slice.call(holder.childNodes);
        var chain = Promise.resolve();

        function renderNode(node) {
            return Promise.resolve().then(function () {
                if (node.nodeType === 3) {
                    var t = node.nodeValue.trim();
                    if (!t) return;
                    ctx.fillStyle = '#1f1712';
                    ctx.font = '28px sans-serif';
                    drawWrappedText(ctx, t, M, y, W - M * 2, Math.round(28 * lhMult), 'left');
                    y += 10;
                    return;
                }
                if (node.nodeType !== 1) return;
                var tag = node.tagName.toUpperCase();
                if (tag === 'HR') {
                    ensureSpace(36);
                    y += 14;
                    ctx.strokeStyle = '#c29b70';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(M, y);
                    ctx.lineTo(W - M, y);
                    ctx.stroke();
                    y += 20;
                    return;
                }
                var imgEl = tag === 'IMG' ? node : (node.querySelector && node.querySelector('img'));
                if (imgEl && (tag === 'IMG' || node.classList.contains('np-img-wrap'))) {
                    return loadImg(imgEl.getAttribute('src') || '').then(function (im) {
                        if (!im) return;
                        var pct = parseFloat(node.getAttribute('data-scale') || imgEl.getAttribute('data-scale') || '60') || 60;
                        var rot = parseFloat(node.getAttribute('data-rot') || '0') || 0;
                        var fx = node.getAttribute('data-flipx') === '1' ? -1 : 1;
                        var fy = node.getAttribute('data-flipy') === '1' ? -1 : 1;
                        var align = node.getAttribute('data-align') || 'center';
                        var maxW = (W - M * 2) * Math.min(100, Math.max(15, pct)) / 100;
                        var ratio = im.height / (im.width || 1);
                        var drawW = maxW;
                        var drawH = Math.min(H - M * 2 - 40, drawW * ratio);
                        ensureSpace(drawH + 30);
                        var dx = M + (W - M * 2 - drawW) / 2;
                        if (align === 'left') dx = M;
                        else if (align === 'right') dx = W - M - drawW;
                        // Imagen libre: respeta su posición horizontal relativa al lienzo
                        if (node.getAttribute('data-free') === '1') {
                            var nx = parseFloat(node.getAttribute('data-x') || '0') || 0;
                            var refW = Math.max(320, window.innerWidth || 360);
                            var frac = Math.max(0, Math.min(1, nx / refW));
                            dx = M + frac * (W - M * 2 - drawW);
                        }
                        ctx.save();
                        ctx.translate(dx + drawW / 2, y + drawH / 2);
                        if (rot) ctx.rotate(rot * Math.PI / 180);
                        ctx.scale(fx, fy);
                        ctx.drawImage(im, -drawW / 2, -drawH / 2, drawW, drawH);
                        ctx.restore();
                        y += drawH + 24;
                    });
                }

                var align = (node.style && node.style.textAlign) || 'left';
                var lhN = parseFloat(node.style && node.style.lineHeight) || lhMult;
                if (!(lhN > 0.2)) lhN = lhMult;
                var sz = 28, bold = false, italic = false, code = false, quote = false;
                if (tag === 'H1') { sz = 46; bold = true; }
                else if (tag === 'H2') { sz = 40; bold = true; }
                else if (tag === 'H3') { sz = 35; bold = true; }
                else if (tag === 'H4') { sz = 31; bold = true; }
                else if (tag === 'H5') { sz = 28; bold = true; }
                else if (tag === 'H6') { sz = 25; bold = true; }
                else if (tag === 'BLOCKQUOTE') { quote = true; italic = true; }
                else if (tag === 'PRE' || tag === 'CODE') { code = true; sz = 25; }

                if (tag === 'UL' || tag === 'OL') {
                    var items = Array.prototype.slice.call(node.querySelectorAll('li'));
                    items.forEach(function (li, idx) {
                        var prefix = tag === 'OL' ? ((idx + 1) + '. ') : '• ';
                        ctx.fillStyle = '#1f1712';
                        ctx.font = '28px sans-serif';
                        drawWrappedText(ctx, prefix + (li.innerText || li.textContent || '').trim(),
                            M + 28, y, W - M * 2 - 28, Math.round(28 * lhN), align);
                        y += 6;
                    });
                    y += 10;
                    return;
                }

                var txt = (node.innerText || node.textContent || '').trim();
                if (!txt) { y += 14; return; }
                ctx.fillStyle = quote ? '#5c4033' : (code ? '#2b3a42' : '#1f1712');
                ctx.font = (italic ? 'italic ' : '') + (bold ? 'bold ' : '') +
                    sz + 'px ' + (code ? 'monospace' : 'sans-serif');
                var x0 = quote ? M + 32 : M;
                var startY = y;
                drawWrappedText(ctx, txt, x0, y, W - M * 2 - (quote ? 32 : 0),
                    Math.round(sz * lhN), align);
                if (quote) {
                    ctx.fillStyle = '#e2602e';
                    ctx.fillRect(M, startY, 6, Math.max(24, y - startY));
                }
                y += 12;
            });
        }

        nodes.forEach(function (nd) {
            chain = chain.then(function () { return renderNode(nd); });
        });

        return chain.then(function () {
            commitPage();
            return jpegsToPdfBlob(pages);
        });
    }

    function downloadOrShareBlob(blob, filename, mime, deps) {
        var f = new File([blob], filename, { type: mime });
        var saveP = (deps && deps.store && deps.store.add)
            ? deps.store.add(f).then(function (meta) {
                if (deps.reload) deps.reload();
                return meta;
            }).catch(function () { return null; })
            : Promise.resolve(null);

        return saveP.then(function (meta) {
            var IO = window.SonoStoreIO;
            var P = window.Capacitor && window.Capacitor.Plugins;
            if (IO && IO.isNative() && P && P.Share && IO.nativeWriteCache) {
                return IO.nativeWriteCache(filename, blob).then(function (p) {
                    return P.Filesystem.getUri({ path: p, directory: 'CACHE' });
                }).then(function (r) {
                    return P.Share.share({ files: [r.uri], title: filename });
                }).catch(function () {});
            }
            var u = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = u;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(u); }, 5000);
            return meta;
        });
    }

    function exportTxt(note, deps) {
        var txt = docToTxt(note);
        var fname = safeFileName(note.title, '.txt');
        var blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
        if (deps && deps.toast) deps.toast('Exportando «' + fname + '»…');
        return downloadOrShareBlob(blob, fname, 'text/plain', deps).then(function () {
            if (deps && deps.toast) deps.toast('«' + fname + '» guardado y exportado');
        });
    }

    function exportPdf(note, deps) {
        var fname = safeFileName(note.title, '.pdf');
        if (deps && deps.toast) deps.toast('Generando PDF «' + fname + '»…');
        return docToPdfBlob(note).then(function (blob) {
            return downloadOrShareBlob(blob, fname, 'application/pdf', deps);
        }).then(function () {
            if (deps && deps.toast) deps.toast('PDF «' + fname + '» guardado y exportado');
        });
    }

    function shareWhatsApp(note) {
        var txt = docToTxt(note);
        var url = 'https://wa.me/?text=' + encodeURIComponent(txt);
        var w = window.open(url, '_blank', 'noopener');
        if (!w) location.href = url;
    }

    function shareBluetooth(note, deps) {
        var txt = docToTxt(note);
        var fname = safeFileName(note.title, '.txt');
        var blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
        var IO = window.SonoStoreIO;
        var P = window.Capacitor && window.Capacitor.Plugins;
        var TN = P && P.TribalNative;
        if (IO && IO.isNative() && TN && TN.shareBluetooth && IO.nativeWriteCache) {
            if (deps && deps.toast) deps.toast('Enviando «' + fname + '» por Bluetooth…');
            return IO.nativeWriteCache(fname, blob).then(function (p) {
                return TN.shareBluetooth({ path: p, mime: 'text/plain', title: fname });
            }).catch(function () {
                return exportTxt(note, deps);
            });
        }
        return exportTxt(note, deps);
    }

    function getById(id) {
        return list().then(function (arr) {
            for (var i = 0; i < arr.length; i++) {
                if (arr[i].id === id) return arr[i];
            }
            return null;
        });
    }

    function syncToMediaStore(note, deps) {
        var MS = (deps && deps.store) || window.MediaStore;
        if (!MS || !MS.list) return Promise.resolve(note);
        var txt = docToTxt(note);
        var fname = safeFileName(note.title || 'Nota', '.txt');
        var f = new File([new Blob([txt], { type: 'text/plain;charset=utf-8' })],
            fname, { type: 'text/plain' });
        return MS.list().then(function (items) {
            var ex = (items || []).filter(function (m) {
                return m.info && m.info.noteId === note.id;
            })[0];
            if (ex && MS.replaceData) {
                return MS.replaceData(ex.id, f).then(function () {
                    return MS.updateInfo(ex.id, {
                        noteId: note.id, isNote: 1,
                        titulo: note.title || 'Sin título',
                        createdAt: note.createdAt, updatedAt: note.updatedAt
                    });
                });
            }
            return MS.add(f, fname).then(function (m) {
                return MS.updateInfo(m.id, {
                    noteId: note.id, isNote: 1,
                    titulo: note.title || 'Sin título',
                    createdAt: note.createdAt, updatedAt: note.updatedAt
                });
            });
        }).then(function () {
            if (deps && deps.reload) deps.reload();
            return note;
        }).catch(function () { return note; });
    }

    function removeFromMediaStore(noteId, deps) {
        var MS = (deps && deps.store) || window.MediaStore;
        if (!MS || !MS.list) return Promise.resolve();
        return MS.list().then(function (items) {
            var matches = (items || []).filter(function (m) {
                return m.info && m.info.noteId === noteId;
            });
            return Promise.all(matches.map(function (m) {
                return MS.remove(m.id);
            }));
        }).then(function () {
            if (deps && deps.reload) deps.reload();
        }).catch(function () {});
    }

    return {
        list: list,
        getById: getById,
        save: save,
        remove: remove,
        syncToMediaStore: syncToMediaStore,
        removeFromMediaStore: removeFromMediaStore,
        fmtDateTime: fmtDateTime,
        docToTxt: docToTxt,
        docToPdfBlob: docToPdfBlob,
        exportTxt: exportTxt,
        exportPdf: exportPdf,
        shareWhatsApp: shareWhatsApp,
        shareBluetooth: shareBluetooth
    };
})();
