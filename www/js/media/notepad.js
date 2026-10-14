// ============================================================================
// ARCHIVO: media/notepad.js
// RESPONSABILIDAD: CRUD de Bloc de Notas con editor WYSIWYG 100% en vivo
//   ("al aire", sin inputs de texto):
//   - Crear, editar en vivo, leer y eliminar documentos de texto enriquecido
//   - Exportar/compartir a PDF, TXT, WhatsApp y Bluetooth
//   - Formato: Negrita, Itálica, Subrayado, Tachado, Código, Cita, Hipervínculo
//   - Títulos H1–H6 + P, Deshacer/Rehacer, Izquierda/Centro/Derecha/Justificado
//   - Viñetas, Lista ordenada, Línea horizontal
//   - Transformación de selección: MAYÚSCULAS, minúsculas, Title Case
//   - Interlineado (line-height) y Letter-spacing en vivo
//   - Multimedia en la nota: Imágenes (dispositivo + internet), Audios/Canciones
//     (de la tribu o dispositivo), Videos (dispositivo, YouTube y Facebook)
//   - Long-press sobre imagen/multimedia → menú contextual: mover libremente,
//     escalar (+/-), rotar, flip H, flip V, centrar/izquierda/derecha,
//     agregar hipervínculo, agregar línea horizontal, eliminar
//   - Hora de creado y hora de actualizado según hora del dispositivo
//   - Sincronización automática con «Libros y notas» y menú long-press sobre
//     cualquier documento guardado (Editar, Eliminar, WhatsApp, TXT, PDF, BT)
// ============================================================================
window.TribalNotepad = (function () {
    'use strict';

    var IO = window.TribalNotepadIO;
    var ov = null;
    var deps = null;
    var notes = [];
    var curNote = null;
    var activeWrap = null;         // elemento .np-img-wrap seleccionado / en long-press
    var ctxNote = null;            // nota sobre la que se hizo long-press en la lista
    var savedRange = null;         // selección guardada del contenteditable
    var undoStack = [];
    var redoStack = [];
    var autoSaveTimer = null;

    var LINE_HEIGHTS = ['-2', '-1.5', '-1.25', '1', '1.25', '1.5', '2'];
    var LH_CSS = {
        '-2': '0.78',
        '-1.5': '0.86',
        '-1.25': '0.93',
        '1': '1',
        '1.25': '1.25',
        '1.5': '1.5',
        '2': '2'
    };
    var LETTER_SPACINGS = ['0px', '1px', '2px', '4px'];

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function uid() {
        return 'np_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    }

    function saveSelection() {
        var sel = window.getSelection && window.getSelection();
        if (!sel || !sel.rangeCount) return;
        var r = sel.getRangeAt(0);
        var canvas = ov && ov.querySelector('#np-canvas');
        if (canvas && canvas.contains(r.commonAncestorContainer)) {
            savedRange = r.cloneRange();
        }
    }

    function restoreSelection() {
        if (!savedRange || !window.getSelection) return;
        var canvas = ov && ov.querySelector('#np-canvas');
        if (canvas) canvas.focus();
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
    }

    function pushHistory() {
        if (!ov) return;
        var canvas = ov.querySelector('#np-canvas');
        if (!canvas) return;
        var snap = canvas.innerHTML;
        if (undoStack.length && undoStack[undoStack.length - 1] === snap) return;
        undoStack.push(snap);
        if (undoStack.length > 50) undoStack.shift();
        redoStack = [];
    }

    function doUndo() {
        if (!ov) return;
        var canvas = ov.querySelector('#np-canvas');
        if (undoStack.length > 1) {
            redoStack.push(undoStack.pop());
            canvas.innerHTML = undoStack[undoStack.length - 1];
            rebindMediaWraps();
            scheduleLiveSave();
        } else {
            document.execCommand('undo', false, null);
        }
    }

    function doRedo() {
        if (!ov) return;
        var canvas = ov.querySelector('#np-canvas');
        if (redoStack.length) {
            var next = redoStack.pop();
            undoStack.push(next);
            canvas.innerHTML = next;
            rebindMediaWraps();
            scheduleLiveSave();
        } else {
            document.execCommand('redo', false, null);
        }
    }

    // Convierte enlaces de YouTube o Facebook a URL embebible
    function parseEmbedUrl(raw) {
        var u = String(raw || '').trim();
        if (!u) return null;
        if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
        var yt = /(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,15})/i.exec(u);
        if (yt) {
            return {
                kind: 'youtube',
                src: 'https://www.youtube.com/embed/' + yt[1] + '?rel=0',
                url: u
            };
        }
        if (/facebook\.com|fb\.watch/i.test(u)) {
            return {
                kind: 'facebook',
                src: 'https://www.facebook.com/plugins/video.php?href=' +
                    encodeURIComponent(u) + '&show_text=false',
                url: u
            };
        }
        return null;
    }

    // Aplica las transformaciones visuales guardadas en data-* de un .np-img-wrap
    function applyWrapTransform(wrap) {
        if (!wrap) return;
        var scale = parseFloat(wrap.getAttribute('data-scale') || '70') || 70;
        var rot = parseFloat(wrap.getAttribute('data-rot') || '0') || 0;
        var fx = wrap.getAttribute('data-flipx') === '1' ? -1 : 1;
        var fy = wrap.getAttribute('data-flipy') === '1' ? -1 : 1;
        var align = wrap.getAttribute('data-align') || 'center';
        var free = wrap.getAttribute('data-free') === '1';

        wrap.style.width = Math.min(100, Math.max(15, scale)) + '%';
        if (free) {
            wrap.classList.add('np-free');
            wrap.style.left = (wrap.getAttribute('data-x') || '16') + 'px';
            wrap.style.top = (wrap.getAttribute('data-y') || '16') + 'px';
            wrap.style.marginLeft = '0';
            wrap.style.marginRight = '0';
        } else {
            wrap.classList.remove('np-free');
            wrap.style.left = '';
            wrap.style.top = '';
            if (align === 'left') {
                wrap.style.marginLeft = '0';
                wrap.style.marginRight = 'auto';
            } else if (align === 'right') {
                wrap.style.marginLeft = 'auto';
                wrap.style.marginRight = '0';
            } else {
                wrap.style.marginLeft = 'auto';
                wrap.style.marginRight = 'auto';
            }
        }
        var inner = wrap.querySelector('.np-media-inner') || wrap.firstElementChild;
        if (inner) {
            inner.style.transform = 'rotate(' + rot + 'deg) scale(' + fx + ', ' + fy + ')';
        }
    }

    // Construye el HTML de la ventana completa del Bloc de Notas (sin <input> de texto)
    function buildHtml() {
        return '<div class="tribal-p2p tribal-links np-root">' +
            '<div class="tribal-p2p-head np-head">' +
                '<button class="tribal-ctrl lk-back" id="np-back" title="Volver">' +
                    '<i class="bi bi-arrow-left"></i><span id="np-back-lbl">Volver</span></button>' +
                '<i class="bi bi-journal-richtext"></i>' +
                '<strong id="np-head-title">Bloc de notas</strong>' +
                '<div class="np-head-acts">' +
                    '<button class="tribal-btn tribal-btn-xs primary" id="np-new-btn">' +
                        '<i class="bi bi-plus-lg"></i> Nueva nota</button>' +
                    '<button class="tribal-btn tribal-btn-xs" id="np-read-btn" hidden title="Ver nota en texto completo">' +
                        '<i class="bi bi-arrows-fullscreen"></i> Texto completo</button>' +
                    '<button class="tribal-btn tribal-btn-xs primary" id="np-save-btn" hidden>' +
                        '<i class="bi bi-check2-circle"></i> Guardar</button>' +
                '</div>' +
            '</div>' +

            '<!-- VISTA 1: LISTA DE DOCUMENTOS -->' +
            '<div class="lk-body np-list-view" id="np-list-view">' +
                '<p class="np-hint">Toca una nota para leer/editar en vivo · ' +
                    'Mantén presionado (long-press) para Editar, Eliminar o Compartir (WhatsApp, TXT, PDF, Bluetooth)</p>' +
                '<div class="np-docs-grid" id="np-docs-grid"></div>' +
            '</div>' +

            '<!-- VISTA 2: EDITOR WYSIWYG EN VIVO AL AIRE (ARCHIVO COMPLETO SIN CARD) -->' +
            '<section class="np-edit-view" id="np-edit-view" hidden>' +
                '<nav class="np-toolbar" id="np-toolbar">' +
                    '<div class="np-tb-group">' +
                        '<button type="button" class="np-tbtn" data-cmd="undo" title="Deshacer"><i class="bi bi-arrow-counterclockwise"></i></button>' +
                        '<button type="button" class="np-tbtn" data-cmd="redo" title="Rehacer"><i class="bi bi-arrow-clockwise"></i></button>' +
                    '</div>' +
                    '<div class="np-tb-group">' +
                        '<button type="button" class="np-tbtn" data-cmd="bold" title="Negrita"><i class="bi bi-type-bold"></i></button>' +
                        '<button type="button" class="np-tbtn" data-cmd="italic" title="Itálica"><i class="bi bi-type-italic"></i></button>' +
                        '<button type="button" class="np-tbtn" data-cmd="underline" title="Subrayado"><i class="bi bi-type-underline"></i></button>' +
                        '<button type="button" class="np-tbtn" data-cmd="strikeThrough" title="Tachado"><i class="bi bi-type-strikethrough"></i></button>' +
                        '<button type="button" class="np-tbtn" data-act="code" title="Código"><i class="bi bi-code-slash"></i></button>' +
                        '<button type="button" class="np-tbtn" data-act="quote" title="Cita"><i class="bi bi-chat-quote"></i></button>' +
                        '<button type="button" class="np-tbtn" data-act="link" title="Agregar hipervínculo"><i class="bi bi-link-45deg"></i></button>' +
                        '<button type="button" class="np-tbtn" data-act="hr" title="Línea horizontal"><i class="bi bi-hr"></i></button>' +
                    '</div>' +
                    '<div class="np-tb-group">' +
                        '<select class="np-dd" id="np-dd-block" title="Títulos y formato de bloque">' +
                            '<option value="">Título / Bloque…</option>' +
                            '<option value="P">Párrafo normal (P)</option>' +
                            '<option value="H1">Título H1</option>' +
                            '<option value="H2">Título H2</option>' +
                            '<option value="H3">Título H3</option>' +
                            '<option value="H4">Título H4</option>' +
                            '<option value="H5">Título H5</option>' +
                            '<option value="H6">Título H6</option>' +
                        '</select>' +
                        '<select class="np-dd" id="np-dd-align" title="Alinear elementos seleccionados">' +
                            '<option value="">Alinear selección…</option>' +
                            '<option value="left">Izquierda</option>' +
                            '<option value="center">Centrar</option>' +
                            '<option value="right">Derecha</option>' +
                            '<option value="justify">Justificado</option>' +
                        '</select>' +
                        '<select class="np-dd" id="np-dd-case" title="Cambiar mayúsculas/minúsculas">' +
                            '<option value="">Mayús / Minús…</option>' +
                            '<option value="upper">MAYÚSCULAS (AA)</option>' +
                            '<option value="lower">minúsculas (aa)</option>' +
                            '<option value="title">Title Case (Aa)</option>' +
                        '</select>' +
                        '<select class="np-dd" id="np-dd-lh" title="Interlineado">' +
                            '<option value="-2">Interlineado: -2</option>' +
                            '<option value="-1.5">Interlineado: -1.5</option>' +
                            '<option value="-1.25">Interlineado: -1.25</option>' +
                            '<option value="1">Interlineado: 1</option>' +
                            '<option value="1.25">Interlineado: 1.25</option>' +
                            '<option value="1.5" selected>Interlineado: 1.5</option>' +
                            '<option value="2">Interlineado: 2</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="np-tb-group">' +
                        '<button type="button" class="np-tbtn" data-cmd="insertUnorderedList" title="Viñetas"><i class="bi bi-list-ul"></i></button>' +
                        '<button type="button" class="np-tbtn" data-cmd="insertOrderedList" title="Lista ordenada"><i class="bi bi-list-ol"></i></button>' +
                        '<button type="button" class="np-tbtn" data-act="ls" title="Letter-spacing"><i class="bi bi-distribute-horizontal"></i> <small id="np-ls-lbl">0px</small></button>' +
                        '<button type="button" class="np-tbtn" data-act="autocorrect" title="Autocorregir ortografía"><i class="bi bi-spellcheck"></i> Ortografía</button>' +
                        '<button type="button" class="np-tbtn" data-act="synonyms" title="Sinónimos de la palabra seleccionada"><i class="bi bi-book"></i> Sinónimos</button>' +
                    '</div>' +
                    '<div class="np-tb-group">' +
                        '<button type="button" class="np-tbtn" data-act="img-dev" title="Imagen del dispositivo"><i class="bi bi-image"></i></button>' +
                        '<button type="button" class="np-tbtn" data-act="img-url" title="Imagen de Internet"><i class="bi bi-globe2"></i></button>' +
                        '<button type="button" class="np-tbtn" data-act="song-tribu" title="Agregar canción de la tribu"><i class="bi bi-music-note-beamed"></i></button>' +
                        '<button type="button" class="np-tbtn" data-act="aud-dev" title="Audio del dispositivo"><i class="bi bi-file-earmark-music"></i></button>' +
                        '<button type="button" class="np-tbtn" data-act="vid-dev" title="Video del dispositivo"><i class="bi bi-camera-video"></i></button>' +
                        '<button type="button" class="np-tbtn" data-act="vid-net" title="Video/Audio de YouTube o Facebook"><i class="bi bi-youtube"></i></button>' +
                    '</div>' +
                    '<div class="np-tb-group">' +
                        '<button type="button" class="np-tbtn" data-exp="pdf" title="Exportar a PDF"><i class="bi bi-file-earmark-pdf"></i> PDF</button>' +
                        '<button type="button" class="np-tbtn" data-exp="txt" title="Exportar a TXT"><i class="bi bi-filetype-txt"></i> TXT</button>' +
                        '<button type="button" class="np-tbtn" data-exp="wa" title="Enviar a WhatsApp"><i class="bi bi-whatsapp"></i></button>' +
                    '</div>' +
                '</nav>' +

                '<!-- ARCHIVO COMPLETO AL AIRE SIN CARD DE FONDO -->' +
                '<main class="np-doc-scroll" id="np-doc-scroll">' +
                    '<h1 id="np-title" class="np-air-title" contenteditable="true" spellcheck="true" lang="es" ' +
                        'data-placeholder="Escribe el título aquí al aire…"></h1>' +
                    '<header class="np-timestamps">' +
                        '<span><i class="bi bi-clock"></i> Creado: <b id="np-ts-created">—</b></span>' +
                        '<span><i class="bi bi-clock-history"></i> Actualizado: <b id="np-ts-updated">—</b></span>' +
                    '</header>' +
                    '<article id="np-canvas" class="np-air-canvas" contenteditable="true" spellcheck="true" lang="es" ' +
                        'data-placeholder="Escribe tu nota aquí al aire… Mantén presionada cualquier imagen, audio o video para abrir su menú contextual."></article>' +
                '</main>' +
            '</section>' +

            '<!-- MODAL DE SINÓNIMOS -->' +
            '<div class="np-modal-bd" id="np-syn-modal" hidden>' +
                '<div class="np-modal-card">' +
                    '<strong><i class="bi bi-book"></i> Diccionario de Sinónimos</strong>' +
                    '<div id="np-syn-search" class="np-air-urlbox" contenteditable="true" ' +
                        'data-placeholder="Escribe o selecciona una palabra (ej. bonito, rápido, hablar, casa…)"></div>' +
                    '<div class="np-ctx-grid" id="np-syn-list"></div>' +
                    '<div class="np-modal-acts">' +
                        '<button type="button" class="tribal-btn" id="np-syn-close">Cerrar</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<!-- SELECTORES NATIVOS OCULTOS DE ARCHIVOS MULTIMEDIA -->' +
            '<input type="file" id="np-file-img" accept="image/*" hidden>' +
            '<input type="file" id="np-file-aud" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus" hidden>' +
            '<input type="file" id="np-file-vid" accept="video/*,.mp4,.webm,.mkv,.mov" hidden>' +

            '<!-- BURBUJA FLOTANTE PARA PEGAR ENLACES / URLS AL AIRE (SIN INPUT) -->' +
            '<div class="np-modal-bd" id="np-air-prompt" hidden>' +
                '<div class="np-modal-card">' +
                    '<strong id="np-air-prompt-title">Enlace</strong>' +
                    '<div id="np-air-prompt-box" class="np-air-urlbox" contenteditable="true" ' +
                        'data-placeholder="https://…"></div>' +
                    '<div class="np-modal-acts">' +
                        '<button type="button" class="tribal-btn" id="np-air-cancel">Cancelar</button>' +
                        '<button type="button" class="tribal-btn primary" id="np-air-ok">Insertar</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<!-- MODAL DE CANCIONES DE LA TRIBU -->' +
            '<div class="np-modal-bd" id="np-song-picker" hidden>' +
                '<div class="np-modal-card">' +
                    '<strong><i class="bi bi-music-note-beamed"></i> Agregar canción a la nota</strong>' +
                    '<div class="np-song-list" id="np-song-list"></div>' +
                    '<div class="np-modal-acts">' +
                        '<button type="button" class="tribal-btn" id="np-song-close">Cerrar</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<!-- MENÚ CONTEXTUAL LONG-PRESS DE IMAGEN / ELEMENTO MULTIMEDIA -->' +
            '<div class="np-modal-bd" id="np-img-menu" hidden>' +
                '<div class="np-modal-card np-ctx-card">' +
                    '<strong><i class="bi bi-sliders"></i> Controlar elemento seleccionado</strong>' +
                    '<div class="np-ctx-grid">' +
                        '<button type="button" data-im="free"><i class="bi bi-arrows-move"></i> <span id="np-im-free-lbl">Mover libremente</span></button>' +
                        '<button type="button" data-im="scale-up"><i class="bi bi-zoom-in"></i> Aumentar escala (+)</button>' +
                        '<button type="button" data-im="scale-down"><i class="bi bi-zoom-out"></i> Disminuir tamaño (-)</button>' +
                        '<button type="button" data-im="align-left"><i class="bi bi-align-start"></i> Izquierda</button>' +
                        '<button type="button" data-im="align-center"><i class="bi bi-align-center"></i> Centro</button>' +
                        '<button type="button" data-im="align-right"><i class="bi bi-align-end"></i> Derecha</button>' +
                        '<button type="button" data-im="rot-r"><i class="bi bi-arrow-clockwise"></i> Rotar +90°</button>' +
                        '<button type="button" data-im="rot-l"><i class="bi bi-arrow-counterclockwise"></i> Rotar -90°</button>' +
                        '<button type="button" data-im="flip-h"><i class="bi bi-symmetry-vertical"></i> Flip horizontal</button>' +
                        '<button type="button" data-im="flip-v"><i class="bi bi-symmetry-horizontal"></i> Flip vertical</button>' +
                        '<button type="button" data-im="link"><i class="bi bi-link-45deg"></i> Agregar hipervínculo</button>' +
                        '<button type="button" data-im="hr"><i class="bi bi-hr"></i> Agregar línea horizontal</button>' +
                        '<button type="button" data-im="del" class="danger"><i class="bi bi-trash3"></i> Quitar elemento</button>' +
                    '</div>' +
                    '<div class="np-modal-acts">' +
                        '<button type="button" class="tribal-btn" id="np-im-close">Cerrar</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<!-- MENÚ CONTEXTUAL LONG-PRESS DE DOCUMENTO GUARDADO -->' +
            '<div class="np-modal-bd" id="np-doc-menu" hidden>' +
                '<div class="np-modal-card np-ctx-card">' +
                    '<strong id="np-doc-menu-title">Documento</strong>' +
                    '<div class="np-ctx-grid np-doc-acts">' +
                        '<button type="button" data-dm="edit"><i class="bi bi-pencil-square"></i> Leer / Editar en vivo</button>' +
                        '<button type="button" data-dm="wa"><i class="bi bi-whatsapp"></i> Compartir por WhatsApp</button>' +
                        '<button type="button" data-dm="txt"><i class="bi bi-filetype-txt"></i> Exportar / Compartir TXT</button>' +
                        '<button type="button" data-dm="pdf"><i class="bi bi-file-earmark-pdf"></i> Exportar / Compartir PDF</button>' +
                        '<button type="button" data-dm="bt"><i class="bi bi-bluetooth"></i> Compartir por Bluetooth</button>' +
                        '<button type="button" data-dm="del" class="danger"><i class="bi bi-trash3"></i> Eliminar documento</button>' +
                    '</div>' +
                    '<div class="np-modal-acts">' +
                        '<button type="button" class="tribal-btn" id="np-dm-close">Cancelar</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    // Prompt "al aire" sin <input>
    function askAirUrl(title, initial, cb) {
        saveSelection();
        var modal = ov.querySelector('#np-air-prompt');
        var box = ov.querySelector('#np-air-prompt-box');
        ov.querySelector('#np-air-prompt-title').textContent = title;
        box.textContent = initial || '';
        modal.hidden = false;
        setTimeout(function () { box.focus(); }, 20);
        function closePrompt(ok) {
            modal.hidden = true;
            ov.querySelector('#np-air-ok').onclick = null;
            ov.querySelector('#np-air-cancel').onclick = null;
            box.onkeydown = null;
            var val = (box.innerText || box.textContent || '').trim();
            restoreSelection();
            if (ok && val) cb(val);
        }
        ov.querySelector('#np-air-ok').onclick = function () { closePrompt(true); };
        ov.querySelector('#np-air-cancel').onclick = function () { closePrompt(false); };
        box.onkeydown = function (e) {
            if (e.key === 'Enter') { e.preventDefault(); closePrompt(true); }
            if (e.key === 'Escape') { e.preventDefault(); closePrompt(false); }
        };
    }

    // Inserta un nodo en la posición actual del cursor en #np-canvas
    function insertNodeAtCursor(node) {
        var canvas = ov.querySelector('#np-canvas');
        canvas.focus();
        restoreSelection();
        var sel = window.getSelection && window.getSelection();
        if (sel && sel.rangeCount) {
            var r = sel.getRangeAt(0);
            if (canvas.contains(r.commonAncestorContainer)) {
                r.deleteContents();
                r.insertNode(node);
                var after = document.createElement('p');
                after.innerHTML = '<br>';
                if (node.parentNode) {
                    node.parentNode.insertBefore(after, node.nextSibling);
                }
                r.setStartAfter(node);
                r.collapse(true);
                sel.removeAllRanges();
                sel.addRange(r);
                saveSelection();
                pushHistory();
                scheduleLiveSave();
                return;
            }
        }
        canvas.appendChild(node);
        var p = document.createElement('p');
        p.innerHTML = '<br>';
        canvas.appendChild(p);
        pushHistory();
        scheduleLiveSave();
    }

    // Crea un contenedor multimedia (.np-img-wrap) con soporte de long-press y arrastre libre
    function createMediaWrap(innerHtml, kind) {
        var wrap = document.createElement('figure');
        wrap.className = 'np-img-wrap';
        wrap.setAttribute('contenteditable', 'false');
        wrap.setAttribute('data-kind', kind || 'image');
        wrap.setAttribute('data-scale', kind === 'audio' ? '85' : '70');
        wrap.setAttribute('data-rot', '0');
        wrap.setAttribute('data-flipx', '0');
        wrap.setAttribute('data-flipy', '0');
        wrap.setAttribute('data-align', 'center');
        wrap.setAttribute('data-free', '0');
        wrap.innerHTML = '<div class="np-media-inner">' + innerHtml + '</div>' +
            '<span class="np-media-badge" title="Mantén presionado para opciones"><i class="bi bi-sliders"></i></span>';
        applyWrapTransform(wrap);
        bindWrapEvents(wrap);
        return wrap;
    }

    function bindWrapEvents(wrap) {
        if (wrap._npBound) return;
        wrap._npBound = true;
        var lpT = null, startX = 0, startY = 0, dragging = false, origX = 0, origY = 0;

        wrap.addEventListener('pointerdown', function (e) {
            e.stopPropagation();
            if (ov) {
                ov.querySelectorAll('.np-img-wrap.np-sel').forEach(function (w) {
                    w.classList.remove('np-sel');
                });
            }
            wrap.classList.add('np-sel');
            activeWrap = wrap;
            startX = e.clientX;
            startY = e.clientY;
            dragging = false;

            if (wrap.getAttribute('data-free') === '1' && !e.target.closest('audio,video,iframe')) {
                origX = parseFloat(wrap.getAttribute('data-x') || wrap.offsetLeft || '16') || 16;
                origY = parseFloat(wrap.getAttribute('data-y') || wrap.offsetTop || '16') || 16;
                dragging = true;
                try { wrap.setPointerCapture(e.pointerId); } catch (er) {}
            }

            clearTimeout(lpT);
            lpT = setTimeout(function () {
                lpT = null;
                dragging = false;
                openMediaMenu(wrap);
            }, 460);
        });

        wrap.addEventListener('pointermove', function (e) {
            if (lpT && (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10)) {
                clearTimeout(lpT);
                lpT = null;
            }
            if (dragging && wrap.getAttribute('data-free') === '1') {
                var nx = Math.max(0, origX + (e.clientX - startX));
                var ny = Math.max(0, origY + (e.clientY - startY));
                wrap.setAttribute('data-x', String(Math.round(nx)));
                wrap.setAttribute('data-y', String(Math.round(ny)));
                wrap.style.left = Math.round(nx) + 'px';
                wrap.style.top = Math.round(ny) + 'px';
            }
        });

        function endPtr() {
            clearTimeout(lpT);
            lpT = null;
            if (dragging) {
                dragging = false;
                scheduleLiveSave();
            }
        }
        wrap.addEventListener('pointerup', endPtr);
        wrap.addEventListener('pointercancel', endPtr);
        wrap.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            clearTimeout(lpT);
            openMediaMenu(wrap);
        });

        var badge = wrap.querySelector('.np-media-badge');
        if (badge) {
            badge.addEventListener('click', function (e) {
                e.stopPropagation();
                openMediaMenu(wrap);
            });
        }
    }

    function rebindMediaWraps() {
        if (!ov) return;
        ov.querySelectorAll('#np-canvas .np-img-wrap').forEach(function (w) {
            applyWrapTransform(w);
            bindWrapEvents(w);
        });
    }

    function openMediaMenu(wrap) {
        activeWrap = wrap;
        var menu = ov.querySelector('#np-img-menu');
        var freeLbl = ov.querySelector('#np-im-free-lbl');
        if (freeLbl) {
            freeLbl.textContent = wrap.getAttribute('data-free') === '1'
                ? 'Fijar al texto (quitar libre)'
                : 'Mover libremente';
        }
        menu.hidden = false;
    }

    function handleMediaMenuAction(act) {
        var w = activeWrap;
        if (!w) return;
        var menu = ov.querySelector('#np-img-menu');
        if (act === 'free') {
            var isFree = w.getAttribute('data-free') === '1';
            w.setAttribute('data-free', isFree ? '0' : '1');
            if (!isFree && !w.getAttribute('data-x')) {
                w.setAttribute('data-x', '24');
                w.setAttribute('data-y', String(Math.max(24, w.offsetTop || 24)));
            }
            applyWrapTransform(w);
            menu.hidden = true;
            if (deps && deps.toast) {
                deps.toast(isFree ? 'Elemento devuelto al flujo del texto'
                                  : 'Modo libre activo: arrástralo con el dedo');
            }
            scheduleLiveSave();
            return;
        }
        if (act === 'scale-up' || act === 'scale-down') {
            var cur = parseFloat(w.getAttribute('data-scale') || '70') || 70;
            var next = act === 'scale-up' ? Math.min(100, cur + 10) : Math.max(15, cur - 10);
            w.setAttribute('data-scale', String(next));
            applyWrapTransform(w);
            scheduleLiveSave();
            return;
        }
        if (act === 'align-left' || act === 'align-center' || act === 'align-right') {
            w.setAttribute('data-free', '0');
            w.setAttribute('data-align', act.replace('align-', ''));
            applyWrapTransform(w);
            menu.hidden = true;
            scheduleLiveSave();
            return;
        }
        if (act === 'rot-r' || act === 'rot-l') {
            var r = parseFloat(w.getAttribute('data-rot') || '0') || 0;
            r = (r + (act === 'rot-r' ? 90 : -90)) % 360;
            w.setAttribute('data-rot', String(r));
            applyWrapTransform(w);
            scheduleLiveSave();
            return;
        }
        if (act === 'flip-h') {
            w.setAttribute('data-flipx', w.getAttribute('data-flipx') === '1' ? '0' : '1');
            applyWrapTransform(w);
            scheduleLiveSave();
            return;
        }
        if (act === 'flip-v') {
            w.setAttribute('data-flipy', w.getAttribute('data-flipy') === '1' ? '0' : '1');
            applyWrapTransform(w);
            scheduleLiveSave();
            return;
        }
        if (act === 'link') {
            menu.hidden = true;
            var curHref = w.getAttribute('data-href') || '';
            askAirUrl('Hipervínculo para el elemento', curHref || 'https://', function (url) {
                if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
                w.setAttribute('data-href', url);
                var inner = w.querySelector('.np-media-inner');
                var cap = w.querySelector('.np-media-link');
                if (!cap) {
                    cap = document.createElement('a');
                    cap.className = 'np-media-link';
                    cap.target = '_blank';
                    cap.rel = 'noopener';
                    inner.appendChild(cap);
                }
                cap.href = url;
                cap.textContent = url;
                scheduleLiveSave();
            });
            return;
        }
        if (act === 'hr') {
            menu.hidden = true;
            var hr = document.createElement('hr');
            hr.className = 'np-hr';
            if (w.parentNode) w.parentNode.insertBefore(hr, w.nextSibling);
            scheduleLiveSave();
            return;
        }
        if (act === 'del') {
            menu.hidden = true;
            if (w.parentNode) w.parentNode.removeChild(w);
            activeWrap = null;
            scheduleLiveSave();
        }
    }

    // Transforma el texto seleccionado a MAYÚSCULA, minúscula o Title Case
    function transformSelectedCase(mode) {
        var canvas = ov.querySelector('#np-canvas');
        canvas.focus();
        var sel = window.getSelection && window.getSelection();
        if (!sel || !sel.rangeCount || sel.isCollapsed) {
            if (deps && deps.toast) deps.toast('Selecciona primero el texto a transformar');
            return;
        }
        var txt = sel.toString();
        if (!txt) return;
        var out = txt;
        if (mode === 'upper') out = txt.toUpperCase();
        else if (mode === 'lower') out = txt.toLowerCase();
        else if (mode === 'title') {
            out = txt.toLowerCase().replace(/(?:^|\s|\b)\S/g, function (c) {
                return c.toUpperCase();
            });
        }
        document.execCommand('insertText', false, out);
        pushHistory();
        scheduleLiveSave();
    }

    // Aplica alineación ESTRICTAMENTE a los elementos seleccionados
    function applyAlignment(dir) {
        var canvas = ov.querySelector('#np-canvas');
        // 1) Si hay un elemento multimedia seleccionado (.np-img-wrap.np-sel),
        //    alineamos SOLO ese elemento multimedia sin tocar el texto
        if (activeWrap && activeWrap.classList.contains('np-sel') && canvas.contains(activeWrap)) {
            activeWrap.setAttribute('data-free', '0');
            activeWrap.setAttribute('data-align', dir === 'justify' ? 'center' : dir);
            applyWrapTransform(activeWrap);
            pushHistory();
            scheduleLiveSave();
            return;
        }
        canvas.focus();
        restoreSelection();
        var sel = window.getSelection && window.getSelection();
        if (!sel || !sel.rangeCount) return;
        var r = sel.getRangeAt(0);
        if (!canvas.contains(r.commonAncestorContainer)) return;

        // 2) Si hay texto seleccionado, envolvemos o alineamos SOLO los bloques dentro del Range
        if (!r.collapsed) {
            var blocks = Array.prototype.slice.call(
                canvas.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote')
            ).filter(function (b) { return r.intersectsNode(b); });
            if (blocks.length) {
                blocks.forEach(function (b) { b.style.textAlign = dir; });
            } else {
                var frag = r.extractContents();
                var p = document.createElement('p');
                p.style.textAlign = dir;
                p.appendChild(frag);
                r.insertNode(p);
                sel.removeAllRanges();
                var nr = document.createRange();
                nr.selectNodeContents(p);
                sel.addRange(nr);
                saveSelection();
            }
            pushHistory();
            scheduleLiveSave();
            return;
        }

        // 3) Cursor sin selección: alinea únicamente el párrafo/bloque actual
        var node = r.startContainer;
        while (node && node !== canvas) {
            if (node.nodeType === 1 && /^(P|H[1-6]|LI|BLOCKQUOTE)$/.test(node.tagName)) {
                node.style.textAlign = dir;
                pushHistory();
                scheduleLiveSave();
                return;
            }
            node = node.parentNode;
        }
    }

    function applyLineHeight(val) {
        if (!curNote || !ov) return;
        var cssLh = LH_CSS[val] || val || '1.5';
        curNote.lineHeight = val;
        var canvas = ov.querySelector('#np-canvas');
        restoreSelection();
        var sel = window.getSelection && window.getSelection();
        if (sel && sel.rangeCount && !sel.isCollapsed) {
            var r = sel.getRangeAt(0);
            var blocks = Array.prototype.slice.call(
                canvas.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote')
            ).filter(function (b) { return r.intersectsNode(b); });
            if (blocks.length) {
                blocks.forEach(function (b) { b.style.lineHeight = cssLh; });
                pushHistory();
                scheduleLiveSave();
                return;
            }
        }
        canvas.style.lineHeight = cssLh;
        scheduleLiveSave();
    }

    // Lee los datos en vivo del lienzo y actualiza timestamps
    function syncCurrentNoteFromDOM() {
        if (!curNote || !ov) return;
        var titleEl = ov.querySelector('#np-title');
        var canvasEl = ov.querySelector('#np-canvas');
        curNote.title = (titleEl.innerText || titleEl.textContent || '').trim() || 'Nota sin título';
        curNote.html = canvasEl.innerHTML;
        curNote.text = (canvasEl.innerText || canvasEl.textContent || '').trim();
        curNote.updatedAt = Date.now();
        if (!curNote.createdAt) curNote.createdAt = curNote.updatedAt;
        var upEl = ov.querySelector('#np-ts-updated');
        if (upEl) upEl.textContent = IO.fmtDateTime(curNote.updatedAt);
    }

    function scheduleLiveSave() {
        if (!curNote) return;
        syncCurrentNoteFromDOM();
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(function () {
            IO.save(curNote);
        }, 350);
    }

    function saveCurrentNoteAndSync(showMsg) {
        if (!curNote) return Promise.resolve();
        syncCurrentNoteFromDOM();
        return IO.save(curNote).then(function () {
            return IO.syncToMediaStore(curNote, deps);
        }).then(function () {
            if (showMsg && deps && deps.toast) {
                deps.toast('«' + curNote.title + '» guardada en Libros y notas');
            }
        });
    }

    // Pinta la lista de notas guardadas
    function renderNotesList() {
        if (!ov) return;
        var grid = ov.querySelector('#np-docs-grid');
        IO.list().then(function (arr) {
            notes = arr || [];
            if (!notes.length) {
                grid.innerHTML = '<div class="tribal-empty-mini">' +
                    '<p>Aún no hay notas. Toca «+ Nueva nota» para crear la primera.</p></div>';
                return;
            }
            grid.innerHTML = notes.map(function (n) {
                var prev = String(n.text || '').replace(/\s+/g, ' ').slice(0, 120) || 'Sin texto adicional…';
                return '<div class="np-doc-card" data-id="' + esc(n.id) + '">' +
                    '<div class="np-doc-ico"><i class="bi bi-file-earmark-richtext"></i></div>' +
                    '<div class="np-doc-body">' +
                        '<strong class="np-doc-title">' + esc(n.title || 'Sin título') + '</strong>' +
                        '<p class="np-doc-prev">' + esc(prev) + '</p>' +
                        '<div class="np-doc-dates">' +
                            '<span>Creado: ' + esc(IO.fmtDateTime(n.createdAt)) + '</span>' +
                            '<span>Actualizado: ' + esc(IO.fmtDateTime(n.updatedAt)) + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<button type="button" class="tribal-ctrl np-doc-more" data-more="' + esc(n.id) + '" title="Opciones">' +
                        '<i class="bi bi-three-dots-vertical"></i>' +
                    '</button>' +
                '</div>';
            }).join('');
        });
    }

    function showListView() {
        if (!ov) return;
        ov.querySelector('#np-list-view').hidden = false;
        ov.querySelector('#np-edit-view').hidden = true;
        ov.querySelector('#np-new-btn').hidden = false;
        ov.querySelector('#np-save-btn').hidden = true;
        ov.querySelector('#np-read-btn').hidden = true;
        ov.querySelector('#np-head-title').textContent = 'Bloc de notas';
        ov.querySelector('#np-back-lbl').textContent = 'Volver';
        curNote = null;
        renderNotesList();
    }

    function openNoteEditor(note) {
        if (!ov) return;
        try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}
        var now = Date.now();
        curNote = note || {
            id: uid(),
            title: '',
            html: '<p><br></p>',
            text: '',
            createdAt: now,
            updatedAt: now,
            lineHeight: '1.5',
            letterSpacing: '0px'
        };
        ov.querySelector('#np-list-view').hidden = true;
        ov.querySelector('#np-edit-view').hidden = false;
        ov.querySelector('#np-toolbar').hidden = false;
        ov.querySelector('#np-new-btn').hidden = true;
        ov.querySelector('#np-save-btn').hidden = false;
        ov.querySelector('#np-read-btn').hidden = false;
        ov.querySelector('#np-read-btn').innerHTML = '<i class="bi bi-arrows-fullscreen"></i> Texto completo';
        ov.querySelector('#np-head-title').textContent = 'Editor en vivo';
        ov.querySelector('#np-back-lbl').textContent = 'Notas';

        var titleEl = ov.querySelector('#np-title');
        var canvasEl = ov.querySelector('#np-canvas');
        titleEl.textContent = curNote.title || '';
        canvasEl.innerHTML = curNote.html || '<p><br></p>';
        var lhVal = curNote.lineHeight || '1.5';
        canvasEl.style.lineHeight = LH_CSS[lhVal] || lhVal;
        canvasEl.style.letterSpacing = curNote.letterSpacing || '0px';
        var ddLh = ov.querySelector('#np-dd-lh');
        if (ddLh) ddLh.value = lhVal;
        ov.querySelector('#np-ls-lbl').textContent = curNote.letterSpacing || '0px';
        ov.querySelector('#np-ts-created').textContent = IO.fmtDateTime(curNote.createdAt);
        ov.querySelector('#np-ts-updated').textContent = IO.fmtDateTime(curNote.updatedAt);

        undoStack = [canvasEl.innerHTML];
        redoStack = [];
        rebindMediaWraps();
    }

    function openDocContextMenu(note) {
        if (!note || !ov) return;
        ctxNote = note;
        ov.querySelector('#np-doc-menu-title').textContent = note.title || 'Documento';
        ov.querySelector('#np-doc-menu').hidden = false;
    }

    function wireEvents() {
        var canvas = ov.querySelector('#np-canvas');
        var titleEl = ov.querySelector('#np-title');

        // Evitar perder selección al pulsar botones de la barra WYSIWYG
        ov.querySelector('#np-toolbar').addEventListener('mousedown', function (e) {
            if (e.target.closest('button')) e.preventDefault();
        });

        ['keyup', 'mouseup', 'touchend'].forEach(function (ev) {
            canvas.addEventListener(ev, saveSelection);
        });

        titleEl.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                canvas.focus();
            }
        });
        titleEl.addEventListener('input', scheduleLiveSave);
        canvas.addEventListener('keydown', function (e) {
            if ((e.key === ' ' || e.key === 'Enter' || e.key === ',' || e.key === '.') &&
                window.TribalNotepadWords) {
                var sel = window.getSelection && window.getSelection();
                if (sel && sel.rangeCount && sel.isCollapsed) {
                    var r = sel.getRangeAt(0);
                    var nd = r.startContainer;
                    if (nd && nd.nodeType === 3) {
                        var before = nd.nodeValue.slice(0, r.startOffset);
                        var m = /([A-Za-zÁÉÍÓÚáéíóúñÑüÜ]{2,})$/.exec(before);
                        if (m) {
                            var orig = m[1];
                            var fixed = window.TribalNotepadWords.autocorrectWord(orig);
                            if (fixed && fixed !== orig) {
                                var start = r.startOffset - orig.length;
                                nd.nodeValue = before.slice(0, start) + fixed +
                                    nd.nodeValue.slice(r.startOffset);
                                var nr = document.createRange();
                                nr.setStart(nd, start + fixed.length);
                                nr.collapse(true);
                                sel.removeAllRanges();
                                sel.addRange(nr);
                            }
                        }
                    }
                }
            }
        });
        canvas.addEventListener('input', function () {
            pushHistory();
            scheduleLiveSave();
        });

        // Botón Volver y Guardar
        ov.querySelector('#np-back').addEventListener('click', function () {
            if (!ov.querySelector('#np-edit-view').hidden && curNote) {
                saveCurrentNoteAndSync(true).then(showListView);
                return;
            }
            close();
        });
        ov.querySelector('#np-save-btn').addEventListener('click', function () {
            saveCurrentNoteAndSync(true).then(showListView);
        });
        ov.querySelector('#np-read-btn').addEventListener('click', function () {
            var tb = ov.querySelector('#np-toolbar');
            tb.hidden = !tb.hidden;
            this.innerHTML = tb.hidden
                ? '<i class="bi bi-sliders"></i> Mostrar herramientas'
                : '<i class="bi bi-arrows-fullscreen"></i> Texto completo';
        });
        ov.querySelector('#np-new-btn').addEventListener('click', function () {
            openNoteEditor(null);
        });

        // Deseleccionar elemento multimedia al tocar texto del lienzo
        canvas.addEventListener('pointerdown', function (e) {
            if (!e.target.closest('.np-img-wrap')) {
                ov.querySelectorAll('.np-img-wrap.np-sel').forEach(function (w) {
                    w.classList.remove('np-sel');
                });
                activeWrap = null;
            }
        });

        // Dropdowns de Títulos, Alineación, Mayús/Minús e Interlineado
        ov.querySelector('#np-dd-block').addEventListener('change', function () {
            var v = this.value;
            this.value = '';
            if (!v) return;
            canvas.focus();
            restoreSelection();
            document.execCommand('formatBlock', false, '<' + v + '>');
            pushHistory();
            scheduleLiveSave();
        });
        ov.querySelector('#np-dd-align').addEventListener('change', function () {
            var v = this.value;
            this.value = '';
            if (!v) return;
            applyAlignment(v);
        });
        ov.querySelector('#np-dd-case').addEventListener('change', function () {
            var v = this.value;
            this.value = '';
            if (!v) return;
            transformSelectedCase(v);
        });
        ov.querySelector('#np-dd-lh').addEventListener('change', function () {
            if (!this.value) return;
            applyLineHeight(this.value);
        });

        // Barra de herramientas WYSIWYG
        ov.querySelector('#np-toolbar').addEventListener('click', function (e) {
            var btn = e.target.closest('button');
            if (!btn) return;
            var cmd = btn.getAttribute('data-cmd');
            var block = btn.getAttribute('data-block');
            var align = btn.getAttribute('data-align');
            var tcase = btn.getAttribute('data-case');
            var act = btn.getAttribute('data-act');
            var exp = btn.getAttribute('data-exp');

            if (cmd) {
                if (cmd === 'undo') return doUndo();
                if (cmd === 'redo') return doRedo();
                canvas.focus();
                restoreSelection();
                document.execCommand(cmd, false, null);
                pushHistory();
                scheduleLiveSave();
                return;
            }
            if (block) {
                canvas.focus();
                restoreSelection();
                document.execCommand('formatBlock', false, '<' + block + '>');
                pushHistory();
                scheduleLiveSave();
                return;
            }
            if (align) {
                applyAlignment(align);
                return;
            }
            if (tcase) {
                transformSelectedCase(tcase);
                return;
            }
            if (exp) {
                syncCurrentNoteFromDOM();
                IO.save(curNote).then(function () {
                    if (exp === 'pdf') IO.exportPdf(curNote, deps);
                    else if (exp === 'txt') IO.exportTxt(curNote, deps);
                    else if (exp === 'wa') IO.shareWhatsApp(curNote);
                });
                return;
            }
            if (act === 'code') {
                canvas.focus();
                restoreSelection();
                var selTxt = (window.getSelection && window.getSelection().toString()) || 'código';
                document.execCommand('insertHTML', false,
                    '<code class="np-code">' + esc(selTxt) + '</code>&nbsp;');
                pushHistory();
                scheduleLiveSave();
                return;
            }
            if (act === 'quote') {
                canvas.focus();
                restoreSelection();
                document.execCommand('formatBlock', false, '<blockquote>');
                pushHistory();
                scheduleLiveSave();
                return;
            }
            if (act === 'hr') {
                var hr = document.createElement('hr');
                hr.className = 'np-hr';
                insertNodeAtCursor(hr);
                return;
            }
            if (act === 'link') {
                askAirUrl('Agregar hipervínculo', 'https://', function (url) {
                    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
                    var sel = window.getSelection && window.getSelection();
                    if (sel && !sel.isCollapsed) {
                        document.execCommand('createLink', false, url);
                    } else {
                        var a = document.createElement('a');
                        a.href = url;
                        a.target = '_blank';
                        a.rel = 'noopener';
                        a.textContent = url;
                        insertNodeAtCursor(a);
                    }
                    pushHistory();
                    scheduleLiveSave();
                });
                return;
            }
            if (act === 'lh') {
                var curLh = curNote.lineHeight || '1.5';
                var nextLh = LINE_HEIGHTS[(LINE_HEIGHTS.indexOf(curLh) + 1) % LINE_HEIGHTS.length];
                curNote.lineHeight = nextLh;
                canvas.style.lineHeight = nextLh;
                ov.querySelector('#np-lh-lbl').textContent = nextLh;
                scheduleLiveSave();
                return;
            }
            if (act === 'ls') {
                var curLs = curNote.letterSpacing || '0px';
                var nextLs = LETTER_SPACINGS[(LETTER_SPACINGS.indexOf(curLs) + 1) % LETTER_SPACINGS.length];
                curNote.letterSpacing = nextLs;
                canvas.style.letterSpacing = nextLs;
                ov.querySelector('#np-ls-lbl').textContent = nextLs;
                scheduleLiveSave();
                return;
            }
            if (act === 'img-dev') {
                saveSelection();
                ov.querySelector('#np-file-img').click();
                return;
            }
            if (act === 'img-url') {
                askAirUrl('URL de imagen de Internet', 'https://', function (url) {
                    var wrap = createMediaWrap('<img src="' + esc(url) + '" alt="">', 'image');
                    insertNodeAtCursor(wrap);
                });
                return;
            }
            if (act === 'aud-dev') {
                saveSelection();
                ov.querySelector('#np-file-aud').click();
                return;
            }
            if (act === 'vid-dev') {
                saveSelection();
                ov.querySelector('#np-file-vid').click();
                return;
            }
            if (act === 'vid-net') {
                askAirUrl('Enlace de YouTube o Facebook', 'https://', function (url) {
                    var emb = parseEmbedUrl(url);
                    if (emb) {
                        var wrap = createMediaWrap(
                            '<div class="np-embed-box"><iframe src="' + esc(emb.src) + '" ' +
                            'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ' +
                            'allowfullscreen></iframe></div>' +
                            '<a class="np-media-link" href="' + esc(emb.url) + '" target="_blank" rel="noopener">' +
                            esc(emb.url) + '</a>', emb.kind);
                        insertNodeAtCursor(wrap);
                    } else {
                        var wrap2 = createMediaWrap(
                            '<video src="' + esc(url) + '" controls playsinline></video>', 'video');
                        insertNodeAtCursor(wrap2);
                    }
                });
                return;
            }
            if (act === 'song-tribu') {
                saveSelection();
                openSongPicker();
                return;
            }
            if (act === 'autocorrect') {
                if (!window.TribalNotepadWords) return;
                canvas.focus();
                restoreSelection();
                var sel0 = window.getSelection && window.getSelection();
                if (sel0 && sel0.rangeCount && !sel0.isCollapsed) {
                    var fixedSel = window.TribalNotepadWords.autocorrectText(sel0.toString());
                    document.execCommand('insertText', false, fixedSel);
                } else {
                    var walk = document.createTreeWalker(canvas, NodeFilter.SHOW_TEXT, null, false);
                    var tn;
                    while ((tn = walk.nextNode())) {
                        tn.nodeValue = window.TribalNotepadWords.autocorrectText(tn.nodeValue);
                    }
                    titleEl.textContent = window.TribalNotepadWords.autocorrectText(titleEl.textContent);
                }
                pushHistory();
                scheduleLiveSave();
                if (deps && deps.toast) deps.toast('Ortografía corregida');
                return;
            }
            if (act === 'synonyms') {
                if (!window.TribalNotepadWords) return;
                saveSelection();
                var wordToLookup = '';
                var sel = window.getSelection && window.getSelection();
                var r = (sel && sel.rangeCount && canvas.contains(sel.getRangeAt(0).commonAncestorContainer))
                    ? sel.getRangeAt(0) : savedRange;

                if (r && !r.collapsed) {
                    wordToLookup = r.toString().trim().split(/\s+/)[0];
                    savedRange = r.cloneRange();
                } else if (r && r.startContainer && r.startContainer.nodeType === 3) {
                    var txt = r.startContainer.nodeValue || '';
                    var off = r.startOffset;
                    var left = txt.slice(0, off).match(/[A-Za-zÁÉÍÓÚáéíóúñÑüÜ]+$/);
                    var right = txt.slice(off).match(/^[A-Za-zÁÉÍÓÚáéíóúñÑüÜ]+/);
                    var sIdx = left ? off - left[0].length : off;
                    var eIdx = right ? off + right[0].length : off;
                    if (eIdx > sIdx) {
                        var wr = document.createRange();
                        wr.setStart(r.startContainer, sIdx);
                        wr.setEnd(r.startContainer, eIdx);
                        savedRange = wr;
                        wordToLookup = txt.slice(sIdx, eIdx);
                    }
                }
                if (!wordToLookup) {
                    var walkW = document.createTreeWalker(canvas, NodeFilter.SHOW_TEXT, null, false);
                    var lastN = null, curN;
                    while ((curN = walkW.nextNode())) {
                        if (/[A-Za-zÁÉÍÓÚáéíóúñÑüÜ]{2,}/.test(curN.nodeValue)) lastN = curN;
                    }
                    if (lastN) {
                        var mm = /([A-Za-zÁÉÍÓÚáéíóúñÑüÜ]{2,})\s*$/.exec(lastN.nodeValue);
                        if (mm) {
                            var wr2 = document.createRange();
                            var st2 = lastN.nodeValue.lastIndexOf(mm[1]);
                            wr2.setStart(lastN, st2);
                            wr2.setEnd(lastN, st2 + mm[1].length);
                            savedRange = wr2;
                            wordToLookup = mm[1];
                        }
                    }
                }
                openSynModal(wordToLookup);
            }
        });

        function renderSynResults(word) {
            var synList = ov.querySelector('#np-syn-list');
            var clean = String(word || '').trim().split(/\s+/)[0];
            if (!clean) {
                synList.innerHTML = '<p class="np-hint">Escribe arriba una palabra para ver sus sinónimos y tocar para insertarlo.</p>';
                return;
            }
            window.TribalNotepadWords.synonymsFor(clean).then(function (arr) {
                if (!arr || !arr.length) {
                    synList.innerHTML = '<p class="np-hint">Sin sinónimos registrados para «' + esc(clean) + '». Prueba con otra palabra (ej. bueno, grande, rápido, bonito, hablar, crear, casa, música…).</p>';
                    return;
                }
                synList.innerHTML = arr.map(function (s) {
                    return '<button type="button" data-syn="' + esc(s) + '">' +
                        '<i class="bi bi-arrow-left-right"></i> ' + esc(s) + '</button>';
                }).join('');
            });
        }

        function openSynModal(word) {
            var synModal = ov.querySelector('#np-syn-modal');
            var searchBox = ov.querySelector('#np-syn-search');
            searchBox.textContent = word || '';
            synModal.hidden = false;
            renderSynResults(word || '');
            if (!word) setTimeout(function () { searchBox.focus(); }, 30);
        }

        ov.querySelector('#np-syn-search').addEventListener('input', function () {
            renderSynResults(this.innerText || this.textContent || '');
        });

        ov.querySelector('#np-syn-modal').addEventListener('click', function (e) {
            if (e.target.id === 'np-syn-modal' || e.target.id === 'np-syn-close') {
                ov.querySelector('#np-syn-modal').hidden = true;
                return;
            }
            var b = e.target.closest('[data-syn]');
            if (!b) return;
            var rep = b.getAttribute('data-syn');
            ov.querySelector('#np-syn-modal').hidden = true;
            canvas.focus();
            if (savedRange) {
                var sel = window.getSelection && window.getSelection();
                if (sel) {
                    sel.removeAllRanges();
                    sel.addRange(savedRange);
                }
                savedRange.deleteContents();
                var tn = document.createTextNode(rep);
                savedRange.insertNode(tn);
                savedRange.setStartAfter(tn);
                savedRange.collapse(true);
                if (sel) {
                    sel.removeAllRanges();
                    sel.addRange(savedRange);
                }
            } else {
                document.execCommand('insertText', false, rep);
            }
            pushHistory();
            scheduleLiveSave();
        });

        // Archivos locales (imagen, audio, video del dispositivo)
        ov.querySelector('#np-file-img').addEventListener('change', function () {
            var f = this.files && this.files[0];
            this.value = '';
            if (!f) return;
            var reader = new FileReader();
            reader.onload = function () {
                var wrap = createMediaWrap('<img src="' + reader.result + '" alt="' + esc(f.name) + '">', 'image');
                insertNodeAtCursor(wrap);
            };
            reader.readAsDataURL(f);
        });
        ov.querySelector('#np-file-aud').addEventListener('change', function () {
            var f = this.files && this.files[0];
            this.value = '';
            if (!f) return;
            var reader = new FileReader();
            reader.onload = function () {
                var wrap = createMediaWrap(
                    '<div class="np-audio-card"><i class="bi bi-music-note-beamed"></i>' +
                    '<span>' + esc(f.name) + '</span>' +
                    '<audio src="' + reader.result + '" controls></audio></div>', 'audio');
                insertNodeAtCursor(wrap);
            };
            reader.readAsDataURL(f);
        });
        ov.querySelector('#np-file-vid').addEventListener('change', function () {
            var f = this.files && this.files[0];
            this.value = '';
            if (!f) return;
            var reader = new FileReader();
            reader.onload = function () {
                var wrap = createMediaWrap(
                    '<video src="' + reader.result + '" controls playsinline></video>', 'video');
                insertNodeAtCursor(wrap);
            };
            reader.readAsDataURL(f);
        });

        // Menú contextual de imagen/elemento multimedia
        ov.querySelector('#np-img-menu').addEventListener('click', function (e) {
            if (e.target.id === 'np-img-menu' || e.target.id === 'np-im-close') {
                ov.querySelector('#np-img-menu').hidden = true;
                return;
            }
            var b = e.target.closest('[data-im]');
            if (b) handleMediaMenuAction(b.getAttribute('data-im'));
        });

        // Lista de documentos: tap corto = abrir, long-press = menú contextual
        var docsGrid = ov.querySelector('#np-docs-grid');
        var lpDocT = null, lpDocId = null, lpFired = false, dx0 = 0, dy0 = 0;

        docsGrid.addEventListener('pointerdown', function (e) {
            var more = e.target.closest('[data-more]');
            if (more) return;
            var card = e.target.closest('.np-doc-card');
            if (!card) return;
            lpDocId = card.getAttribute('data-id');
            lpFired = false;
            dx0 = e.clientX; dy0 = e.clientY;
            clearTimeout(lpDocT);
            lpDocT = setTimeout(function () {
                lpFired = true;
                var n = notes.filter(function (x) { return x.id === lpDocId; })[0];
                if (n) openDocContextMenu(n);
            }, 460);
        });
        docsGrid.addEventListener('pointermove', function (e) {
            if (lpDocT && (Math.abs(e.clientX - dx0) > 10 || Math.abs(e.clientY - dy0) > 10)) {
                clearTimeout(lpDocT);
                lpDocT = null;
            }
        });
        ['pointerup', 'pointercancel'].forEach(function (ev) {
            docsGrid.addEventListener(ev, function () {
                clearTimeout(lpDocT);
                lpDocT = null;
            });
        });
        docsGrid.addEventListener('contextmenu', function (e) {
            var card = e.target.closest('.np-doc-card');
            if (!card) return;
            e.preventDefault();
            clearTimeout(lpDocT);
            var id = card.getAttribute('data-id');
            var n = notes.filter(function (x) { return x.id === id; })[0];
            if (n) openDocContextMenu(n);
        });
        docsGrid.addEventListener('click', function (e) {
            var more = e.target.closest('[data-more]');
            if (more) {
                e.stopPropagation();
                var id = more.getAttribute('data-more');
                var n = notes.filter(function (x) { return x.id === id; })[0];
                if (n) openDocContextMenu(n);
                return;
            }
            if (lpFired) { lpFired = false; return; }
            var card = e.target.closest('.np-doc-card');
            if (!card) return;
            var cid = card.getAttribute('data-id');
            var note = notes.filter(function (x) { return x.id === cid; })[0];
            if (note) openNoteEditor(note);
        });

        // Menú contextual de documento guardado
        ov.querySelector('#np-doc-menu').addEventListener('click', function (e) {
            if (e.target.id === 'np-doc-menu' || e.target.id === 'np-dm-close') {
                ov.querySelector('#np-doc-menu').hidden = true;
                return;
            }
            var b = e.target.closest('[data-dm]');
            if (!b || !ctxNote) return;
            var act = b.getAttribute('data-dm');
            var targetNote = ctxNote;
            ov.querySelector('#np-doc-menu').hidden = true;
            if (act === 'edit') {
                openNoteEditor(targetNote);
            } else if (act === 'wa') {
                IO.shareWhatsApp(targetNote);
            } else if (act === 'txt') {
                IO.exportTxt(targetNote, deps);
            } else if (act === 'pdf') {
                IO.exportPdf(targetNote, deps);
            } else if (act === 'bt') {
                IO.shareBluetooth(targetNote, deps);
            } else if (act === 'del') {
                var doDel = function () {
                    IO.remove(targetNote.id).then(function () {
                        return IO.removeFromMediaStore(targetNote.id, deps);
                    }).then(function () {
                        if (deps && deps.toast) deps.toast('Nota eliminada');
                        renderNotesList();
                    });
                };
                if (deps && deps.confirm) {
                    deps.confirm('Eliminar nota',
                        '¿Eliminar «' + (targetNote.title || 'Nota') + '»?',
                        'Eliminar', doDel);
                } else {
                    doDel();
                }
            }
        });

        // Cerrar picker de canciones de la tribu
        ov.querySelector('#np-song-close').addEventListener('click', function () {
            ov.querySelector('#np-song-picker').hidden = true;
        });
    }

    function openSongPicker() {
        var modal = ov.querySelector('#np-song-picker');
        var listBox = ov.querySelector('#np-song-list');
        var audios = ((deps && deps.items) || []).filter(function (m) {
            return m.kind === 'audio';
        });
        if (!audios.length) {
            listBox.innerHTML = '<p class="np-hint">No hay canciones en la tribu aún.</p>';
        } else {
            listBox.innerHTML = audios.map(function (m) {
                return '<button type="button" class="np-song-row" data-sid="' + esc(m.id) + '">' +
                    '<i class="bi bi-music-note-beamed"></i>' +
                    '<span>' + esc(m.name) + '</span>' +
                '</button>';
            }).join('');
        }
        listBox.onclick = function (e) {
            var row = e.target.closest('[data-sid]');
            if (!row) return;
            var id = row.getAttribute('data-sid');
            var m = audios.filter(function (x) { return x.id === id; })[0];
            if (!m || !deps || !deps.urlFor) return;
            modal.hidden = true;
            deps.urlFor(m, function (u) {
                if (!u) return;
                var wrap = createMediaWrap(
                    '<div class="np-audio-card"><i class="bi bi-music-note-beamed"></i>' +
                    '<span>' + esc(m.name) + '</span>' +
                    '<audio src="' + esc(u) + '" data-tribu-id="' + esc(m.id) + '" controls></audio></div>',
                    'audio');
                insertNodeAtCursor(wrap);
            });
        };
        modal.hidden = false;
    }

    function open(d, initialNoteId) {
        deps = d || {};
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = document.createElement('div');
        ov.className = 'tribal-overlay tribal-p2p-ov np-overlay';
        ov.innerHTML = buildHtml();
        (deps.mount || document.body).appendChild(ov);
        wireEvents();
        if (initialNoteId) {
            IO.getById(initialNoteId).then(function (n) {
                if (n) openNoteEditor(n);
                else showListView();
            });
        } else {
            showListView();
        }
    }

    function openContextMenuForNoteId(noteId, d) {
        deps = d || deps || {};
        IO.getById(noteId).then(function (n) {
            if (!n) return;
            open(deps);
            setTimeout(function () { openDocContextMenu(n); }, 60);
        });
    }

    function close() {
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = null;
        curNote = null;
        activeWrap = null;
    }

    return {
        open: open,
        close: close,
        openContextMenuForNoteId: openContextMenuForNoteId
    };
})();
