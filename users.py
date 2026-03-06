# ==============================================================================
# ARCHIVO: users.py
# ROL: MÓDULO DE USUARIOS
# DESCRIPCIÓN: Gestiona contactos, lista de usuarios y operaciones relacionadas
# ==============================================================================

import time
from flask import Blueprint, request, jsonify, make_response
from flask_cors import cross_origin
from sqlalchemy import text
from database import get_db_session

# Blueprint para usuarios
users_bp = Blueprint('users_bp', __name__)

@users_bp.route('/api/<app_slug>/contactos/<mi_email>', methods=['GET'])
@cross_origin()
def obtener_contactos(app_slug, mi_email):
    """Devuelve contactos cruzando tabla User y Member por Email"""
    session = None
    try:
        session = get_db_session(app_slug)
        current_time = int(time.time())
        
        # Unimos user y member y excluimos mi propio correo
        query = text("""
            SELECT u.email, m.nombre, m.apellido1, m.rol, m.pin, m.last_active 
            FROM user u
            JOIN member m ON u.id = m.id
            WHERE u.email != :mi_email
            ORDER BY m.nombre ASC
        """)
        usuarios = session.execute(query, {"mi_email": mi_email}).mappings().fetchall()
        
        contactos = []
        for u in usuarios:
            apellido = u['apellido1'] if u['apellido1'] else ''
            nombre_completo = f"{u['nombre']} {apellido}".strip()
            
            # Lógica de estado en línea
            last_active = u.get('last_active') or 0
            is_online = (current_time - last_active) < 30
            
            # Contar mensajes no leídos
            try:
                res = session.execute(
                    text("""
                        SELECT COUNT(*) as no_leidos 
                        FROM chat_message 
                        WHERE sender_email = :sender AND receiver_email = :receiver AND is_read = 0
                    """),
                    {"sender": u['email'], "receiver": mi_email}
                ).mappings().fetchone()
                no_leidos = res['no_leidos']
            except Exception:
                no_leidos = 0 
                
            contactos.append({
                "email": u['email'],
                "nombre": nombre_completo,
                "pin": u['pin'],
                "rol": u['rol'],
                "no_leidos": no_leidos,
                "is_online": is_online 
            })
            
        return jsonify({"contactos": contactos})
    except Exception as e:
        print(f"Error cargando contactos para {app_slug}: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if session:
            session.close()

@users_bp.route('/api/<app_slug>/usuarios', methods=['GET', 'OPTIONS'])
@cross_origin()
def obtener_usuarios(app_slug):
    """Devuelve la lista completa de usuarios registrados (endpoint público)"""
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
        print(f"Error cargando lista de usuarios: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if session:
            session.close()

@users_bp.route('/api/<app_slug>/usuario_detalle/<email>', methods=['GET', 'OPTIONS'])
def usuario_detalle(app_slug, email):
    """Devuelve todos los datos de un usuario específico"""
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

@users_bp.route('/api/<app_slug>/buscar_usuario', methods=['POST', 'OPTIONS'])
def buscar_usuario(app_slug):
    """Busca usuarios por nombre, email o PIN"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    session = None
    try:
        data = request.json
        termino = data.get('termino', '').strip()
        
        if not termino:
            return jsonify({"error": "Término de búsqueda requerido"}), 400
            
        session = get_db_session(app_slug)
        
        query = text("""
            SELECT u.email, m.nombre, m.apellido1, m.pin, m.rol 
            FROM member m
            JOIN user u ON m.id = u.id
            WHERE m.nombre LIKE :termino 
               OR m.apellido1 LIKE :termino
               OR u.email LIKE :termino
               OR m.pin LIKE :termino
            ORDER BY m.nombre ASC
            LIMIT 20
        """)
        
        termino_busqueda = f"%{termino}%"
        resultados = session.execute(query, {"termino": termino_busqueda}).mappings().fetchall()
        
        usuarios = []
        for m in resultados:
            apellido = m['apellido1'] if m['apellido1'] else ''
            
            usuarios.append({
                "nombre": m['nombre'],
                "apellido1": apellido,
                "email": m['email'],
                "pin": m['pin'],
                "rol": m.get('rol', 'usuario')
            })
            
        return jsonify({"status": "ok", "usuarios": usuarios})
    except Exception as e:
        print(f"Error buscando usuarios: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if session:
            session.close()

@users_bp.route('/api/<app_slug>/verificar_pin', methods=['POST', 'OPTIONS'])
def verificar_pin(app_slug):
    """Verifica si un PIN existe y devuelve información del usuario"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    session = None
    try:
        data = request.json
        pin = data.get('pin', '').strip()
        
        if not pin:
            return jsonify({"error": "PIN requerido"}), 400
            
        session = get_db_session(app_slug)
        
        query = text("""
            SELECT u.email, m.nombre, m.apellido1, m.id
            FROM member m
            JOIN user u ON m.id = u.id
            WHERE m.pin = :pin
        """)
        
        resultado = session.execute(query, {"pin": pin}).mappings().fetchone()
        
        if not resultado:
            return jsonify({"error": "PIN no encontrado"}), 404
            
        return jsonify({
            "status": "ok",
            "usuario": {
                "email": resultado['email'],
                "nombre": resultado['nombre'],
                "apellido1": resultado['apellido1'],
                "id": resultado['id']
            }
        })
    except Exception as e:
        print(f"Error verificando PIN: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if session:
            session.close()
