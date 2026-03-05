    const cacheVistas = {};

        // === GESTIÓN UNIFICADA DE ACCESOS DIRECTOS ===
        const ACCESOS_POR_DEFECTO = [
            { nombre: 'Calendario', ruta: 'calendarioTribu', icono: 'bi-calendar-event', color: '#ff6b6b', enBarra: false },
            { nombre: 'Rutas / Gráficas', ruta: 'rutas', icono: 'bi-map-fill', color: '#20c997', enBarra: false },
            { nombre: 'Pagos JyK', ruta: 'tablapagosV1 (2)', icono: 'bi-cash-coin', color: '#ffc107', enBarra: false },
            { nombre: 'Apartados', ruta: 'apartados', icono: 'bi-shop', color: '#fd7e14', enBarra: false },
            { nombre: 'Usuarios', ruta: 'usuarios', icono: 'bi-people-fill', color: '#6f42c1', enBarra: false }
        ];

        function obtenerAccesos() {
            let guardados = localStorage.getItem('accesosTribu');
            if (guardados) {
                let accesos = JSON.parse(guardados);
                
                // Migración única
                if (!localStorage.getItem('limpiezaPinesV2')) {
                    accesos.forEach(acc => acc.enBarra = false);
                    localStorage.setItem('limpiezaPinesV2', 'completada');
                    localStorage.setItem('accesosTribu', JSON.stringify(accesos));
                }
                return accesos;
            } else {
                localStorage.setItem('limpiezaPinesV2', 'completada');
                localStorage.setItem('accesosTribu', JSON.stringify(ACCESOS_POR_DEFECTO));
                return ACCESOS_POR_DEFECTO;
            }
        }

        // --- FUNCIONES GLOBALES ---

        window.toggleBarra = function(event, index) {
            event.preventDefault();
            event.stopPropagation();
            
            let accesos = obtenerAccesos();
            let fijadosActuales = accesos.filter(a => a.enBarra).length;

            if (!accesos[index].enBarra && fijadosActuales >= 3) {
                alert('Solo puedes fijar un máximo de 3 accesos en la barra inferior.');
                return;
            }

            accesos[index].enBarra = !accesos[index].enBarra;
            localStorage.setItem('accesosTribu', JSON.stringify(accesos));
            
            renderHomeDashboard();
            renderNavBar();
        };

        window.eliminarAcceso = function(event, index) {
            event.preventDefault(); 
            event.stopPropagation();
            if (confirm('¿Deseas eliminar este acceso directo?')) {
                let accesos = obtenerAccesos();
                const ruta = accesos[index].ruta.replace('.html', '');
                
                accesos.splice(index, 1);
                localStorage.setItem('accesosTribu', JSON.stringify(accesos));
                localStorage.removeItem('vista_custom_' + ruta);
                
                renderHomeDashboard();
                renderNavBar();
            }
        };

        window.cerrarSesion = function() {
            if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
                window.setLoginState(false);
                window.location.hash = 'login';
            }
        };

        window.setLoginState = function(isLoggedIn) {
            const nav = document.getElementById('bottom-navigation');
            if (isLoggedIn) {
                nav.classList.remove('hidden-forced');
            } else {
                nav.classList.add('hidden-forced');
                localStorage.removeItem('usuarioActual');
            }
        };

        function actualizarUIAuth() {
            const usuario = localStorage.getItem('usuarioActual');
            window.setLoginState(!!usuario);
        }

        // --- RENDERIZADO DE LA BARRA INFERIOR ---
        function renderNavBar() {
            const nav = document.getElementById('bottom-navigation');
            const accesosFijados = obtenerAccesos().filter(a => a.enBarra).slice(0, 3);
            
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
        }

        // --- RENDERIZADO DEL DASHBOARD ---
        function renderHomeDashboard() {
            const contenedor = document.getElementById('app-content');
            let nombre = 'Tribu';
            try {
                const user = JSON.parse(localStorage.getItem('usuarioActual'));
                if (user && user.nombre) {
                    nombre = user.nombre.split(' ')[0];
                }
            } catch(e) {}

            const todosLosAccesos = obtenerAccesos();

            let gridHtml = '';
            todosLosAccesos.forEach((acc, index) => {
                const hashLimpio = acc.ruta.replace('.html', '');
                const bgColor = acc.color || '#0d6efd';
                
                let btnEliminar = `
                    <button onclick="eliminarAcceso(event, ${index})" class="btn btn-danger position-absolute shadow-sm" 
                            style="top: -8px; right: -8px; width: 28px; height: 28px; border-radius: 50%; padding: 0; display: flex; align-items: center; justify-content: center; z-index: 10;" title="Eliminar">
                        <i class="bi bi-x fs-5"></i>
                    </button>
                `;

                let btnPin = `
                    <button onclick="toggleBarra(event, ${index})" class="btn-pin ${acc.enBarra ? 'active' : ''} position-absolute shadow-sm" 
                            style="top: -8px; left: -8px; width: 28px; height: 28px; border-radius: 50%; padding: 0; display: flex; align-items: center; justify-content: center; z-index: 10;" title="Fijar en barra">
                        <i class="bi bi-pin-angle-fill fs-6"></i>
                    </button>
                `;

                gridHtml += `
                    <div class="col-6 col-md-4 position-relative">
                        ${btnPin}
                        ${btnEliminar}
                        <a href="#${hashLimpio}" class="text-decoration-none d-block h-100">
                            <div class="card border-0 shadow-sm h-100 rounded-4 text-center p-3" style="transition: transform 0.2s;">
                                <div class="d-flex justify-content-center align-items-center mx-auto rounded-circle mb-2" 
                                     style="width: 60px; height: 60px; background-color: ${bgColor}20; color: ${bgColor};">
                                    <i class="bi ${acc.icono}" style="font-size: 1.8rem;"></i>
                                </div>
                                <h6 class="text-dark fw-bold mb-0" style="font-size: 0.9rem;">${acc.nombre}</h6>
                            </div>
                        </a>
                    </div>
                `;
            });

            const html = `
                <div class="h-100 d-flex flex-column bg-light pb-safe">
                    <div class="position-relative w-100 flex-shrink-0 p-4 pt-5" style="background: linear-gradient(135deg, #0d6efd, #0dcaf0); border-bottom-left-radius: 30px; border-bottom-right-radius: 30px;">
                        <div class="mt-3">
                            <h2 class="fw-bold text-white mb-0 mt-2">Hola, ${nombre}</h2>
                            <p class="text-white-50 mb-0">Tus accesos directos</p>
                        </div>
                    </div>
                    <div class="flex-grow-1 p-4 overflow-auto">
                        <div class="row g-3">
                            ${gridHtml}
                        </div>
                    </div>
                </div>
            `;

            contenedor.innerHTML = html;
            contenedor.classList.remove('fade-out');
        }

        async function cargarVista() {
            const contenedor = document.getElementById('app-content');
            const navBar = document.getElementById('bottom-navigation');
            const backBtn = document.getElementById('global-back-btn');
            const logoutBtn = document.getElementById('global-logout-btn');
            const fabBtn = document.getElementById('fab-add-acceso');
            const chatBtn = document.getElementById('btn-chat-flotante');
            
            let hash = window.location.hash.substring(1) || 'home';
            
            // Lógica de Autenticación
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
            
            if (vistasPrincipales.includes(hash)) {
                backBtn.classList.add('hidden-forced'); 
                if (estaLogueado) {
                    navBar.classList.remove('hidden-forced'); 
                    contenedor.classList.add('nav-padding'); 
                }
            } else {
                backBtn.classList.remove('hidden-forced'); 
                navBar.classList.add('hidden-forced'); 
                contenedor.classList.remove('nav-padding'); 
            }

            if (estaLogueado && hash !== 'login' && hash !== 'registro') {
                logoutBtn.classList.remove('hidden-forced'); 
                chatBtn.classList.remove('hidden-forced');
            } else {
                logoutBtn.classList.add('hidden-forced');
                chatBtn.classList.add('hidden-forced'); 
            }

            if (hash === 'home') {
                fabBtn.classList.remove('hidden-forced');
            } else {
                fabBtn.classList.add('hidden-forced');
            }

            contenedor.classList.add('fade-out');
            
            if (hash === 'home') {
                setTimeout(() => {
                    renderHomeDashboard();
                }, 150);
                return;
            }

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

        window.addEventListener('hashchange', cargarVista);
        
        window.addEventListener('DOMContentLoaded', () => {
            actualizarUIAuth();
            renderNavBar();
            cargarVista();
            
            const inputArchivo = document.getElementById('acc-file');
            const inputRuta = document.getElementById('acc-ruta');
            
            if (inputArchivo && inputRuta) {
                inputArchivo.addEventListener('change', function(e) {
                    if (this.files && this.files[0]) {
                        const nombreLimpio = this.files[0].name.replace('.html', '').replace(/\s+/g, '_');
                        inputRuta.value = nombreLimpio;
                    }
                });
            }

            const formNuevo = document.getElementById('form-nuevo-acceso');
            if(formNuevo) {
                formNuevo.addEventListener('submit', function(e) {
                    e.preventDefault();
                    
                    let ruta = inputRuta.value.trim().replace('.html', '');
                    const archivoSeleccionado = inputArchivo.files[0];
                    const fijarEnBarra = document.getElementById('acc-enbarra').checked;
                    
                    if (!ruta) {
                        alert('Debes escribir una ruta o seleccionar un archivo HTML de tu dispositivo.');
                        return;
                    }

                    const nuevoAcceso = {
                        nombre: document.getElementById('acc-nombre').value,
                        ruta: ruta,
                        icono: document.getElementById('acc-icono').value,
                        color: '#0d6efd',
                        enBarra: fijarEnBarra
                    };

                    let accesos = obtenerAccesos();
                    let fijadosActuales = accesos.filter(a => a.enBarra).length;

                    if (fijarEnBarra && fijadosActuales >= 3) {
                        alert('Atención: Solo puedes fijar 3 accesos en la parte inferior. Se guardará, pero no se anclará.');
                        nuevoAcceso.enBarra = false;
                    }

                    const procesarGuardado = () => {
                        accesos.push(nuevoAcceso);
                        localStorage.setItem('accesosTribu', JSON.stringify(accesos));

                        const modalEl = document.getElementById('modalNuevoAcceso');
                        const modalIns = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
                        modalIns.hide();
                        formNuevo.reset();

                        if (window.location.hash === '' || window.location.hash === '#home') {
                            renderHomeDashboard();
                        }
                        renderNavBar();
                    };

                    if (archivoSeleccionado) {
                        const reader = new FileReader();
                        reader.onload = function(evt) {
                            const htmlContent = evt.target.result;
                            localStorage.setItem('vista_custom_' + ruta, htmlContent);
                            procesarGuardado();
                        };
                        reader.readAsText(archivoSeleccionado);
                    } else {
                        procesarGuardado();
                    }
                });
            }

            if(window.location.hash === '' || window.location.hash === '#home') {
                fetch('login.html').then(r => r.text()).then(html => cacheVistas['login'] = html).catch(()=>{});
            }

            // Iniciar polling de notificaciones (Punto rojo) apenas cargue el DOM
            setInterval(window.revisarNotificacionesGlobales, 6000);
        });

        // =====================================================================
        // === FUNCIONES DEL CHAT AISLADO (FETCH DINÁMICO) ===
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
        // NUEVAS FUNCIONES GLOBALES: Buscador, Notificaciones, Eliminar, Exportar
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