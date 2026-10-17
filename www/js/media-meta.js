// ============================================================================
// ARCHIVO: media-meta.js
// RESPONSABILIDAD: Diálogos de "Información" y "Metadatos" de la TRIBALs.
//   - Información: datos del archivo + metadatos guardados.
//   - Metadatos: edición manual, carátula propia y búsqueda en internet
//     (API pública de iTunes, sin clave) para música pública.
//   API: TribalMeta.openInfo(meta, deps) · TribalMeta.openEditor(meta, deps)
//   deps = { store, urlFor, fmtSize, fmtTime, kindLabel, mount, toast, onSaved }
// ============================================================================
window.TribalMeta = (function () {
    'use strict';

    var ov = null;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function close() {
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = null;
    }

    function shell(mount, html) {
        close();
        ov = document.createElement('div');
        ov.className = 'tribal-overlay';
        ov.innerHTML = html;
        (mount || document.body).appendChild(ov);
        ov.addEventListener('click', function (e) {
            if (e.target === ov) close();
        });
        return ov;
    }

    function row(k, v) {
        return v ? '<div class="tmeta-row"><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>' : '';
    }

    // Texto + bandera "abrible" de la ruta según el origen del archivo:
    //   ref (escáner) → ruta real del dispositivo, tocable ("abrir en la ruta")
    //   copia de la app → carpeta privada, se muestra pero no es navegable
    //   builtin → asset del bundle; web → IndexedDB del navegador
    function pathInfo(m) {
        if (m.ref && m.path) return { text: m.path, openable: true };
        if (m.builtin)   return { text: 'Integrado en la app → builtin/' + m.builtin, openable: false };
        if (m.path)      return { text: 'Almacenamiento interno de TRIBALs → ' + m.path, openable: false };
        return { text: 'Navegador (IndexedDB) — sin ruta de disco', openable: false };
    }

    function probeDuration(m, deps, cb) {
        if (m._dur != null) return cb(m._dur);
        if (m.kind !== 'audio' && m.kind !== 'video') return cb(null);
        deps.urlFor(m, function (u) {
            if (!u) return cb(null);
            var t = document.createElement(m.kind === 'video' ? 'video' : 'audio');
            t.preload = 'metadata';
            t.src = u;
            t.addEventListener('loadedmetadata', function () { m._dur = t.duration; cb(t.duration); });
            t.addEventListener('error', function () { cb(null); });
            setTimeout(function () { cb(null); }, 5000);
        });
    }

    // ------------------------------------------------------------- info ----
    function openInfo(m, deps) {
        var info = m.info || {};
        var pi = pathInfo(m);
        var el = shell(deps.mount,
            '<div class="tribal-dialog tmeta-dialog">' +
                '<h4>Información</h4>' +
                '<div class="tmeta-art" id="tmeta-info-art"><i class="bi bi-music-note-beamed"></i></div>' +
                '<div class="tmeta-rows">' +
                    row('Nombre', m.name) +
                    row('Tipo', deps.kindLabel(m.kind)) +
                    row('Formato', m.mime || '—') +
                    row('Tamaño', deps.fmtSize(m.size)) +
                    row('Agregado', m.addedAt ? new Date(m.addedAt).toLocaleString() : '—') +
                    row('Duración', '…') +
                    '<div class="tmeta-row"><span>Ruta</span>' +
                        '<b class="' + (pi.openable ? 'tmeta-path tmeta-link' : 'tmeta-path') + '"' +
                        ' id="tmeta-path" title="' + esc(pi.text) + '">' +
                        esc(pi.text) + (pi.openable ? ' <i class="bi bi-box-arrow-up-right"></i>' : '') +
                        '</b></div>' +
                    row('Origen', m.ref ? 'Escaneado del dispositivo'
                        : m.builtin ? 'Integrado en la app'
                        : (window.SonoStoreIO && window.SonoStoreIO.isNative()) ? 'Copiado a la app'
                        : 'Navegador') +
                '</div>' +
                '<div class="tmeta-rows" id="tmeta-info-saved"></div>' +
                '<div class="tribal-dialog-actions">' +
                    '<button class="tribal-btn primary" id="tmeta-info-ok">Cerrar</button>' +
                '</div>' +
            '</div>');

        el.querySelector('#tmeta-info-ok').addEventListener('click', close);

        // tocar la ruta → abrir la carpeta exacta en el gestor de archivos
        // ("abrir en la ruta"); si el sistema no tiene gestor compatible,
        // la ruta se copia al portapapeles como respaldo
        if (pi.openable) {
            el.querySelector('#tmeta-path').addEventListener('click', function () {
                var toast = deps.toast || function () {};
                if (window.TribalScan && window.TribalScan.openLocation) {
                    window.TribalScan.openLocation(m.path).then(function (res) {
                        if (res === 'open') toast('📂 Abriendo la carpeta…');
                        else if (res === 'copy') toast('Sin gestor de archivos compatible — ruta copiada al portapapeles');
                        else toast('No se pudo abrir la carpeta');
                    });
                } else {
                    toast('Disponible solo en el APK');
                }
            });
        }

        var saved = el.querySelector('#tmeta-info-saved');
        saved.innerHTML =
            row('Título', info.titulo) + row('Artista', info.artista) +
            row('Álbum', info.album) + row('Género', info.genero) +
            row('Año', info.anio) + row('Notas', info.notas);
        if (!saved.innerHTML) {
            saved.innerHTML = '<p class="tmeta-empty">Sin metadatos guardados. Usa «Metadatos» en el menú del archivo.</p>';
        }

        probeDuration(m, deps, function (d) {
            var rows = el.querySelectorAll('.tmeta-row b');
            if (rows[5] && d) rows[5].textContent = deps.fmtTime(d);
        });
        if (deps.store.getArtURL) {
            deps.store.getArtURL(m).then(function (u) {
                if (u) el.querySelector('#tmeta-info-art').innerHTML = '<img src="' + esc(u) + '" alt="">';
            });
        }
    }

    // ----------------------------------------------------------- editor ----
    function openEditor(m, deps) {
        var info = m.info || {};
        var isMusic = m.kind === 'audio';
        var el = shell(deps.mount,
            '<div class="tribal-dialog tmeta-dialog tmeta-edit">' +
                '<h4>Metadatos</h4>' +
                '<div class="tmeta-edit-top">' +
                    '<div class="tmeta-art" id="tmeta-art"><i class="bi bi-disc"></i></div>' +
                    '<div class="tmeta-art-btns">' +
                        '<button class="tribal-btn" id="tmeta-pick"><i class="bi bi-image"></i> Elegir imagen</button>' +
                        (isMusic ? '<button class="tribal-btn" id="tmeta-net"><i class="bi bi-globe"></i> Buscar en internet</button>' : '') +
                    '</div>' +
                '</div>' +
                '<input type="file" id="tmeta-file" accept="image/*" hidden>' +
                '<div class="tmeta-results" id="tmeta-results"></div>' +
                '<input class="tmeta-in" id="tm-titulo" placeholder="Título" value="' + esc(info.titulo || m.name) + '">' +
                '<input class="tmeta-in" id="tm-artista" placeholder="Artista" value="' + esc(info.artista || '') + '">' +
                '<input class="tmeta-in" id="tm-album" placeholder="Álbum" value="' + esc(info.album || '') + '">' +
                '<div class="tmeta-duo">' +
                    '<input class="tmeta-in" id="tm-genero" placeholder="Género" value="' + esc(info.genero || '') + '">' +
                    '<input class="tmeta-in" id="tm-anio" placeholder="Año" value="' + esc(info.anio || '') + '">' +
                '</div>' +
                '<input class="tmeta-in" id="tm-notas" placeholder="Notas" value="' + esc(info.notas || '') + '">' +
                '<div class="tribal-dialog-actions">' +
                    '<button class="tribal-btn" id="tmeta-cancel">Cancelar</button>' +
                    '<button class="tribal-btn primary" id="tmeta-save">Guardar</button>' +
                '</div>' +
            '</div>');

        var pendingArtUrl = null;
        var results = el.querySelector('#tmeta-results');
        var artBox = el.querySelector('#tmeta-art');
        var fileIn = el.querySelector('#tmeta-file');

        if (deps.store.getArtURL) {
            deps.store.getArtURL(m).then(function (u) {
                if (u) artBox.innerHTML = '<img src="' + esc(u) + '" alt="">';
            });
        }

        el.querySelector('#tmeta-cancel').addEventListener('click', close);

        el.querySelector('#tmeta-pick').addEventListener('click', function () { fileIn.click(); });
        fileIn.addEventListener('change', function () {
            var f = fileIn.files && fileIn.files[0];
            fileIn.value = '';
            if (!f) return;
            deps.store.saveArtwork(m.id, f).then(function () {
                pendingArtUrl = 'local';
                artBox.innerHTML = '<img src="' + esc(URL.createObjectURL(f)) + '" alt="">';
                deps.toast('Carátula guardada en la tribu');
            }).catch(function (e) {
                deps.toast('No se pudo guardar la imagen: ' +
                    String((e && e.message) || e || 'error'));
            });
        });

        if (isMusic) {
            el.querySelector('#tmeta-net').addEventListener('click', function () {
                var q = (el.querySelector('#tm-titulo').value || m.name).replace(/\.[a-z0-9]+$/i, '');
                var art = el.querySelector('#tm-artista').value;
                if (art) q += ' ' + art;
                results.innerHTML = '<p class="tmeta-empty">Buscando en internet…</p>';
                var url = 'https://itunes.apple.com/search?media=music&entity=song&limit=8&term=' +
                    encodeURIComponent(q);
                fetch(url).then(function (r) { return r.json(); }).then(function (data) {
                    var list = (data && data.results) || [];
                    if (!list.length) {
                        results.innerHTML = '<p class="tmeta-empty">Sin resultados para «' + esc(q) + '».</p>';
                        return;
                    }
                    results.innerHTML = list.map(function (t, i) {
                        return '<button class="tmeta-hit" data-i="' + i + '">' +
                            '<img src="' + esc(t.artworkUrl100 || '') + '" alt="">' +
                            '<span><b>' + esc(t.trackName || '') + '</b>' +
                            '<small>' + esc(t.artistName || '') + ' · ' + esc(t.collectionName || '') + '</small></span>' +
                        '</button>';
                    }).join('');
                    results.querySelectorAll('.tmeta-hit').forEach(function (b) {
                        b.addEventListener('click', function () {
                            var t = list[+b.dataset.i];
                            el.querySelector('#tm-titulo').value = t.trackName || '';
                            el.querySelector('#tm-artista').value = t.artistName || '';
                            el.querySelector('#tm-album').value = t.collectionName || '';
                            el.querySelector('#tm-genero').value = t.primaryGenreName || '';
                            el.querySelector('#tm-anio').value = (t.releaseDate || '').slice(0, 4);
                            if (t.artworkUrl100) {
                                pendingArtUrl = t.artworkUrl100.replace('100x100bb', '600x600bb');
                                artBox.innerHTML = '<img src="' + esc(pendingArtUrl) + '" alt="">';
                            }
                            results.innerHTML = '';
                        });
                    });
                }).catch(function () {
                    results.innerHTML = '<p class="tmeta-empty">Sin conexión o búsqueda no disponible.</p>';
                });
            });
        }

        el.querySelector('#tmeta-save').addEventListener('click', function () {
            var patch = {
                titulo: el.querySelector('#tm-titulo').value.trim(),
                artista: el.querySelector('#tm-artista').value.trim(),
                album: el.querySelector('#tm-album').value.trim(),
                genero: el.querySelector('#tm-genero').value.trim(),
                anio: el.querySelector('#tm-anio').value.trim(),
                notas: el.querySelector('#tm-notas').value.trim()
            };

            function finish() {
                deps.store.updateInfo(m.id, patch).then(function () {
                    close();
                    deps.toast('Metadatos guardados');
                    if (deps.onSaved) deps.onSaved();
                });
            }

            // Offline-first: si eligió carátula de internet, la descargamos y
            // queda guardada dentro de la app (blob local, no URL remota).
            if (pendingArtUrl && pendingArtUrl !== 'local') {
                fetch(pendingArtUrl).then(function (r) {
                    if (!r.ok) throw new Error('http ' + r.status);
                    return r.blob();
                }).then(function (blob) {
                    return deps.store.saveArtwork(m.id, blob);
                }).then(finish).catch(function () {
                    // sin red: dejamos la URL remota como respaldo
                    patch.artUrl = pendingArtUrl;
                    finish();
                });
            } else {
                finish();
            }
        });
    }

    return { openInfo: openInfo, openEditor: openEditor, close: close };
})();
