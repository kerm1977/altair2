# ==============================================================================
# ARCHIVO: events.py
# ROL: MÓDULO DE EVENTOS
# DESCRIPCIÓN: Gestiona eventos, inscripciones y operaciones relacionadas
# ==============================================================================

from flask import Blueprint, request, jsonify
from sqlalchemy import text
from database import get_db_session

# Blueprint para eventos
events_bp = Blueprint('events_bp', __name__)

@events_bp.route('/api/<app_slug>/eventos', methods=['GET', 'OPTIONS'])
def obtener_eventos(app_slug):
    """Endpoint para obtener todos los eventos de la app"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    session = None
    try:
        session = get_db_session(app_slug)
        
        eventos = session.execute(
            text("SELECT * FROM event ORDER BY fecha DESC")
        ).mappings().fetchall()
        
        return jsonify({"status": "ok", "eventos": [dict(e) for e in eventos]})
    except Exception as e:
        print(f"Error cargando eventos para {app_slug}: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if session:
            session.close()

@events_bp.route('/api/<app_slug>/crear_evento', methods=['POST', 'OPTIONS'])
def crear_evento(app_slug):
    """Endpoint para crear un nuevo evento"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    session = None
    try:
        data = request.json
        
        if not data.get('nombre') or not data.get('fecha'):
            return jsonify({"error": "Nombre y fecha son requeridos"}), 400
            
        session = get_db_session(app_slug)
        
        # Insertar nuevo evento
        session.execute(
            text("INSERT INTO event (nombre, fecha) VALUES (:nombre, :fecha)"),
            {"nombre": data['nombre'], "fecha": data['fecha']}
        )
        
        session.commit()
        return jsonify({
            "status": "ok", 
            "mensaje": f"Evento '{data['nombre']}' creado exitosamente"
        })
        
    except Exception as e:
        if session:
            session.rollback()
        print(f"Error creando evento para {app_slug}: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if session:
            session.close()

@events_bp.route('/api/<app_slug>/evento/<int:event_id>', methods=['GET', 'OPTIONS'])
def obtener_evento(app_slug, event_id):
    """Endpoint para obtener un evento específico"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    session = None
    try:
        session = get_db_session(app_slug)
        
        evento = session.execute(
            text("SELECT * FROM event WHERE id = :id"),
            {"id": event_id}
        ).mappings().fetchone()
        
        if not evento:
            return jsonify({"error": "Evento no encontrado"}), 404
            
        return jsonify({"status": "ok", "evento": dict(evento)})
    except Exception as e:
        print(f"Error obteniendo evento {event_id}: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if session:
            session.close()

@events_bp.route('/api/<app_slug>/editar_evento/<int:event_id>', methods=['PUT', 'OPTIONS'])
def editar_evento(app_slug, event_id):
    """Endpoint para editar un evento existente"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    session = None
    try:
        data = request.json
        session = get_db_session(app_slug)
        
        # Verificar que el evento existe
        evento = session.execute(
            text("SELECT id FROM event WHERE id = :id"),
            {"id": event_id}
        ).fetchone()
        
        if not evento:
            return jsonify({"error": "Evento no encontrado"}), 404
            
        # Actualizar evento
        session.execute(
            text("UPDATE event SET nombre = :nombre, fecha = :fecha WHERE id = :id"),
            {"nombre": data.get('nombre'), "fecha": data.get('fecha'), "id": event_id}
        )
        
        session.commit()
        return jsonify({
            "status": "ok", 
            "mensaje": "Evento actualizado exitosamente"
        })
        
    except Exception as e:
        if session:
            session.rollback()
        print(f"Error editando evento {event_id}: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if session:
            session.close()

@events_bp.route('/api/<app_slug>/eliminar_evento/<int:event_id>', methods=['DELETE', 'OPTIONS'])
def eliminar_evento(app_slug, event_id):
    """Endpoint para eliminar un evento"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    session = None
    try:
        session = get_db_session(app_slug)
        
        # Verificar que el evento existe
        evento = session.execute(
            text("SELECT id FROM event WHERE id = :id"),
            {"id": event_id}
        ).fetchone()
        
        if not evento:
            return jsonify({"error": "Evento no encontrado"}), 404
            
        # Eliminar evento
        session.execute(
            text("DELETE FROM event WHERE id = :id"),
            {"id": event_id}
        )
        
        session.commit()
        return jsonify({
            "status": "ok", 
            "mensaje": "Evento eliminado exitosamente"
        })
        
    except Exception as e:
        if session:
            session.rollback()
        print(f"Error eliminando evento {event_id}: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if session:
            session.close()

@events_bp.route('/api/<app_slug>/inscribir', methods=['POST', 'OPTIONS'])
def inscribir_evento(app_slug):
    """Endpoint para inscribir a un usuario en un evento usando su PIN"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    session = None
    try:
        data = request.json
        pin = data.get('pin')
        event_id = data.get('event_id')
        
        if not pin or not event_id:
            return jsonify({"error": "PIN y ID del evento son requeridos"}), 400
            
        session = get_db_session(app_slug)
        
        # Buscar usuario por PIN
        miembro = session.execute(
            text("SELECT id FROM member WHERE pin = :pin"),
            {"pin": pin}
        ).fetchone()
        
        if not miembro:
            return jsonify({"error": "PIN no encontrado"}), 404
            
        # Verificar que el evento existe
        evento = session.execute(
            text("SELECT id FROM event WHERE id = :event_id"),
            {"event_id": event_id}
        ).fetchone()
        
        if not evento:
            return jsonify({"error": "Evento no encontrado"}), 404
            
        # Aquí podrías agregar lógica para evitar inscripciones duplicadas
        # Por ahora simplemente retornamos éxito
        
        return jsonify({
            "status": "ok", 
            "mensaje": f"Usuario con PIN {pin} inscrito exitosamente en el evento {event_id}"
        })
        
    except Exception as e:
        print(f"Error en inscripción para {app_slug}: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if session:
            session.close()

@events_bp.route('/api/<app_slug>/eventos_inscritos/<pin>', methods=['GET', 'OPTIONS'])
def eventos_inscritos(app_slug, pin):
    """Endpoint para obtener los eventos en los que un usuario está inscrito"""
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    session = None
    try:
        session = get_db_session(app_slug)
        
        # Buscar usuario por PIN
        miembro = session.execute(
            text("SELECT id FROM member WHERE pin = :pin"),
            {"pin": pin}
        ).fetchone()
        
        if not miembro:
            return jsonify({"error": "PIN no encontrado"}), 404
            
        # Aquí deberías tener una tabla de inscripciones
        # Por ahora retornamos todos los eventos disponibles
        eventos = session.execute(
            text("SELECT * FROM event ORDER BY fecha DESC")
        ).mappings().fetchall()
        
        return jsonify({
            "status": "ok", 
            "eventos": [dict(e) for e in eventos],
            "mensaje": "Funcionalidad de inscripciones pendiente de implementar completamente"
        })
        
    except Exception as e:
        print(f"Error obteniendo eventos inscritos para {app_slug}: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if session:
            session.close()
