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
    var searchQuery = '';
    var currentPage = 0;
    var PER_PAGE = 10;
    var CRASH_KEY = 'tribu_np_crash_draft_v1';
    var OPEN_ID_KEY = 'tribu_np_open_id_v1';

    var LINE_HEIGHTS = ['-2', '-1.5', '-1.25', '1', '1.25', '1.5', '2'];
    var LH_CSS = {
        '-2': '0.4',     // casi una línea entera debajo de la otra
        '-1.5': '0.85',  // base inferior pegada a la base superior
        '-1.25': '0.95', // apenas el grosor de una línea HR de aire
        '1': '1.0',      // muy pocos píxeles
        '1.25': '1.35',  // separación normal
        '1.5': '1.65',   // un poco más
        '2': '2.1'       // separación amplia
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
        ensureFooterSpace();
    }

    // Nada puede cubrir el pie de página: los elementos libres empujan el lienzo
    function ensureFooterSpace() {
        var canvas = ov && ov.querySelector('#np-canvas');
        if (!canvas) return;
        var max = 0;
        canvas.querySelectorAll('.np-img-wrap.np-free').forEach(function (w) {
            var hh = w.offsetHeight || 0, ww = w.offsetWidth || 0;
            var rad = Math.abs(parseFloat(w.getAttribute('data-rot') || '0')) % 180 * Math.PI / 180;
            var rh = hh * Math.cos(rad) + ww * Math.sin(rad); // alto real tras rotar
            var bottom = (w.offsetTop || 0) + Math.max(hh, rh);
            if (bottom > max) max = bottom;
        });
        canvas.style.minHeight = max ? Math.ceil(max + 60) + 'px' : '';
    }

    // Construye el HTML de la ventana completa del Bloc de Notas (sin <input> de texto)
    function buildHtml() {
        return '<div class="tribal-p2p tribal-links np-root">' +
            '<div class="tribal-p2p-head np-head">' +
                '<button class="tribal-ctrl lk-back" id="np-back" title="Volver">' +
                    '<i class="bi bi-arrow-left"></i><span id="np-back-lbl">Volver</span></button>' +
                '<div class="np-head-center">' +
                    '<i class="bi bi-journal-richtext" id="np-head-ico" title="Bloc de notas"></i>' +
                    '<strong id="np-head-title">Bloc de notas</strong>' +
                '</div>' +
                '<div class="np-head-acts">' +
                    '<button class="tribal-btn tribal-btn-xs primary" id="np-new-btn" title="Nueva nota">' +
                        '<i class="bi bi-plus-lg"></i><span>Nueva nota</span></button>' +
                    '<button class="tribal-ctrl np-icon-only" id="np-read-btn" hidden title="Texto completo / Herramientas">' +
                        '<i class="bi bi-arrows-fullscreen"></i></button>' +
                '</div>' +
            '</div>' +

            '<!-- VISTA 1: LISTA DE DOCUMENTOS CON BUSCADOR EN VIVO Y PAGINACIÓN DE 10 -->' +
            '<div class="lk-body np-list-view" id="np-list-view">' +
                '<div class="np-search-bar">' +
                    '<i class="bi bi-search"></i>' +
                    '<div id="np-note-search" class="np-search-air" contenteditable="true" ' +
                        'data-placeholder="Buscar en vivo por nombre, palabras, contenido, canciones, enlaces o fecha…"></div>' +
                    '<button type="button" class="tribal-ctrl np-search-clear" id="np-search-clear" title="Limpiar búsqueda" hidden>' +
                        '<i class="bi bi-x-lg"></i></button>' +
                '</div>' +
                '<p class="np-hint">Toca una nota para leer/editar en vivo · ' +
                    'Mantén presionado (long-press) para Editar, Eliminar o Compartir (WhatsApp, TXT, PDF, Bluetooth)</p>' +
                '<div class="np-docs-grid" id="np-docs-grid"></div>' +
                '<div class="np-pager" id="np-pager" hidden>' +
                    '<button type="button" class="tribal-btn tribal-btn-xs" id="np-prev-page"><i class="bi bi-chevron-left"></i> Anterior</button>' +
                    '<span id="np-page-info">Página 1 / 1</span>' +
                    '<button type="button" class="tribal-btn tribal-btn-xs" id="np-next-page">Siguiente <i class="bi bi-chevron-right"></i></button>' +
                '</div>' +
            '</div>' +

            '<!-- VISTA 2: EDITOR WYSIWYG EN VIVO AL AIRE (ARCHIVO COMPLETO SIN CARD) -->' +
            '<section class="np-edit-view" id="np-edit-view" hidden>' +
                '<nav class="np-toolbar" id="np-toolbar">' +
                    '<div class="np-tb-main">' +
                    '<div class="np-tb-group">' +
                        '<button type="button" class="np-tbtn np-disk-btn" data-act="save-disk" title="Guardar nota"><i class="bi bi-floppy-fill"></i></button>' +
                        '<button type="button" class="np-tbtn" id="np-fav-btn" data-act="fav-note" title="Favorito (fijar siempre arriba)"><i class="bi bi-star"></i></button>' +
                        '<button type="button" class="np-tbtn" data-cmd="undo" title="Deshacer"><i class="bi bi-arrow-counterclockwise"></i></button>' +
                        '<button type="button" class="np-tbtn" data-cmd="redo" title="Rehacer"><i class="bi bi-arrow-clockwise"></i></button>' +
                        '<button type="button" class="np-tbtn np-del-xbtn" data-act="del-sel" title="Eliminar elemento o texto seleccionado (✕)"><i class="bi bi-x-lg"></i></button>' +
                    '</div>' +
                    '<div class="np-tb-group">' +
                        '<button type="button" class="np-tbtn" data-cmd="bold" title="Negrita"><i class="bi bi-type-bold"></i></button>' +
                        '<button type="button" class="np-tbtn" data-cmd="italic" title="Itálica"><i class="bi bi-type-italic"></i></button>' +
                        '<button type="button" class="np-tbtn" data-cmd="underline" title="Subrayado"><i class="bi bi-type-underline"></i></button>' +
                        '<button type="button" class="np-tbtn" data-act="quote" title="Cita"><i class="bi bi-chat-quote"></i></button>' +
                        '<select class="np-dd" id="np-dd-align" title="Alinear elementos seleccionados">' +
                            '<option value="">Alinear…</option>' +
                            '<option value="left">Izquierda</option>' +
                            '<option value="center">Centrar</option>' +
                            '<option value="right">Derecha</option>' +
                            '<option value="justify">Justificado</option>' +
                        '</select>' +
                        '<button type="button" class="np-tbtn np-tb-more" id="np-tb-more" ' +
                            'title="Más herramientas"><i class="bi bi-chevron-down"></i></button>' +
                    '</div>' +
                    '</div>' +
                    '<div class="np-tb-extra" id="np-tb-extra" hidden>' +
                    '<div class="np-tb-group">' +
                        '<button type="button" class="np-tbtn" data-cmd="strikeThrough" title="Tachado"><i class="bi bi-type-strikethrough"></i></button>' +
                        '<button type="button" class="np-tbtn" data-act="code" title="Código"><i class="bi bi-code-slash"></i></button>' +
                        '<button type="button" class="np-tbtn" data-act="link" title="Agregar hipervínculo"><i class="bi bi-link-45deg"></i></button>' +
                        '<button type="button" class="np-tbtn" data-act="hr" title="Línea horizontal"><i class="bi bi-hr"></i></button>' +
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
                        '<button type="button" class="np-tbtn" data-act="autocorrect" title="Ortografía y diccionario personal"><i class="bi bi-spellcheck"></i> Ortografía</button>' +
                        '<button type="button" class="np-tbtn" data-act="synonyms" title="Sinónimos de la palabra seleccionada"><i class="bi bi-book"></i> Sinónimos</button>' +
                    '</div>' +
                    '<div class="np-tb-group">' +
                        '<button type="button" class="np-tbtn" data-act="img-dev" title="Imagen del dispositivo"><i class="bi bi-image"></i></button>' +
                        '<button type="button" class="np-tbtn" data-act="img-url" title="Imagen de Internet"><i class="bi bi-globe2"></i></button>' +
                        '<button type="button" class="np-tbtn" data-act="song-tribu" title="Agregar canción de la tribu"><i class="bi bi-music-note-beamed"></i></button>' +
                        '<button type="button" class="np-tbtn" data-act="aud-dev" title="Audio del dispositivo"><i class="bi bi-file-earmark-music"></i></button>' +
                        '<button type="button" class="np-tbtn" data-act="vid-dev" title="Video del dispositivo"><i class="bi bi-camera-video"></i></button>' +
                        '<button type="button" class="np-tbtn" data-act="vid-net" title="Video/Audio de YouTube o Facebook"><i class="bi bi-youtube"></i></button>' +
                        '<button type="button" class="np-tbtn" data-exp="pdf" title="Exportar a PDF"><i class="bi bi-file-earmark-pdf"></i> PDF</button>' +
                        '<button type="button" class="np-tbtn" data-exp="txt" title="Exportar a TXT"><i class="bi bi-filetype-txt"></i> TXT</button>' +
                        '<button type="button" class="np-tbtn" data-exp="wa" title="Enviar a WhatsApp"><i class="bi bi-whatsapp"></i></button>' +
                    '</div>' +
                    '</div>' +
                '</nav>' +

                '<!-- ARCHIVO COMPLETO AL AIRE SIN CARD DE FONDO (FECHAS AL PIE) -->' +
                '<main class="np-doc-scroll" id="np-doc-scroll">' +
                    '<h1 id="np-title" class="np-air-title" contenteditable="true" spellcheck="true" lang="es" ' +
                        'data-placeholder="Escribe el título aquí al aire…"></h1>' +
                    '<article id="np-canvas" class="np-air-canvas" contenteditable="true" spellcheck="true" lang="es" ' +
                        'data-placeholder="Escribe tu nota aquí al aire… Mantén presionado cualquier elemento o texto seleccionado para opciones o eliminar."></article>' +
                    '<footer class="np-timestamps np-footer-ts">' +
                        '<span><i class="bi bi-clock"></i> Creado: <b id="np-ts-created">—</b></span>' +
                        '<span><i class="bi bi-clock-history"></i> Modificado: <b id="np-ts-updated">—</b></span>' +
                    '</footer>' +
                '</main>' +
            '</section>' +

            '<!-- MODAL DE ORTOGRAFÍA Y DICCIONARIO PERSONAL -->' +
            '<div class="np-modal-bd" id="np-spell-modal" hidden>' +
                '<div class="np-modal-card">' +
                    '<strong><i class="bi bi-spellcheck"></i> Ortografía y Diccionario Personal</strong>' +
                    '<p class="np-hint" id="np-spell-msg">Corrige toda la nota o guarda palabras y correcciones propias para que se apliquen siempre.</p>' +
                    '<button type="button" class="tribal-btn primary" id="np-spell-runall">' +
                        '<i class="bi bi-magic"></i> Corregir toda la nota ahora</button>' +
                    '<div class="np-spell-add">' +
                        '<div id="np-sp-wrong" class="np-air-urlbox" contenteditable="true" ' +
                            'data-placeholder="Palabra a corregir o guardar (ej. tmb / miPalabra)…"></div>' +
                        '<div id="np-sp-right" class="np-air-urlbox" contenteditable="true" ' +
                            'data-placeholder="Corrección exacta (ej. también / MiPalabra)…"></div>' +
                        '<button type="button" class="tribal-btn primary" id="np-sp-save">' +
                            '<i class="bi bi-plus-circle"></i> Guardar en ortografía</button>' +
                    '</div>' +
                    '<div class="np-song-list" id="np-sp-list"></div>' +
                    '<div class="np-modal-acts">' +
                        '<button type="button" class="tribal-btn" id="np-spell-close">Cerrar</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<!-- MODAL DE CONFIRMACIÓN DE ELIMINACIÓN EN 2 PASOS -->' +
            '<div class="np-modal-bd" id="np-del2-modal" hidden>' +
                '<div class="np-modal-card">' +
                    '<strong id="np-del2-title"><i class="bi bi-exclamation-triangle-fill"></i> Eliminar selección (Paso 1/2)</strong>' +
                    '<p class="np-hint" id="np-del2-msg"></p>' +
                    '<div class="np-modal-acts">' +
                        '<button type="button" class="tribal-btn" id="np-del2-cancel">Cancelar</button>' +
                        '<button type="button" class="tribal-btn danger" id="np-del2-ok">Continuar</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +

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

            '<!-- CHIP DE SUGERENCIA ORTOGRÁFICA JUNTO AL CURSOR -->' +
            '<button type="button" class="np-spell-hint" id="np-spell-hint" hidden></button>' +

            '<!-- MENÚ CONTEXTUAL DE SELECCIÓN (long-press ~1s sobre texto marcado) -->' +
            '<div class="np-selmenu" id="np-selmenu" hidden>' +
                '<div class="np-sm-row">' +
                    '<button type="button" data-sa="bold" class="np-smb" title="Negrita"><i class="bi bi-type-bold"></i></button>' +
                    '<button type="button" data-sa="al:left" title="Izquierda"><i class="bi bi-text-left"></i></button>' +
                    '<button type="button" data-sa="al:center" title="Centrar"><i class="bi bi-text-center"></i></button>' +
                    '<button type="button" data-sa="al:right" title="Derecha"><i class="bi bi-text-right"></i></button>' +
                    '<button type="button" data-sa="al:justify" title="Justificado"><i class="bi bi-justify"></i></button>' +
                    '<button type="button" data-sa="case:upper" title="MAYÚSCULAS">AA</button>' +
                    '<button type="button" data-sa="case:lower" title="minúsculas">aa</button>' +
                    '<button type="button" data-sa="case:title" title="Title Case">Aa</button>' +
                '</div>' +
                '<div class="np-sm-row">' +
                    '<select class="np-sm-dd" id="np-sm-block" title="Párrafo o Título">' +
                        '<option value="">Párrafo / Título…</option>' +
                        '<option value="P">Párrafo normal</option>' +
                        '<option value="H1">Título H1</option>' +
                        '<option value="H2">Título H2</option>' +
                        '<option value="H3">Título H3</option>' +
                        '<option value="H4">Título H4</option>' +
                        '<option value="H5">Título H5</option>' +
                        '<option value="H6">Título H6</option>' +
                    '</select>' +
                '</div>' +
                '<div class="np-sm-row np-sm-lh" title="Interlineado">' +
                    '<span class="np-sm-lbl">↕</span>' +
                    '<button type="button" data-sa="lh:-2">-2</button>' +
                    '<button type="button" data-sa="lh:-1.5">-1.5</button>' +
                    '<button type="button" data-sa="lh:-1.25">-1.25</button>' +
                    '<button type="button" data-sa="lh:1">1</button>' +
                    '<button type="button" data-sa="lh:1.25">1.25</button>' +
                    '<button type="button" data-sa="lh:1.5">1.5</button>' +
                    '<button type="button" data-sa="lh:2">2</button>' +
                '</div>' +
            '</div>' +

            '<!-- MENÚ CONTEXTUAL LONG-PRESS DE DOCUMENTO GUARDADO -->' +
            '<div class="np-modal-bd" id="np-doc-menu" hidden>' +
                '<div class="np-modal-card np-ctx-card">' +
                    '<strong id="np-doc-menu-title">Documento</strong>' +
                    '<div class="np-ctx-grid np-doc-acts">' +
                        '<button type="button" data-dm="edit"><i class="bi bi-pencil-square"></i> Leer / Editar en vivo</button>' +
                        '<button type="button" data-dm="fav"><i class="bi bi-star-fill"></i> <span id="np-dm-fav-lbl">Marcar como Favorita (fijar arriba)</span></button>' +
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

    // Crea un contenedor multimedia (.np-img-wrap) con soporte de long-press, botón ✕ y arrastre libre
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
            '<span class="np-media-badge" title="Opciones del elemento"><i class="bi bi-sliders"></i></span>' +
            '<button type="button" class="np-media-del-x" title="Eliminar este elemento (✕)"><i class="bi bi-x-lg"></i></button>';
        applyWrapTransform(wrap);
        bindWrapEvents(wrap);
        return wrap;
    }

    function bindWrapEvents(wrap) {
        if (wrap._npBound) return;
        wrap._npBound = true;
        var lpT = null, pts = {}, mv = null, pinch = null, dirty = false;

        function nPts() { return Object.keys(pts).length; }
        function interactive(e) {
            return !!(e.target && e.target.closest &&
                e.target.closest('audio,video,iframe,button,input,.np-media-badge,.np-media-del-x'));
        }
        // Barra de tamaño debajo de la imagen (solo visible al seleccionarla)
        var sizeBar = wrap.querySelector('.np-size-bar');
        if (!sizeBar) {
            sizeBar = document.createElement('input');
            sizeBar.type = 'range';
            sizeBar.min = '15'; sizeBar.max = '100';
            sizeBar.className = 'np-size-bar';
            sizeBar.setAttribute('contenteditable', 'false');
            sizeBar.title = 'Tamaño de la imagen';
            wrap.appendChild(sizeBar);
        }
        if (!sizeBar._npBound) {
            sizeBar._npBound = true;
            sizeBar.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
            sizeBar.addEventListener('input', function (e) {
                e.stopPropagation();
                wrap.setAttribute('data-scale', this.value);
                applyWrapTransform(wrap);
                dirty = true;
            });
            sizeBar.addEventListener('change', function () {
                if (dirty) { pushHistory(); scheduleLiveSave(); dirty = false; }
            });
        }
        function ensureFree() {
            if (wrap.getAttribute('data-free') !== '1') {
                wrap.setAttribute('data-free', '1');
                wrap.setAttribute('data-x', String(wrap.offsetLeft));
                wrap.setAttribute('data-y', String(wrap.offsetTop));
                applyWrapTransform(wrap);
            }
        }
        function pairInfo() {
            var ks = Object.keys(pts), a = pts[ks[0]], b = pts[ks[1]];
            return {
                d: Math.max(12, Math.hypot(a.x - b.x, a.y - b.y)),
                ang: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI,
                mx: (a.x + b.x) / 2,
                my: (a.y + b.y) / 2
            };
        }

        wrap.addEventListener('pointerdown', function (e) {
            e.stopPropagation();
            if (ov) {
                ov.querySelectorAll('.np-img-wrap.np-sel').forEach(function (w) {
                    w.classList.remove('np-sel');
                });
            }
            wrap.classList.add('np-sel');
            activeWrap = wrap;
            sizeBar.value = wrap.getAttribute('data-scale') || '70';
            if (interactive(e)) return;
            pts[e.pointerId] = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY };
            try { wrap.setPointerCapture(e.pointerId); } catch (er) {}

            if (nPts() === 1) {
                // Un dedo arrastra la imagen libremente (el scroll va sobre el texto)
                mv = {
                    x: e.clientX, y: e.clientY,
                    ox: parseFloat(wrap.getAttribute('data-x') || wrap.offsetLeft || '16') || 16,
                    oy: parseFloat(wrap.getAttribute('data-y') || wrap.offsetTop || '16') || 16,
                    moved: false
                };
                clearTimeout(lpT);
                lpT = setTimeout(function () {
                    lpT = null;
                    openMediaMenu(wrap);
                }, 520);
            } else if (nPts() === 2) {
                clearTimeout(lpT); lpT = null; mv = null;
                ensureFree();
                var pi = pairInfo();
                pinch = {
                    d: pi.d, ang: pi.ang, mx: pi.mx, my: pi.my,
                    s: parseFloat(wrap.getAttribute('data-scale') || '70') || 70,
                    r: parseFloat(wrap.getAttribute('data-rot') || '0') || 0,
                    x: parseFloat(wrap.getAttribute('data-x') || wrap.offsetLeft || '16') || 16,
                    y: parseFloat(wrap.getAttribute('data-y') || wrap.offsetTop || '16') || 16
                };
            }
        });

        wrap.addEventListener('pointermove', function (e) {
            var p = pts[e.pointerId];
            if (!p) return;
            p.x = e.clientX; p.y = e.clientY;
            if (pinch && nPts() === 2) {
                var pi = pairInfo();
                var ns = Math.max(15, Math.min(100, pinch.s * (pi.d / pinch.d)));
                wrap.setAttribute('data-scale', String(Math.round(ns)));
                wrap.setAttribute('data-rot',
                    String(Math.round(pinch.r + (pi.ang - pinch.ang))));
                wrap.setAttribute('data-x',
                    String(Math.round(pinch.x + pi.mx - pinch.mx)));
                wrap.setAttribute('data-y',
                    String(Math.round(pinch.y + pi.my - pinch.my)));
                applyWrapTransform(wrap);
                dirty = true;
                return;
            }
            if (mv && (mv.moved ||
                Math.abs(e.clientX - mv.x) > 8 || Math.abs(e.clientY - mv.y) > 8)) {
                clearTimeout(lpT); lpT = null;
                ensureFree();
                mv.moved = true;
                wrap.setAttribute('data-x',
                    String(Math.round(Math.max(-40, mv.ox + (e.clientX - mv.x)))));
                wrap.setAttribute('data-y',
                    String(Math.round(Math.max(-40, mv.oy + (e.clientY - mv.y)))));
                applyWrapTransform(wrap);
                dirty = true;
            } else if (lpT &&
                (Math.abs(e.clientX - p.x0) > 10 || Math.abs(e.clientY - p.y0) > 10)) {
                clearTimeout(lpT); lpT = null;
            }
        });

        function endPtr(e) {
            if (e && e.pointerId in pts) delete pts[e.pointerId];
            if (nPts() < 2) pinch = null;
            if (nPts() === 1) {
                // queda un dedo tras el pellizco → re-anclar arrastre
                var id = Object.keys(pts)[0];
                mv = {
                    x: pts[id].x, y: pts[id].y,
                    ox: parseFloat(wrap.getAttribute('data-x') || '16') || 16,
                    oy: parseFloat(wrap.getAttribute('data-y') || '16') || 16,
                    moved: true
                };
            }
            if (nPts() === 0) {
                clearTimeout(lpT); lpT = null;
                if (dirty || (mv && mv.moved)) { pushHistory(); scheduleLiveSave(); }
                mv = null; dirty = false;
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
        var delX = wrap.querySelector('.np-media-del-x');
        if (delX) {
            delX.addEventListener('click', function (e) {
                e.stopPropagation();
                confirmDelete2Steps('este elemento multimedia (' + (wrap.getAttribute('data-kind') || 'media') + ')', function () {
                    if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
                    if (activeWrap === wrap) activeWrap = null;
                    ensureFooterSpace();
                    pushHistory();
                    scheduleLiveSave();
                });
            });
        }
    }

    function rebindMediaWraps() {
        if (!ov) return;
        ov.querySelectorAll('#np-canvas .np-img-wrap').forEach(function (w) {
            if (!w.querySelector('.np-media-del-x')) {
                var bx = document.createElement('button');
                bx.type = 'button';
                bx.className = 'np-media-del-x';
                bx.title = 'Eliminar este elemento (✕)';
                bx.innerHTML = '<i class="bi bi-x-lg"></i>';
                w.appendChild(bx);
            }
            applyWrapTransform(w);
            bindWrapEvents(w);
        });
    }

    // Modal de confirmación en 2 pasos para eliminar cualquier detalle seleccionado
    function confirmDelete2Steps(desc, onConfirm) {
        if (!ov) return;
        var modal = ov.querySelector('#np-del2-modal');
        var title = ov.querySelector('#np-del2-title');
        var msg = ov.querySelector('#np-del2-msg');
        var okBtn = ov.querySelector('#np-del2-ok');
        var cancelBtn = ov.querySelector('#np-del2-cancel');
        var step = 1;

        function renderStep() {
            if (step === 1) {
                title.innerHTML = '<i class="bi bi-exclamation-triangle-fill"></i> Confirmar eliminación (Paso 1/2)';
                msg.textContent = '¿Quieres eliminar ' + (desc || 'el detalle seleccionado') + ' de la nota?';
                okBtn.textContent = 'Continuar →';
            } else {
                title.innerHTML = '<i class="bi bi-trash3-fill"></i> Confirmación final (Paso 2/2)';
                msg.textContent = 'Último paso: se eliminará definitivamente ' + (desc || 'el detalle seleccionado') + '. ¿Confirmar?';
                okBtn.textContent = 'Sí, eliminar ahora';
            }
        }
        renderStep();
        modal.hidden = false;

        okBtn.onclick = function () {
            if (step === 1) {
                step = 2;
                renderStep();
            } else {
                modal.hidden = true;
                onConfirm();
            }
        };
        cancelBtn.onclick = function () {
            modal.hidden = true;
        };
    }

    function deleteSelectedDetail() {
        if (!ov) return;
        var canvas = ov.querySelector('#np-canvas');
        if (activeWrap && activeWrap.classList.contains('np-sel') && canvas.contains(activeWrap)) {
            var targetW = activeWrap;
            confirmDelete2Steps('el elemento multimedia seleccionado', function () {
                if (targetW.parentNode) targetW.parentNode.removeChild(targetW);
                activeWrap = null;
                pushHistory();
                scheduleLiveSave();
            });
            return;
        }
        restoreSelection();
        var sel = window.getSelection && window.getSelection();
        var r = (sel && sel.rangeCount && canvas.contains(sel.getRangeAt(0).commonAncestorContainer))
            ? sel.getRangeAt(0) : savedRange;
        if (r && !r.collapsed) {
            var rClone = r.cloneRange();
            var snippet = rClone.toString().trim().slice(0, 36) || 'la selección actual';
            confirmDelete2Steps('«' + snippet + '»', function () {
                rClone.deleteContents();
                pushHistory();
                scheduleLiveSave();
            });
            return;
        }
        if (r && r.startContainer) {
            var nd = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
            if (nd && nd !== canvas && canvas.contains(nd)) {
                var descNode = (nd.innerText || nd.textContent || nd.tagName || 'este bloque').trim().slice(0, 32);
                confirmDelete2Steps('el elemento «' + descNode + '»', function () {
                    if (nd.parentNode) nd.parentNode.removeChild(nd);
                    pushHistory();
                    scheduleLiveSave();
                });
                return;
            }
        }
        if (deps && deps.toast) deps.toast('Selecciona primero el texto, foto, video o audio que quieras eliminar');
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
            confirmDelete2Steps('este elemento multimedia', function () {
                if (w.parentNode) w.parentNode.removeChild(w);
                activeWrap = null;
                pushHistory();
                scheduleLiveSave();
            });
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
                var cssNum = parseFloat(cssLh);
                blocks.forEach(function (b) {
                    b.style.lineHeight = cssLh;
                    // Con valores <1 los bloques se traslapen visualmente (margen negativo)
                    b.style.marginTop = cssNum < 1 ? (cssNum - 1) + 'em' : '';
                });
                pushHistory();
                scheduleLiveSave();
                return;
            }
        }
        canvas.style.lineHeight = cssLh;
        scheduleLiveSave();
    }

    // Lee los datos en vivo del lienzo y actualiza timestamps + respaldo anti-crash
    function syncCurrentNoteFromDOM() {
        if (!curNote || !ov) return;
        var titleEl = ov.querySelector('#np-title');
        var canvasEl = ov.querySelector('#np-canvas');
        if (!titleEl || !canvasEl) return;
        curNote.title = (titleEl.innerText || titleEl.textContent || '').trim() || 'Nota sin título';
        curNote.html = canvasEl.innerHTML;
        curNote.text = (canvasEl.innerText || canvasEl.textContent || '').trim();
        curNote.updatedAt = Date.now();
        if (!curNote.createdAt) curNote.createdAt = curNote.updatedAt;
        var upEl = ov.querySelector('#np-ts-updated');
        if (upEl) upEl.textContent = IO.fmtDateTime(curNote.updatedAt);
        // Respaldo síncrono inmediato en localStorage ante cierres o crashes
        try {
            localStorage.setItem(CRASH_KEY, JSON.stringify(curNote));
            localStorage.setItem(OPEN_ID_KEY, curNote.id);
        } catch (e) {}
    }

    function scheduleLiveSave() {
        if (!curNote) return;
        syncCurrentNoteFromDOM();
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(function () {
            IO.save(curNote).then(function () {
                return IO.syncToMediaStore(curNote, deps);
            });
        }, 250);
    }

    function saveCurrentNoteAndSync(showMsg) {
        if (!curNote) return Promise.resolve();
        syncCurrentNoteFromDOM();
        return IO.save(curNote).then(function () {
            return IO.syncToMediaStore(curNote, deps);
        }).then(function () {
            if (showMsg && deps && deps.toast) {
                deps.toast('«' + curNote.title + '» guardada');
            }
        });
    }

    // Recuperar borrador si la app se cerró o crasheó mientras se editaba
    function recoverCrashDraft() {
        try {
            var raw = localStorage.getItem(CRASH_KEY);
            if (!raw) return Promise.resolve();
            var draft = JSON.parse(raw);
            if (!draft || !draft.id) return Promise.resolve();
            return IO.save(draft).then(function () {
                return IO.syncToMediaStore(draft, deps);
            });
        } catch (e) {
            return Promise.resolve();
        }
    }

    ['visibilitychange', 'pagehide', 'beforeunload'].forEach(function (ev) {
        window.addEventListener(ev, function () {
            if (curNote && ov && !ov.querySelector('#np-edit-view').hidden) {
                syncCurrentNoteFromDOM();
                IO.save(curNote);
            }
        });
    });

    // Pinta la lista de notas guardadas con buscador en vivo y paginación cada 10 notas
    function renderNotesList() {
        if (!ov) return;
        var grid = ov.querySelector('#np-docs-grid');
        var pager = ov.querySelector('#np-pager');
        var pageInfo = ov.querySelector('#np-page-info');
        var prevBtn = ov.querySelector('#np-prev-page');
        var nextBtn = ov.querySelector('#np-next-page');
        var clearBtn = ov.querySelector('#np-search-clear');

        IO.list().then(function (arr) {
            notes = arr || [];
            var q = String(searchQuery || '').trim().toLowerCase();
            if (clearBtn) clearBtn.hidden = !q;

            var filtered = !q ? notes : notes.filter(function (n) {
                var haystack = [
                    n.title || '',
                    n.text || '',
                    n.html || '',
                    IO.fmtDateTime(n.createdAt),
                    IO.fmtDateTime(n.updatedAt)
                ].join(' ').toLowerCase();
                return haystack.indexOf(q) >= 0;
            });

            if (!filtered.length) {
                pager.hidden = true;
                grid.innerHTML = '<div class="tribal-empty-mini"><p>' +
                    (q ? 'Ninguna nota coincide con «' + esc(searchQuery) + '».'
                       : 'Aún no hay notas. Toca «+ Nueva nota» para crear la primera.') +
                    '</p></div>';
                return;
            }

            var totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
            if (currentPage >= totalPages) currentPage = totalPages - 1;
            if (currentPage < 0) currentPage = 0;

            var slice = filtered.slice(currentPage * PER_PAGE, (currentPage + 1) * PER_PAGE);
            pager.hidden = filtered.length <= PER_PAGE;
            pageInfo.textContent = 'Página ' + (currentPage + 1) + ' / ' + totalPages +
                ' · ' + filtered.length + ' nota(s)';
            prevBtn.disabled = currentPage <= 0;
            nextBtn.disabled = currentPage >= totalPages - 1;

            grid.innerHTML = slice.map(function (n) {
                var prev = String(n.text || '').replace(/\s+/g, ' ').slice(0, 140) || 'Sin texto adicional…';
                return '<div class="np-doc-card' + (n.fav ? ' np-fav-card' : '') + '" data-id="' + esc(n.id) + '">' +
                    '<div class="np-doc-ico"><i class="bi ' + (n.fav ? 'bi-star-fill' : 'bi-file-earmark-richtext') + '"></i></div>' +
                    '<div class="np-doc-body">' +
                        '<strong class="np-doc-title">' + (n.fav ? '<span class="np-fav-badge">★ Fijada</span> ' : '') + esc(n.title || 'Sin título') + '</strong>' +
                        '<p class="np-doc-prev">' + esc(prev) + '</p>' +
                        '<div class="np-doc-dates">' +
                            '<span>Creado: ' + esc(IO.fmtDateTime(n.createdAt)) + '</span>' +
                            '<span>Modificado: ' + esc(IO.fmtDateTime(n.updatedAt)) + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<button type="button" class="tribal-ctrl np-doc-fav' + (n.fav ? ' on' : '') + '" data-fav="' + esc(n.id) + '" title="Fijar en favoritos">' +
                        '<i class="bi ' + (n.fav ? 'bi-star-fill' : 'bi-star') + '"></i>' +
                    '</button>' +
                    '<button type="button" class="tribal-ctrl np-doc-more" data-more="' + esc(n.id) + '" title="Opciones">' +
                        '<i class="bi bi-three-dots-vertical"></i>' +
                    '</button>' +
                '</div>';
            }).join('');
        });
    }

    function showListView() {
        if (!ov) return;
        try { localStorage.removeItem(OPEN_ID_KEY); } catch (e) {}
        ov.querySelector('#np-list-view').hidden = false;
        ov.querySelector('#np-edit-view').hidden = true;
        ov.querySelector('#np-new-btn').hidden = false;
        ov.querySelector('#np-read-btn').hidden = true;
        ov.querySelector('#np-head-title').textContent = 'Bloc de notas';
        ov.querySelector('#np-head-title').hidden = false;
        ov.querySelector('#np-head-ico').className = 'bi bi-journal-richtext';
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
        try {
            localStorage.setItem(CRASH_KEY, JSON.stringify(curNote));
            localStorage.setItem(OPEN_ID_KEY, curNote.id);
        } catch (e) {}
        ov.querySelector('#np-list-view').hidden = true;
        ov.querySelector('#np-edit-view').hidden = false;
        ov.querySelector('#np-toolbar').hidden = false;
        ov.querySelector('#np-new-btn').hidden = true;
        ov.querySelector('#np-read-btn').hidden = false;
        ov.querySelector('#np-read-btn').innerHTML = '<i class="bi bi-arrows-fullscreen"></i>';
        ov.querySelector('#np-head-title').textContent = '';
        ov.querySelector('#np-head-title').hidden = true;
        ov.querySelector('#np-head-ico').className = 'bi bi-pencil-square';
        ov.querySelector('#np-back-lbl').textContent = '';

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

        var fb = ov.querySelector('#np-fav-btn');
        if (fb) {
            fb.classList.toggle('np-disk-btn', !!curNote.fav);
            fb.innerHTML = '<i class="bi ' + (curNote.fav ? 'bi-star-fill' : 'bi-star') + '"></i>';
        }
        undoStack = [canvasEl.innerHTML];
        redoStack = [];
        rebindMediaWraps();
    }

    function openDocContextMenu(note) {
        if (!note || !ov) return;
        ctxNote = note;
        ov.querySelector('#np-doc-menu-title').textContent = note.title || 'Documento';
        var favLbl = ov.querySelector('#np-dm-fav-lbl');
        if (favLbl) favLbl.textContent = note.fav ? 'Quitar de Favoritos' : 'Marcar como Favorita (fijar arriba)';
        ov.querySelector('#np-doc-menu').hidden = false;
    }

    function wireEvents() {
        var canvas = ov.querySelector('#np-canvas');
        var titleEl = ov.querySelector('#np-title');
        function onEl(sel, ev, fn) {
            var el = ov && ov.querySelector(sel);
            if (el) el.addEventListener(ev, fn);
        }
        if (!canvas || !titleEl) return;

        // Evitar perder selección al pulsar botones de la barra WYSIWYG
        onEl('#np-toolbar', 'mousedown', function (e) {
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
            if ((e.key === ' ' || e.key === 'Enter' || e.key === ',' || e.key === '.' ||
                e.key === ';' || e.key === ':' || e.key === '!' || e.key === '?' ||
                e.key === ')' || e.key === '(' || e.key === '"' || e.key === 'Tab') &&
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

        // Ortografía en vivo: chip «✏ sugerencia» flotante junto al cursor
        var spellHint = ov.querySelector('#np-spell-hint');
        var shT = null, shWord = null, shFix = null, shNode = null, shStart = 0, shEnd = 0;
        function hideSpellHint() { if (spellHint) spellHint.hidden = true; shWord = null; }
        function scheduleSpellHint() {
            if (!spellHint || !window.TribalNotepadWords) return;
            clearTimeout(shT);
            shT = setTimeout(showSpellHint, 320);
        }
        function showSpellHint() {
            var sel = window.getSelection && window.getSelection();
            if (!sel || !sel.rangeCount || !sel.isCollapsed) return hideSpellHint();
            var r = sel.getRangeAt(0), nd = r.startContainer;
            if (!nd || nd.nodeType !== 3 ||
                !(canvas.contains(nd) || titleEl.contains(nd))) return hideSpellHint();
            var before = (nd.nodeValue || '').slice(0, r.startOffset);
            var m = /([A-Za-zÁÉÍÓÚáéíóúñÑüÜ]{2,})$/.exec(before);
            if (!m) return hideSpellHint();
            var fix = window.TribalNotepadWords.autocorrectWord(m[1]);
            if (!fix || fix === m[1]) return hideSpellHint();
            shWord = m[1]; shFix = fix; shNode = nd;
            shStart = r.startOffset - m[1].length; shEnd = r.startOffset;
            var wr = document.createRange();
            wr.setStart(nd, shStart); wr.setEnd(nd, shEnd);
            var rc = wr.getBoundingClientRect();
            spellHint.textContent = '✏ ' + fix;
            spellHint.style.left = Math.max(8, Math.min(rc.left, window.innerWidth - 140)) + 'px';
            spellHint.style.top = (rc.bottom + 6) + 'px';
            spellHint.hidden = false;
        }
        if (spellHint) {
            spellHint.addEventListener('pointerdown', function (e) {
                e.preventDefault(); e.stopPropagation();
                if (!shNode || !shNode.parentNode || !shFix) return hideSpellHint();
                var txt = shNode.nodeValue || '';
                if (txt.slice(shStart, shEnd) === shWord) {
                    shNode.nodeValue = txt.slice(0, shStart) + shFix + txt.slice(shEnd);
                    pushHistory(); scheduleLiveSave();
                }
                hideSpellHint();
            });
            canvas.addEventListener('input', scheduleSpellHint);
            titleEl.addEventListener('input', scheduleSpellHint);
            document.addEventListener('selectionchange', function () {
                if (!ov || ov.hidden) return;
                var sel = window.getSelection && window.getSelection();
                if (!sel || !sel.rangeCount) return hideSpellHint();
                var nd = sel.getRangeAt(0).startContainer;
                if (nd && (canvas.contains(nd) || titleEl.contains(nd))) scheduleSpellHint();
                else hideSpellHint();
            });
        }

        // Menú contextual de formato al mantener presionado texto seleccionado
        var selMenu = ov.querySelector('#np-selmenu');
        function hideSelMenu() { if (selMenu) selMenu.hidden = true; }
        function openSelMenu() {
            if (!selMenu) return;
            var sel = window.getSelection && window.getSelection();
            if (!sel || !sel.rangeCount || sel.isCollapsed) return;
            var r = sel.getRangeAt(0);
            if (!canvas.contains(r.commonAncestorContainer)) return;
            saveSelection();
            selMenu.hidden = false;
            var rc = r.getBoundingClientRect();
            var mw = selMenu.offsetWidth || 280, mh = selMenu.offsetHeight || 120;
            var left = Math.max(8, Math.min(rc.left + rc.width / 2 - mw / 2,
                window.innerWidth - mw - 8));
            var top = rc.top - mh - 10;
            if (top < 8) top = Math.min(rc.bottom + 10, window.innerHeight - mh - 8);
            selMenu.style.left = left + 'px';
            selMenu.style.top = top + 'px';
        }
        if (selMenu) {
            selMenu.addEventListener('pointerdown', function (e) {
                if (!e.target.closest('select')) e.preventDefault();
            });
            selMenu.addEventListener('click', function (e) {
                var b = e.target.closest('[data-sa]');
                if (!b) return;
                var v = b.getAttribute('data-sa');
                if (v === 'bold') {
                    canvas.focus(); restoreSelection();
                    document.execCommand('bold', false, null);
                    pushHistory(); scheduleLiveSave(); saveSelection();
                } else if (v.indexOf('al:') === 0) {
                    applyAlignment(v.slice(3));
                } else if (v.indexOf('case:') === 0) {
                    transformSelectedCase(v.slice(5));
                } else if (v.indexOf('lh:') === 0) {
                    applyLineHeight(v.slice(3));
                }
            });
            var smBlock = selMenu.querySelector('#np-sm-block');
            if (smBlock) smBlock.addEventListener('change', function () {
                var v = this.value; this.value = '';
                if (!v) return;
                canvas.focus(); restoreSelection();
                document.execCommand('formatBlock', false, '<' + v + '>');
                pushHistory(); scheduleLiveSave(); saveSelection();
            });
            document.addEventListener('pointerdown', function (e) {
                if (!selMenu.hidden && !selMenu.contains(e.target) &&
                    !canvas.contains(e.target)) hideSelMenu();
            });
        }

        // Botón Volver y Texto completo
        onEl('#np-back', 'click', function () {
            if (!ov.querySelector('#np-edit-view').hidden && curNote) {
                saveCurrentNoteAndSync(true).then(showListView);
                return;
            }
            close();
        });
        onEl('#np-read-btn', 'click', function () {
            var tb = ov.querySelector('#np-toolbar');
            tb.hidden = !tb.hidden;
            this.innerHTML = tb.hidden
                ? '<i class="bi bi-sliders"></i>'
                : '<i class="bi bi-arrows-fullscreen"></i>';
        });
        onEl('#np-new-btn', 'click', function () {
            openNoteEditor(null);
        });
        onEl('#np-tb-more', 'click', function () {
            var ex = ov.querySelector('#np-tb-extra');
            ex.hidden = !ex.hidden;
            this.classList.toggle('np-open', !ex.hidden);
        });

        // Buscador en vivo de notas y paginación cada 10 notas
        var searchAir = ov.querySelector('#np-note-search');
        var clearBtn = ov.querySelector('#np-search-clear');
        if (searchAir) {
            searchAir.addEventListener('input', function () {
                searchQuery = (this.innerText || this.textContent || '').trim();
                currentPage = 0;
                renderNotesList();
            });
            searchAir.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') e.preventDefault();
            });
        }
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                if (searchAir) searchAir.textContent = '';
                searchQuery = '';
                currentPage = 0;
                renderNotesList();
            });
        }
        onEl('#np-prev-page', 'click', function () {
            if (currentPage > 0) { currentPage--; renderNotesList(); }
        });
        onEl('#np-next-page', 'click', function () {
            currentPage++;
            renderNotesList();
        });

        // Deseleccionar elemento multimedia al tocar texto + long-press sobre texto seleccionado → eliminar en 2 pasos
        var selLpT = null, selX0 = 0, selY0 = 0;
        canvas.addEventListener('pointerdown', function (e) {
            hideSelMenu();
            if (!e.target.closest('.np-img-wrap')) {
                ov.querySelectorAll('.np-img-wrap.np-sel').forEach(function (w) {
                    w.classList.remove('np-sel');
                });
                activeWrap = null;
            }
            selX0 = e.clientX; selY0 = e.clientY;
            clearTimeout(selLpT);
            selLpT = setTimeout(function () {
                var sel = window.getSelection && window.getSelection();
                if (sel && sel.rangeCount && !sel.isCollapsed &&
                    canvas.contains(sel.getRangeAt(0).commonAncestorContainer)) {
                    saveSelection();
                    openSelMenu();
                }
            }, 900);
        });
        canvas.addEventListener('pointermove', function (e) {
            if (selLpT && (Math.abs(e.clientX - selX0) > 10 || Math.abs(e.clientY - selY0) > 10)) {
                clearTimeout(selLpT);
                selLpT = null;
            }
        });
        ['pointerup', 'pointercancel'].forEach(function (ev) {
            canvas.addEventListener(ev, function () {
                clearTimeout(selLpT);
                selLpT = null;
            });
        });

        // Dropdowns de Títulos, Alineación, Mayús/Minús e Interlineado
        onEl('#np-dd-block', 'change', function () {
            var v = this.value;
            this.value = '';
            if (!v) return;
            canvas.focus();
            restoreSelection();
            document.execCommand('formatBlock', false, '<' + v + '>');
            pushHistory();
            scheduleLiveSave();
        });
        onEl('#np-dd-align', 'change', function () {
            var v = this.value;
            this.value = '';
            if (!v) return;
            applyAlignment(v);
        });
        onEl('#np-dd-case', 'change', function () {
            var v = this.value;
            this.value = '';
            if (!v) return;
            transformSelectedCase(v);
        });
        onEl('#np-dd-lh', 'change', function () {
            if (!this.value) return;
            applyLineHeight(this.value);
        });

        // Barra de herramientas WYSIWYG
        onEl('#np-toolbar', 'click', function (e) {
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
            if (act === 'ls') {
                var curLs = curNote.letterSpacing || '0px';
                var nextLs = LETTER_SPACINGS[(LETTER_SPACINGS.indexOf(curLs) + 1) % LETTER_SPACINGS.length];
                curNote.letterSpacing = nextLs;
                canvas.style.letterSpacing = nextLs;
                var lsLbl = ov.querySelector('#np-ls-lbl');
                if (lsLbl) lsLbl.textContent = nextLs;
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
            if (act === 'save-disk') {
                saveCurrentNoteAndSync(true);
                return;
            }
            if (act === 'fav-note') {
                if (!curNote) return;
                curNote.fav = !curNote.fav;
                var fb = ov.querySelector('#np-fav-btn');
                if (fb) {
                    fb.classList.toggle('np-disk-btn', !!curNote.fav);
                    fb.innerHTML = '<i class="bi ' + (curNote.fav ? 'bi-star-fill' : 'bi-star') + '"></i>';
                }
                scheduleLiveSave();
                if (deps && deps.toast) {
                    deps.toast(curNote.fav ? '★ Nota fijada en Favoritos (siempre arriba)' : 'Quitada de Favoritos');
                }
                return;
            }
            if (act === 'del-sel') {
                deleteSelectedDetail();
                return;
            }
            if (act === 'song-tribu') {
                saveSelection();
                openSongPicker();
                return;
            }
            if (act === 'autocorrect') {
                if (!window.TribalNotepadWords) return;
                saveSelection();
                var nFixed = runAutocorrectNow();
                openSpellModal(nFixed);
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

        function runAutocorrectNow() {
            var W = window.TribalNotepadWords;
            if (!W) return 0;
            var total = 0;
            var walk = document.createTreeWalker(canvas, NodeFilter.SHOW_TEXT, null, false);
            var tn;
            while ((tn = walk.nextNode())) {
                var r = W.autocorrectText(tn.nodeValue);
                if (r.count > 0) {
                    tn.nodeValue = r.text;
                    total += r.count;
                }
            }
            var rt = W.autocorrectText(titleEl.textContent);
            if (rt.count > 0) {
                titleEl.textContent = rt.text;
                total += rt.count;
            }
            pushHistory();
            scheduleLiveSave();
            return total;
        }

        function renderSpellRules() {
            var box = ov.querySelector('#np-sp-list');
            var rules = (window.TribalNotepadWords && window.TribalNotepadWords.getRules()) || {};
            var keys = Object.keys(rules);
            if (!keys.length) {
                box.innerHTML = '<p class="np-hint">Aún no has guardado palabras propias. El diccionario base de español ya está activo.</p>';
                return;
            }
            box.innerHTML = keys.map(function (k) {
                return '<div class="np-song-row" style="justify-content:space-between">' +
                    '<span><b>' + esc(k) + '</b> → ' + esc(rules[k]) + '</span>' +
                    '<button type="button" class="tribal-btn tribal-btn-xs danger" data-rm-rule="' + esc(k) + '">' +
                        '<i class="bi bi-trash3"></i></button>' +
                '</div>';
            }).join('');
        }

        function openSpellModal(nFixed) {
            var modal = ov.querySelector('#np-spell-modal');
            var msg = ov.querySelector('#np-spell-msg');
            var wBox = ov.querySelector('#np-sp-wrong');
            var rBox = ov.querySelector('#np-sp-right');
            var selStr = (savedRange && !savedRange.collapsed) ? savedRange.toString().trim().split(/\s+/)[0] : '';
            wBox.textContent = selStr || '';
            rBox.textContent = selStr || '';
            msg.textContent = nFixed > 0
                ? ('Se corrigieron ' + nFixed + ' palabra(s) automáticamente. También puedes guardar palabras propias abajo:')
                : 'Revisión completada. Puedes guardar palabras o correcciones personalizadas abajo:';
            renderSpellRules();
            modal.hidden = false;
        }

        ov.querySelector('#np-spell-runall').addEventListener('click', function () {
            var n = runAutocorrectNow();
            ov.querySelector('#np-spell-msg').textContent = n > 0
                ? ('¡Listo! Se corrigieron ' + n + ' palabra(s) en la nota.')
                : 'No se encontraron más errores ortográficos en la nota.';
        });

        ov.querySelector('#np-sp-save').addEventListener('click', function () {
            var wBox = ov.querySelector('#np-sp-wrong');
            var rBox = ov.querySelector('#np-sp-right');
            var wrong = (wBox.innerText || wBox.textContent || '').trim();
            var right = (rBox.innerText || rBox.textContent || '').trim() || wrong;
            if (!wrong) {
                if (deps && deps.toast) deps.toast('Escribe la palabra a guardar');
                return;
            }
            window.TribalNotepadWords.addRule(wrong, right);
            wBox.textContent = '';
            rBox.textContent = '';
            renderSpellRules();
            var n = runAutocorrectNow();
            if (deps && deps.toast) {
                deps.toast('Palabra «' + right + '» guardada en ortografía' + (n ? ' (' + n + ' corregidas)' : ''));
            }
        });

        ov.querySelector('#np-sp-list').addEventListener('click', function (e) {
            var b = e.target.closest('[data-rm-rule]');
            if (!b) return;
            window.TribalNotepadWords.removeRule(b.getAttribute('data-rm-rule'));
            renderSpellRules();
        });

        ov.querySelector('#np-spell-modal').addEventListener('click', function (e) {
            if (e.target.id === 'np-spell-modal' || e.target.id === 'np-spell-close') {
                ov.querySelector('#np-spell-modal').hidden = true;
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
            if (e.target.closest('[data-more],[data-fav]')) return;
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
            var favBtn = e.target.closest('[data-fav]');
            if (favBtn) {
                e.stopPropagation();
                var fid = favBtn.getAttribute('data-fav');
                var fn = notes.filter(function (x) { return x.id === fid; })[0];
                if (fn) {
                    fn.fav = !fn.fav;
                    IO.save(fn).then(function () {
                        if (deps && deps.toast) {
                            deps.toast(fn.fav ? '★ Nota fijada arriba en Favoritos' : 'Nota quitada de Favoritos');
                        }
                        renderNotesList();
                    });
                }
                return;
            }
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
            } else if (act === 'fav') {
                targetNote.fav = !targetNote.fav;
                IO.save(targetNote).then(function () {
                    if (deps && deps.toast) {
                        deps.toast(targetNote.fav ? '★ Nota fijada arriba en Favoritos' : 'Nota quitada de Favoritos');
                    }
                    renderNotesList();
                });
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
        recoverCrashDraft().then(function () {
            var targetId = initialNoteId;
            if (!targetId) {
                try { targetId = localStorage.getItem(OPEN_ID_KEY) || ''; } catch (e) {}
            }
            if (targetId) {
                IO.getById(targetId).then(function (n) {
                    if (n) openNoteEditor(n);
                    else showListView();
                });
            } else {
                showListView();
            }
        });
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
        if (curNote && ov && !ov.querySelector('#np-edit-view').hidden) {
            syncCurrentNoteFromDOM();
            IO.save(curNote).then(function () {
                return IO.syncToMediaStore(curNote, deps);
            });
        }
        try { localStorage.removeItem(OPEN_ID_KEY); } catch (e) {}
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
