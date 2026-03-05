// ============================================================================
// ARCHIVO: usuarios.js 
// RESPONSABILIDAD: Cargar la lista completa de usuarios, gestionar roles 
// y conectar con el chat.
// ============================================================================

window.cargarListaUsuarios = async function() {
    const tbody = document.getElementById('tabla-usuarios-body');
    if (!tbody) return; // No estamos en la vista de usuarios

    // 1. Obtener mi nivel de acceso actual
    let miRol = 'user';
    try {
        const u = JSON.parse(localStorage.getItem('usuarioActual'));
        if (u && u.rol) miRol = u.rol.toLowerCase();
    } catch(e) {}

    const esAdmin = (miRol === 'superadmin' || miRol === 'admin');
    const API_BASE = typeof API_URL !== 'undefined' ? API_URL : "https://kenth1977.pythonanywhere.com/api/Altair";

    // Mostramos estado de carga
    tbody.innerHTML = `
        <tr>
            <td colspan="4" class="text-center py-5">
                <div class="spinner-border text-primary" role="status"></div>
                <div class="mt-2 text-secondary small">Conectando con el servidor...</div>
            </td>
        </tr>
    `;

    try {
        // ENLACE REAL SACADO DE tribu.py: /admin/usuarios
        const response = await fetch(`${API_BASE}/admin/usuarios`, { headers: { 'Accept': 'application/json' }});
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        const usuarios = data.usuarios || data; 

        if (!Array.isArray(usuarios) || usuarios.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">No hay usuarios registrados aún.</td></tr>`;
            return;
        }

        tbody.innerHTML = ''; // Limpiamos la tabla

        usuarios.forEach((u, index) => {
            const tr = document.createElement('tr');
            tr.className = "contacto-item"; 
            tr.setAttribute('data-name', (u.nombre || '').toLowerCase());

            // Columna 1: Avatar / Indice
            const td1 = document.createElement('td');
            td1.className = 'text-center text-muted fw-bold';
            td1.textContent = index + 1;

            // Columna 2: Info del Usuario
            const td2 = document.createElement('td');
            td2.innerHTML = `
                <div class="d-flex align-items-center">
                    <div class="rounded-circle bg-primary text-white d-flex justify-content-center align-items-center me-2 flex-shrink-0" style="width: 35px; height: 35px; font-size: 0.9rem;">
                        ${u.nombre ? u.nombre.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div>
                        <div class="fw-bold text-dark" style="line-height: 1.2;">${u.nombre || 'Sin nombre'}</div>
                        <div class="text-muted" style="font-size: 0.7rem;">${u.email || u.pin || 'Sin correo'}</div>
                    </div>
                </div>
            `;

            // Columna 3: ROL
            const tdRol = document.createElement('td');
            tdRol.className = 'text-center';
            
            if (esAdmin) {
                tdRol.innerHTML = `
                    <select class="form-select form-select-sm rounded-pill shadow-sm border-0 bg-light" 
                            style="font-size: 0.75rem; width: 100px; margin: 0 auto;"
                            onchange="window.cambiarRolUsuario('${u.email || u.pin}', this.value)">
                        <option value="user" ${u.rol === 'user' ? 'selected' : ''}>Usuario</option>
                        <option value="admin" ${u.rol === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="superadmin" ${u.rol === 'superadmin' ? 'selected' : ''}>Súper</option>
                    </select>
                `;
            } else {
                let badgeColor = u.rol === 'superadmin' ? 'bg-danger' : (u.rol === 'admin' ? 'bg-primary' : 'bg-secondary');
                tdRol.innerHTML = `<span class="badge ${badgeColor} rounded-pill fw-normal">${u.rol || 'user'}</span>`;
            }

            // Columna 4: ACCIONES
            const td3 = document.createElement('td');
            td3.className = 'text-end';
            
            let htmlAcciones = `
                <button class="btn btn-sm btn-light text-primary rounded-circle shadow-sm me-1" 
                        onclick="window.iniciarChatDirecto('${u.email || u.pin}', '${u.nombre}')" title="Chatear">
                    <i class="bi bi-chat-dots-fill"></i>
                </button>
            `;

            if (esAdmin) {
                htmlAcciones += `
                    <button class="btn btn-sm btn-light text-danger rounded-circle shadow-sm" 
                            onclick="window.eliminarUsuario('${u.email || u.pin}', '${u.nombre}')" title="Expulsar">
                        <i class="bi bi-trash-fill"></i>
                    </button>
                `;
            }

            td3.innerHTML = htmlAcciones;

            tr.appendChild(td1);
            tr.appendChild(td2);
            tr.appendChild(tdRol);
            tr.appendChild(td3);
            tbody.appendChild(tr);
        });

    } catch (error) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center text-danger py-4 fw-bold">
                    <i class="bi bi-wifi-off fs-3 d-block mb-2"></i>
                    Fallo de Conexión:<br><small class="fw-normal">${error.message}</small>
                </td>
            </tr>`;
    }
};

// --- FUNCIONES DE ACCIÓN ---

window.iniciarChatDirecto = function(identificador, nombre) {
    if (typeof window.abrirModalChat === 'function') {
        window.abrirModalChat();
        if (typeof window.seleccionarContacto === 'function') {
            setTimeout(() => window.seleccionarContacto(identificador, nombre), 350);
        }
    } else {
        alert("El módulo de chat no está disponible.");
    }
};

window.cambiarRolUsuario = async function(identificador, nuevoRol) {
    const API_BASE = typeof API_URL !== 'undefined' ? API_URL : "https://kenth1977.pythonanywhere.com/api/Altair";
    const u = JSON.parse(localStorage.getItem('usuarioActual') || '{}');
    
    try {
        console.log(`Solicitando cambiar rol de ${identificador} a ${nuevoRol}...`);
        
        // ENLACE REAL SACADO DE tribu.py: /admin/editar_usuario
        const response = await fetch(`${API_BASE}/admin/editar_usuario`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                editor_email: u.email,       // El backend pide el email de quien edita por seguridad
                target_email: identificador, // El email de a quien le cambiamos el rol
                rol: nuevoRol 
            })
        });
        
        const result = await response.json();
        if(!response.ok) throw new Error(result.error || "Error en el servidor");
        
        const toast = document.createElement('div');
        toast.className = "position-fixed bottom-0 start-50 translate-middle-x mb-5 p-2 bg-dark text-white rounded-pill shadow";
        toast.style.zIndex = "9999";
        toast.innerHTML = `<i class="bi bi-check-circle-fill text-success me-2"></i> Rol actualizado a ${nuevoRol}`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);

    } catch(error) {
        alert("Error al cambiar rol: " + error.message);
        window.cargarListaUsuarios(); 
    }
};

window.eliminarUsuario = async function(identificador, nombre) {
    if (!confirm(`¿Estás TOTALMENTE seguro de expulsar a ${nombre} de la tribu? Esta acción no se puede deshacer.`)) return;

    const API_BASE = typeof API_URL !== 'undefined' ? API_URL : "https://kenth1977.pythonanywhere.com/api/Altair";
    const u = JSON.parse(localStorage.getItem('usuarioActual') || '{}');
    
    try {
        console.log(`Solicitando eliminar a ${identificador}...`);
        
        // ENLACE REAL SACADO DE tribu.py: /admin/borrar_usuario/<email>?editor_email=...
        const response = await fetch(`${API_BASE}/admin/borrar_usuario/${identificador}?editor_email=${u.email}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        if(!response.ok) throw new Error(result.error || "Error en el servidor");
        
        alert(`El usuario ${nombre} ha sido eliminado.`);
        window.cargarListaUsuarios(); 

    } catch(error) {
        alert("Error al eliminar usuario: " + error.message);
    }
};

// ============================================================================
// VIGILANTES DE INICIO
// ============================================================================
window.addEventListener('hashchange', () => {
    if (window.location.hash === '#usuarios') {
        setTimeout(window.cargarListaUsuarios, 150);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    if (window.location.hash === '#usuarios') {
        setTimeout(window.cargarListaUsuarios, 150);
    }
});