// ============================================================================
// ARCHIVO: media/fx.js
// RESPONSABILIDAD: Calculadora de divisas tribal — página completa, base USD.
//   · Banda de referencia arriba: "tipo de cambio del dólar" en TEXTO PLANO
//     (tasa de referencia + la de open.er-api.com, para comparar)
//   · Buscador: monto + dropdown de la moneda origen
//   · Lista de conversiones; la tasa de cada fila también es texto plano
//   · Ajuste manual: TOCAR una tasa la vuelve editable solo en ese momento
//   Datos/persistencia en media/fxdata.js · red en media/fxnet.js
//   API: TribalFX.open() / TribalFX.hide()
// ============================================================================
window.TribalFX = (function () {
    'use strict';

    var D = window.TribalFXData;
    var LIST, esc, fmt, find, persist;
    var ov, amtEl, selEl, listEl, statusEl, refEl;
    var st; // { rates, api, stamp }

    function boot() {
        if (st) return;
        LIST = D.LIST; esc = D.esc; fmt = D.fmt; find = D.find; persist = D.persist;
        st = D.load();
    }
    // moneda de referencia para la banda del dólar (si el origen es USD → CRC)
    function refCode() {
        var c = selEl ? selEl.value : 'USD';
        return c === 'USD' ? 'CRC' : c;
    }
    function paintStatus(t) { if (statusEl) statusEl.textContent = t; }
    function stampText() {
        return st.stamp ? ('fuente: open.er-api.com · ' + st.stamp)
                        : 'tasas manuales — toca una tasa para ajustarla';
    }

    // banda superior: tipo de cambio del dólar (referencia vs API) — texto
    function paintRef() {
        var c = find(refCode()), api = st.api[c.code];
        refEl.innerHTML = 'Tipo de cambio del dólar · ' +
            '<b class="fx-rtext" data-c="' + c.code + '" ' +
            'title="Toca para ajustar a mano">1 USD = ' + st.rates[c.code] +
            ' ' + c.sym + '</b>' + (api && api !== st.rates[c.code] ?
            ' <small>open.er-api.com: ' + api + ' ' + c.sym + '</small>' : '');
    }

    function rowHtml(c, a, code, usd) {
        var eq = usd == null ? '—' : fmt(usd * st.rates[c.code]);
        var label = isFinite(a) ? fmt(a) + ' ' + code + ' en ' + c.name
                                : 'monto en ' + c.name;
        return '<div class="fx-row" data-c="' + c.code + '">' +
            '<span class="fx-flag">' + c.flag + '</span>' +
            '<div class="fx-rtxt"><b>' + eq + ' ' + c.sym + '</b>' +
            '<small>' + esc(label) + '</small></div>' +
            '<span class="fx-rtext" data-c="' + c.code + '" ' +
            'title="Toca para ajustar a mano">1 USD = ' + st.rates[c.code] +
            ' ' + c.sym + '</span></div>';
    }
    function renderList() {
        var a = parseFloat(amtEl.value), code = selEl.value;
        var usd = (isFinite(a) && st.rates[code] > 0) ? a / st.rates[code] : null;
        var html = '';
        LIST.forEach(function (c) {
            if (c.code !== code) html += rowHtml(c, a, code, usd);
        });
        listEl.innerHTML = html;
        paintRef();
    }
    function reamount() {
        var a = parseFloat(amtEl.value), code = selEl.value;
        var usd = (isFinite(a) && st.rates[code] > 0) ? a / st.rates[code] : null;
        listEl.querySelectorAll('.fx-row').forEach(function (row) {
            var c = find(row.getAttribute('data-c'));
            row.querySelector('b').textContent =
                (usd == null ? '—' : fmt(usd * st.rates[c.code])) + ' ' + c.sym;
        });
    }

    // tocar una tasa (texto plano) la vuelve campo SOLO mientras se edita
    function startEdit(code, holder) {
        var inp = document.createElement('input'), done = false;
        inp.type = 'number'; inp.step = 'any'; inp.min = '0';
        inp.className = 'fx-rate-edit'; inp.value = st.rates[code];
        holder.parentNode.replaceChild(inp, holder);
        inp.focus(); inp.select();
        function end(ok) {
            if (done) return;
            done = true;
            var v = parseFloat(inp.value);
            if (ok && v > 0) {
                st.rates[code] = v; persist(st);
                paintStatus('tasa ' + code + ' ajustada a mano');
            }
            renderList();
        }
        inp.addEventListener('keydown', function (e) {
            e.stopPropagation();
            if (e.key === 'Enter') end(true);
            else if (e.key === 'Escape') end(false);
        });
        inp.addEventListener('blur', function () { end(true); });
    }

    function onInput(e) {
        if (e.target === amtEl || e.target === selEl) renderList();
    }
    function onClick(e) {
        if (e.target.closest('.fx-fetch')) return fetchRates();
        if (e.target.closest('.fx-back')) return hide();
        var rt = e.target.closest('.fx-rtext');
        if (rt) startEdit(rt.getAttribute('data-c'), rt);
    }

    function fetchRates() {
        if (!window.TribalFXNet) return paintStatus('módulo de red ausente');
        paintStatus('consultando open.er-api.com…');
        TribalFXNet.fetch(function (err, res) {
            if (err) return paintStatus('sin conexión — tasas manuales');
            st.api = res.rates; st.stamp = res.stamp || 'en línea';
            var n = 0;
            LIST.forEach(function (c) {
                var v = res.rates[c.code];
                if (v > 0 && c.code !== 'USD') { st.rates[c.code] = v; n++; }
            });
            persist(st); renderList();
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
            '<div class="fx-ref"></div>' +
            '<div class="fx-search">' +
            '<input type="number" step="any" class="fx-amt" inputmode="decimal" ' +
            'placeholder="0.00" aria-label="Monto">' +
            '<select class="fx-sel" aria-label="Moneda origen">' + opts + '</select>' +
            '</div>' +
            '<div class="fx-status"></div>' +
            '<div class="fx-list"></div>' +
            '<div class="fx-foot">Base USD · toca una tasa para ajustarla ' +
            'a mano · ↻ trae open.er-api.com</div>' +
            '</div>';
        document.body.appendChild(ov);
        amtEl = ov.querySelector('.fx-amt');
        selEl = ov.querySelector('.fx-sel');
        listEl = ov.querySelector('.fx-list');
        statusEl = ov.querySelector('.fx-status');
        refEl = ov.querySelector('.fx-ref');
        ov.addEventListener('input', onInput);
        ov.addEventListener('change', onInput);
        ov.addEventListener('click', onClick);
    }

    function open() {
        boot(); build();
        selEl.value = 'USD';
        renderList();
        paintStatus(stampText());
        ov.classList.add('on');
    }
    function hide() { if (ov) ov.classList.remove('on'); }

    return { open: open, hide: hide };
})();
