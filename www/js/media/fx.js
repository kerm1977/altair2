// ============================================================================
// ARCHIVO: media/fx.js
// RESPONSABILIDAD: Calculadora de divisas tribal — base USD.
//   · Una tarjeta por moneda: tasa editable (1 USD = X) + monto editable
//   · Escribir el monto en CUALQUIER tarjeta convierte a todas las demás
//   · ⇄ en una tarjeta la marca como origen (inversión) y enfoca su monto
//   · Tasas: "Actualizar en línea" (media/fxnet.js) o edición manual;
//     se recuerdan en localStorage para no reescribirlas cada vez
//   API: TribalFX.open()
// ============================================================================
window.TribalFX = (function () {
    'use strict';

    var LIST = [
        { code: 'USD', sym: '$',   flag: '🇺🇸', name: 'Dólar (EE. UU.)' },
        { code: 'CRC', sym: '₡',   flag: '🇨🇷', name: 'Colón (Costa Rica)' },
        { code: 'GTQ', sym: 'Q',   flag: '🇬🇹', name: 'Quetzal (Guatemala)' },
        { code: 'SVC', sym: '₡',   flag: '🇸🇻', name: 'Colón (El Salvador)' },
        { code: 'HNL', sym: 'L',   flag: '🇭🇳', name: 'Lempira (Honduras)' },
        { code: 'NIO', sym: 'C$',  flag: '🇳🇮', name: 'Córdoba (Nicaragua)' },
        { code: 'PAB', sym: 'B/.', flag: '🇵🇦', name: 'Balboa (Panamá)' },
        { code: 'BZD', sym: 'BZ$', flag: '🇧🇿', name: 'Dólar (Belice)' },
        { code: 'MXN', sym: '$',   flag: '🇲🇽', name: 'Peso (México)' },
        { code: 'PEN', sym: 'S/',  flag: '🇵🇪', name: 'Sol (Perú)' },
        { code: 'COP', sym: '$',   flag: '🇨🇴', name: 'Peso (Colombia)' },
        { code: 'EUR', sym: '€',   flag: '🇪🇸', name: 'Euro (España)' }
    ];
    // respaldo si nunca hubo red ni edición manual
    var DEF = { USD: 1, CRC: 505, GTQ: 7.72, SVC: 8.75, HNL: 26.3, NIO: 36.8,
                PAB: 1, BZD: 2, MXN: 18.2, PEN: 3.75, COP: 4200, EUR: 0.92 };
    var KEY = 'tribal-fx-rates';

    var ov = null, gridEl = null, statusEl = null;
    var rates = null, stamp = null, curUSD = null, srcCode = 'USD';

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

    function cardHtml(c) {
        return '<div class="fx-card" data-c="' + c.code + '">' +
            '<div class="fx-chead"><span class="fx-flag">' + c.flag + '</span>' +
            '<b>' + c.code + '</b><span class="fx-cname">' + esc(c.name) + '</span>' +
            '<button type="button" class="fx-swap" ' +
            'title="Convertir desde ' + c.code + '">⇄</button></div>' +
            '<label class="fx-rrow">1 USD = ' +
            '<input type="number" step="any" min="0" class="fx-rate" ' +
            'value="' + rates[c.code] + '"' + (c.code === 'USD' ? ' disabled' : '') +
            '> ' + c.sym + '</label>' +
            '<input type="number" step="any" class="fx-amt" inputmode="decimal" ' +
            'placeholder="monto en ' + c.code + '">' +
            '</div>';
    }

    function paintStatus(txt) { if (statusEl) statusEl.textContent = txt; }
    function stampText() {
        return stamp ? ('tasas: ' + stamp) : 'tasas manuales (edita o actualiza)';
    }

    function renderGrid() {
        gridEl.innerHTML = LIST.map(cardHtml).join('');
        markSrc(srcCode);
        refill();
    }
    function markSrc(code) {
        srcCode = code;
        gridEl.querySelectorAll('.fx-card').forEach(function (el) {
            el.classList.toggle('fx-src', el.getAttribute('data-c') === code);
        });
    }
    // repinta todos los montos según curUSD (menos la tarjeta origen si se da)
    function refill() {
        gridEl.querySelectorAll('.fx-card').forEach(function (el) {
            var code = el.getAttribute('data-c');
            var inp = el.querySelector('.fx-amt');
            if (curUSD == null) { if (code !== srcCode) inp.value = ''; return; }
            if (document.activeElement === inp) return;
            var v = curUSD * rates[code];
            inp.value = isFinite(v) ? Math.round(v * 100) / 100 : '';
        });
    }

    function onInput(e) {
        var t = e.target, card = t.closest('.fx-card');
        if (!card) return;
        var code = card.getAttribute('data-c');
        if (t.classList.contains('fx-rate')) {
            var r = parseFloat(t.value);
            if (r > 0) { rates[code] = r; persist(); refill(); paintStatus(stampText() + ' · editada'); }
            return;
        }
        if (t.classList.contains('fx-amt')) {
            markSrc(code);
            var a = parseFloat(t.value);
            curUSD = (isFinite(a) && rates[code] > 0) ? a / rates[code] : null;
            refill();
        }
    }
    function onClick(e) {
        var sw = e.target.closest('.fx-swap');
        if (sw) {
            var code = sw.closest('.fx-card').getAttribute('data-c');
            markSrc(code);
            var inp = sw.closest('.fx-card').querySelector('.fx-amt');
            if (inp) inp.focus();
            return;
        }
        if (e.target.closest('.fx-fetch')) fetchRates();
        if (e.target.closest('.fx-close') || e.target === ov) hide();
    }

    function fetchRates() {
        if (!window.TribalFXNet) return paintStatus('módulo de red ausente');
        paintStatus('consultando tasas en línea…');
        TribalFXNet.fetch(function (err, res) {
            if (err) return paintStatus('sin conexión — tasas manuales');
            var n = 0;
            LIST.forEach(function (c) {
                var v = res.rates[c.code];
                if (v > 0 && c.code !== 'USD') { rates[c.code] = v; n++; }
            });
            stamp = res.stamp || 'en línea';
            persist();
            renderGrid();
            paintStatus(stampText() + ' · ' + n + ' actualizadas');
        });
    }

    function build() {
        if (ov) return;
        ov = document.createElement('div');
        ov.className = 'tribal-fx';
        ov.innerHTML =
            '<div class="fx-box" role="dialog" aria-label="Divisas">' +
            '<div class="fx-head"><b>💱 Divisas</b>' +
            '<button type="button" class="fx-fetch">↻ Actualizar en línea</button>' +
            '<button type="button" class="fx-close" aria-label="Cerrar">✕</button></div>' +
            '<div class="fx-status"></div>' +
            '<div class="fx-grid"></div>' +
            '<div class="fx-foot">Base USD · edita la tasa o el monto en ' +
            'cualquier tarjeta; ⇄ invierte el origen.</div>' +
            '</div>';
        document.body.appendChild(ov);
        gridEl = ov.querySelector('.fx-grid');
        statusEl = ov.querySelector('.fx-status');
        ov.addEventListener('input', onInput);
        ov.addEventListener('click', onClick);
    }

    function open() {
        load();
        build();
        renderGrid();
        paintStatus(stampText());
        ov.classList.add('on');
    }
    function hide() { if (ov) ov.classList.remove('on'); }

    return { open: open, hide: hide };
})();
