// ============================================================================
// ARCHIVO: media/menus.js
// RESPONSABILIDAD: menú ⋮ de cada tarjeta + diálogos CRUD.
//   - Menú contextual (abrir, favorito, colecciones, info, metadatos,
//     compartir, convertir audio, renombrar, eliminar)
//   - Diálogos de renombrar y eliminar
//   - Convertidor de audio (media-convert.js)
//   - Doble clic en tarjeta → openFull
// ============================================================================
window.Sono.register('menus', function (S) {
    'use strict';
    var $ = S.$;
    var menu = S.menu, audio = S.audio, grid = S.grid;
    var menuBd = $('card-menu-bd');

    function closeMenu() {
        menu.hidden = true;
        if (menuBd) menuBd.hidden = true;
        S.menuItem = null;
    }
    if (menuBd) menuBd.addEventListener('click', closeMenu);
    document.addEventListener('click', function (e) {
        if (!menu.hidden && !menu.contains(e.target)) closeMenu();
    });

    // prepara las opciones visibles según el tipo del item
    function prepMenu(m) {
        S.menuItem = m;
        $('menu-conv').style.display = m.kind === 'audio' ? '' : 'none';
        $('menu-vnote').style.display = m.kind === 'audio' ? '' : 'none';
        $('menu-cover').style.display = m.kind === 'doc' ? '' : 'none';
        $('menu-imgedit').style.display = m.kind === 'image' ? '' : 'none';
        menu.hidden = false;
        if (menuBd) menuBd.hidden = false;
    }
    // mismo menú (long-press sobre la imagen abierta) — queda centrado igual
    S.openItemMenu = function (m) {
        if (m) prepMenu(m);
    };

    // clic en tarjeta / ⋮ de tarjeta (modo items y dentro de colección)
    grid.addEventListener('click', function (e) {
        if (S.viewMode === 'cols') return; // carpetas: las maneja collections.js
        var menuBtn = e.target.closest('[data-menu]');
        if (menuBtn) {
            e.stopPropagation();
            var mm = S.byId(menuBtn.dataset.menu);
            if (!mm) return;
            prepMenu(mm);
            return;
        }
        // vista de lista: botón play de la fila
        var playBtn = e.target.closest('.tr-row-play');
        if (playBtn) {
            e.stopPropagation();
            var pm = S.byId(playBtn.dataset.play);
            if (!pm) return;
            if (pm.kind === 'audio') {
                if (S.audio.dataset.current === pm.id && !S.audio.paused) {
                    S.audio.pause();
                } else {
                    S.playAudio(pm);
                }
            } else {
                S.openItem(pm);
            }
            return;
        }
        var card = e.target.closest('.tribal-card, .tribal-row');
        if (card) {
            closeMenu();
            if (S._lpBlock) { S._lpBlock = false; return; } // venía de long-press
            if (S.msMode) { S.msToggle(card.dataset.id); return; }
            var m = S.byId(card.dataset.id);
            if (m) S.openItem(m);
        }
    });

    // long-press en tarjeta → cambiar carátula (música, videos, libros)
    if (window.TribalCover) window.TribalCover.attach(grid, S);

    // long-press sobre la imagen abierta a pantalla completa → menú modal
    var ivT = null, ivX = 0, ivY = 0;
    S.imageOv.addEventListener('pointerdown', function (e) {
        if (e.target.closest('.tribal-close')) return;
        ivX = e.clientX; ivY = e.clientY;
        ivT = setTimeout(function () {
            ivT = null;
            if (S.imageItem) S.openItemMenu(S.imageItem);
        }, 550);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
        S.imageOv.addEventListener(ev, function () {
            clearTimeout(ivT); ivT = null;
        });
    });
    S.imageOv.addEventListener('pointermove', function (e) {
        if (ivT && (Math.abs(e.clientX - ivX) > 10 ||
                    Math.abs(e.clientY - ivY) > 10)) {
            clearTimeout(ivT); ivT = null;
        }
    });

    // doble clic → pantalla completa vinilo tribal
    grid.addEventListener('dblclick', function (e) {
        if (S.msMode) return;
        var card = e.target.closest('.tribal-card, .tribal-row');
        if (!card) return;
        var m = S.byId(card.dataset.id);
        if (m) S.openFull(m);
    });

    // ---------------------------------------------------- acciones del menú
    $('menu-open').addEventListener('click', function () {
        if (S.menuItem) S.openItem(S.menuItem);
        closeMenu();
    });
    $('menu-rename').addEventListener('click', function () {
        if (!S.menuItem) return closeMenu();
        S.pendingId = S.menuItem.id;
        S.renInput.value = S.menuItem.name;
        S.renOv.hidden = false;
        closeMenu();
        setTimeout(function () { S.renInput.focus(); S.renInput.select(); }, 50);
    });
    $('menu-delete').addEventListener('click', function () {
        if (!S.menuItem) return closeMenu();
        S.pendingId = S.menuItem.id;
        S.delText.textContent = '¿Devolver "' + S.menuItem.name + '" a las cenizas? No hay vuelta atrás.';
        S.delOv.hidden = false;
        closeMenu();
    });
    $('menu-fav').addEventListener('click', function () {
        if (!S.menuItem) return closeMenu();
        window.MediaStore.toggleFavorite(S.menuItem.id).then(function (m) {
            S.showToast(m.fav ? 'Guardado en Favoritos' : 'Quitado de Favoritos');
            closeMenu();
            S.reload();
        });
    });
    $('menu-col').addEventListener('click', function () {
        if (!S.menuItem) return closeMenu();
        var id = S.menuItem.id;
        closeMenu();
        S.openColAssign(id);
    });
    // selección múltiple: entra al modo y marca la tarjeta del ⋮
    $('menu-multi').addEventListener('click', function () {
        var m = S.menuItem;
        closeMenu();
        S.msStart(m ? m.id : null);
    });

    function metaDeps() {
        return {
            store: window.MediaStore,
            urlFor: S.urlFor,
            fmtSize: S.fmtSize,
            fmtTime: S.fmtTime,
            kindLabel: function (k) { return S.KIND_LABEL[k] || k; },
            mount: S.root,
            toast: S.showToast,
            onSaved: function () {
                S.reload();
                var cur = S.byId(audio.dataset.current);
                if (cur) {
                    S.pTitle.textContent = (cur.info && cur.info.titulo) || cur.name;
                    S.updateCover(cur);
                }
            }
        };
    }
    $('menu-info').addEventListener('click', function () {
        if (!S.menuItem) return closeMenu();
        var m = S.menuItem;
        closeMenu();
        window.TribalMeta.openInfo(m, metaDeps());
    });
    $('menu-meta').addEventListener('click', function () {
        if (!S.menuItem) return closeMenu();
        var m = S.menuItem;
        closeMenu();
        window.TribalMeta.openEditor(m, metaDeps());
    });

    // editor de imágenes (solo fotos)
    $('menu-imgedit').addEventListener('click', function () {
        if (!S.menuItem || S.menuItem.kind !== 'image') return closeMenu();
        var m = S.menuItem;
        closeMenu();
        if (window.TribalImgEdit) {
            window.TribalImgEdit.open(m, {
                mount: S.root, urlFor: S.urlFor, store: window.MediaStore,
                toast: S.showToast, items: S.items, onSaved: S.reload,
                invalidate: function (id) {
                    if (S.urlCache[id]) {
                        try { URL.revokeObjectURL(S.urlCache[id]); } catch (e) {}
                        delete S.urlCache[id];
                    }
                }
            });
        }
    });

    // carátula del libro: picker completo (internet + imágenes de la tribu)
    $('menu-cover').addEventListener('click', function () {
        if (!S.menuItem || S.menuItem.kind !== 'doc') return closeMenu();
        var m = S.menuItem;
        closeMenu();
        if (window.TribalCover) window.TribalCover.open(m, S);
    });

    // compartir → hoja nativa (WhatsApp, Bluetooth…) o Web Share/descarga
    $('menu-share').addEventListener('click', function () {
        if (!S.menuItem) return closeMenu();
        var m = S.menuItem;
        closeMenu();
        S.showToast('Compartiendo ' + m.name + '…');
        window.MediaStore.share(m).then(function () {}).catch(function (e) {
            S.showToast('No se pudo compartir: ' +
                String((e && e.message) || e || 'error'));
        });
    });

    // editar nota de audio: recorte, EQ, fades, echo, ambiente, exportar
    $('menu-vnote').addEventListener('click', function () {
        if (!S.menuItem || S.menuItem.kind !== 'audio') return closeMenu();
        var m = S.menuItem;
        closeMenu();
        if (window.TribalVNotes) {
            window.TribalVNotes.edit(m, {
                mount: S.root, urlFor: S.urlFor, store: window.MediaStore,
                toast: S.showToast, items: S.items, reload: S.reload
            });
        } else S.showToast('Editor no disponible');
    });

    // sembrar en P2P — cualquier archivo de la tribu (audio/video/imagen/doc)
    $('menu-seed').addEventListener('click', function () {
        var m = S.menuItem;
        if (!m) return closeMenu();
        closeMenu();
        S.urlFor(m, function (u) {
            if (!u) return S.showToast('No se pudo leer el archivo');
            fetch(u).then(function (r) { return r.blob(); }).then(function (blob) {
                var j = window.TribalP2P && window.TribalP2P.seed(m, blob);
                if (j && window.TribalP2PExtra && window.TribalP2PExtra.magnetDialog)
                    window.TribalP2PExtra.magnetDialog(j, S.root, S.showToast);
                else
                    S.showToast(j ? 'Sembrando «' + m.name + '» — magnet en P2P'
                                : 'No se pudo sembrar');
            }).catch(function () { S.showToast('No se pudo leer el archivo'); });
        });
    });

    // compartir por Bluetooth directo (Android) — en web cae a share normal
    $('menu-bt').addEventListener('click', function () {
        if (!S.menuItem) return closeMenu();
        var m = S.menuItem;
        closeMenu();
        S.showToast('Enviando ' + m.name + ' por Bluetooth…');
        window.MediaStore.shareBluetooth(m).then(function () {}).catch(function (e) {
            S.showToast('No se pudo compartir por Bluetooth: ' +
                String((e && e.message) || e || 'error'));
        });
    });

    // convertir audio → MP3 / WAV / WebM
    var convOv = $('conv-overlay'), convList = $('conv-list'),
        convStatus = $('conv-status'), convItem = null;
    $('menu-conv').addEventListener('click', function () {
        if (!S.menuItem || S.menuItem.kind !== 'audio') return closeMenu();
        convItem = S.menuItem;
        closeMenu();
        $('conv-name').textContent = convItem.name;
        convStatus.textContent = '';
        convList.innerHTML = window.TribalConvert.formats().map(function (f) {
            return '<button class="tribal-col-check" data-fmt="' + f.id + '">' +
                '<i class="bi bi-circle"></i><span>' + S.esc(f.label) + '</span></button>';
        }).join('');
        convOv.hidden = false;
    });
    convList.addEventListener('click', function (e) {
        var b = e.target.closest('[data-fmt]');
        if (!b || !convItem) return;
        var fmtId = b.dataset.fmt;
        convStatus.textContent = 'Decodificando…';
        S.urlFor(convItem, function (u) {
            if (!u) { convStatus.textContent = 'No se pudo leer el audio'; return; }
            fetch(u).then(function (r) { return r.blob(); }).then(function (blob) {
                return window.TribalConvert.convert(blob, fmtId, function (p) {
                    convStatus.textContent = 'Convirtiendo ' + Math.round(p * 100) + '%…';
                });
            }).then(function (out) {
                var base = convItem.name.replace(/\.[^.]+$/, '');
                return S.saveMediaBlob(out.blob, base + out.ext, null,
                    'Convertido: ' + base + out.ext);
            }).then(function () {
                convStatus.textContent = '';
                convOv.hidden = true;
            }).catch(function (err) {
                convStatus.textContent = (err && err.message) || 'No se pudo convertir';
            });
        });
    });
    $('conv-cancel').addEventListener('click', function () { convOv.hidden = true; });

    // ------------------------------------------------------------------ CRUD
    $('rename-cancel').addEventListener('click', function () { S.renOv.hidden = true; });
    $('rename-ok').addEventListener('click', function () {
        var name = S.renInput.value.trim();
        if (!name || !S.pendingId) return;
        var id = S.pendingId;
        window.MediaStore.rename(id, name).then(function (updated) {
            S.renOv.hidden = true;
            S.pendingId = null;
            if (audio.dataset.current === id) {
                S.pTitle.textContent = (updated && updated.info && updated.info.titulo) || name;
                if (window.TribalVinyl && window.TribalVinyl.isOpen() && updated) {
                    window.MediaStore.getArtURL(updated).then(function (art) {
                        window.TribalVinyl.setMeta(updated, art);
                    });
                }
            }
            S.showToast('Renombrado en la tribu');
            S.reload();
        });
    });
    S.renInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') $('rename-ok').click();
        if (e.key === 'Escape') S.renOv.hidden = true;
    });

    $('delete-cancel').addEventListener('click', function () { S.delOv.hidden = true; });
    $('delete-ok').addEventListener('click', function () {
        if (!S.pendingId) return;
        var id = S.pendingId;
        S.delOv.hidden = true;
        S.pendingId = null;
        // si está sonando, lo paramos y cerramos el vinilo
        if (audio.dataset.current === id) {
            $('player-close').click();
            window.TribalVinyl.close();
        }
        // si es la foto abierta en el visor, lo cerramos
        if (S.imageItem && S.imageItem.id === id) S.closeImage();
        if (S.urlCache[id]) { try { URL.revokeObjectURL(S.urlCache[id]); } catch (e) {} delete S.urlCache[id]; }
        var px = S.findProxy(id);
        window.MediaStore.remove(id).then(function () {
            if (px) return window.MediaStore.remove(px.id);
        }).then(function () {
            S.showToast('Devuelto a las cenizas');
            S.reload();
        });
    });
});
