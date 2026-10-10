// ============================================================================
// ARCHIVO: router.js
// RESPONSABILIDAD: Enrutador SPA (Single Page Application), control de vistas,
// barra de navegación y protección de rutas (Login).
// ============================================================================

const cacheVistas = {};

// --- CONTROL DE SESIÓN ---
window.setLoginState = function(isLoggedIn) {
    const nav = document.getElementById('bottom-navigation');
    if (isLoggedIn) {
        if (nav) nav.classList.remove('hidden-forced');
    } else {
        if (nav) nav.classList.add('hidden-forced');
        localStorage.removeItem('usuarioActual');
    }
};

function actualizarUIAuth() {
    const usuario = localStorage.getItem('usuarioActual');
    window.setLoginState(!!usuario);
}

// --- RENDERIZADO DE LA BARRA INFERIOR ---
window.renderNavBar = function() {
    const nav = document.getElementById('bottom-navigation');
    if (!nav) return;

    // Leemos los accesos para saber cuáles están marcados con "enBarra"
    let accesosPersonalizados = [];
    try {
        const guardados = localStorage.getItem('accesosPersonalizados');
        if (guardados) accesosPersonalizados = JSON.parse(guardados);
    } catch(e) {}
    
    // Lista temporal unida (Por defecto + Personalizados)
    const todosLosAccesos = [
        { nombre: 'Usuarios', ruta: 'usuarios', icono: 'bi-people-fill', color: '#6f42c1', enBarra: false },
        { nombre: 'TRIBALs', ruta: 'media', icono: 'bi-music-note-beamed', color: '#e2602e', enBarra: true },
        ...accesosPersonalizados
    ];

    const accesosFijados = todosLosAccesos.filter(a => a.enBarra).slice(0, 3);
    
    let html = `
        <a href="#home" class="text-center text-decoration-none text-secondary flex-fill">
            <i class="bi bi-house-door fs-4 d-block"></i>
            <span style="font-size: 0.7rem;">Inicio</span>
        </a>
    `;
    
    accesosFijados.forEach(acc => {
        const hashLimpio = acc.ruta.replace('.html', '');
        html += `
            <a href="#${hashLimpio}" class="text-center text-decoration-none text-secondary flex-fill">
                <i class="bi ${acc.icono} fs-4 d-block" style="color: ${acc.color};"></i>
                <span style="font-size: 0.7rem;">${acc.nombre}</span>
            </a>
        `;
    });
    
    html += `
        <a href="#perfil" class="text-center text-decoration-none text-secondary flex-fill">
            <i class="bi bi-person fs-4 d-block"></i>
            <span style="font-size: 0.7rem;">Perfil</span>
        </a>
    `;
    
    nav.innerHTML = html;
};

// --- MOTOR PRINCIPAL DE CAMBIO DE PANTALLA ---
async function cargarVista() {
    const contenedor = document.getElementById('app-content');
    const navBar = document.getElementById('bottom-navigation');
    const backBtn = document.getElementById('global-back-btn');
    const logoutBtn = document.getElementById('global-logout-btn');
    const fabBtn = document.getElementById('fab-add-acceso');
    const chatBtn = document.getElementById('btn-chat-flotante');
    
    let hash = window.location.hash.substring(1) || 'home';
    
    // Lógica de Protección de Rutas
    const estaLogueado = !!localStorage.getItem('usuarioActual');
    if (!estaLogueado && hash !== 'login' && hash !== 'registro') {
        window.location.hash = 'login';
        return;
    }
    if (estaLogueado && (hash === 'login' || hash === 'registro')) {
        window.location.hash = 'home';
        return;
    }

    const vistasPrincipales = ['home', 'login', 'registro', 'perfil'];
    
    // Control de visibilidad de los elementos globales
    if (vistasPrincipales.includes(hash)) {
        if (backBtn) backBtn.classList.add('hidden-forced'); 
        if (estaLogueado) {
            if (navBar) navBar.classList.remove('hidden-forced'); 
            if (contenedor) contenedor.classList.add('nav-padding'); 
        }
    } else {
        if (backBtn) backBtn.classList.remove('hidden-forced'); 
        if (navBar) navBar.classList.add('hidden-forced'); 
        if (contenedor) contenedor.classList.remove('nav-padding'); 
    }

    if (estaLogueado && hash !== 'login' && hash !== 'registro') {
        if (logoutBtn) logoutBtn.classList.remove('hidden-forced'); 
        if (chatBtn) chatBtn.classList.remove('hidden-forced');
    } else {
        if (logoutBtn) logoutBtn.classList.add('hidden-forced');
        if (chatBtn) chatBtn.classList.add('hidden-forced'); 
    }

    if (hash === 'home') {
        if (fabBtn) fabBtn.classList.remove('hidden-forced');
    } else {
        if (fabBtn) fabBtn.classList.add('hidden-forced');
    }

    if (contenedor) contenedor.classList.add('fade-out');

    // --- Carga inteligente de la vista HTML ---
    try {
        let html = '';
        
        if (cacheVistas[hash]) {
            html = cacheVistas[hash];
        } else {
            const customHtmlGuardado = localStorage.getItem('vista_custom_' + hash);
            
            if (customHtmlGuardado) {
                html = customHtmlGuardado;
                cacheVistas[hash] = html;
            } else {
                const response = await fetch(`${hash}.html`);
                if (!response.ok) throw new Error(`Vista no encontrada (${hash}.html)`);
                html = await response.text();
                cacheVistas[hash] = html; 
            }
        }

        setTimeout(() => {
            if (!contenedor) return;
            contenedor.innerHTML = html;
            contenedor.classList.remove('fade-out');

            // MOTOR POTENCIADO DE EJECUCIÓN DE SCRIPTS
            const scripts = Array.from(contenedor.querySelectorAll('script'));
            
            const ejecutarScriptsSecuencialmente = async () => {
                for (const script of scripts) {
                    await new Promise((resolve) => {
                        const nuevoScript = document.createElement('script');
                        
                        Array.from(script.attributes).forEach(attr => {
                            nuevoScript.setAttribute(attr.name, attr.value);
                        });

                        if (script.src) {
                            nuevoScript.onload = resolve;
                            nuevoScript.onerror = resolve; 
                            nuevoScript.src = script.src; // Asignamos el src al final
                        } else {
                            nuevoScript.text = script.innerHTML;
                            resolve();
                        }
                        
                        document.body.appendChild(nuevoScript);
                        
                        setTimeout(() => { 
                            if(nuevoScript.parentNode) nuevoScript.parentNode.removeChild(nuevoScript); 
                        }, 100);
                    });
                }
                
                setTimeout(() => {
                    document.dispatchEvent(new Event('DOMContentLoaded'));
                    window.dispatchEvent(new Event('load'));
                }, 50);
            };

            ejecutarScriptsSecuencialmente();

        }, 150); 

    } catch (error) {
        if (contenedor) {
            contenedor.innerHTML = `
                <div class="h-100 d-flex flex-column align-items-center justify-content-center text-center p-4">
                    <i class="bi bi-exclamation-triangle-fill text-danger" style="font-size: 3rem;"></i>
                    <h4 class="mt-3 text-secondary">Vista No Disponible</h4>
                    <p class="text-muted">No se pudo cargar: ${hash}.html<br>Puede que necesites volver a cargar el archivo local.</p>
                    <button class="btn btn-primary mt-3" onclick="history.back()">Volver</button>
                </div>`;
            contenedor.classList.remove('fade-out');
        }
    }
}

// ============================================================================
// INICIALIZADORES GLOBALES
// ============================================================================
window.addEventListener('hashchange', cargarVista);

window.addEventListener('DOMContentLoaded', () => {
    actualizarUIAuth();
    window.renderNavBar();
    cargarVista();
    
    // Pre-cacheamos el login para que cargue más rápido si cierran sesión
    if(window.location.hash === '' || window.location.hash === '#home') {
        fetch('login.html').then(r => r.text()).then(html => cacheVistas['login'] = html).catch(()=>{});
    }
});