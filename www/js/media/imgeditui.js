// ============================================================================
// ARCHIVO: media/imgeditui.js
// RESPONSABILIDAD: paneles de herramientas del editor de imágenes de TRIBALs.
//   - Tabs: Imagen / Transformar / Recorte / Blur+Viñeta / Texto / Sticker /
//     Capas / Guardar
//   - Capas (máx. 10): textos, emojis y fotos-sticker en un solo orden z —
//     seleccionar, renombrar, subir/bajar, eliminar (doble confirmación)
//   - Texto: preview EN VIVO mientras se escribe; doble clic en la capa
//     recarga el texto/color/fuente para editarlo
//   - Capa seleccionada: tamaño, rotación libre, voltear H/V, quitar (2 pasos)
//   - «Restablecer» por panel + Deshacer/Rehacer + autoguardado (mem.js)
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
        { id: 'lay',  ico: 'bi-stack',        t: 'Capas' },
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
        { k: 'blur', l: 'Blur total', min: 0, max: 100 }
    ];

    // restablecer por panel: qué claves vuelven al valor de fábrica
    var RESETS = {
        img:  { br: 100, co: 100, sa: 100, r: 100, g: 100, b: 100,
                sharp: 0, blur: 0 },
        trf:  { flipH: 0, flipV: 0, rot: 0, zoom: 100 },
        vig:  { edgeBlur: 0, vig: 0, vx: .5, vy: .5 }
    };

    function sliderRow(s, cur) {
        return '<label class="vfx-row"><span>' + s.l + '</span>' +
            '<input type="range" data-ie="' + s.k + '" min="' + s.min +
            '" max="' + s.max + '" value="' + cur + '"><b>' + cur + '</b></label>';
    }
    function rstBtn() {
        return '<div class="ie-row"><button class="tribal-btn tribal-btn-xs" ' +
            'data-act="rst"><i class="bi bi-arrow-counterclockwise"></i> ' +
            'Restablecer</button></div>';
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

        function layerName(o, idx) {
            if (o.name) return o.name;
            var n = E.st.ovs.indexOf(o) + 1;
            return o.ty === 't' ? 'Texto ' + n
                 : (o.str ? 'Emoji ' + o.str : 'Foto ' + n);
        }
        function autoName(o) {
            var n = E.st.ovs.length;
            o.name = o.ty === 't' ? 'Texto ' + n
                   : (o.str ? 'Emoji ' + o.str : 'Foto ' + n);
        }
        function addLayer(o) {
            if (E.st.ovs.length >= E.maxLayers) {
                deps.toast('Máximo ' + E.maxLayers + ' capas');
                return false;
            }
            autoName(o);
            E.st.ovs.push(o);
            E.sel = o;
            E.commit();
            return true;
        }
        function selRowHtml() {
            var o = E.sel;
            if (!o) return '';
            return '<div class="ie-selbox">' +
                '<span class="ie-selname">' + esc(layerName(o, 0)) + '</span>' +
                '<label class="vfx-row"><span>Tamaño</span>' +
                    '<input type="range" id="ie-sel-size" min="4" max="60" ' +
                    'value="' + o.s + '"><b>' + o.s + '</b></label>' +
                '<label class="vfx-row"><span>Rotar °</span>' +
                    '<input type="range" id="ie-sel-rot" min="-180" max="180" ' +
                    'value="' + (o.rot || 0) + '"><b>' + (o.rot || 0) + '</b></label>' +
                '<div class="ie-row">' +
                    '<button class="tribal-btn tribal-btn-xs" data-sel="fh">' +
                        '<i class="bi bi-symmetry-vertical"></i> Voltear H</button>' +
                    '<button class="tribal-btn tribal-btn-xs" data-sel="fv">' +
                        '<i class="bi bi-symmetry-horizontal"></i> Voltear V</button>' +
                    '<button class="tribal-btn tribal-btn-xs danger" data-sel="del">' +
                        '<i class="bi bi-trash3"></i> Quitar</button></div></div>';
        }
        function layersHtml() {
            var s = '<p class="ie-hint">Cada texto, emoji y sticker es una ' +
                'capa — se apilan en este orden (la de arriba va por encima).</p>';
            if (!E.st.ovs.length) return s +
                '<p class="ie-hint">Aún sin capas. Agrega texto o emojis.</p>';
            return s + '<div class="ie-layers">' +
                E.st.ovs.map(function (o, i) {
                    return '<div class="ie-layer' + (o === E.sel ? ' on' : '') +
                        '" data-lay="' + i + '">' +
                        '<i class="bi ' + (o.ty === 't' ? 'bi-type' : 'bi-emoji-smile') + '"></i>' +
                        '<span class="ie-layer-n">' + esc(layerName(o, i)) + '</span>' +
                        '<button data-lact="up" data-i="' + i + '" title="Subir">' +
                            '<i class="bi bi-caret-up-fill"></i></button>' +
                        '<button data-lact="dn" data-i="' + i + '" title="Bajar">' +
                            '<i class="bi bi-caret-down-fill"></i></button>' +
                        '<button data-lact="ren" data-i="' + i + '" title="Renombrar">' +
                            '<i class="bi bi-pencil"></i></button>' +
                        '<button data-lact="del" data-i="' + i + '" title="Eliminar">' +
                            '<i class="bi bi-trash3"></i></button></div>';
                }).join('') + '</div>';
        }
        function selPanel() {
            return '<div id="ie-selrow">' +
                (E.sel ? selRowHtml() : '<p class="ie-hint">Toca un texto o sticker sobre la imagen para ajustarlo — doble clic en un texto para editarlo.</p>') +
                '</div>';
        }
        function paintSelRow() {
            var sr = panel.querySelector('#ie-selrow');
            if (sr) sr.innerHTML = E.sel ? selRowHtml()
                : '<p class="ie-hint">Toca un texto o sticker sobre la imagen para ajustarlo.</p>';
        }
        E.paintSel = paintSelRow;
        // doble clic sobre un texto → cargarlo en el panel para editarlo
        E.editLayer = function (o) {
            E.sel = o;
            if (o.ty === 't') {
                show('txt');
                var inp = panel.querySelector('#ie-txt-in');
                var cc = panel.querySelector('#ie-txt-c');
                var ff = panel.querySelector('#ie-txt-f');
                if (inp) inp.value = o.str;
                if (cc) cc.value = o.c || '#f0b429';
                if (ff && o.f) ff.value = o.f;
            } else {
                show('stk');
            }
            paintSelRow();
            E.render();
        };

        function show(tab) {
            E.cropMode = (tab === 'crop');
            tools.querySelectorAll('.ie-tab').forEach(function (b) {
                b.classList.toggle('on', b.dataset.iet === tab);
            });
            if (tab === 'img') {
                panel.innerHTML = IMG_SLIDERS.map(function (s) {
                    return sliderRow(s, E.st[s.k]);
                }).join('') + rstBtn();
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
                    sliderRow({ k: 'zoom', l: 'Zoom %', min: 50, max: 300 }, E.st.zoom) +
                    rstBtn();
            } else if (tab === 'crop') {
                panel.innerHTML =
                    '<p class="ie-hint">Elige un aspecto o arrastra las ' +
                        'esquinas y los puntos de los lados del recuadro.</p>' +
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
                            '<i class="bi bi-x2"></i> Quitar / Restablecer</button></div>';
            } else if (tab === 'vig') {
                panel.innerHTML =
                    '<p class="ie-hint">Toca la imagen para mover el centro ' +
                        'de la viñeta / blur de bordes.</p>' +
                    sliderRow({ k: 'edgeBlur', l: 'Blur bordes (fuerte)', min: 0, max: 100 }, E.st.edgeBlur) +
                    sliderRow({ k: 'blur', l: 'Blur total de la imagen', min: 0, max: 100 }, E.st.blur) +
                    sliderRow({ k: 'vig', l: 'Viñeta (−claro +oscuro)', min: -100, max: 100 }, E.st.vig) +
                    rstBtn();
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
                            '<i class="bi bi-plus-lg"></i> Fijar texto</button></div>' +
                    '<p class="ie-hint">Escribe y se ve al instante sobre la imagen — arrástralo con el dedo.</p>' +
                    selPanel() + rstBtn();
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
                    selPanel() + rstBtn();
            } else if (tab === 'lay') {
                panel.innerHTML = layersHtml();
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
        E.showTab = show;

        // ---------------- eventos ----------------
        tools.addEventListener('click', function (e) {
            var t = e.target.closest('[data-iet]');
            if (t) { show(t.dataset.iet); E.render(); return; }
            var lb = e.target.closest('[data-lact]');
            if (lb) {
                var i = +lb.dataset.i, a2 = lb.dataset.lact, L = E.st.ovs;
                if (a2 === 'up' && i < L.length - 1) { var t2 = L[i]; L[i] = L[i+1]; L[i+1] = t2; }
                else if (a2 === 'dn' && i > 0) { var t3 = L[i]; L[i] = L[i-1]; L[i-1] = t3; }
                else if (a2 === 'ren') {
                    var nw = prompt('Nombre de la capa:', L[i].name || layerName(L[i], i));
                    if (nw) L[i].name = nw.trim() || L[i].name;
                } else if (a2 === 'del') {
                    if (lb.dataset.arm) {          // segundo toque → borra
                        if (E.sel === L[i]) E.sel = null;
                        L.splice(i, 1);
                    } else {
                        lb.dataset.arm = '1';
                        lb.classList.add('armed');
                        lb.innerHTML = '¿Seguro?';
                        setTimeout(function () {
                            delete lb.dataset.arm;
                            lb.classList.remove('armed');
                            lb.innerHTML = '<i class="bi bi-trash3"></i>';
                        }, 3500);
                        return;
                    }
                } else if (a2 === 'sel') { /* fila misma */ }
                E.commit();
                if (panel.dataset.tab === 'lay') show('lay'); else paintSelRow();
                E.render();
                return;
            }
            var lr = e.target.closest('[data-lay]');
            if (lr && !e.target.closest('[data-lact]')) {
                E.sel = E.st.ovs[+lr.dataset.lay];
                show('lay'); E.render();
                return;
            }
            var sb = e.target.closest('[data-sel]');
            if (sb && E.sel) {
                var k = sb.dataset.sel, o = E.sel;
                if (k === 'fh') o.fh = !o.fh;
                else if (k === 'fv') o.fv = !o.fv;
                else if (k === 'del') {
                    if (sb.dataset.arm) {
                        var ix = E.st.ovs.indexOf(o);
                        if (ix >= 0) E.st.ovs.splice(ix, 1);
                        E.sel = null;
                    } else {
                        sb.dataset.arm = '1';
                        sb.classList.add('armed');
                        sb.innerHTML = '¿Seguro que quito «' +
                            esc(layerName(o, 0)) + '»?';
                        setTimeout(function () {
                            delete sb.dataset.arm;
                            sb.classList.remove('armed');
                            sb.innerHTML = '<i class="bi bi-trash3"></i> Quitar';
                        }, 3500);
                        return;
                    }
                }
                E.commit(); paintSelRow(); E.render();
                return;
            }
            var act = e.target.closest('[data-act]');
            if (act) {
                var a = act.dataset.act, s = E.st;
                if (a === 'flipH') s.flipH = !s.flipH;
                else if (a === 'flipV') s.flipV = !s.flipV;
                else if (a === 'rotl') s.rot = (s.rot + 270) % 360;
                else if (a === 'rotr') s.rot = (s.rot + 90) % 360;
                else if (a === 'rst') {
                    var tab = panel.dataset.tab, map = RESETS[tab];
                    if (map) Object.keys(map).forEach(function (k) { s[k] = map[k]; });
                    if (tab === 'txt') s.ovs = s.ovs.filter(function (o) { return o.ty !== 't'; });
                    if (tab === 'stk') s.ovs = s.ovs.filter(function (o) { return o.ty === 't'; });
                    E.sel = null; E._live = null;
                    show(tab);
                }
                else if (a === 'cropApply') { if (window.TribalImgEditTouch.applyCrop) {
                        window.TribalImgEditTouch.applyCrop(E); } return; }
                else if (a === 'cropClear') {
                    s.crop = null; E.cropBox = null; E.cropRatio = null;
                    window.TribalImgEditTouch.placeCropDiv(E);
                    E.commit(); E.render(); return; }
                else if (a === 'cropRatio') {
                    var pv = parseFloat(act.dataset.r) || 0;
                    if (window.TribalImgEditTouch.setRatio) {
                        window.TribalImgEditTouch.setRatio(E, pv); }
                    panel.querySelectorAll('.ie-ratio').forEach(function (rb) {
                        rb.classList.toggle('on', rb === act); });
                    E.commit(); return; }
                else if (a === 'addText') {
                    // «Fijar»: el texto en vivo ya es una capa — solo suelta el input
                    var inp = panel.querySelector('#ie-txt-in');
                    if (inp) { inp.value = ''; }
                    if (E.sel && E.sel.ty === 't') E.sel = null;
                    paintSelRow(); E.render(); return;
                }
                E.commit();
                E.render();
                return;
            }
            var em = e.target.closest('[data-em]');
            if (em) {
                addLayer({ ty: 's', str: em.dataset.em, x: .5, y: .5, s: 18 });
                paintSelRow(); E.render();
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
                        addLayer({ ty: 's', img: im, iid: m.id, x: .5, y: .5, s: 20 });
                        paintSelRow(); E.render();
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
        // texto en vivo: al escribir se ve al instante sobre la imagen
        tools.addEventListener('input', function (e) {
            var rng = e.target.closest('[data-ie]');
            if (rng) {
                E.st[rng.dataset.ie] = +rng.value;
                rng.parentElement.querySelector('b').textContent = rng.value;
                E.commit(); E.render();
                return;
            }
            if (e.target.id === 'ie-sel-size' && E.sel) {
                E.sel.s = +e.target.value;
                E.sel.name = E.sel.name;   // mantiene el nombre
                var b = e.target.parentElement.querySelector('b');
                if (b) b.textContent = e.target.value;
                E.commit(); E.render(); return;
            }
            if (e.target.id === 'ie-sel-rot' && E.sel) {
                E.sel.rot = +e.target.value;
                var b2 = e.target.parentElement.querySelector('b');
                if (b2) b2.textContent = e.target.value;
                E.commit(); E.render(); return;
            }
            if (e.target.id === 'ie-txt-c' && E.sel && E.sel.ty === 't') {
                E.sel.c = e.target.value; E.commit(); E.render(); return;
            }
            if (e.target.id === 'ie-txt-f' && E.sel && E.sel.ty === 't') {
                E.sel.f = e.target.value; E.commit(); E.render(); return;
            }
            if (e.target.id === 'ie-txt-in') {
                var v = e.target.value;
                if (E.sel && E.sel.ty === 't') {          // editar capa elegida
                    E.sel.str = v;
                    if (!v) { var ix2 = E.st.ovs.indexOf(E.sel);
                        if (ix2 >= 0) E.st.ovs.splice(ix2, 1);
                        if (E.sel === E._live) E._live = null;
                        E.sel = null; }
                } else if (v) {                          // capa viva automática
                    if (!E._live) {
                        E._live = { ty: 't', str: '', x: .5, y: .5, s: 8,
                                    f: panel.querySelector('#ie-txt-f').value,
                                    c: panel.querySelector('#ie-txt-c').value };
                        if (!addLayer(E._live)) { E._live = null; return; }
                    }
                    E._live.str = v;
                } else if (E._live) {                    // borró todo → fuera
                    var ix3 = E.st.ovs.indexOf(E._live);
                    if (ix3 >= 0) E.st.ovs.splice(ix3, 1);
                    E._live = null;
                }
                E.commit(); E.render(); return;
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
