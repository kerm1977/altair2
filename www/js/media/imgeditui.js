// ============================================================================
// ARCHIVO: media/imgeditui.js
// RESPONSABILIDAD: paneles de herramientas del editor de imágenes de TRIBALs.
//   - Tabs de herramientas: Imagen / Transformar / Recorte / Blur+Viñeta /
//     Texto / Sticker / Guardar
//   - Textos: varios, con tipografía, tamaño, color, arrastrables
//   - Stickers: emoji o imagen de la tribu, arrastrables
//   - Exportar PNG / JPG / Compartir
//   API: TribalImgEditUI.build(E, deps) · .sync(E)
// ============================================================================
window.TribalImgEditUI = (function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    var TABS = [
        { id: 'img',  ico: 'bi-sliders',      t: 'Imagen' },
        { id: 'trf',  ico: 'bi-arrows-move',  t: 'Transformar' },
        { id: 'crop', ico: 'bi-crop',         t: 'Recorte' },
        { id: 'vig',  ico: 'bi-circle-half',  t: 'Blur / Viñeta' },
        { id: 'txt',  ico: 'bi-type',         t: 'Texto' },
        { id: 'stk',  ico: 'bi-emoji-smile',  t: 'Sticker' },
        { id: 'out',  ico: 'bi-save',         t: 'Guardar' }
    ];

    var CROP_RATIOS = [
        { l: 'Libre', v: 0 },   { l: '1:1',  v: 1 },
        { l: '4:3',  v: 4 / 3 }, { l: '3:4',  v: 3 / 4 },
        { l: '3:2',  v: 3 / 2 }, { l: '2:3',  v: 2 / 3 },
        { l: '16:9', v: 16 / 9 }, { l: '9:16', v: 9 / 16 },
        { l: '5:4',  v: 5 / 4 }, { l: '4:5',  v: 4 / 5 },
        { l: '21:9', v: 21 / 9 }
    ];

    var IMG_SLIDERS = [
        { k: 'br', l: 'Brillo', min: 30, max: 200 },
        { k: 'co', l: 'Contraste', min: 30, max: 200 },
        { k: 'sa', l: 'Saturación', min: 0, max: 300 },
        { k: 'r', l: 'Rojo', min: 0, max: 200 },
        { k: 'g', l: 'Verde', min: 0, max: 200 },
        { k: 'b', l: 'Azul', min: 0, max: 200 },
        { k: 'sharp', l: 'Nitidez', min: 0, max: 100 },
        { k: 'blur', l: 'Blur', min: 0, max: 100 }
    ];

    function sliderRow(s, cur) {
        return '<label class="vfx-row"><span>' + s.l + '</span>' +
            '<input type="range" data-ie="' + s.k + '" min="' + s.min +
            '" max="' + s.max + '" value="' + cur + '"><b>' + cur + '</b></label>';
    }

    function build(E, deps) {
        var tools = E.ov.querySelector('#ie-tools');
        tools.innerHTML =
            '<div class="ie-tabs">' + TABS.map(function (t, i) {
                return '<button class="ie-tab' + (i === 0 ? ' on' : '') +
                    '" data-iet="' + t.id + '"><i class="bi ' + t.ico +
                    '"></i><span>' + t.t + '</span></button>';
            }).join('') + '</div>' +
            '<div class="ie-panel" id="ie-panel"></div>';
        var panel = tools.querySelector('#ie-panel');

        function show(tab) {
            E.cropMode = (tab === 'crop');
            tools.querySelectorAll('.ie-tab').forEach(function (b) {
                b.classList.toggle('on', b.dataset.iet === tab);
            });
            if (tab === 'img') {
                panel.innerHTML = IMG_SLIDERS.map(function (s) {
                    return sliderRow(s, E.st[s.k]);
                }).join('');
            } else if (tab === 'trf') {
                panel.innerHTML =
                    '<div class="ie-row">' +
                        '<button class="tribal-btn tribal-btn-xs" data-act="flipH">' +
                            '<i class="bi bi-symmetry-vertical"></i> Voltear H</button>' +
                        '<button class="tribal-btn tribal-btn-xs" data-act="flipV">' +
                            '<i class="bi bi-symmetry-horizontal"></i> Voltear V</button>' +
                        '<button class="tribal-btn tribal-btn-xs" data-act="rotl">' +
                            '<i class="bi bi-arrow-counterclockwise"></i> 90°</button>' +
                        '<button class="tribal-btn tribal-btn-xs" data-act="rotr">' +
                            '<i class="bi bi-arrow-clockwise"></i> 90°</button></div>' +
                    sliderRow({ k: 'rot', l: 'Inclinar °', min: -180, max: 180 }, E.st.rot) +
                    sliderRow({ k: 'zoom', l: 'Zoom %', min: 50, max: 300 }, E.st.zoom);
            } else if (tab === 'crop') {
                panel.innerHTML =
                    '<p class="ie-hint">Elige un aspecto o arrastra las ' +
                        'esquinas del recuadro a tu gusto.</p>' +
                    '<div class="ie-row ie-ratios">' +
                        CROP_RATIOS.map(function (r) {
                            var on = (E.cropRatio || 0) === r.v ? ' on' : '';
                            return '<button class="ie-ratio' + on +
                                '" data-act="cropRatio" data-r="' + r.v +
                                '">' + r.l + '</button>';
                        }).join('') + '</div>' +
                    '<div class="ie-row">' +
                        '<button class="tribal-btn tribal-btn-xs" data-act="cropApply">' +
                            '<i class="bi bi-check2"></i> Aplicar recorte</button>' +
                        '<button class="tribal-btn tribal-btn-xs" data-act="cropClear">' +
                            '<i class="bi bi-x2"></i> Quitar recorte</button></div>';
            } else if (tab === 'vig') {
                panel.innerHTML =
                    '<p class="ie-hint">Toca la imagen para mover el centro ' +
                        'de la viñeta / blur de bordes.</p>' +
                    sliderRow({ k: 'edgeBlur', l: 'Blur bordes', min: 0, max: 100 }, E.st.edgeBlur) +
                    sliderRow({ k: 'vig', l: 'Viñeta (−claro +oscuro)', min: -100, max: 100 }, E.st.vig);
            } else if (tab === 'txt') {
                panel.innerHTML =
                    '<div class="ie-row">' +
                        '<input id="ie-txt-in" type="text" placeholder="Texto sobre la imagen…">' +
                        '<input id="ie-txt-c" type="color" value="#f0b429" title="Color"></div>' +
                    '<div class="ie-row"><select id="ie-txt-f">' +
                        E.fonts.map(function (f) {
                            return '<option style="font-family:' + f + '">' + f + '</option>';
                        }).join('') + '</select>' +
                        '<button class="tribal-btn tribal-btn-xs" data-act="addText">' +
                            '<i class="bi bi-plus-lg"></i> Agregar texto</button></div>' +
                    selPanel();
            } else if (tab === 'stk') {
                var emojis = ['🔥','💀','🌞','🦅','🐍','🌵','🏹','🪶','💛','✨','🌙','⭐'];
                panel.innerHTML =
                    '<div class="ie-emojis">' + emojis.map(function (e) {
                        return '<button class="ie-emoji" data-em="' + e + '">' + e + '</button>';
                    }).join('') + '</div>' +
                    '<p class="ie-hint">o una foto de la tribu:</p>' +
                    '<div class="ie-stklist" id="ie-stklist">' +
                        (deps.items || []).filter(function (m) {
                            return m.kind === 'image';
                        }).slice(0, 20).map(function (m) {
                            return '<button class="tribal-btn tribal-btn-xs" data-stk="' + m.id +
                                '"><i class="bi bi-image"></i> ' + esc(m.name) + '</button>';
                        }).join('') + '</div>' +
                    selPanel();
            } else if (tab === 'out') {
                panel.innerHTML =
                    '<div class="ie-row">' +
                        '<button class="tribal-btn" data-save="png">' +
                            '<i class="bi bi-filetype-png"></i> PNG</button>' +
                        '<button class="tribal-btn" data-save="jpg">' +
                            '<i class="bi bi-filetype-jpg"></i> JPG</button></div>' +
                    '<div class="ie-row">' +
                        '<button class="tribal-btn" data-sharesave="png">' +
                            '<i class="bi bi-share"></i> PNG y compartir</button>' +
                        '<button class="tribal-btn" data-sharesave="jpg">' +
                            '<i class="bi bi-share"></i> JPG y compartir</button></div>' +
                    '<p class="ie-hint">Se guarda en la tribu y puedes enviarla ' +
                        'por WhatsApp, correo u otras apps.</p>';
            }
            panel.dataset.tab = tab;
        }
        function selPanel() {
            return '<div class="ie-row ie-sel" id="ie-selrow" hidden>' +
                '<span class="ie-hint">Seleccionado:</span>' +
                '<input type="range" id="ie-sel-size" min="4" max="60" value="12">' +
                '<button class="tribal-btn tribal-btn-xs" data-act="delSel">' +
                    '<i class="bi bi-trash3"></i> Quitar</button></div>';
        }

        // ---------------- eventos ----------------
        tools.addEventListener('click', function (e) {
            var t = e.target.closest('[data-iet]');
            if (t) { E.sel = null; show(t.dataset.iet); E.render(); return; }
            var act = e.target.closest('[data-act]');
            if (act) {
                var a = act.dataset.act, s = E.st;
                if (a === 'flipH') s.flipH = !s.flipH;
                else if (a === 'flipV') s.flipV = !s.flipV;
                else if (a === 'rotl') s.rot = (s.rot + 270) % 360;
                else if (a === 'rotr') s.rot = (s.rot + 90) % 360;
                else if (a === 'cropApply') { if (window.TribalImgEditTouch.applyCrop) {
                        window.TribalImgEditTouch.applyCrop(E); } return; }
                else if (a === 'cropClear') {
                    s.crop = null; E.cropBox = null; E.cropRatio = null;
                    window.TribalImgEditTouch.placeCropDiv(E);
                    E.render(); return; }
                else if (a === 'cropRatio') {
                    var pv = parseFloat(act.dataset.r) || 0;
                    if (window.TribalImgEditTouch.setRatio) {
                        window.TribalImgEditTouch.setRatio(E, pv); }
                    panel.querySelectorAll('.ie-ratio').forEach(function (rb) {
                        rb.classList.toggle('on', rb === act); });
                    return; }
                else if (a === 'addText') {
                    var str = panel.querySelector('#ie-txt-in').value.trim();
                    if (!str) return;
                    s.texts.push({ str: str, x: .5, y: .5, s: 8,
                        f: panel.querySelector('#ie-txt-f').value,
                        c: panel.querySelector('#ie-txt-c').value });
                    panel.querySelector('#ie-txt-in').value = '';
                } else if (a === 'delSel') {
                    if (E.sel) {
                        var i1 = s.texts.indexOf(E.sel);
                        var i2 = s.sticks.indexOf(E.sel);
                        if (i1 >= 0) s.texts.splice(i1, 1);
                        if (i2 >= 0) s.sticks.splice(i2, 1);
                        E.sel = null;
                        var sr = panel.querySelector('#ie-selrow');
                        if (sr) sr.hidden = true;
                    }
                }
                E.render();
                return;
            }
            var em = e.target.closest('[data-em]');
            if (em) {
                E.st.sticks.push({ str: em.dataset.em, x: .5, y: .5, s: 18 });
                E.render();
                return;
            }
            var stk = e.target.closest('[data-stk]');
            if (stk) {
                var m = (deps.items || []).filter(function (x) {
                    return x.id === stk.dataset.stk;
                })[0];
                if (!m) return;
                deps.urlFor(m, function (u) {
                    if (!u) return;
                    var im = new Image();
                    im.onload = function () {
                        E.st.sticks.push({ img: im, x: .5, y: .5, s: 20 });
                        E.render();
                    };
                    im.src = u;
                });
                return;
            }
            var sv = e.target.closest('[data-save]');
            if (sv) return E.saveAs(sv.dataset.save, false);
            var sh = e.target.closest('[data-sharesave]');
            if (sh) return E.saveAs(sh.dataset.sharesave, true);
        });
        tools.addEventListener('input', function (e) {
            var rng = e.target.closest('[data-ie]');
            if (rng) {
                E.st[rng.dataset.ie] = +rng.value;
                rng.parentElement.querySelector('b').textContent = rng.value;
                E.render();
                return;
            }
            if (e.target.id === 'ie-sel-size' && E.sel) {
                E.sel.s = +e.target.value;
                E.render();
            }
            if (e.target.id === 'ie-txt-c' && E.sel && E.sel.str !== undefined) {
                E.sel.c = e.target.value;
                E.render();
            }
            if (e.target.id === 'ie-txt-f' && E.sel && E.sel.str !== undefined) {
                E.sel.f = e.target.value;
                E.render();
            }
        });
        show('img');
    }

    function sync(E) {
        var tab = E.ov.querySelector('#ie-panel');
        if (tab) {
            var on = E.ov.querySelector('.ie-tab.on');
            if (on) on.click();
        }
    }

    return { build: build, sync: sync };
})();
