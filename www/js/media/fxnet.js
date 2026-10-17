// ============================================================================
// ARCHIVO: media/fxnet.js
// RESPONSABILIDAD: Traer las tasas de cambio en línea (base USD).
//   Fuente: open.er-api.com — gratuito, sin llave, cubre todas las monedas
//   necesarias. El API oficial del BCCR (indicadores económicos) exige un
//   token registrado por correo; sin credenciales no se puede consultar —
//   queda como opción futura si el usuario registra su token.
//   Sin conexión → cb(err) y el módulo sigue con tasas manuales.
//   API: TribalFXNet.fetch(cb) → cb(err, { rates, stamp })
// ============================================================================
window.TribalFXNet = (function () {
    'use strict';

    var URL = 'https://open.er-api.com/v6/latest/USD';

    function fetch(cb) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', URL, true);
        xhr.timeout = 8000;
        xhr.onload = function () {
            if (xhr.status !== 200) return cb(new Error('HTTP ' + xhr.status));
            try {
                var d = JSON.parse(xhr.responseText);
                if (!d || d.result !== 'success' || !d.rates) {
                    return cb(new Error('respuesta inválida'));
                }
                cb(null, {
                    rates: d.rates,
                    stamp: d.time_last_update_utc || d.time_last_update || 'en línea'
                });
            } catch (e) { cb(e); }
        };
        xhr.onerror = function () { cb(new Error('red')); };
        xhr.ontimeout = function () { cb(new Error('timeout')); };
        xhr.send();
    }

    return { fetch: fetch };
})();
