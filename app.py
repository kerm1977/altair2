# ==============================================================================
# ARCHIVO: app_new.py (Versión Refactorizada)
# ROL: EL ABUELO (Master Gateway de PythonAnywhere) - Versión Modular
# DESCRIPCIÓN: Puerta de entrada principal. Habilita CORS globalmente y
#              registra a las aplicaciones padre (como La Tribu, Ventas, etc.).
# ==============================================================================

import os
from flask import Flask
from flask_cors import CORS

# 1. Inicializamos la aplicación MAESTRA
app = Flask(__name__)

# 2. Habilitar CORS globalmente para que cualquier app externa se pueda conectar
CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"]
    }
})

# ==========================================
# IMPORTACIÓN DE MÓDULOS (MULTI-APPS PRINCIPALES)
# ==========================================

# Importamos "La Tribu" (El Padre) - Ahora modular
from tribu import tribu_bp

# 🚀 En el futuro, aquí importarás tus nuevas apps principales:
# from ventas import ventas_bp
# from inventario import inventario_bp

# ==========================================
# REGISTRO DE BLUEPRINTS (Conectando los cables)
# ==========================================

# El abuelo solo registra a los padres
app.register_blueprint(tribu_bp)

# app.register_blueprint(ventas_bp)
# app.register_blueprint(inventario_bp)

# ==========================================
# CONFIGURACIÓN ADICIONAL
# ==========================================

# Configuración de la aplicación
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'tu-clave-secreta-aqui')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Manejo de errores global
@app.errorhandler(404)
def not_found(error):
    return jsonify({
        "error": "Endpoint no encontrado",
        "message": "La ruta solicitada no existe en esta aplicación",
        "available_apps": ["tribu"]  # Actualizar cuando agregues más apps
    }), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        "error": "Error interno del servidor",
        "message": "Ocurrió un error procesando tu solicitud"
    }), 500

@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({
        "error": "Método no permitido",
        "message": "El método HTTP utilizado no está permitido para este endpoint"
    }), 405

# ==========================================
# ENDPOINTS GLOBALES DEL SISTEMA
# ==========================================

@app.route('/health')
def system_health():
    """Endpoint de salud del sistema completo"""
    return jsonify({
        "status": "healthy",
        "system": "PythonAnywhere Multi-App Gateway",
        "version": "2.0.0-Modular",
        "architecture": "Modular-Multi-App",
        "apps": {
            "tribu": "active"
            # Agregar aquí más apps cuando las implementes
        }
    })

@app.route('/info')
def system_info():
    """Endpoint con información del sistema"""
    return jsonify({
        "name": "La Tribu Multi-App Platform",
        "version": "2.0.0-Modular",
        "description": "Plataforma modular multi-aplicaciones para PythonAnywhere",
        "features": [
            "Multi-app architecture",
            "Modular design",
            "Dynamic database creation",
            "User management",
            "Chat system",
            "Event management",
            "Admin panel",
            "File uploads",
            "OTA updates"
        ],
        "modules": [
            "database.py - Gestión de base de datos",
            "auth.py - Autenticación y registro",
            "users.py - Gestión de usuarios y contactos", 
            "events.py - Sistema de eventos",
            "admin.py - Panel de administración",
            "utils.py - Utilidades y sistema",
            "chat.py - Sistema de mensajería"
        ]
    })

@app.route('/routes')
def list_routes():
    """Lista todas las rutas disponibles (útil para debugging)"""
    import urllib
    
    routes = []
    for rule in app.url_map.iter_rules():
        if rule.endpoint != 'static':
            methods = ','.join(rule.methods)
            routes.append({
                'endpoint': rule.endpoint,
                'methods': methods,
                'path': str(rule.rule)
            })
    
    return jsonify({
        "total_routes": len(routes),
        "routes": sorted(routes, key=lambda x: x['path'])
    })

# ==========================================
# MIDDLEWARE GLOBAL
# ==========================================

@app.before_request
def before_request():
    """Middleware global para logging y validaciones"""
    from flask import request
    
    # Log de requests (solo en desarrollo)
    if app.debug:
        print(f"[{request.method}] {request.path} - {request.remote_addr}")

@app.after_request
def after_request(response):
    """Middleware global para headers y logging"""
    # Headers de seguridad
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['X-App-Version'] = '2.0.0-Modular'
    
    return response

# ==========================================
# INICIALIZACIÓN
# ==========================================

def init_app():
    """Función de inicialización de la aplicación"""
    print("[OK] Gateway Maestro de PythonAnywhere iniciado. Arquitectura Modular v2.0")
    print("[OK] Módulos cargados: database, auth, users, events, admin, utils, chat")
    print("[OK] Multi-apps conectadas: tribu")
    print("[OK] Sistema listo para recibir solicitudes")

# Inicializar la aplicación
init_app()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
