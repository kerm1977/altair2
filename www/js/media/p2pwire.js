// ============================================================================
// ARCHIVO: media/p2pwire.js
// RESPONSABILIDAD: cableado de eventos del panel P2P de TRIBALs.
//   - Motores: agregar (formulario vertical), activar, probar, quitar
//   - Trackers: alta en bloque (textarea una por línea), importar .txt,
//     probar individual/todos, quitar
//   - Sembrar: desde la tribu o subiendo archivo del dispositivo
//   API: TribalP2PWire.wire(overlay, deps, helpers)
//   helpers = { seedItem, copyMagnet }
// ============================================================================
window.TribalP2PWire = (function () {
    'use strict';

    function wire(ov, deps, helpers) {
        var X = window.TribalP2PExtra;
        var seedItem = helpers.seedItem;
        var copyMagnet = helpers.copyMagnet;

        function refreshEngines() { X.renderEngines(ov.querySelector('#tp-engines')); }
        function refreshTrackers() { X.renderTrackers(ov.querySelector('#tp-trackers')); }

        // clicks delegados: quitar motor/tracker, probar uno, sembrar, magnet
        ov.addEventListener('click', function (e) {
            var seedB = e.target.closest('[data-seed]');
            var hit = e.target.closest('[data-magnet]');
            var engDel = e.target.closest('[data-eng-del]');
            var trkDel = e.target.closest('[data-trk-del]');
            var engPrb = e.target.closest('[data-eng]');
            var trkPrb = e.target.closest('[data-trk]');
            if (seedB) return seedItem(seedB.dataset.seed);
            if (hit) return TribalP2P.add(hit.dataset.magnet);
            if (engDel) {
                var en = TribalP2P.engines()[+engDel.dataset.engDel];
                return deps.confirm('Quitar motor', '¿Quitar «' +
                    (en ? en.name : 'motor') + '» de los buscadores?', 'Quitar', function () {
                    TribalP2P.removeEngine(+engDel.dataset.engDel);
                    refreshEngines();
                });
            }
            if (trkDel) {
                return deps.confirm('Quitar tracker', '¿Quitar «' +
                    trkDel.dataset.trkDel + '»?', 'Quitar', function () {
                    TribalP2P.removeTracker(trkDel.dataset.trkDel);
                    refreshTrackers();
                });
            }
            if (engPrb && engPrb.classList.contains('tr-probe')) {
                var eg = TribalP2P.engines()[+engPrb.dataset.eng];
                if (eg) X.probeEngineInto(engPrb, eg);
            }
            if (trkPrb && trkPrb.classList.contains('tr-probe')) {
                X.probeInto(trkPrb, TribalP2P.trackers()[+trkPrb.dataset.trk]);
            }
        });

        // doble clic sobre un resultado → empieza la descarga
        ov.addEventListener('dblclick', function (e) {
            var hit = e.target.closest('.tribal-p2p-hit');
            if (!hit) return;
            var b = hit.querySelector('[data-magnet]');
            if (b) TribalP2P.add(b.dataset.magnet);
        });

        // activar/desactivar motor
        ov.addEventListener('change', function (e) {
            var tgl = e.target.closest('[data-eng-tgl]');
            if (tgl) TribalP2P.toggleEngine(+tgl.dataset.engTgl, tgl.checked);
        });

        // ---- motores: individual + bloque (una por línea) + .txt ----
        ov.querySelector('#tp-eng-add').addEventListener('click', function () {
            var k = ov.querySelector('#tp-eng-kind').value;
            var bulk = ov.querySelector('#tp-eng-bulk').value;
            var n = ov.querySelector('#tp-eng-name').value;
            var u = ov.querySelector('#tp-eng-url').value;
            var added = 0;
            if (bulk.trim()) added += TribalP2P.addEngines(bulk, k);
            if (n.trim() || u.trim())
                added += TribalP2P.addEngine(n, u, k) ? 1 : 0;
            if (!added)
                return deps.toast('Pon URL con %q — una por línea (o Nombre|URL)');
            ov.querySelector('#tp-eng-name').value = '';
            ov.querySelector('#tp-eng-url').value = '';
            ov.querySelector('#tp-eng-bulk').value = '';
            refreshEngines();
            deps.toast(added + ' motor' + (added > 1 ? 'es' : '') + ' agregados');
        });
        ov.querySelector('#tp-eng-file').addEventListener('click', function () {
            ov.querySelector('#tp-eng-file-input').click();
        });
        ov.querySelector('#tp-eng-file-input').addEventListener('change', function () {
            var f = this.files && this.files[0];
            this.value = '';
            if (!f) return;
            var k = ov.querySelector('#tp-eng-kind').value;
            var reader = new FileReader();
            reader.onload = function () {
                var n = TribalP2P.addEngines(reader.result, k);
                refreshEngines();
                deps.toast(n ? (n + ' motores importados del .txt')
                             : 'El .txt no traía motores nuevos');
            };
            reader.readAsText(f);
        });
        ov.querySelector('#tp-eng-test').addEventListener('click', function () {
            ov.querySelectorAll('[data-eng]').forEach(function (el) {
                var eg = TribalP2P.engines()[+el.dataset.eng];
                if (eg) X.probeEngineInto(el, eg);
            });
        });

        // ---- trackers: bloque (una por línea) + individual + .txt ----
        ov.querySelector('#tp-trk-add').addEventListener('click', function () {
            var bulk = ov.querySelector('#tp-tracker-bulk').value;
            var one = ov.querySelector('#tp-tracker').value.trim();
            var n = TribalP2P.addTrackers(bulk + '\n' + one);
            if (!n) return deps.toast('Nada que agregar');
            ov.querySelector('#tp-tracker-bulk').value = '';
            ov.querySelector('#tp-tracker').value = '';
            refreshTrackers();
            deps.toast(n + ' tracker' + (n > 1 ? 's' : '') + ' agregados');
            // probar los recién agregados
            TribalP2P.trackers().slice(-n).forEach(function (u) {
                var el = ov.querySelector('[data-trk="' +
                    TribalP2P.trackers().indexOf(u) + '"]');
                if (el) X.probeInto(el, u);
            });
        });
        ov.querySelector('#tp-trk-file').addEventListener('click', function () {
            ov.querySelector('#tp-trk-file-input').click();
        });
        ov.querySelector('#tp-trk-file-input').addEventListener('change', function () {
            var f = this.files && this.files[0];
            this.value = '';
            if (!f) return;
            var reader = new FileReader();
            reader.onload = function () {
                var n = TribalP2P.addTrackers(reader.result);
                refreshTrackers();
                deps.toast(n ? (n + ' trackers importados del .txt')
                             : 'El .txt no traía trackers nuevos');
            };
            reader.readAsText(f);
        });
        ov.querySelector('#tp-trk-test').addEventListener('click', function () {
            ov.querySelectorAll('[data-trk]').forEach(function (el) {
                X.probeInto(el, TribalP2P.trackers()[+el.dataset.trk]);
            });
        });

        // ---- sembrar desde el dispositivo ----
        ov.querySelector('#tp-seedfile-btn').addEventListener('click', function () {
            ov.querySelector('#tp-seedfile').click();
        });
        ov.querySelector('#tp-seedfile').addEventListener('change', function () {
            var f = this.files && this.files[0];
            this.value = '';
            if (!f) return;
            var j = TribalP2P.seed({ name: f.name, mime: f.type }, f);
            if (j) { deps.toast('Sembrando «' + f.name + '»'); copyMagnet(j); }
        });
    }

    return { wire: wire };
})();
