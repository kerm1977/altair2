// ============================================================================
// ARCHIVO: media/msctx.js
// RESPONSABILIDAD: menú contextual del modo selección múltiple.
//   - Long-press sobre una tarjeta ya estando en modo selección.
//   - Acciones en lote: enviar a colección · misma carátula · cerrar.
//   API: TribalMsCtx.open(S, count) — count es la función de multisel.js
//        que devuelve cuántos archivos hay marcados.
// ============================================================================
window.TribalMsCtx = (function () {
    'use strict';

    function open(S, count) {
        var $ = S.$;
        var ov = document.createElement('div');
        ov.className = 'tribal-overlay';
        ov.innerHTML = '<div class="tribal-dialog">' +
            '<h4><i class="bi bi-check2-square"></i> ' + count() +
                ' seleccionado' + (count() > 1 ? 's' : '') + '</h4>' +
            '<div class="ms-ctx">' +
                '<button class="tribal-btn" id="msa-col">' +
                    '<i class="bi bi-folder-plus"></i> Enviar a colección</button>' +
                '<button class="tribal-btn primary" id="msa-art">' +
                    '<i class="bi bi-image"></i> Aplicar la misma carátula ' +
                    'a las seleccionadas</button>' +
                '<button class="tribal-btn" id="msa-close">Cerrar</button>' +
            '</div></div>';
        (S.root || document.body).appendChild(ov);
        var kill = function () { ov.remove(); };
        ov.querySelector('#msa-close').addEventListener('click', kill);
        ov.querySelector('#msa-col').addEventListener('click', function () {
            kill();
            S.openColAssign(Object.keys(S.msSel));
        });
        ov.querySelector('#msa-art').addEventListener('click', function () {
            kill();
            $('ms-art-input').click();
        });
        ov.addEventListener('click', function (e) {
            if (e.target === ov) kill();
        });
    }

    return { open: open };
})();
