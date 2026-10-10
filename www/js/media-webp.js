// ============================================================================
// ARCHIVO: media-webp.js
// RESPONSABILIDAD: exportación del slideshow a WebP animado.
//   canvas.toBlob('image/webp') solo da frames estáticos; aquí los envolvemos
//   en un contenedor WebP animado (RIFF/VP8X/ANIM/ANMF) sin dependencias.
//   Extiende window.TribalSlide (estado en _x).
// ============================================================================
(function () {
    'use strict';
    var TS = window.TribalSlide;
    if (!TS) return;
    var _x = TS._x;

    var WQUAL = { alta: 0.92, media: 0.8, baja: 0.6 };

    function webpChunk(tag, data) {
        var pad = data.length % 2 ? 1 : 0;
        var out = new Uint8Array(8 + data.length + pad);
        for (var i = 0; i < 4; i++) out[i] = tag.charCodeAt(i);
        new DataView(out.buffer).setUint32(4, data.length, true);
        out.set(data, 8);
        return out;
    }

    // extrae los chunks de imagen (VP8/VP8L/ALPH) de un webp estático
    function webpFrameData(buf) {
        var b = new Uint8Array(buf);
        if (b.length < 12 || b[8] !== 87) return null; // 'W' de WEBP
        var dv = new DataView(buf);
        var parts = [], pos = 12;
        while (pos + 8 <= b.length) {
            var tag = String.fromCharCode(b[pos], b[pos + 1], b[pos + 2], b[pos + 3]);
            var sz = dv.getUint32(pos + 4, true);
            var end = pos + 8 + sz + (sz % 2);
            if (tag === 'VP8 ' || tag === 'VP8L' || tag === 'ALPH') {
                parts.push(b.slice(pos, end));
            }
            pos = end;
        }
        if (!parts.length) return null;
        var total = parts.reduce(function (a, p) { return a + p.length; }, 0);
        var out = new Uint8Array(total), off = 0;
        parts.forEach(function (p) { out.set(p, off); off += p.length; });
        return out;
    }

    function webpMux(frameBufs, W, H, durMs) {
        var u24 = function (v) { return new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255]); };
        var cat = function (arr) {
            var t = 0; arr.forEach(function (a) { t += a.length; });
            var o = new Uint8Array(t), p = 0;
            arr.forEach(function (a) { o.set(a, p); p += a.length; });
            return o;
        };

        // VP8X: flag animación (0x02) + lienzo (w-1, h-1 en 24 bits LE)
        var vp8x = new Uint8Array(10);
        vp8x[0] = 0x02;
        vp8x.set(u24(W - 1), 4); vp8x.set(u24(H - 1), 7);

        // ANIM: fondo negro opaco (ARGB LE) + loop infinito (0)
        var anim = new Uint8Array([0, 0, 0, 255, 0, 0]);

        var chunks = [webpChunk('VP8X', vp8x), webpChunk('ANIM', anim)];
        frameBufs.forEach(function (fd) {
            var h = new Uint8Array(16);
            h.set(u24(0), 0); h.set(u24(0), 3);            // x, y
            h.set(u24(W - 1), 6); h.set(u24(H - 1), 9);   // w-1, h-1
            h.set(u24(Math.min(16777215, Math.round(durMs))), 12); // duración ms
            h[15] = 0;                                     // sin blend ni dispose
            chunks.push(webpChunk('ANMF', cat([h, fd])));
        });

        var body = cat(chunks);
        var riff = new Uint8Array(12 + body.length);
        riff.set([82, 73, 70, 70], 0);                            // RIFF
        new DataView(riff.buffer).setUint32(4, 4 + body.length, true);
        riff.set([87, 69, 66, 80], 8);                            // WEBP
        riff.set(body, 12);
        return new Blob([riff], { type: 'image/webp' });
    }

    function exportWebP() {
        var deps = _x.deps;
        // sondeo rápido de soporte del encoder webp del canvas
        var probe = document.createElement('canvas');
        probe.width = 2; probe.height = 2;
        var canWebP = probe.toDataURL('image/webp').indexOf('data:image/webp') === 0;
        if (!canWebP) {
            return deps.toast('Este dispositivo no codifica WebP — usa GIF o video');
        }
        if (_x.exporting) return;
        _x.exporting = true;
        var ui = _x.exportShell();

        _x.loadAll(function (imgs) {
            if (ui.cancelled.v) { _x.exporting = false; return _x.close(); }

            var dims = _x.GDIMS[_x.autoOrient(imgs)] || _x.GDIMS.h;
            var W = dims[0], H = dims[1];
            var canvas = document.createElement('canvas');
            canvas.width = W; canvas.height = H;
            var ctx = canvas.getContext('2d');

            var total = _x.photos.length * _x.secs;
            var step = 0.125; // 8 fps — suficiente para imagen animada
            var frames = Math.max(2, Math.round(total / step));
            var bufs = [], i = 0;

            function gen() {
                if (ui.cancelled.v) { _x.exporting = false; return _x.close(); }
                if (i >= frames) {
                    if (!bufs.length) {
                        _x.exporting = false; _x.close();
                        return deps.toast('No se pudieron codificar los frames WebP');
                    }
                    ui.pct.textContent = 'Armando WebP…';
                    ui.bar.style.width = '95%';
                    var blob = webpMux(bufs, W, H, step * 1000);
                    var f = new File([blob],
                        'WebP ' + _x.quality.toUpperCase() + ' · ' + _x.photos.length + ' fotos.webp',
                        { type: 'image/webp' });
                    return deps.store.add(f).then(function (item) {
                        deps.store.updateInfo(item.id, {
                            notes: 'WebP animado · calidad ' + _x.quality + ' · ' + _x.photos.length + ' fotos'
                        });
                        _x.exporting = false;
                        ui.bar.style.width = '100%';
                        _x.close();
                        deps.toast('WebP animado guardado en Fotos');
                    });
                }
                _x.drawFrame(ctx, imgs, i * step, W, H);
                canvas.toBlob(function (b) {
                    if (!b) { _x.exporting = false; _x.close(); return deps.toast('Falló el frame WebP'); }
                    b.arrayBuffer().then(function (ab) {
                        var fd = webpFrameData(ab);
                        if (fd) bufs.push(fd);
                        i++;
                        ui.bar.style.width = (i / frames * 90) + '%';
                        ui.pct.textContent = 'Frames WebP ' + i + ' de ' + frames + '…';
                        gen();
                    });
                }, 'image/webp', WQUAL[_x.quality] || 0.8);
            }
            gen();
        });
    }

    _x.exportWebP = exportWebP;
})();
