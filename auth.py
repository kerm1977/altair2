# ==============================================================================
# ARCHIVO: auth.py
# ROL: MÓDULO DE AUTENTICACIÓN
# DESCRIPCIÓN: Gestiona login, registro, y operaciones de autenticación
# ==============================================================================

import time
from flask import Blueprint, request, jsonify
from flask_cors import cross_origin
from flask_bcrypt import Bcrypt
from sqlalchemy import text
from database import get_db_session

# Blueprint para autenticación
auth_bp = Blueprint('auth_bp', __name__)
bcrypt = Bcrypt()

@auth_bp.route('/api/<app_slug>/registro', methods=['POST', 'OPTIONS'])
@cross_origin()
def registrar_usuario(app_slug):
    """Endpoint para registrar un nuevo usuario"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    session = None
    try:
        data = request.json
        print(f"[*] Intento de registro en DB '{app_slug}' | Email: {data.get('email')}")
        
        session = get_db_session(app_slug)
        
        # Verificar si el usuario ya existe
        usuario_existente = session.execute(
            text("SELECT id FROM user WHERE email = :e"), 
            {"e": data.get('email')}
        ).fetchone()
        
        if usuario_existente:
            return jsonify({"error": "El correo ingresado ya se encuentra registrado."}), 400

        # Hashear contraseña
        hashed_pw = bcrypt.generate_password_hash(data['password']).decode('utf-8')
        username_interno = data['email']
        
        # Insertar en tabla user
        session.execute(
            text("INSERT INTO user (username, email, password) VALUES (:u, :e, :p)"),
            {"u": username_interno, "e": data['email'], "p": hashed_pw}
        )
        
        # Insertar en tabla member
        session.execute(
            text("INSERT INTO member (nombre, apellido1, pin, puntos_totales, rol, telefono, emg_nombre, emg_telefono, dob_dia, dob_mes, dob_anio, last_active) VALUES (:n, :a, :pin, 0, 'usuario', :tel, :emg_n, :emg_t, :d_dia, :d_mes, :d_anio, :la)"),
            {
                "n": data['nombre'], 
                "a": data['apellido1'], 
                "pin": data.get('pin', ''),
                "tel": data.get('telefono', ''),
                "emg_n": data.get('emgNombre', ''),
                "emg_t": data.get('emgTelefono', ''),
                "d_dia": data.get('dobDia', ''),
                "d_mes": data.get('dobMes', ''),
                "d_anio": data.get('dobAnio', ''),
                "la": int(time.time())
            }
        )
        
        session.commit()
        print(f"[+] Registro exitoso en '{app_slug}' para {data.get('email')}")
        return jsonify({"status": "ok", "mensaje": "Usuario registrado exitosamente en la nube."})
        
    except Exception as e:
        if session:
            session.rollback()
        print(f"[-] Error en registro '{app_slug}': {e}")
        return jsonify({"error": str(e)}), 400
        
    finally:
        if session:
            session.close()

@auth_bp.route('/api/<app_slug>/login', methods=['POST', 'OPTIONS'])
@cross_origin()
def login_usuario(app_slug):
    """Endpoint real para iniciar sesión y recuperar datos"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    session = None
    try:
        data = request.json
        session = get_db_session(app_slug)
        
        # Buscar usuario por email
        user_record = session.execute(
            text("SELECT * FROM user WHERE email = :e"), 
            {"e": data['email']}
        ).mappings().fetchone()
        
        if not user_record:
            return jsonify({"error": "Credenciales incorrectas (Usuario no encontrado)"}), 401
            
        # Verificar contraseña
        if not bcrypt.check_password_hash(user_record['password'], data['password']):
            return jsonify({"error": "Credenciales incorrectas (Contraseña inválida)"}), 401
            
        # Obtener datos del miembro
        member_record = session.execute(
            text("SELECT * FROM member WHERE id = :id"),
            {"id": user_record['id']}
        ).mappings().fetchone()
        
        if not member_record:
            return jsonify({"error": "Perfil de usuario incompleto"}), 404
            
        # Construir respuesta
        usuario_data = {
            "nombre": f"{member_record['nombre']} {member_record['apellido1']}".strip(),
            "email": user_record['email'],
            "pin": member_record['pin'],
            "puntos": member_record['puntos_totales'],
            "rol": member_record.get('rol', 'usuario'), 
            "telefono": member_record.get('telefono') or '',
            "emgNombre": member_record.get('emg_nombre') or '',
            "emgTelefono": member_record.get('emg_telefono') or '',
            "dobDia": str(member_record.get('dob_dia') or ''),
            "dobMes": str(member_record.get('dob_mes') or ''),
            "dobAnio": str(member_record.get('dob_anio') or '')
        }
        
        return jsonify({"status": "ok", "usuario": usuario_data})
        
    except Exception as e:
        print(f"[-] Error en login '{app_slug}': {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if session:
            session.close()

@auth_bp.route('/api/<app_slug>/editar_perfil', methods=['POST', 'OPTIONS'])
def editar_perfil(app_slug):
    """Endpoint real para actualizar datos del perfil"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    session = None
    try:
        data = request.json
        session = get_db_session(app_slug)
        
        # Buscar usuario por email
        user_record = session.execute(
            text("SELECT id FROM user WHERE email = :e"), 
            {"e": data['email']}
        ).mappings().fetchone()
        
        if not user_record:
            return jsonify({"error": "Usuario no encontrado"}), 404
            
        user_id = user_record['id']
        apellidos_completos = data.get('apellido1', '') + " " + data.get('apellido2', '')
        
        # Actualizar tabla member
        session.execute(
            text("""
                UPDATE member 
                SET nombre = :n, apellido1 = :a, pin = :pin, telefono = :tel, emg_nombre = :emg_n, emg_telefono = :emg_t, dob_dia = :d_dia, dob_mes = :d_mes, dob_anio = :d_anio
                WHERE id = :id
            """),
            {
                "n": data['nombre'], 
                "a": apellidos_completos.strip(), 
                "pin": data.get('pin', ''),
                "tel": data.get('telefono', ''),
                "emg_n": data.get('emgNombre', ''),
                "emg_t": data.get('emgTelefono', ''),
                "d_dia": data.get('dobDia', ''),
                "d_mes": data.get('dobMes', ''),
                "d_anio": data.get('dobAnio', ''),
                "id": user_id
            }
        )
        
        session.commit()
        return jsonify({"status": "ok", "mensaje": "Perfil actualizado en la nube"})
        
    except Exception as e:
        if session:
            session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if session:
            session.close()

@auth_bp.route('/api/<app_slug>/ping/<email>', methods=['GET', 'OPTIONS'])
@cross_origin()
def ping_usuario(app_slug, email):
    """Latido (Heartbeat) del frontend basado en email"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    session = None
    try:
        session = get_db_session(app_slug)
        current_time = int(time.time())
        
        # Buscar ID del usuario por email
        user_record = session.execute(text("SELECT id FROM user WHERE email = :e"), {"e": email}).fetchone()
        if user_record:
            # Actualizar last_active
            session.execute(
                text("UPDATE member SET last_active = :time WHERE id = :id"),
                {"time": current_time, "id": user_record[0]}
            )
            session.commit()
        return jsonify({"status": "ok"})
    except Exception:
        if session: session.rollback()
        return jsonify({"error": "Falló ping"}), 500
    finally:
        if session: session.close()
