# ==============================================================================
# ARCHIVO: admin.py
# ROL: MÓDULO DE ADMINISTRACIÓN
# DESCRIPCIÓN: Gestiona operaciones administrativas y control de usuarios
# ==============================================================================
import time
from flask import Blueprint, request, jsonify
from flask_cors import cross_origin
from flask_bcrypt import Bcrypt
from sqlalchemy import text
from database import get_db_session

# Blueprint para administración
admin_bp = Blueprint('admin_bp', __name__)
bcrypt = Bcrypt()

@admin_bp.route('/api/<app_slug>/admin/usuarios', methods=['GET', 'OPTIONS'])
@cross_origin()
def admin_obtener_usuarios(app_slug):
    """Devuelve la lista completa de usuarios registrados usando un JOIN"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    session = None
    try:
        session = get_db_session(app_slug)
        
        query = text("""
            SELECT u.email, m.nombre, m.apellido1, m.pin, m.rol 
            FROM member m
            JOIN user u ON m.id = u.id
            ORDER BY m.id ASC
        """)
        miembros = session.execute(query).mappings().fetchall()
        
        usuarios = []
        for index, m in enumerate(miembros, start=1):
            apellido = m['apellido1'] if m['apellido1'] else ''
            
            usuarios.append({
                "consecutivo": index,
                "nombre": m['nombre'],
                "apellido1": apellido,
                "email": m['email'],
                "pin": m['pin'],
                "rol": m.get('rol', 'usuario')
            })
            
        return jsonify({"status": "ok", "usuarios": usuarios})
    except Exception as e:
        print(f"Error cargando lista de usuarios admin: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if session:
            session.close()

@admin_bp.route('/api/<app_slug>/admin/usuario_detalle/<email>', methods=['GET', 'OPTIONS'])
def admin_usuario_detalle(app_slug, email):
    """Devuelve absolutamente todos los datos de un usuario para la vista de edición profunda"""
    if request.method == 'OPTIONS': 
        return jsonify({"status": "ok"}), 200
        
    session = None
    try:
        session = get_db_session(app_slug)
        
        user_record = session.execute(text("SELECT id, email FROM user WHERE email = :e"), {"e": email}).mappings().fetchone()
        if not user_record:
            return jsonify({"error": "Usuario no encontrado"}), 404
            
        miembro = session.execute(text("SELECT * FROM member WHERE id = :id"), {"id": user_record['id']}).mappings().fetchone()
        
        return jsonify({
            "status": "ok", 
            "usuario": {
                "nombre": miembro['nombre'],
                "apellido1": miembro['apellido1'],
                "pin": miembro['pin'],
                "puntos": miembro['puntos_totales'],
                "rol": miembro.get('rol', 'usuario'),
                "telefono": miembro.get('telefono') or '',
                "emgNombre": miembro.get('emg_nombre') or '',
                "emgTelefono": miembro.get('emg_telefono') or '',
                "dobDia": str(miembro.get('dob_dia') or ''),
                "dobMes": str(miembro.get('dob_mes') or ''),
                "dobAnio": str(miembro.get('dob_anio') or ''),
                "email": user_record['email']
            }
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if session: session.close()

@admin_bp.route('/api/<app_slug>/admin/editar_usuario', methods=['POST', 'OPTIONS'])
def admin_editar_usuario(app_slug):
    """Actualiza la totalidad de los datos del usuario (Perfil, Configuración y Seguridad)"""
    if request.method == 'OPTIONS': 
        return jsonify({"status": "ok"}), 200
        
    session = None
    try:
        data = request.json
        session = get_db_session(app_slug)
        
        # Identificadores por correo
        editor_email = data.get('editor_email')
        target_email = data.get('target_email', data.get('email'))

        # Obtener Rol del Editor
        editor_user = session.execute(text("SELECT id FROM user WHERE email = :e"), {"e": editor_email}).fetchone()
        editor_rol = 'usuario'
        if editor_user:
            e_member = session.execute(text("SELECT rol FROM member WHERE id = :id"), {"id": editor_user[0]}).fetchone()
            if e_member: 
                editor_rol = e_member[0]

        # Obtener Datos del Destino
        target_user = session.execute(text("SELECT id FROM user WHERE email = :e"), {"e": target_email}).fetchone()
        if not target_user:
            return jsonify({"error": "Usuario destino no encontrado."}), 404

        target_id = target_user[0]
        target_member = session.execute(text("SELECT * FROM member WHERE id = :id"), {"id": target_id}).mappings().fetchone()
        
        target_rol = target_member.get('rol', 'usuario')
        nuevo_rol = data.get('rol', target_rol)

        # 🛡️ REGLAS DE PODER 🛡️
        if editor_rol == 'usuario':
            return jsonify({"error": "No tienes permisos de Administrador."}), 403
        
        if editor_rol == 'admin':
            if target_rol == 'superadmin':
                return jsonify({"error": "No tienes nivel suficiente para editar a un Superusuario."}), 403
            if nuevo_rol == 'superadmin':
                return jsonify({"error": "Solo un Superusuario puede crear a otro Superusuario."}), 403
                
        # --- 1. ACTUALIZAR TABLA MEMBER (Datos Públicos) ---
        nuevo_nombre = data.get('nombre', target_member['nombre'])
        nuevo_apellido = data.get('apellido1', data.get('apellido', target_member['apellido1']))
        nuevo_pin = data.get('nuevo_pin', data.get('pin', target_member['pin']))
        nuevos_puntos = data.get('puntos', target_member['puntos_totales'])
        nuevo_telefono = data.get('telefono', target_member.get('telefono'))
        nuevo_emg_nombre = data.get('emgNombre', target_member.get('emg_nombre'))
        nuevo_emg_telefono = data.get('emgTelefono', target_member.get('emg_telefono'))
        nuevo_dob_dia = data.get('dobDia', target_member.get('dob_dia'))
        nuevo_dob_mes = data.get('dobMes', target_member.get('dob_mes'))
        nuevo_dob_anio = data.get('dobAnio', target_member.get('dob_anio'))
        
        session.execute(
            text("""
                UPDATE member 
                SET nombre = :n, apellido1 = :a, rol = :r, pin = :np, puntos_totales = :pt, 
                    telefono = :tel, emg_nombre = :emg_n, emg_telefono = :emg_t, 
                    dob_dia = :dd, dob_mes = :dm, dob_anio = :da 
                WHERE id = :id
            """),
            {
                "n": nuevo_nombre, 
                "a": nuevo_apellido, 
                "r": nuevo_rol, 
                "np": nuevo_pin,
                "pt": nuevos_puntos,
                "tel": nuevo_telefono,
                "emg_n": nuevo_emg_nombre,
                "emg_t": nuevo_emg_telefono,
                "dd": nuevo_dob_dia,
                "dm": nuevo_dob_mes,
                "da": nuevo_dob_anio,
                "id": target_id
            }
        )
        
        # --- 2. ACTUALIZAR TABLA USER (Datos de Seguridad) ---
        nuevo_email_ingresado = data.get('nuevo_email', data.get('email'))
        nueva_pass = data.get('password')
        
        if nuevo_email_ingresado and nuevo_email_ingresado != target_email:
            session.execute(text("UPDATE user SET email = :e WHERE id = :id"), {"e": nuevo_email_ingresado, "id": target_id})
            
        if nueva_pass and str(nueva_pass).strip() != '':
            hashed_pw = bcrypt.generate_password_hash(str(nueva_pass).strip()).decode('utf-8')
            session.execute(text("UPDATE user SET password = :p WHERE id = :id"), {"p": hashed_pw, "id": target_id})

        session.commit()
        return jsonify({"status": "ok", "mensaje": "Usuario actualizado completamente"})
    except Exception as e:
        if session: session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if session: session.close()

@admin_bp.route('/api/<app_slug>/admin/borrar_usuario/<email>', methods=['DELETE', 'OPTIONS'])
def admin_borrar_usuario(app_slug, email):
    if request.method == 'OPTIONS': 
        return jsonify({"status": "ok"}), 200
        
    session = None
    try:
        editor_email = request.args.get('editor_email')
        session = get_db_session(app_slug)
        
        # Validar permisos del editor
        editor_user = session.execute(text("SELECT id FROM user WHERE email = :e"), {"e": editor_email}).fetchone()
        editor_rol = 'usuario'
        if editor_user:
            e_member = session.execute(text("SELECT rol FROM member WHERE id = :id"), {"id": editor_user[0]}).fetchone()
            if e_member: editor_rol = e_member[0]
        
        if editor_rol == 'usuario':
            return jsonify({"error": "No tienes permisos de Administrador."}), 403
            
        # Buscar Target
        target_user = session.execute(text("SELECT id FROM user WHERE email = :e"), {"e": email}).fetchone()
        if target_user:
            user_id = target_user[0]
            target_member = session.execute(text("SELECT rol FROM member WHERE id = :id"), {"id": user_id}).fetchone()
            target_rol = target_member[0] if target_member else 'usuario'
            
            # 🛡️ REGLA: Admin no borra Superadmin 🛡️
            if editor_rol == 'admin' and target_rol == 'superadmin':
                return jsonify({"error": "Acceso Denegado: Imposible borrar a un Superusuario."}), 403
                
            session.execute(text("DELETE FROM member WHERE id = :id"), {"id": user_id})
            session.execute(text("DELETE FROM user WHERE id = :id"), {"id": user_id})
            session.commit()
            return jsonify({"status": "ok"})
        else:
            return jsonify({"error": "Usuario no encontrado"}), 404
            
    except Exception as e:
        if session: session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if session: session.close()

@admin_bp.route('/api/<app_slug>/admin/estadisticas', methods=['GET', 'OPTIONS'])
def admin_estadisticas(app_slug):
    """Devuelve estadísticas generales de la aplicación"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    session = None
    try:
        session = get_db_session(app_slug)
        
        # Total de usuarios
        total_usuarios = session.execute(text("SELECT COUNT(*) as total FROM user")).fetchone()[0]
        
        # Usuarios por rol
        roles = session.execute(text("""
            SELECT m.rol, COUNT(*) as cantidad 
            FROM member m 
            GROUP BY m.rol
        """)).mappings().fetchall()
        
        # Usuarios activos (últimos 30 días)
        import time
        thirty_days_ago = int(time.time()) - (30 * 24 * 60 * 60)
        usuarios_activos = session.execute(
            text("SELECT COUNT(*) as total FROM member WHERE last_active > :time"), 
            {"time": thirty_days_ago}
        ).fetchone()[0]
        
        # Total de eventos
        total_eventos = session.execute(text("SELECT COUNT(*) as total FROM event")).fetchone()[0]
        
        return jsonify({
            "status": "ok",
            "estadisticas": {
                "total_usuarios": total_usuarios,
                "usuarios_activos": usuarios_activos,
                "total_eventos": total_eventos,
                "roles": [dict(r) for r in roles]
            }
        })
    except Exception as e:
        print(f"Error obteniendo estadísticas: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if session:
            session.close()

@admin_bp.route('/api/<app_slug>/admin/backup', methods=['GET', 'OPTIONS'])
def admin_backup(app_slug):
    """Genera un backup de la base de datos"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    try:
        import os
        import shutil
        from datetime import datetime
        
        # Ruta de la base de datos
        safe_slug = "".join([c for c in app_slug if c.isalnum()])
        db_path = os.path.join('/home/kenth1977/myDBs/DBs', f"{safe_slug}.db")
        
        if not os.path.exists(db_path):
            return jsonify({"error": "Base de datos no encontrada"}), 404
            
        # Crear backup
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = os.path.join('/home/kenth1977/myDBs/backups', f"{safe_slug}_backup_{timestamp}.db")
        
        # Asegurar que el directorio de backups exista
        os.makedirs(os.path.dirname(backup_path), exist_ok=True)
        
        # Copiar archivo
        shutil.copy2(db_path, backup_path)
        
        return jsonify({
            "status": "ok",
            "mensaje": f"Backup creado exitosamente: {os.path.basename(backup_path)}",
            "backup_file": os.path.basename(backup_path)
        })
    except Exception as e:
        print(f"Error creando backup: {e}")
        return jsonify({"error": str(e)}), 500
