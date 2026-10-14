// ============================================================================
// ARCHIVO: media/p2pui.js
// RESPONSABILIDAD: interfaz del módulo P2P de TRIBALs.
//   - Magnet instantáneo · buscador multi-motor · sembrar (tribu o dispositivo)
//   - Acordeones EXCLUSIVOS: abrir uno cierra el resto (name="tpacc"/"tpfiles")
//   - Lista de torrents: progreso total + acordeón por archivo (cada archivo
//     con su barra propia) · pausa/reanudar/reconectar/magnet/eliminar
//   - Configuración: motores de búsqueda y trackers (agregar/probar/quitar)
//   API: TribalP2PUI.open(S) · S = contexto Sono (extDeps)
// ============================================================================
window.TribalP2PUI = (function () {
    'use strict';
    var ov = null, deps = null, ticker = null, boundDone = false;
    var X = function () { return window.TribalP2PExtra; };

    function stLabel(s) {
        if (s === 'netwait') {
            return 'Esperando ' + (TribalP2P.getNet() === 'wifi' ? 'Wi-Fi' : 'datos');
        }
        return { queued: 'En cola', metadata: 'Obteniendo datos…',
                 downloading: 'Descargando', paused: 'Pausado',
                 seed: 'Sembrando', done: 'Completo', error: 'Error' }[s] || s;
    }

    // ------------------------------------------------------------- jobs ----
    function renderJobs() {
        var box = ov.querySelector('#tp-jobs');
        var jobs = TribalP2P.jobs();
        if (!jobs.length) {
            box.innerHTML = '<div class="tribal-empty-mini"><i class="bi bi-diagram-3"></i>' +
                '<p>Sin torrents. Pega un magnet o busca arriba.</p></div>';
            return;
        }
        // preservar qué acordeones están abiertos al re-renderizar
        var openFile = box.querySelector('details.tp-files[open]');
        var openMag = box.querySelector('details.tp-magnet[open]');
        var openId = openFile ? openFile.dataset.for : null;
        var magId = openMag ? openMag.dataset.for : null;
        box.innerHTML = jobs.map(function (j) {
            return window.TribalP2PJobs.jobHtml(j, stLabel);
        }).join('');
        if (openId) {
            var d = box.querySelector('details.tp-files[data-for="' + openId + '"]');
            if (d) d.open = true;
        }
        if (magId) {
            var m = box.querySelector('details.tp-magnet[data-for="' + magId + '"]');
            if (m) m.open = true;
        }
    }

    function renderConsole() {
        var box = ov.querySelector('#tp-console');
        if (!box) return;
        var ls = TribalP2P.logs();
        var atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
        box.innerHTML = ls.map(function (l) {
            var cls = /ERROR|falló|caído|Rechazados/i.test(l.m) ? ' tr-log-err'
                    : (/✓|COMPLETO|peer/i.test(l.m) ? ' tr-log-ok' : '');
            return '<div class="tr-log' + cls + '"><span>' + l.t +
                '</span>' + X().esc(l.m) + '</div>';
        }).join('') || '<div class="tribal-empty-mini"><p>Sin eventos aún — ' +
            'aquí aparece todo lo del motor</p></div>';
        if (atBottom) box.scrollTop = box.scrollHeight;
    }

    // ----------------------------------------------------------- helpers ---
    function copyMagnet(j) {
        var done = function () { deps.toast('Magnet copiado'); };
        if (navigator.clipboard && navigator.clipboard.writeText)
            navigator.clipboard.writeText(j.magnet).then(done, function () { fallback(j.magnet, done); });
        else fallback(j.magnet, done);
    }
    function shareMagnet(j) {
        var P = window.Capacitor && window.Capacitor.Plugins;
        if (P && P.Share && P.Share.share)
            return P.Share.share({ title: j.name || 'Magnet tribal',
                text: j.magnet }).catch(function () {});
        if (navigator.share)
            return navigator.share({ title: j.name || 'Magnet',
                text: j.magnet }).catch(function () {});
        copyMagnet(j);   // sin share nativo → al menos queda en el portapapeles
    }
    function fallback(txt, done) {
        var ta = document.createElement('textarea');
        ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) {}
        ta.remove();
    }
    function seedItem(id) {
        var m = (deps.items || []).find(function (x) { return x.id === id; });
        if (!m) return;
        deps.urlFor(m, function (u) {
            fetch(u).then(function (r) { return r.blob(); }).then(function (b) {
                var j = TribalP2P.seed(m, b);
                if (j) {
                    deps.toast('Sembrando «' + m.name + '»');
                    if (X().magnetDialog)
                        X().magnetDialog(j, deps.mount, deps.toast);
                    else if (j.magnet) copyMagnet(j);
                }
            });
        });
    }
    function playFile(jobId, path) {
        var j = TribalP2P.jobs().find(function (x) { return x.id === jobId; });
        if (!j || !j.torrent) return;
        var f = j.torrent.files.find(function (x) { return (x.path || x.name) === path; });
        if (f) deps.playP2P(f);
    }
    function completeModal(j) {
        var d = document.createElement('div');
        d.className = 'tribal-overlay tribal-p2p-done';
        d.innerHTML = '<div class="tribal-dialog tribal-p2p-donebox">' +
            '<i class="bi bi-check-circle-fill"></i><h3>Descarga completa</h3>' +
            '<p>«' + X().esc(j.name || 'Torrent') + '» ya está en la tribu.</p>' +
            '<button class="tribal-btn">Listo</button></div>';
        (deps.mount || document.body).appendChild(d);
        d.querySelector('button').addEventListener('click', function () { d.remove(); });
        setTimeout(function () { if (d.parentNode) d.remove(); }, 12000);
    }
    function close() {
        if (ticker) { clearInterval(ticker); ticker = null; }
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = null;
    }

    // -------------------------------------------------------- eventos -------
    function onJobClick(e) {
        var play = e.target.closest('.tr-play');
        var hit = e.target.closest('[data-magnet]');
        var b = e.target.closest('[data-tp]');
        if (hit) return TribalP2P.add(hit.dataset.magnet);
        if (play) return playFile(play.dataset.id, play.dataset.fp);
        if (!b) return;
        var j = TribalP2P.jobs().find(function (x) { return x.id === b.dataset.id; });
        if (!j) return;
        var tp = b.dataset.tp;
        if (tp === 'pause')
            j.status === 'paused' ? TribalP2P.resume(j.id) : TribalP2P.pause(j.id);
        else if (tp === 'recon') {
            TribalP2P.reconnect(j.id);
            deps.toast('Reconectando «' + (j.name || 'torrent') + '»…');
        }
        else if (tp === 'force') {
            var ok = TribalP2P.forceComm(j.id);
            deps.toast(ok ? 'Anunciando de nuevo en los trackers…'
                          : 'Sin canal vivo — reconectando…');
        }
        else if (tp === 'fpause') {
            // 0 = archivo detenido; al reanudar vuelve a prioridad media
            TribalP2P.setFilePrio(j.id, +b.dataset.fi,
                +b.dataset.cur === 0 ? 4 : 0);
        }
        else if (tp === 'fprio') {
            var cur = +b.dataset.cur;
            TribalP2P.setFilePrio(j.id, +b.dataset.fi,
                cur === 0 || cur <= 2 ? 4 : cur < 7 ? 7 : 1);
        }
        else if (tp === 'magnet') copyMagnet(j);
        else if (tp === 'share') shareMagnet(j);
        else if (tp === 'del') deps.confirm('Eliminar torrent',
            '¿Sacar «' + (j.name || 'torrent') + '» de la lista?' +
            ' Los datos descargados se pierden.', 'Eliminar', function () {
            TribalP2P.remove(j.id);
        });
    }

    // el cableado de motores/trackers/sembrar vive en p2pwire.js
    function wireCfg() {
        ov.querySelector('#tp-jobs').addEventListener('click', onJobClick);
        if (window.TribalP2PWire) TribalP2PWire.wire(ov, deps, {
            seedItem: seedItem, copyMagnet: copyMagnet
        });
    }

    // ------------------------------------------------------------- open ----
    function open(S) {
        deps = S;
        TribalP2P.bind(S.store, S.toast);
        TribalP2P.restore();
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = document.createElement('div');
        ov.className = 'tribal-overlay tribal-p2p-ov';
        ov.innerHTML = X().panelHtml();
        (S.mount || document.body).appendChild(ov);

        ov.querySelector('#tp-max').value = String(TribalP2P.getMax());
        ov.querySelector('#tp-net').value = TribalP2P.getNet();
        ov.querySelector('#tp-close').addEventListener('click', close);
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
        ov.querySelector('#tp-add').addEventListener('click', function () {
            var inp = ov.querySelector('#tp-magnet');
            if (TribalP2P.add(inp.value)) inp.value = '';
        });
        // torrent de prueba: «Sintel» (Blender Foundation, dominio público,
        // enjambre sanísimo — sirve para verificar descarga real)
        ov.querySelector('#tp-test').addEventListener('click', function () {
            var TEST = 'magnet:?xt=urn:btih:' +
                '08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel';
            if (TribalP2P.add(TEST))
                deps.toast('Probando con «Sintel» (dominio público)');
        });
        ov.querySelector('#tp-go').addEventListener('click', function () {
            var q = ov.querySelector('#tp-q').value.trim();
            if (q) X().search(ov.querySelector('#tp-results'), q);
        });
        ov.querySelector('#tp-q').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') ov.querySelector('#tp-go').click();
        });
        ov.querySelector('#tp-max').addEventListener('change', function () {
            TribalP2P.setMax(+this.value);
        });
        ov.querySelector('#tp-net').addEventListener('change', function () {
            TribalP2P.setNet(this.value);
            var k = TribalP2P.netKind();
            deps.toast(this.value === 'any' ? 'Descargas en Wi-Fi y datos'
                : 'Descargas solo por ' +
                  (this.value === 'wifi' ? 'Wi-Fi' : 'datos') +
                  (k !== 'unknown' && k !== this.value && this.value !== 'any'
                      ? ' — ahora estás en ' +
                        (k === 'wifi' ? 'Wi-Fi' : 'datos') : ''));
        });
        X().renderEngines(ov.querySelector('#tp-engines'));
        X().renderTrackers(ov.querySelector('#tp-trackers'));
        window.TribalP2PJobs.fillSeed(ov.querySelector('#tp-seedlist'), S.items);
        wireCfg();
        ov.querySelector('#tp-log-clear').addEventListener('click', function () {
            TribalP2P.clearLog(); renderConsole();
        });
        ov.querySelector('#tp-log-copy').addEventListener('click', function () {
            var txt = TribalP2P.logs().map(function (l) {
                return '[' + l.t + '] ' + l.m;
            }).join('\n') || 'sin eventos';
            var done = function () { deps.toast('Consola copiada'); };
            if (navigator.clipboard && navigator.clipboard.writeText)
                navigator.clipboard.writeText(txt).then(done,
                    function () { fallback(txt, done); });
            else fallback(txt, done);
        });
        renderJobs();
        renderConsole();
        ticker = setInterval(function () { renderJobs(); renderConsole(); }, 1000);
    }

    return {
        open: function (S) {
            if (!boundDone) {
                TribalP2P.on('done', function (j) {
                    completeModal(j);
                    // lo descargado ya entró al store → repintar la tribu
                    if (deps && deps.reload) deps.reload();
                });
                // la importación es async — repintar de nuevo cuando el
                // último archivo del torrent ya está indexado
                TribalP2P.on('imported', function () {
                    if (deps && deps.reload) deps.reload();
                });
                TribalP2P.on('change', function () { if (ov) renderJobs(); });
                boundDone = true;
            }
            open(S);
        },
        close: close
    };
})();
