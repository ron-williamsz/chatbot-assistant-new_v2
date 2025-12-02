import sqlite3
import json
from typing import List, Dict, Any, Optional, Tuple
import os
from datetime import datetime
import logging

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Obter caminho do banco de dados
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'assistants.db')

# Garantir que o diretório existe
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

def get_db_connection():
    """Obtém uma conexão com o banco de dados SQLite"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    
    # Habilitar FOREIGN KEYS para garantir integridade referencial
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")
    
    return conn

def init_db():
    """Inicializa o banco de dados criando as tabelas necessárias se não existirem"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Criar tabela de assistentes
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS assistants (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        instructions TEXT,
        model TEXT,
        metadata TEXT,
        created_at INTEGER,
        data JSON,
        deleted INTEGER DEFAULT 0
    )
    ''')
    
    # Criar tabela para informações de sincronização
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS sync_info (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        last_sync_time INTEGER,
        cursor_after TEXT
    )
    ''')
    
    conn.commit()
    conn.close()
    logger.info("Banco de dados inicializado com sucesso")

# Inicializa o banco de dados na importação do módulo
init_db()

def store_assistant(assistant_data: Dict[str, Any]):
    """Armazena um assistente no banco de dados"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Extrair os dados principais
        assistant_id = assistant_data.get('id')
        name = assistant_data.get('name')
        description = assistant_data.get('description')
        instructions = assistant_data.get('instructions')
        model = assistant_data.get('model')
        metadata = json.dumps(assistant_data.get('metadata', {}))
        created_at = assistant_data.get('created_at')
        
        # Armazenar todo o objeto JSON para referência futura
        data_json = json.dumps(assistant_data)
        
        # Verificar se já existe
        cursor.execute("SELECT id FROM assistants WHERE id = ?", (assistant_id,))
        existing = cursor.fetchone()
        
        if existing:
            # Atualizar registro existente
            cursor.execute('''
            UPDATE assistants 
            SET name = ?, description = ?, instructions = ?, model = ?, 
                metadata = ?, created_at = ?, data = ?, deleted = 0
            WHERE id = ?
            ''', (name, description, instructions, model, metadata, created_at, data_json, assistant_id))
        else:
            # Inserir novo registro
            cursor.execute('''
            INSERT INTO assistants (id, name, description, instructions, model, metadata, created_at, data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (assistant_id, name, description, instructions, model, metadata, created_at, data_json))
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Erro ao armazenar assistente: {str(e)}")
        return False

def get_assistants(search_term: Optional[str] = None, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """
    Retorna assistentes do banco de dados local
    
    Args:
        search_term: Termo para pesquisa (nome, descrição ou ID)
        limit: Limite de resultados
        offset: Deslocamento para paginação
    
    Returns:
        Lista de assistentes
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        query = "SELECT * FROM assistants WHERE deleted = 0"
        params = []
        
        # Adicionar filtro de pesquisa se fornecido
        if search_term:
            query += " AND (name LIKE ? OR description LIKE ? OR id LIKE ?)"
            search_pattern = f"%{search_term}%"
            params.extend([search_pattern, search_pattern, search_pattern])
        
        # Adicionar ordenação e paginação
        query += " ORDER BY name ASC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        # Converter para dicionários
        assistants = []
        for row in rows:
            assistant = {
                'id': row['id'],
                'name': row['name'],
                'description': row['description'],
                'model': row['model']
            }
            assistants.append(assistant)
        
        conn.close()
        return assistants
    except Exception as e:
        logger.error(f"Erro ao obter assistentes: {str(e)}")
        return []

def save_assistant(assistant_data: Dict[str, Any]) -> bool:
    """Alias para store_assistant para compatibilidade"""
    return store_assistant(assistant_data)

def mark_assistant_deleted(assistant_id: str) -> bool:
    """Marca um assistente como excluído no banco de dados local"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("UPDATE assistants SET deleted = 1 WHERE id = ?", (assistant_id,))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Erro ao marcar assistente como excluído: {str(e)}")
        return False

def get_last_sync_info() -> Dict[str, Any]:
    """Obtém informações da última sincronização"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM sync_info ORDER BY id DESC LIMIT 1")
        row = cursor.fetchone()
        
        if row:
            result = {
                'last_sync_time': row['last_sync_time'],
                'cursor_after': row['cursor_after']
            }
        else:
            result = {
                'last_sync_time': 0,
                'cursor_after': None
            }
        
        conn.close()
        return result
    except Exception as e:
        logger.error(f"Erro ao obter informações de sincronização: {str(e)}")
        return {'last_sync_time': 0, 'cursor_after': None}

def update_sync_info(cursor_after: Optional[str] = None) -> bool:
    """Atualiza informações de sincronização"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        now = int(datetime.now().timestamp())
        
        cursor.execute('''
        INSERT INTO sync_info (last_sync_time, cursor_after)
        VALUES (?, ?)
        ''', (now, cursor_after))
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Erro ao atualizar informações de sincronização: {str(e)}")
        return False 