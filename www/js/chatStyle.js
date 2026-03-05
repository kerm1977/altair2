// =====================================================================
// ARCHIVO: chatStyle.js
// RESPONSABILIDAD: Funciones visuales, modales, adjuntos y utilidades del Chat.
// =====================================================================

let chatInterval = null;

window.abrirModalChat = async function() {
    let modalEl = document.getElementById('modalChat');
    
    if (!modalEl) {
        try {
            const res = await fetch('chat.html');
            if (!res.ok) throw new Error('Archivo chat.html no encontrado');
            const html = await res.text();
            
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            modalEl = tempDiv.querySelector('#modalChat');
            if (!modalEl) modalEl = tempDiv.children[0]; 
            
            document.body.appendChild(modalEl);
            
            // Conectar los Eventos nativos de Bootstrap
            modalEl.addEventListener('shown.bs.modal', () => {
                const buscador = document.getElementById('buscador-input');
                if (buscador) buscador.value = ''; // Limpiar buscador al abrir
                window.refrescarChat();
                chatInterval = setInterval(window.refrescarChat, 3500);
            });

            modalEl.addEventListener('hidden.bs.modal', () => {
                if (chatInterval) clearInterval(chatInterval);
                if (window.volverAContactos) window.volverAContactos(); // Reset a la lista al cerrar
            });

            // Permitir el uso del "Enter" para enviar
            const inputMsg = document.getElementById('chat-msg-input');
            if (inputMsg) {
                inputMsg.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') window.enviarAccionChat();
                });
            }
        } catch (e) {
            console.error("Error cargando el chat:", e);
            alert("Error al cargar el chat. Verifica que chat.html exista.");
            return;
        }
    }
    
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
};

window.refrescarChat = async function() {
    if (!window.ChatManager) return;
    
    if (window.ChatManager.chatActivoPin) {
        const msgs = await window.ChatManager.obtenerMensajesPrivados();
        window.ChatManager.renderizarMensajes(msgs, 'chat-window');
    } else {
        const contactos = await window.ChatManager.obtenerContactos();
        window.ChatManager.renderizarContactos(contactos);
    }
    window.revisarNotificacionesGlobales();
};

window.actualizarEstadoAdjunto = function(input) {
    const label = document.getElementById('label-adjunto');
    if (input.files && input.files[0]) {
        window.tempFile = input.files[0];
        label.classList.add('btn-adjunto-active');
        label.innerHTML = '<i class="bi bi-check2 fs-5"></i>';
    } else {
        window.tempFile = null;
        label.classList.remove('btn-adjunto-active');
        label.innerHTML = '<i class="bi bi-paperclip fs-5"></i>';
    }
};

window.enviarAccionChat = async function() {
    const input = document.getElementById('chat-msg-input');
    const txt = input ? input.value.trim() : '';
    const file = window.tempFile;
    
    if (!txt && !file) return;

    const btn = document.querySelector('#modalChat .btn-primary');
    if (btn) btn.disabled = true;

    const res = await window.ChatManager.enviarMensaje(txt, file);
    
    if (res && res.status === 'ok') {
        if (input) input.value = '';
        window.tempFile = null;
        const label = document.getElementById('label-adjunto');
        if (label) {
            label.classList.remove('btn-adjunto-active');
            label.innerHTML = '<i class="bi bi-paperclip fs-5"></i>';
        }
        await window.refrescarChat();
    }
    
    if (btn) btn.disabled = false;
};

// =====================================================================
// FUNCIONES GLOBALES DEL CHAT: Notificaciones, Buscador, Eliminar, Exportar
// =====================================================================

window.revisarNotificacionesGlobales = async function() {
    const btnFlotante = document.getElementById('btn-chat-flotante');
    if (window.ChatManager && btnFlotante && !btnFlotante.classList.contains('hidden-forced')) {
        const hayNuevos = await window.ChatManager.verificarPuntoRojo();
        const badge = document.getElementById('chat-badge');
        if (badge) {
            if (hayNuevos) badge.classList.remove('d-none');
            else badge.classList.add('d-none');
        }
    }
};

window.filtrarBuscador = function() {
    const filtro = document.getElementById('buscador-input');
    if (!filtro) return;
    const texto = filtro.value.toLowerCase();
    
    const items = document.querySelectorAll('.contacto-item');
    items.forEach(item => {
        const nombre = item.getAttribute('data-name') || '';
        item.style.setProperty('display', nombre.includes(texto) ? 'flex' : 'none', 'important');
    });
};

window.eliminarMensaje = async function(id) {
    if (confirm("¿Eliminar este mensaje para todos?")) {
        await window.ChatManager.borrarMensaje(id);
        if (window.refrescarChat) window.refrescarChat();
    }
};

window.limpiarChat = async function() {
    if (confirm("¿Estás seguro de que quieres eliminar TODA la conversación con este usuario? (Esta acción no se puede deshacer)")) {
        await window.ChatManager.limpiarChatCompleto();
        if (window.refrescarChat) window.refrescarChat();
    }
};

window.exportarTXT = function() {
    if (!window.ChatManager || !window.ChatManager.mensajesCacheados || !window.ChatManager.mensajesCacheados.length) {
        alert("No hay mensajes para exportar."); 
        return;
    }
    
    let textData = `=== CHAT CON ${window.ChatManager.chatActivoNombre} ===\n\n`;
    window.ChatManager.mensajesCacheados.forEach(m => {
        textData += `[${m.fecha_larga || m.fecha}] ${m.nombre}:\n`;
        if(m.texto) textData += `${m.texto}\n`;
        if(m.file_path) textData += `<Archivo Adjunto: ${m.file_type}>\n`;
        textData += `----------------------------\n`;
    });
    
    const blob = new Blob([textData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Chat_${window.ChatManager.chatActivoNombre}_${new Date().getTime()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
};