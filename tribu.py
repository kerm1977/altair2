# ==============================================================================
# ARCHIVO: tribu_new.py (Versión Refactorizada)
# ROL: EL PADRE (Módulo principal de "La Tribu" - Versión Modular)
# DESCRIPCIÓN: Orquestador principal que importa y registra todos los módulos
# ==============================================================================

import os
from flask import Blueprint, request, jsonify
from flask_cors import cross_origin
from sqlalchemy import text

# Importar todos los módulos especializados
from database import get_db_session
from auth import auth_bp
from users import users_bp
from events import events_bp
from admin import admin_bp
from utils import utils_bp

# 1. Convertimos la app en un Blueprint principal (El Padre)
tribu_bp = Blueprint('tribu_bp', __name__)

# ==========================================
# CONEXIÓN CON EL HIJO (MÓDULO DE CHAT)
# ==========================================
# Importamos el Blueprint del hijo y lo anidamos dentro del padre
from chat import chat_bp
tribu_bp.register_blueprint(chat_bp)

# ==========================================
# REGISTRO DE TODOS LOS MÓDULOS ESPECIALIZADOS
# ==========================================
tribu_bp.register_blueprint(auth_bp)
tribu_bp.register_blueprint(users_bp)
tribu_bp.register_blueprint(events_bp)
tribu_bp.register_blueprint(admin_bp)
tribu_bp.register_blueprint(utils_bp)

# ==========================================
# ENDPOINTS DE ORQUESTRACIÓN (Quedan aquí los que no pertenecen a ningún módulo específico)
# ==========================================

@tribu_bp.route('/api/<app_slug>/status', methods=['GET', 'OPTIONS'])
@cross_origin()
def app_status(app_slug):
    """Endpoint de estado general de la aplicación"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    try:
        session = get_db_session(app_slug)
        
        # Obtener estadísticas básicas
        stats = session.execute(text("""
            SELECT 
                (SELECT COUNT(*) FROM user) as total_users,
                (SELECT COUNT(*) FROM member WHERE last_active > strftime('%s', 'now', '-30 days')) as active_users,
                (SELECT COUNT(*) FROM event) as total_events
        """)).fetchone()
        
        return jsonify({
            "status": "ok",
            "app": app_slug,
            "statistics": {
                "total_users": stats[0] or 0,
                "active_users": stats[1] or 0,
                "total_events": stats[2] or 0
            },
            "modules": {
                "auth": "active",
                "users": "active", 
                "events": "active",
                "admin": "active",
                "utils": "active",
                "chat": "active"
            }
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if 'session' in locals():
            session.close()

@tribu_bp.route('/api/<app_slug>/migrate', methods=['POST', 'OPTIONS'])
def run_migrations(app_slug):
    """Endpoint para ejecutar migraciones manualmente"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    try:
        from database import run_migrations, get_db_session
        
        session = get_db_session(app_slug)
        engine = session.bind
        
        # Ejecutar migraciones
        run_migrations(engine)
        
        return jsonify({
            "status": "ok",
            "message": "Migraciones ejecutadas exitosamente"
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@tribu_bp.route('/api/<app_slug>/reset', methods=['POST', 'OPTIONS'])
def reset_app(app_slug):
    """Endpoint para resetear la aplicación (PELIGROSO - solo para desarrollo)"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    try:
        # Confirmación de seguridad
        data = request.get_json() or {}
        confirm = data.get('confirm')
        
        if confirm != 'RESET_CONFIRMED':
            return jsonify({"error": "Confirmación requerida. Envía {'confirm': 'RESET_CONFIRMED'}"}), 400
            
        import shutil
        
        # Backup antes de resetear
        safe_slug = "".join([c for c in app_slug if c.isalnum()])
        db_path = f"/home/kenth1977/myDBs/DBs/{safe_slug}.db"
        
        if os.path.exists(db_path):
            backup_path = f"/home/kenth1977/myDBs/backups/{safe_slug}_pre_reset.db"
            os.makedirs(os.path.dirname(backup_path), exist_ok=True)
            shutil.copy2(db_path, backup_path)
            
            # Eliminar base de datos
            os.remove(db_path)
            
            return jsonify({
                "status": "ok",
                "message": f"Aplicación {app_slug} reseteada. Backup guardado en {backup_path}"
            })
        else:
            return jsonify({"error": "Base de datos no encontrada"}), 404
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ==========================================
# MIDDLEWARE Y CONFIGURACIÓN GLOBAL
# ==========================================

@tribu_bp.before_request
def before_request():
    """Middleware que se ejecuta antes de cada request"""
    # Aquí puedes agregar lógica global como logging, rate limiting, etc.
    pass

@tribu_bp.after_request  
def after_request(response):
    """Middleware que se ejecuta después de cada request"""
    # Agregar headers globales
    response.headers['X-App-Version'] = '2.0.0-Modular'
    response.headers['X-Architecture'] = 'Modular-Multi-App'
    return response

# ==========================================
# FUNCIONES AUXILIARES GLOBALES
# ==========================================

def get_app_info(app_slug):
    """Obtiene información básica de la aplicación"""
    safe_slug = "".join([c for c in app_slug if c.isalnum()])
    db_path = f"/home/kenth1977/myDBs/DBs/{safe_slug}.db"
    
    return {
        "slug": safe_slug,
        "database_path": db_path,
        "database_exists": os.path.exists(db_path),
        "database_size": os.path.getsize(db_path) if os.path.exists(db_path) else 0
    }

def validate_app_access(app_slug, required_role=None):
    """Valida acceso a la aplicación con rol opcional"""
    # Aquí puedes agregar lógica de validación de acceso
    return True, "Access granted"

# ==========================================
# EXPORTACIONES PARA COMPATIBILIDAD
# ==========================================

# Exportar funciones importantes para compatibilidad con código existente
__all__ = [
    'tribu_bp',
    'get_db_session', 
    'get_app_info',
    'validate_app_access'
]

print("[OK] Tribu Modular v2.0 - Todos los módulos cargados y registrados")
