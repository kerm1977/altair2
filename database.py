# ==============================================================================
# ARCHIVO: database.py
# ROL: MÓDULO DE BASE DE DATOS
# DESCRIPCIÓN: Gestiona conexiones, migraciones y operaciones de base de datos
# ==============================================================================

import os
import time
from sqlalchemy import create_engine, Column, Integer, String, Boolean, MetaData, Table, insert, text
from sqlalchemy.orm import sessionmaker, scoped_session
from flask_bcrypt import Bcrypt

# Configuración de rutas
BASE_DB_PATH = '/home/kenth1977/myDBs/DBs'
BASE_UPDATE_PATH = '/home/kenth1977/myDBs/updates'

# Asegurar que las carpetas existan
for path in [BASE_DB_PATH, BASE_UPDATE_PATH]:
    if not os.path.exists(path):
        try:
            os.makedirs(path, exist_ok=True)
            print(f"[OK] Directorio creado: {path}")
        except Exception as e:
            print(f"[ERROR] No se pudo crear el directorio {path}: {e}")

# Variables globales para conexiones
engines = {}
session_factories = {}
bcrypt = Bcrypt()

def get_db_session(app_slug, superusuarios=None):
    """Recupera o crea la conexión a la base de datos de la App específica"""
    safe_slug = "".join([c for c in app_slug if c.isalnum()])
    db_path = os.path.join(BASE_DB_PATH, f"{safe_slug}.db")
    db_exists = os.path.exists(db_path)
    
    if safe_slug not in engines:
        engine = create_engine(f"sqlite:///{db_path}")
        engines[safe_slug] = engine
        session_factory = sessionmaker(bind=engine)
        session_factories[safe_slug] = scoped_session(session_factory)
        
        # Definir tablas
        metadata = MetaData()
        
        user = Table('user', metadata,
            Column('id', Integer, primary_key=True),
            Column('username', String(80), unique=True, nullable=False),
            Column('email', String(120), unique=True, nullable=False),
            Column('password', String(128), nullable=False)
        )
        
        member = Table('member', metadata,
            Column('id', Integer, primary_key=True),
            Column('nombre', String(100)),
            Column('apellido1', String(100)),
            Column('pin', String(20)),
            Column('puntos_totales', Integer, default=0),
            Column('rol', String(20), default='usuario'), 
            Column('telefono', String(20)),               
            Column('emg_nombre', String(100)),            
            Column('emg_telefono', String(20)),           
            Column('dob_dia', String(4)),                 
            Column('dob_mes', String(4)),                 
            Column('dob_anio', String(4)),
            Column('last_active', Integer, default=0)
        )
        
        event = Table('event', metadata,
            Column('id', Integer, primary_key=True),
            Column('nombre', String(100)),
            Column('fecha', String(50))
        )
        
        # Crear tablas
        metadata.create_all(engine)
        
        # Migraciones automáticas
        if db_exists:
            run_migrations(engine)
        
        # Seed inicial
        if not db_exists and superusuarios:
            seed_initial_data(engine, superusuarios, metadata)
    
    return session_factories[safe_slug]()

def run_migrations(engine):
    """Ejecuta migraciones automáticas"""
    migrations = [
        "ALTER TABLE user ADD COLUMN username VARCHAR(80)",
        "ALTER TABLE member ADD COLUMN rol VARCHAR(20) DEFAULT 'usuario'",
        "ALTER TABLE member ADD COLUMN telefono VARCHAR(20)",
        "ALTER TABLE member ADD COLUMN emg_nombre VARCHAR(100)",
        "ALTER TABLE member ADD COLUMN emg_telefono VARCHAR(20)",
        "ALTER TABLE member ADD COLUMN dob_dia VARCHAR(4)",
        "ALTER TABLE member ADD COLUMN dob_mes VARCHAR(4)",
        "ALTER TABLE member ADD COLUMN dob_anio VARCHAR(4)",
        "ALTER TABLE member ADD COLUMN last_active INTEGER DEFAULT 0"
    ]
    
    with engine.begin() as conn:
        for migration in migrations:
            try:
                conn.execute(text(migration))
            except Exception:
                pass

def seed_initial_data(engine, superusuarios, metadata):
    """Inserta datos iniciales"""
    with engine.begin() as conn:
        try:
            user = metadata.tables['user']
            member = metadata.tables['member']
            
            for idx, su in enumerate(superusuarios, start=1):
                hashed_pw = bcrypt.generate_password_hash(su['password']).decode('utf-8')
                
                conn.execute(user.insert().values(
                    username=f"admin_sys_{idx}",
                    email=su['email'],
                    password=hashed_pw
                ))
                
                conn.execute(member.insert().values(
                    nombre='Administrador',
                    apellido1=f"{idx}",
                    pin=su.get('pin', str(idx-1)*8),
                    puntos_totales=0,
                    rol='superadmin'
                ))
            
            print(f"Base de datos inicializada con {len(superusuarios)} superusuarios.")
        except Exception as e:
            print(f"Error insertando seed inicial: {e}")
