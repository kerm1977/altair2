// ============================================================================
// ARCHIVO: media/fxdata.js
// RESPONSABILIDAD: datos de la calculadora de divisas — catálogo de monedas,
//   tasas por defecto, carga/guardado en localStorage y utilidades de formato.
//   API: TribalFXData.LIST · .load() → {rates, api, stamp} · .persist(obj)
//        · .esc(s) · .fmt(v) · .find(code)
// ============================================================================
window.TribalFXData = (function () {
    'use strict';

    var LIST = [
        { code: 'USD', sym: '$',   flag: '🇺🇸', name: 'dólares (EE. UU.)' },
        { code: 'CRC', sym: '₡',   flag: '🇨🇷', name: 'colones (Costa Rica)' },
        { code: 'GTQ', sym: 'Q',   flag: '🇬🇹', name: 'quetzales (Guatemala)' },
        { code: 'SVC', sym: '₡',   flag: '🇸🇻', name: 'colones (El Salvador)' },
        { code: 'HNL', sym: 'L',   flag: '🇭🇳', name: 'lempiras (Honduras)' },
        { code: 'NIO', sym: 'C$',  flag: '🇳🇮', name: 'córdobas (Nicaragua)' },
        { code: 'PAB', sym: 'B/.', flag: '🇵🇦', name: 'balboas (Panamá)' },
        { code: 'BZD', sym: 'BZ$', flag: '🇧🇿', name: 'dólares (Belice)' },
        { code: 'MXN', sym: '$',   flag: '🇲🇽', name: 'pesos (México)' },
        { code: 'PEN', sym: 'S/',  flag: '🇵🇪', name: 'soles (Perú)' },
        { code: 'COP', sym: '$',   flag: '🇨🇴', name: 'pesos (Colombia)' },
        { code: 'EUR', sym: '€',   flag: '🇪🇸', name: 'euros (España)' }
    ];
    var DEF = { USD: 1, CRC: 505, GTQ: 7.72, SVC: 8.75, HNL: 26.3, NIO: 36.8,
                PAB: 1, BZD: 2, MXN: 18.2, PEN: 3.75, COP: 4200, EUR: 0.92 };
    var KEY = 'tribal-fx-rates';

    function load() {
        var st = { rates: {}, api: {}, stamp: null };
        try {
            var s = JSON.parse(localStorage.getItem(KEY) || 'null');
            if (s && s.rates) { st.rates = s.rates; st.api = s.api || {}; st.stamp = s.stamp; }
        } catch (e) { /* corrupto → defaults */ }
        LIST.forEach(function (c) {
            if (!(st.rates[c.code] > 0)) st.rates[c.code] = DEF[c.code];
        });
        st.rates.USD = 1;
        return st;
    }
    function persist(st) {
        try {
            localStorage.setItem(KEY, JSON.stringify(
                { rates: st.rates, api: st.api, stamp: st.stamp }));
        } catch (e) { /* solo sesión */ }
    }
    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }
    function fmt(v) {
        return v.toLocaleString('es-CR', { minimumFractionDigits: 2,
                                           maximumFractionDigits: 2 });
    }
    function find(code) {
        for (var i = 0; i < LIST.length; i++) if (LIST[i].code === code) return LIST[i];
        return LIST[0];
    }

    return { LIST: LIST, load: load, persist: persist,
             esc: esc, fmt: fmt, find: find };
})();
