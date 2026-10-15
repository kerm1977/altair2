// ============================================================================
// ARCHIVO: media/imgedit.js
// RESPONSABILIDAD: editor de imágenes de TRIBALs — núcleo.
//   - Pipeline canvas: recorte → rotación libre → flips → zoom → filtros
//     (brillo/contraste/saturación/RGB/nitidez/blur) → blur-viñeta → viñeta
//     movible → capas de texto/emoji/imagen (rotables y volteables)
//   - Capas: un solo array E.st.ovs (texto/emoji/imagen) con orden z,
//     rotación, volteos y nombre — panel Capas en imgeditui.js
//   - Deshacer/Rehacer (E.hist) + borrador persistente anti-cierre
//     (localStorage, media/imgeditmem.js) → se restaura al reabrir
//   - Guardar PNG/JPG en la tribu + compartir (hoja nativa)
//   API: TribalImgEdit.open(meta, deps)
//   deps = { mount, urlFor, store, toast, items, onSaved }
// ============================================================================
window.TribalImgEdit = (function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    var FONTS = ['Georgia', 'Arial', 'Courier New', 'Comic Sans MS', 'Impact',
                 'Palatino Linotype', 'Trebuchet MS', 'Verdana', 'cursive',
                 'monospace'];
    var MAX_LAYERS = 10;

    function open(meta, deps) {
        deps.urlFor(meta, function (u) {
            if (!u) return deps.toast('No se pudo abrir la imagen');
            var img = new Image();
            img.onload = function () { build(meta, deps, img); };
            img.src = u;
        });
    }

    function freshState() {
        return {
            br: 100, co: 100, sa: 100, r: 100, g: 100, b: 100,
            sharp: 0, blur: 0, edgeBlur: 0,
            vig: 0, vx: 0.5, vy: 0.5,
            flipH: 0, flipV: 0, rot: 0, zoom: 100,
            crop: null,                   // {x,y,w,h} en px de la imagen
            ovs: [],                      // capas: {ty,str,img,iid,x,y,s,f,c,rot,fh,fv,name}
            sel: null                     // capa seleccionada
        };
    }

    function build(meta, deps, img) {
        var E = {};                       // instancia del editor
        E.img = img;
        E.imgSrc = 'orig';                // 'orig' | dataURL (tras hornear crop)
        E.meta = meta; E.deps = deps;
        E.st = freshState();
        E.hist = { u: [], r: [] };
        var ov = document.createElement('div');
        ov.className = 'tribal-overlay tribal-ie-ov';
        ov.innerHTML =
            '<div class="tribal-ie">' +
                '<div class="tribal-ie-bar">' +
                    '<button class="tribal-ctrl" id="ie-close"><i class="bi bi-x-lg"></i></button>' +
                    '<span class="tribal-reader-title">' + esc(meta.name) + '</span>' +
                    '<button class="tribal-ctrl" id="ie-undo" title="Deshacer">' +
                        '<i class="bi bi-arrow-counterclockwise"></i></button>' +
                    '<button class="tribal-ctrl" id="ie-redo" title="Rehacer">' +
                        '<i class="bi bi-arrow-clockwise"></i></button>' +
                    '<button class="tribal-ctrl" id="ie-reset" title="Restablecer todo">' +
                        '<i class="bi bi-stars"></i></button>' +
                    '<button class="tribal-ctrl" id="ie-save" title="Guardar">' +
                        '<i class="bi bi-check-lg"></i></button>' +
                '</div>' +
                '<div class="tribal-ie-stage" id="ie-stage">' +
                    '<canvas id="ie-canvas"></canvas>' +
                    '<div class="ie-crop" id="ie-crop" hidden>' +
                        '<i class="ie-ch" data-ch="nw"></i><i class="ie-ch" data-ch="n"></i>' +
                        '<i class="ie-ch" data-ch="ne"></i><i class="ie-ch" data-ch="w"></i>' +
                        '<i class="ie-ch" data-ch="e"></i><i class="ie-ch" data-ch="sw"></i>' +
                        '<i class="ie-ch" data-ch="s"></i><i class="ie-ch" data-ch="se"></i>' +
                    '</div></div>' +
                '<div class="tribal-ie-tools" id="ie-tools"></div>' +
            '</div>' +
            // filtros SVG ocultos: RGB + nitidez en una sola pasada
            '<svg width="0" height="0" style="position:absolute"><defs>' +
                '<filter id="ie-svgfx" color-interpolation-filters="sRGB">' +
                    '<feColorMatrix id="ie-rgb" type="matrix" ' +
                        'values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/>' +
                    '<feConvolveMatrix id="ie-sharp" order="3" preserveAlpha="true" ' +
                        'kernelMatrix="0 0 0 0 1 0 0 0 0"/>' +
                '</filter></defs></svg>';
        (deps.mount || document.body).appendChild(ov);
        E.ov = ov;
        E.cv = ov.querySelector('#ie-canvas');
        E.cx = E.cv.getContext('2d');
        E.tmp = document.createElement('canvas');
        E.tx = E.tmp.getContext('2d');

        // ---------- render pipeline ----------
        function svgFx() {
            var s = E.st;
            var need = (s.r !== 100 || s.g !== 100 || s.b !== 100 || s.sharp > 0);
            ov.querySelector('#ie-rgb').setAttribute('values',
                (s.r / 100) + ' 0 0 0 0 0 ' + (s.g / 100) + ' 0 0 0 0 0 ' +
                (s.b / 100) + ' 0 0 0 0 0 1 0');
            var k = s.sharp / 100;
            ov.querySelector('#ie-sharp').setAttribute('kernelMatrix',
                '0 ' + (-k) + ' 0 ' + (-k) + ' ' + (1 + 4 * k) + ' ' + (-k) + ' 0 ' + (-k) + ' 0');
            return need ? ' url(#ie-svgfx)' : '';
        }
        function filters() {
            var s = E.st, f = '';
            if (s.br !== 100) f += 'brightness(' + s.br + '%) ';
            if (s.co !== 100) f += 'contrast(' + s.co + '%) ';
            if (s.sa !== 100) f += 'saturate(' + s.sa + '%) ';
            if (s.blur > 0) f += 'blur(' + (s.blur / 4) + 'px) ';   // blur total agresivo
            return f + svgFx();
        }
        function drawBase(cx2) {
            var s = E.st;
            var iw = s.crop ? s.crop.w : img.naturalWidth;
            var ih = s.crop ? s.crop.h : img.naturalHeight;
            var rad = s.rot * Math.PI / 180;
            var bw = Math.abs(iw * Math.cos(rad)) + Math.abs(ih * Math.sin(rad));
            var bh = Math.abs(iw * Math.sin(rad)) + Math.abs(ih * Math.cos(rad));
            var sc = Math.min(1, 1600 / Math.max(bw, bh)) * (s.zoom / 100);
            cx2.canvas.width = Math.max(1, bw * sc);
            cx2.canvas.height = Math.max(1, bh * sc);
            cx2.save();
            cx2.translate(cx2.canvas.width / 2, cx2.canvas.height / 2);
            cx2.rotate(rad);
            cx2.scale(s.flipH ? -1 : 1, s.flipV ? -1 : 1);
            cx2.filter = filters();
            var sx = s.crop ? s.crop.x : 0, sy = s.crop ? s.crop.y : 0;
            cx2.drawImage(img, sx, sy, iw, ih,
                -iw * sc / 2, -ih * sc / 2, iw * sc, ih * sc);
            cx2.restore();
            cx2.filter = 'none';
            return sc;
        }
        function drawVignette() {
            var s = E.st, W = E.cv.width, H = E.cv.height;
            if (s.edgeBlur > 0) {
                E.tmp.width = W; E.tmp.height = H;
                E.tx.filter = 'blur(' + (s.edgeBlur / 3) + 'px)';   // más agresivo
                E.tx.drawImage(E.cv, 0, 0);
                E.tx.globalCompositeOperation = 'destination-in';
                var g0 = E.tx.createRadialGradient(s.vx * W, s.vy * H, Math.min(W, H) * .08,
                                                 s.vx * W, s.vy * H, Math.max(W, H) * .7);
                g0.addColorStop(0, 'rgba(0,0,0,0)');
                g0.addColorStop(1, 'rgba(0,0,0,1)');
                E.tx.fillStyle = g0;
                E.tx.fillRect(0, 0, W, H);
                E.tx.globalCompositeOperation = 'source-over';
                E.cx.drawImage(E.tmp, 0, 0);
            }
            if (s.vig !== 0) {
                var g1 = E.cx.createRadialGradient(s.vx * W, s.vy * H, Math.min(W, H) * .15,
                                                 s.vx * W, s.vy * H, Math.max(W, H) * .8);
                var col = s.vig > 0 ? '0,0,0' : '255,255,255';
                g1.addColorStop(0, 'rgba(' + col + ',0)');
                g1.addColorStop(1, 'rgba(' + col + ',' + (Math.abs(s.vig) / 100 * .85) + ')');
                E.cx.fillStyle = g1;
                E.cx.fillRect(0, 0, W, H);
            }
        }
        // cada capa se dibuja con su rotación y volteos propios
        function drawLayer(o) {
            var W = E.cv.width, H = E.cv.height;
            E.cx.save();
            E.cx.translate(o.x * W, o.y * H);
            E.cx.rotate((o.rot || 0) * Math.PI / 180);
            E.cx.scale(o.fh ? -1 : 1, o.fv ? -1 : 1);
            if (o.ty === 't') {
                E.cx.font = '700 ' + (o.s / 100 * H) + 'px ' + (o.f || 'Georgia');
                E.cx.textAlign = 'center';
                E.cx.textBaseline = 'middle';
                E.cx.lineWidth = Math.max(2, o.s / 100 * H / 12);
                E.cx.strokeStyle = 'rgba(0,0,0,.85)';
                E.cx.strokeText(o.str, 0, 0);
                E.cx.fillStyle = o.c || '#f0b429';
                E.cx.fillText(o.str, 0, 0);
            } else {
                var w = o.s / 100 * W;
                if (o.img) {
                    E.cx.drawImage(o.img, -w / 2, -w / 2, w, w);
                } else {
                    E.cx.font = w + 'px serif';
                    E.cx.textAlign = 'center';
                    E.cx.textBaseline = 'middle';
                    E.cx.fillText(o.str, 0, 0);
                }
            }
            E.cx.restore();
        }
        function drawOverlays() {
            E.st.ovs.forEach(drawLayer);
        }
        E.render = function () {
            drawBase(E.cx);
            drawVignette();
            drawOverlays();
            if (E.sel) outlineSel();
        };
        function outlineSel() {
            var o = E.sel, b = E.selBox(o);
            E.cx.strokeStyle = '#f0b429';
            E.cx.setLineDash([6, 4]);
            E.cx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
            E.cx.setLineDash([]);
        }
        function measureSel(o) {
            if (!o.str) return 0;
            E.cx.font = (o.s / 100 * E.cv.height) + 'px serif';
            if (o.ty === 't') E.cx.font = '700 ' + (o.s / 100 * E.cv.height) + 'px ' + (o.f || 'Georgia');
            return E.cx.measureText(o.str).width;
        }
        E.selBox = function (o) {  // caja en px del canvas (para hit-test)
            var W = E.cv.width, H = E.cv.height;
            var w = (o.ty === 't' && o.str) ? measureSel(o) : o.s / 100 * W;
            var h = w;
            if (o.ty === 't' && o.str) h = o.s / 100 * H * 1.3;
            return { x: o.x * W - w / 2, y: o.y * H - h / 2, w: w, h: h };
        };
        // commit = registrar un paso (undo) + autoguardar el borrador
        E.commit = function () {
            if (window.TribalImgEditMem) {
                window.TribalImgEditMem.push(E);
                window.TribalImgEditMem.save(E);
            }
        };

        // ---------- guardar / compartir ----------
        function toBlob(fmt, cb) {
            E.sel = null; E.render();
            var mime = fmt === 'jpg' ? 'image/jpeg' : 'image/png';
            E.cv.toBlob(function (b) { cb(b); }, mime, 0.92);
        }
        // id del archivo editado: si este meta ya era una edición (info.editOf)
        // se sobrescribe a sí mismo; si es original, el primero que se cree
        // en esta sesión se reutiliza en guardados siguientes → cero duplicados
        var savedId = (meta.info && meta.info.editOf) ? meta.id : null;
        function saveAs(fmt, thenShare) {
            toBlob(fmt, function (blob) {
                if (!blob) return deps.toast('No se pudo exportar');
                var base = meta.name.replace(/\.[^.]+$/, '').replace(/-edit$/, '');
                var file = new File([blob], base + '-edit.' + fmt,
                    { type: blob.type });
                var done;
                if (savedId) {
                    done = deps.store.replaceData(savedId, file);
                } else {
                    done = deps.store.add(file).then(function (m2) {
                        if (m2) {
                            savedId = m2.id;
                            m2.info = m2.info || {};
                            var src = (meta.info && meta.info.editOf) || meta.id;
                            m2.info.editOf = src;
                            return deps.store.updateInfo(m2.id, { editOf: src })
                                .then(function () { return m2; });
                        }
                        return m2;
                    });
                }
                done.then(function (m2) {
                    if (window.TribalImgEditMem) window.TribalImgEditMem.clear(meta.id);
                    if (deps.invalidate && savedId) deps.invalidate(savedId);
                    deps.toast('Imagen guardada en la tribu');
                    if (deps.onSaved) deps.onSaved();
                    ov.remove();   // volver a la pizarra de una vez
                    if (thenShare && m2)
                        deps.store.share(m2).catch(function () {});
                }).catch(function () { deps.toast('No se pudo guardar'); });
            });
        }

        ov.querySelector('#ie-close').addEventListener('click', function () { ov.remove(); });
        ov.querySelector('#ie-reset').addEventListener('click', function () {
            var keep = E.st;
            E.st = freshState();
            Object.keys(E.st).forEach(function (k) { keep[k] = E.st[k]; });
            E.st = keep;
            E.imgSrc = 'orig'; E.img = img; E.sel = null;
            E.cropBox = null; E.cropRatio = null;
            if (window.TribalImgEditTouch) window.TribalImgEditTouch.placeCropDiv(E);
            if (window.TribalImgEditUI) window.TribalImgEditUI.sync(E);
            E.commit();
            E.render();
        });
        ov.querySelector('#ie-undo').addEventListener('click', function () {
            if (window.TribalImgEditMem) window.TribalImgEditMem.undo(E);
        });
        ov.querySelector('#ie-redo').addEventListener('click', function () {
            if (window.TribalImgEditMem) window.TribalImgEditMem.redo(E);
        });
        ov.querySelector('#ie-save').addEventListener('click', function () {
            saveAs('png', false);
        });

        E.saveAs = saveAs;
        E.fonts = FONTS;
        E.maxLayers = MAX_LAYERS;
        window.TribalImgEditUI.build(E, deps);
        window.TribalImgEditTouch.bind(E);
        E.render();
        // borrador de una sesión anterior (cierre/accidente) → restaurar
        if (window.TribalImgEditMem) {
            window.TribalImgEditMem.restore(E, function (had) {
                if (had) {
                    deps.toast('Edición restaurada — seguiste donde quedó');
                    window.TribalImgEditUI.sync(E);
                    E.render();
                }
                E.commit();           // estado base del historial
            });
        } else E.commit();
    }

    return { open: open, fonts: FONTS };
})();
