// ============================================================================
// ARCHIVO: btchemo.js
// RESPONSABILIDAD: catálogo de emojis del chat tribal (~96) + montaje del
//   panel selector. Los emojis van como literales (UTF-16 completo), nunca
//   por split de caracteres — rompería los pares sustitutos.
// API: window.TribalBtEmoji.{LIST, mount(container, onPick)}
// ============================================================================
window.TribalBtEmoji = (function () {
    'use strict';

    var LIST = [
        // caras
        '😀','😁','😂','🤣','😊','😇','🙂','😉','😍','😘','😜','🤪','🤔','🤨','😐','😴',
        '😌','😎','🥳','🤩','😢','😭','😤','😡','🤯','🥺','😳','🤗','🫡','😶‍🌫️','🫠','🤫',
        // gestos y cuerpo
        '👍','👎','👌','✌️','🤞','🤙','👋','🙌','👏','🙏','💪','🫶','🤝','✍️','👊','🫰',
        // corazones
        '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💯','💢','💫',
        // naturaleza tribal
        '🔥','✨','⭐','🌟','🌞','🌙','☀️','🌵','🌾','🍂','🪶','🏹','🛡️','⚔️','🥁','🪘',
        // fauna
        '🐺','🦅','🐍','🦂','🐆','🦬','🐴','🦌','🐗','🦎','🦉','🐝',
        // música y multimedia
        '🎵','🎶','🎧','🎤','📻','📀','🎬','📷','🖼️','📚','📖','✏️',
        // objetos y señales
        '⚡','💡','📡','📶','🔍','📣','🏕️','🗿','🧭','🏔️','🌋','🌄'
    ];

    // monta el grid dentro del contenedor; onPick(emoji) al tocar uno
    function mount(el, onPick) {
        el.innerHTML = LIST.map(function (e) {
            return '<button type="button" class="btc-emo">' + e + '</button>';
        }).join('');
        el.addEventListener('click', function (ev) {
            var b = ev.target.closest('.btc-emo');
            if (b) onPick(b.textContent);
        });
    }

    return { LIST: LIST, mount: mount };
})();
