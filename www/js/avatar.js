// ============================================================================
// ARCHIVO: avatar.js
// RESPONSABILIDAD: avatar por defecto 100% offline (reemplaza ui-avatars.com).
//   - TribalAvatar.svg(nombre): data URI SVG con iniciales en paleta tribal
//   - TribalAvatar.DEFAULT: ruta de la imagen local img/avatar-default.svg
// ============================================================================
window.TribalAvatar = (function () {
    'use strict';

    var DEFAULT = 'img/avatar-default.svg';

    function initials(name) {
        var p = String(name || 'U').trim().split(/\s+/);
        return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
    }

    function svg(name) {
        var ini = initials(name);
        var s =
            '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150">' +
            '<rect width="150" height="150" fill="#241408"/>' +
            '<circle cx="75" cy="75" r="60" fill="#e2602e" stroke="#f0b429" stroke-width="4"/>' +
            '<circle cx="75" cy="75" r="50" fill="none" stroke="#f3e6cf" ' +
                'stroke-width="2" stroke-dasharray="4 4"/>' +
            '<text x="75" y="92" font-family="Georgia,serif" font-size="52" ' +
                'font-weight="bold" fill="#f3e6cf" text-anchor="middle">' + ini + '</text>' +
            '</svg>';
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(s);
    }

    return { svg: svg, DEFAULT: DEFAULT };
})();
