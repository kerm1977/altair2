// Esta URL será actualizada automáticamente por el script configurar_proyecto.js
// Ejemplo: https://kenth1977.pythonanywhere.com/api/MiAppSlug
const API_URL = "https://kenth1977.pythonanywhere.com/api/Altair";

// Función global para manejar errores de forma consistente
window.handleError = function(error, context = 'Operación') {
    console.error(`Error en ${context}:`, error);
    
    let mensaje = 'Error desconocido';
    
    if (typeof error === 'string') {
        mensaje = error;
    } else if (error.message) {
        mensaje = error.message;
    } else if (error.error) {
        mensaje = error.error;
    }
    
    // Mensajes amigables para errores comunes
    const mensajesAmigables = {
        'Failed to fetch': 'No se pudo conectar con el servidor. Verifica tu conexión a internet.',
        'NetworkError': 'Error de conexión. Intenta nuevamente.',
        'Credenciales incorrectas': 'El correo o la contraseña son incorrectos.',
        'El correo ingresado ya se encuentra registrado': 'Este correo ya está registrado. Intenta con otro.',
        'PIN no encontrado': 'El PIN ingresado no es válido.',
        'Evento no encontrado': 'El evento seleccionado no existe.'
    };
    
    const mensajeFinal = mensajesAmigables[mensaje] || mensaje;
    
    // Mostrar error de forma no intrusiva
    if (typeof window.showToast === 'function') {
        window.showToast(mensajeFinal, 'error');
    } else {
        alert(`${context}: ${mensajeFinal}`);
    }
    
    return mensajeFinal;
};  

window.CloudDB = {
    // 1. Función para LEER todos los usuarios de la app actual
    async obtenerUsuarios() {
        try {
            // CORRECCIÓN: Cambiado de /usuarios a /admin/usuarios para coincidir con backend
            const respuesta = await fetch(`${API_URL}/admin/usuarios`, { 
                headers: { 'Accept': 'application/json' }
            });
            
            if (!respuesta.ok) return [];
            
            const datos = await respuesta.json();
            if (datos.error) return [];
            return datos;
        } catch (error) { 
            handleError(error, "obtener usuarios");
            return []; 
        }
    },

    // 2. Función para LEER las Caminatas (Eventos) de la app actual
    async obtenerEventos() {
        try {
            const respuesta = await fetch(`${API_URL}/eventos`, { 
                headers: { 'Accept': 'application/json' }
            });
            
            if (!respuesta.ok) return [];

            const datos = await respuesta.json();
            if (datos.error) return [];
            return datos;
        } catch (error) { 
            handleError(error, "obtener eventos");
            return []; 
        }
    },

    // 3. Función para INSCRIBIRSE usando el PIN
    // Nota: Asegúrate de que tu Motor Universal en app.py tenga implementada la ruta /inscribir
    async inscribirEvento(pin, eventId) {
        try {
            const respuesta = await fetch(`${API_URL}/inscribir`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ pin: pin, event_id: eventId })
            });
            
            const resultado = await respuesta.json();
            if (resultado.error) {
                return { status: "error", message: resultado.error };
            }
            return resultado; // Retorna status "ok" y el mensaje de éxito
        } catch (error) {
            handleError(error, "inscripción a evento");
            return { status: "error", message: "Error de conexión con el servidor" };
        }
    }
};