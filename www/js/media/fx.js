// ============================================================================
// ARCHIVO: media/fx.js
// RESPONSABILIDAD: Calculadora de divisas tribal — página completa, base USD.
//   · Barra superior tipo buscador: monto + dropdown de la moneda origen
//   · Abajo, una fila por moneda: "1,000 GTQ en colones es tanto"…
//   · La tasa de cada moneda se edita en su propia fila (1 USD = X)
//   · ↻ Actualizar trae tasas reales (media/fxnet.js); sin red quedan
//     las manuales, que se recuerdan en localStorage
//   API: TribalFX.open() / TribalFX.hide()
// ============================================================================
window.TribalFX = (function () {
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
    // respaldo si nunca hubo red ni edición manual
    var DEF = { USD: 1, CRC: 505, GTQ: 7.72, SVC: 8.75, HNL: 26.3, NIO: 36.8,
                PAB: 1, BZD: 2, MXN: 18.2, PEN: 3.75, COP: 4200, EUR: 0.92 };
    var KEY = 'tribal-fx-rates';

    var ov = null, amtEl = null, selEl = null, listEl = null, statusEl = null;
    var rates = null, stamp = null;

    function load() {
        if (rates) return;
        rates = {};
        try {
            var s = JSON.parse(localStorage.getItem(KEY) || 'null');
            if (s && s.rates) { rates = s.rates; stamp = s.stamp || null; }
        } catch (e) { /* corrupto → defaults */ }
        LIST.forEach(function (c) {
            if (!(rates[c.code] > 0)) rates[c.code] = DEF[c.code];
        });
        rates.USD = 1;
    }
    function persist() {
        try { localStorage.setItem(KEY, JSON.stringify({ rates: rates, stamp: stamp })); }
        catch (e) { /* sin espacio → solo sesión */ }
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

    function paintStatus(txt) { if (statusEl) statusEl.textContent = txt; }
    function stampText() {
        return stamp ? ('fuente: open.er-api.com · ' + stamp)
                     : 'tasas manuales (edítalas en cada fila o actualiza)';
    }

    function rowHtml(c, a, code, usd) {
        var eq = usd == null ? '—' : fmt(usd * rates[c.code]);
        var label = isFinite(a) ?
            fmt(a) + ' ' + code + ' en ' + c.name :
            'monto en ' + c.name;
        return '<div class="fx-row" data-c="' + c.code + '">' +
            '<span class="fx-flag">' + c.flag + '</span>' +
            '<div class="fx-rtxt"><b>' + eq + ' ' + c.sym + '</b>' +
            '<small>' + esc(label) + '</small></div>' +
            '<label class="fx-rrate"><span class="fx-pen">✎</span> 1 USD = ' +
            '<input type="number" step="any" min="0" class="fx-rate" ' +
            'title="Tasa manual: toca y escribe" ' +
            'data-c="' + c.code + '" value="' + rates[c.code] + '"' +
            (c.code === 'USD' ? ' disabled' : '') + '> ' + c.sym + '</label>' +
            '</div>';
    }

    function renderList() {
        var a = parseFloat(amtEl.value);
        var code = selEl.value;
        var usd = (isFinite(a) && rates[code] > 0) ? a / rates[code] : null;
        var html = '';
        LIST.forEach(function (c) {
            if (c.code !== code) html += rowHtml(c, a, code, usd);
        });
        listEl.innerHTML = html;
    }
    // tras editar una tasa solo repintan los montos (sin perder el foco)
    function reamount() {
        var a = parseFloat(amtEl.value);
        var code = selEl.value;
        var usd = (isFinite(a) && rates[code] > 0) ? a / rates[code] : null;
        listEl.querySelectorAll('.fx-row').forEach(function (row) {
            var c = find(row.getAttribute('data-c'));
            row.querySelector('b').textContent =
                (usd == null ? '—' : fmt(usd * rates[c.code])) + ' ' + c.sym;
        });
    }

    function onInput(e) {
        var t = e.target;
        if (t === amtEl || t === selEl) return renderList();
        if (t.classList.contains('fx-rate')) {
            var r = parseFloat(t.value);
            if (r > 0) {
                rates[t.getAttribute('data-c')] = r;
                persist(); reamount();
                paintStatus(stampText() + ' · editada');
            }
        }
    }

    function fetchRates() {
        if (!window.TribalFXNet) return paintStatus('módulo de red ausente');
        paintStatus('consultando tasas en línea…');
        TribalFXNet.fetch(function (err, res) {
            if (err) return paintStatus('sin conexión — tasas manuales');
            var n = 0;
            listEl.querySelectorAll('.fx-rate').forEach(function (inp) {
                var code = inp.getAttribute('data-c');
                var v = res.rates[code];
                if (v > 0 && code !== 'USD') { rates[code] = v; inp.value = v; n++; }
            });
            stamp = res.stamp || 'en línea';
            persist(); reamount();
            paintStatus(stampText() + ' · ' + n + ' actualizadas');
        });
    }

    function build() {
        if (ov) return;
        ov = document.createElement('div');
        ov.className = 'tribal-fx';
        var opts = LIST.map(function (c) {
            return '<option value="' + c.code + '">' + c.flag + ' ' + c.code +
                   ' — ' + esc(c.name) + '</option>';
        }).join('');
        ov.innerHTML =
            '<div class="fx-page">' +
            '<div class="fx-head"><button type="button" class="fx-back" ' +
            'aria-label="Volver">‹</button><b>💱 Divisas</b>' +
            '<button type="button" class="fx-fetch">↻ Actualizar</button></div>' +
            '<div class="fx-search">' +
            '<input type="number" step="any" class="fx-amt" inputmode="decimal" ' +
            'placeholder="0.00" aria-label="Monto">' +
            '<select class="fx-sel" aria-label="Moneda origen">' + opts + '</select>' +
            '</div>' +
            '<div class="fx-status"></div>' +
            '<div class="fx-list"></div>' +
            '<div class="fx-foot">Base USD · fuente en línea: open.er-api.com' +
            ' · el lápiz ✎ de cada fila ajusta la tasa a mano.</div>' +
            '</div>';
        document.body.appendChild(ov);
        amtEl = ov.querySelector('.fx-amt');
        selEl = ov.querySelector('.fx-sel');
        listEl = ov.querySelector('.fx-list');
        statusEl = ov.querySelector('.fx-status');
        ov.addEventListener('input', onInput);
        ov.addEventListener('change', onInput);
        ov.addEventListener('click', function (e) {
            if (e.target.closest('.fx-fetch')) fetchRates();
            if (e.target.closest('.fx-back')) hide();
        });
    }

    function open() {
        load();
        build();
        selEl.value = 'USD';
        renderList();
        paintStatus(stampText());
        ov.classList.add('on');
    }
    function hide() { if (ov) ov.classList.remove('on'); }

    return { open: open, hide: hide };
})();
