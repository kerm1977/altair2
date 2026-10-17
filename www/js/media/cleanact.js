// ============================================================================
// ARCHIVO: media/cleanact.js
// RESPONSABILIDAD: acciones del Limpiador tribal (lógica, sin markup).
//   - scan(): análisis de basura con progreso + permiso «todos los archivos»
//   - del():  borrado confirmado de lo marcado + caché propia + sincronizar
//             la biblioteca (refs que quedaron apuntando a archivos muertos)
//   - dups(): búsqueda de duplicados → vista de grupos (cleandup.js)
//   ctx = {ov, deps, say, paintDisk, paintFree, paintCats, isBusy, setBusy}
// ============================================================================
window.TribalCleanAct = (function () {
    'use strict';

    var D = window.TribalCleanData;

    function scan(ctx) {
        ctx.setBusy(true);
        ctx.say('Analizando el almacenamiento…');
        D.storageInfo().then(function () {
            ctx.paintDisk();
            return D.scan(function (p) {
                ctx.say('🔥 ' + (p.found || 0) + ' hallazgos — ' + (p.dir || ''));
            });
        }).then(function (r) {
            ctx.setBusy(false);
            if (r && r.needAccess) {
                ctx.say('Android no deja leer el almacenamiento. Activa ' +
                    '«Acceso a todos los archivos» para TRIBALs y reintenta.');
                var TN = window.Capacitor.Plugins.TribalNative;
                if (TN && TN.openAllFilesAccess)
                    TN.openAllFilesAccess().catch(function () {});
                return;
            }
            var total = 0;
            D.cats.forEach(function (c) { total += D.state.found[c.id].length; });
            ctx.say(r && r.cancelled
                ? 'Análisis detenido — ' + total + ' hallazgos parciales.'
                : '✅ Análisis listo — ' + total + ' hallazgos.');
            ctx.paintCats();
        }).catch(function (e) {
            ctx.setBusy(false);
            ctx.say('El análisis falló: ' + (e && e.message || e));
        });
    }

    function del(ctx) {
        var paths = [], own = false;
        ctx.ov.querySelectorAll('.cln-cat input:checked').forEach(function (c) {
            var id = c.dataset.cat;
            if (id === 'own') { own = true; return; }
            D.picked(id).forEach(function (it) { paths.push(it.path); });
        });
        if (!paths.length && !own) return;
        var toast = ctx.deps.toast || function () {};
        ctx.deps.confirm('Limpieza tribal',
            'Se borrarán ' + paths.length + ' elementos del dispositivo' +
            (own ? ' y la caché/cookies de la app' : '') +
            '. No hay vuelta atrás.',
            'Limpiar', function () {
                ctx.setBusy(true); ctx.paintFree();
                ctx.say('Limpiando…');
                var chain = own ? D.clearOwn() : Promise.resolve({ freed: 0 });
                chain.then(function (r) {
                    return D.del(paths).then(function (d) {
                        d.freed += (r && r.freed) || 0;
                        return d;
                    });
                }).then(function (r) {
                    ctx.setBusy(false);
                    toast('🔥 ' + D.fmt(r.freed) + ' liberados — ' +
                          r.deleted + ' borrados' +
                          (r.failed ? ', ' + r.failed + ' no se pudieron' : ''));
                    syncLibrary(ctx, paths);
                    scan(ctx);   // re-analizar: el panel queda al día
                }).catch(function (e) {
                    ctx.setBusy(false);
                    ctx.say('Falló: ' + (e && e.message || e));
                });
            });
    }

    function dups(ctx) {
        ctx.setBusy(true);
        ctx.say('Buscando duplicados (mismo tamaño → misma firma)…');
        D.dups(function (p) {
            ctx.say('🔥 ' + (p.found || 0) + ' comparados — ' + (p.dir || ''));
        }).then(function () {
            ctx.setBusy(false);
            if (!D.state.dupGroups.length) {
                ctx.say('✅ Sin duplicados — cada archivo es único.');
                return;
            }
            ctx.say('');
            window.TribalCleanDup.open(ctx.deps, D.state.dupGroups,
                function (deleted) {
                    syncLibrary(ctx, deleted);
                    D.storageInfo().then(ctx.paintDisk);
                });
        }).catch(function (e) {
            ctx.setBusy(false);
            ctx.say('Falló: ' + (e && e.message || e));
        });
    }

    // los refs del escáner que apuntaban a archivos ya borrados deben salir
    // del índice — si no, la biblioteca mostraría muertos
    function syncLibrary(ctx, paths) {
        if (ctx.deps.store && ctx.deps.store.dropPaths)
            ctx.deps.store.dropPaths(paths);
        if (ctx.deps.reload) ctx.deps.reload();
    }

    return { scan: scan, del: del, dups: dups };
})();
