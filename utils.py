# ==============================================================================
# ARCHIVO: utils.py
# ROL: MÓDULO DE UTILIDADES
# DESCRIPCIÓN: Funciones auxiliares, endpoints de sistema y utilidades varias
# ==============================================================================

import os
from flask import Blueprint, request, jsonify, send_from_directory, make_response
from database import get_db_session

# Blueprint para utilidades
utils_bp = Blueprint('utils_bp', __name__)

@utils_bp.route('/')
def index():
    """Diagnóstico inicial"""
    try:
        files = [f.replace('.db', '') for f in os.listdir('/home/kenth1977/myDBs/DBs') if f.endswith('.db')]
    except:
        files = []
    return jsonify({
        "status": "online",
        "motor": "Universal Multi-App v2.0 - Modular",
        "apps_activas_en_disco": files,
        "ayuda": "Visita /api/NombreDeTuApp/crear_ahora para generar una nueva base de datos."
    })

@utils_bp.route('/api/<app_slug>/crear_ahora', methods=['GET', 'POST', 'OPTIONS'])
def forzar_creacion(app_slug):
    """DISPARADOR: Crea la BD físicamente y recibe los superusuarios desde Node.js"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    try:
        superusuarios_entrantes = []
        
        # Si la llamada viene del Script de Node.js (POST), extraemos las credenciales
        if request.method == 'POST':
            data = request.get_json(silent=True)
            if data and 'superusuarios' in data:
                superusuarios_entrantes = data['superusuarios']
                
        # Le pasamos los datos a la función que crea la BD
        get_db_session(app_slug, superusuarios_entrantes)
        
        return jsonify({
            "status": "ok",
            "mensaje": f"Base de datos para '{app_slug}' lista para usar."
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@utils_bp.route('/descargas_ota/<path:filename>')
def descargar_ota(filename):
    """Sirve los archivos ZIP de actualización desde la carpeta protegida"""
    try:
        response = make_response(send_from_directory('/home/kenth1977/myDBs/updates', filename))
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        return response
    except Exception as e:
        return jsonify({"error": f"Archivo no encontrado: {str(e)}"}), 404

@utils_bp.route('/api/<app_slug>/check_update', methods=['GET', 'OPTIONS'])
def check_update(app_slug):
    """Endpoint para que el Frontend sepa si hay una nueva versión de HTML/CSS/JS"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    try:
        zip_path = os.path.join('/home/kenth1977/myDBs/updates', 'www.zip')
        
        file_timestamp = "0"
        if os.path.exists(zip_path):
            file_timestamp = str(int(os.path.getmtime(zip_path)))

        archivos_modificados = [
            "Optimizaciones en la interfaz gráfica",
            "Mejoras de rendimiento y seguridad",
            "Nuevas funciones activadas"
        ]

        update_data = {
            "status": "ok",
            "version": "2.0.0", 
            "timestamp": file_timestamp,
            "archivos": archivos_modificados,
            "url": "https://kenth1977.pythonanywhere.com/descargas_ota/www.zip"
        }
        
        return jsonify(update_data), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@utils_bp.route('/api/<app_slug>/health', methods=['GET', 'OPTIONS'])
def health_check(app_slug):
    """Endpoint de monitoreo de salud"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    try:
        session = get_db_session(app_slug)
        
        # Verificar conexión a base de datos
        db_status = session.execute(text("SELECT 1")).fetchone()
        
        # Verificar tablas principales
        tables_check = {}
        
        try:
            user_count = session.execute(text("SELECT COUNT(*) FROM user")).fetchone()[0]
            tables_check['user'] = {"status": "ok", "count": user_count}
        except Exception as e:
            tables_check['user'] = {"status": "error", "error": str(e)}
            
        try:
            member_count = session.execute(text("SELECT COUNT(*) FROM member")).fetchone()[0]
            tables_check['member'] = {"status": "ok", "count": member_count}
        except Exception as e:
            tables_check['member'] = {"status": "error", "error": str(e)}
            
        try:
            event_count = session.execute(text("SELECT COUNT(*) FROM event")).fetchone()[0]
            tables_check['event'] = {"status": "ok", "count": event_count}
        except Exception as e:
            tables_check['event'] = {"status": "error", "error": str(e)}
        
        session.close()
        
        return jsonify({
            "status": "healthy",
            "app": app_slug,
            "database": "connected" if db_status else "disconnected",
            "tables": tables_check,
            "timestamp": os.path.getmtime(os.path.join('/home/kenth1977/myDBs/DBs', f"{app_slug}.db")) if os.path.exists(os.path.join('/home/kenth1977/myDBs/DBs', f"{app_slug}.db")) else None
        })
        
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "error": str(e)
        }), 500

@utils_bp.route('/api/<app_slug>/logs', methods=['GET', 'OPTIONS'])
def get_logs(app_slug):
    """Endpoint para obtener logs del sistema (simplificado)"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    try:
        # En un entorno real, aquí leerías archivos de log
        # Por ahora retornamos información básica
        logs = [
            {"timestamp": "2026-03-05 18:00:00", "level": "INFO", "message": f"Sistema iniciado para {app_slug}"},
            {"timestamp": "2026-03-05 18:05:00", "level": "INFO", "message": "Base de datos conectada"},
            {"timestamp": "2026-03-05 18:10:00", "level": "INFO", "message": "Módulos cargados correctamente"}
        ]
        
        return jsonify({
            "status": "ok",
            "logs": logs,
            "total": len(logs)
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@utils_bp.route('/api/<app_slug>/config', methods=['GET', 'OPTIONS'])
def get_config(app_slug):
    """Endpoint para obtener configuración de la aplicación"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    try:
        config = {
            "app_name": app_slug,
            "version": "2.0.0",
            "features": {
                "chat": True,
                "events": True,
                "admin_panel": True,
                "file_upload": True,
                "multi_app": True
            },
            "limits": {
                "max_file_size": "10MB",
                "max_users_per_app": 1000,
                "session_timeout": 3600
            },
            "paths": {
                "database": f"/home/kenth1977/myDBs/DBs/{app_slug}.db",
                "uploads": "/home/kenth1977/myDBs/uploads",
                "backups": "/home/kenth1977/myDBs/backups"
            }
        }
        
        return jsonify({
            "status": "ok",
            "config": config
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@utils_bp.route('/api/<app_slug>/cleanup', methods=['POST', 'OPTIONS'])
def cleanup(app_slug):
    """Endpoint para limpiar datos temporales o antiguos"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    try:
        # Lógica de limpieza básica
        cleanup_results = {}
        
        # Limpiar sesiones expiradas (si tuvieras tabla de sesiones)
        cleanup_results['sessions'] = {"cleaned": 0, "status": "ok"}
        
        # Limpiar archivos temporales antiguos
        import glob
        import time
        temp_files = glob.glob("/home/kenth1977/myDBs/temp/*")
        current_time = time.time()
        cleaned_files = 0
        
        for file_path in temp_files:
            if os.path.exists(file_path):
                file_age = current_time - os.path.getmtime(file_path)
                if file_age > 86400:  # 24 horas
                    try:
                        os.remove(file_path)
                        cleaned_files += 1
                    except:
                        pass
        
        cleanup_results['temp_files'] = {"cleaned": cleaned_files, "status": "ok"}
        
        return jsonify({
            "status": "ok",
            "message": "Limpieza completada",
            "results": cleanup_results
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Función auxiliar para validar slugs de aplicaciones
def validate_app_slug(slug):
    """Valida que el slug de la aplicación sea seguro"""
    if not slug:
        return False, "El slug no puede estar vacío"
    
    safe_slug = "".join([c for c in slug if c.isalnum()])
    if len(safe_slug) != len(slug):
        return False, "El slug solo puede contener letras y números"
    
    if len(safe_slug) < 3 or len(safe_slug) > 50:
        return False, "El slug debe tener entre 3 y 50 caracteres"
    
    return True, safe_slug

# Función auxiliar para generar nombres únicos
def generate_unique_filename(original_name, prefix=""):
    """Genera un nombre de archivo único con timestamp"""
    import time
    import uuid
    
    name, ext = os.path.splitext(original_name)
    timestamp = int(time.time())
    unique_id = str(uuid.uuid4())[:8]
    
    return f"{prefix}{timestamp}_{unique_id}{ext}"

# Función auxiliar para formatear tamaños de archivo
def format_file_size(size_bytes):
    """Formatea tamaño de bytes a formato legible"""
    if size_bytes == 0:
        return "0B"
    
    size_names = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    size = float(size_bytes)
    
    while size >= 1024.0 and i < len(size_names) - 1:
        size /= 1024.0
        i += 1
    
    return f"{size:.1f}{size_names[i]}"
