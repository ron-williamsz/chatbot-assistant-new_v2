import sqlite3
import os
from datetime import datetime
import json
import hashlib
import uuid
import secrets

# Importar gerenciador de segurança
try:
    from app.security import SQLiteSecurityManager
    SECURITY_ENABLED = True
except ImportError:
    SECURITY_ENABLED = False
    print("Módulo de segurança não disponível - usando SQLite padrão")

# Define o caminho do banco de dados
DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'assistants.db')

# Garantir que o diretório data existe
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

# Inicializar gerenciador de segurança se disponível
if SECURITY_ENABLED:
    security_manager = SQLiteSecurityManager(DB_PATH)

def get_db_connection():
    """Cria uma conexão com o banco de dados SQLite com configurações de segurança"""
    if SECURITY_ENABLED and os.getenv('SQLITE_SECURE', 'false').lower() == 'true':
        conn = security_manager.get_secure_connection()
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row  # Para acessar colunas pelo nome
        
        # Aplicar algumas configurações básicas de segurança mesmo sem o módulo completo
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")
        cursor.execute("PRAGMA journal_mode = WAL;")
        cursor.execute("PRAGMA synchronous = NORMAL;")
        
    # SEMPRE habilitar FOREIGN KEYS, independente do caminho tomado acima
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")
    
    conn.row_factory = sqlite3.Row  # Garantir que sempre temos acesso por nome
    return conn

def create_backup():
    """Criar backup do banco de dados"""
    if SECURITY_ENABLED:
        return security_manager.create_backup()
    else:
        # Backup simples sem o módulo de segurança
        try:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            backup_dir = os.path.join(os.path.dirname(DB_PATH), 'backups')
            os.makedirs(backup_dir, exist_ok=True)
            backup_path = os.path.join(backup_dir, f'backup_{timestamp}.db')
            
            # Cópia simples do arquivo
            import shutil
            shutil.copy2(DB_PATH, backup_path)
            
            print(f"Backup simples criado: {backup_path}")
            return backup_path
        except Exception as e:
            print(f"Erro ao criar backup simples: {str(e)}")
            return False

def check_database_integrity():
    """Verificar integridade do banco de dados"""
    if SECURITY_ENABLED:
        return security_manager.check_integrity()
    else:
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("PRAGMA integrity_check;")
            result = cursor.fetchone()
            conn.close()
            return result[0] == 'ok'
        except Exception as e:
            print(f"Erro na verificação de integridade: {str(e)}")
            return False

def optimize_database():
    """Otimizar banco de dados"""
    if SECURITY_ENABLED:
        return security_manager.optimize_database()
    else:
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("VACUUM;")
            cursor.execute("ANALYZE;")
            conn.close()
            print("Otimização básica concluída")
            return True
        except Exception as e:
            print(f"Erro na otimização: {str(e)}")
            return False

def get_database_stats():
    """Obter estatísticas do banco de dados"""
    if SECURITY_ENABLED:
        return security_manager.get_database_stats()
    else:
        try:
            stats = {}
            stats['file_size'] = os.path.getsize(DB_PATH) if os.path.exists(DB_PATH) else 0
            stats['security_enabled'] = False
            return stats
        except Exception as e:
            print(f"Erro ao obter estatísticas: {str(e)}")
            return {}

def init_db():
    """Inicializa o banco de dados criando as tabelas necessárias se não existirem"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Tabela de assistentes
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS assistants (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        model TEXT,
        instructions TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        metadata TEXT,
        raw_data TEXT,
        is_deleted INTEGER DEFAULT 0
    )
    ''')
    
    # Tabela para controle de sincronização
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS sync_info (
        id INTEGER PRIMARY KEY,
        last_sync_time INTEGER,
        cursor_after TEXT
    )
    ''')
    
    # Tabela de usuários para autenticação
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        email TEXT UNIQUE,
        full_name TEXT,
        is_admin INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at INTEGER,
        last_login INTEGER,
        tipo TEXT DEFAULT 'usuario',
        carteira DECIMAL(10,2) DEFAULT 0.00,
        last_update INTEGER
    )
    ''')
    
    # Migração: adicionar colunas novas se não existirem
    try:
        cursor.execute("SELECT tipo FROM users LIMIT 1")
    except sqlite3.OperationalError:
        # Coluna tipo não existe, vamos adicioná-la
        cursor.execute("ALTER TABLE users ADD COLUMN tipo TEXT DEFAULT 'usuario'")
        # Atualizar usuários admin existentes
        cursor.execute("UPDATE users SET tipo = 'administrador' WHERE is_admin = 1")
        conn.commit()
    
    try:
        cursor.execute("SELECT carteira FROM users LIMIT 1")
    except sqlite3.OperationalError:
        # Coluna carteira não existe, vamos adicioná-la
        cursor.execute("ALTER TABLE users ADD COLUMN carteira DECIMAL(10,2) DEFAULT 0.00")
        conn.commit()
    
    # Migração: alterar tipo da coluna carteira de DECIMAL para INTEGER
    cursor.execute("PRAGMA table_info(users)")
    columns = cursor.fetchall()
    carteira_col = next((col for col in columns if col[1] == 'carteira'), None)
    
    if carteira_col and 'DECIMAL' in carteira_col[2].upper():
        # Precisamos recriar a tabela para alterar o tipo da coluna
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS users_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            email TEXT UNIQUE,
            full_name TEXT,
            is_admin INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at INTEGER,
            last_login INTEGER,
            tipo TEXT DEFAULT 'usuario',
            carteira INTEGER DEFAULT NULL,
            last_update INTEGER
        )
        ''')
        
        # Copiar dados existentes
        cursor.execute('''
        INSERT INTO users_new (id, username, password_hash, email, full_name, is_admin, 
                              is_active, created_at, last_login, tipo, carteira, last_update)
        SELECT id, username, password_hash, email, full_name, is_admin, 
               is_active, created_at, last_login, tipo, 
               CASE WHEN carteira = 0.00 THEN NULL ELSE CAST(carteira AS INTEGER) END, 
               last_update
        FROM users
        ''')
        
        # Remover tabela antiga e renomear a nova
        cursor.execute("DROP TABLE users")
        cursor.execute("ALTER TABLE users_new RENAME TO users")
        conn.commit()
        print("Migração da coluna carteira concluída com sucesso!")
    
    try:
        cursor.execute("SELECT last_update FROM users LIMIT 1")
    except sqlite3.OperationalError:
        # Coluna last_update não existe, vamos adicioná-la
        cursor.execute("ALTER TABLE users ADD COLUMN last_update INTEGER")
        conn.commit()
    
    # Verificar se existe um usuário admin padrão
    cursor.execute('SELECT id FROM users WHERE username = ?', ('admin',))
    admin_exists = cursor.fetchone()
    
    # Criar usuário admin padrão se não existir
    if not admin_exists:
        hash_password = hashlib.sha256('admin'.encode()).hexdigest()
        now = int(datetime.now().timestamp())
        cursor.execute('''
        INSERT INTO users (username, password_hash, email, full_name, is_admin, created_at, tipo)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', ('admin', hash_password, 'admin@example.com', 'Administrador', 1, now, 'administrador'))

    # Verificar se existe o usuário ron (verificar por username E email)
    cursor.execute('SELECT id FROM users WHERE username = ? OR email = ?', ('ron', 'ron@zangari.com.br'))
    ron_exists = cursor.fetchone()

    # Criar usuário ron se não existir
    if not ron_exists:
        hash_password = hashlib.sha256('ron123'.encode()).hexdigest()
        now = int(datetime.now().timestamp())
        cursor.execute('''
        INSERT INTO users (username, password_hash, email, full_name, is_admin, created_at, tipo)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', ('ron', hash_password, 'ron@zangari.com.br', 'Ron', 1, now, 'administrador'))

    # Tabela para sessões de usuário
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at INTEGER,
        expires_at INTEGER,
        ip_address TEXT,
        user_agent TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    ''')
    
    # Tabela para configurações do sistema
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS system_settings (
        id INTEGER PRIMARY KEY,
        primary_color TEXT DEFAULT '#dc2626',
        primary_dark TEXT DEFAULT '#b91c1c',
        primary_light TEXT DEFAULT '#3b82f6',
        secondary_color TEXT DEFAULT '#6b7280',
        accent_color TEXT DEFAULT '#3b82f6',
        updated_at INTEGER,
        updated_by INTEGER,
        FOREIGN KEY (updated_by) REFERENCES users (id)
    )
    ''')
    
    # Tabela para configurações gerais do sistema (chave API, etc.)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value TEXT,
        description TEXT,
        updated_at INTEGER
    )
    ''')
    
    # Inserir chave da API OpenAI padrão se não existir
    openai_key = os.getenv('OPENAI_API_KEY')
    if openai_key:
        cursor.execute('''
        INSERT OR REPLACE INTO system_config (key, value, description, updated_at)
        VALUES (?, ?, ?, ?)
        ''', ('openai_api_key', openai_key, 'Chave da API OpenAI', int(datetime.now().timestamp())))
    
    # Tabela de carteiras (conjuntos de assistentes)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        is_active INTEGER DEFAULT 1,
        created_at INTEGER,
        updated_at INTEGER,
        created_by INTEGER,
        FOREIGN KEY (created_by) REFERENCES users (id)
    )
    ''')
    
    # Tabela para relacionar assistentes às carteiras
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS wallet_assistants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_id INTEGER NOT NULL,
        assistant_id TEXT NOT NULL,
        added_at INTEGER,
        added_by INTEGER,
        FOREIGN KEY (wallet_id) REFERENCES wallets (id) ON DELETE CASCADE,
        FOREIGN KEY (added_by) REFERENCES users (id),
        UNIQUE(wallet_id, assistant_id)
    )
    ''')
    
    # Tabela para chaves de API
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_name TEXT NOT NULL,
        api_key TEXT NOT NULL UNIQUE,
        hashed_key TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        permissions TEXT DEFAULT 'read',
        created_at INTEGER,
        created_by INTEGER,
        last_used INTEGER,
        expires_at INTEGER,
        description TEXT,
        FOREIGN KEY (created_by) REFERENCES users (id)
    )
    ''')

    # Tabela para tokens de integração entre plataformas
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS user_integration_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        integration_token TEXT UNIQUE NOT NULL,
        platform TEXT DEFAULT 'solucoes_zangari',
        created_at INTEGER,
        last_used INTEGER,
        is_active INTEGER DEFAULT 1,
        description TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    ''')
    
    # Tabela para multas
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS multas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_multa TEXT UNIQUE NOT NULL,
        unidade TEXT NOT NULL,
        bloco TEXT,
        assistant_id TEXT,
        tipo_multa TEXT,
        valor DECIMAL(10,2) NOT NULL,
        data_infracao INTEGER NOT NULL,
        descricao TEXT NOT NULL,
        observacoes TEXT,
        status TEXT DEFAULT 'pendente',
        data_criacao INTEGER NOT NULL,
        criado_por INTEGER NOT NULL,
        data_pagamento INTEGER,
        data_vencimento INTEGER,
        arquivo_documento TEXT,
        FOREIGN KEY (criado_por) REFERENCES users (id)
    )
    ''')
    
    # Tabela para advertências
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS advertencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_advertencia TEXT UNIQUE NOT NULL,
        unidade TEXT NOT NULL,
        bloco TEXT,
        assistant_id TEXT,
        data_ocorrencia INTEGER NOT NULL,
        descricao TEXT NOT NULL,
        reincidente INTEGER DEFAULT 0,
        status TEXT DEFAULT 'ativa',
        data_criacao INTEGER NOT NULL,
        criado_por INTEGER NOT NULL,
        arquivo_documento TEXT,
        FOREIGN KEY (criado_por) REFERENCES users (id)
    )
    ''')
    
    # Tabela para tipos de multas predefinidas
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS tipos_multa (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        descricao TEXT NOT NULL,
        valor_sugerido DECIMAL(10,2),
        ativo INTEGER DEFAULT 1
    )
    ''')
    
    # Tabela para tipos de advertências predefinidas
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS tipos_advertencia (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        descricao TEXT NOT NULL,
        ativo INTEGER DEFAULT 1
    )
    ''')
    
    # Inserir configurações padrão do sistema se não existirem
    cursor.execute("SELECT COUNT(*) FROM system_settings")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
            INSERT INTO system_settings (
                primary_color, primary_dark, primary_light, 
                secondary_color, accent_color, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?)
        """, (
            '#6b7280',  # Cinza suave como cor primária
            '#4b5563',  # Cinza mais escuro
            '#9ca3af',  # Cinza mais claro
            '#6b7280',  # Cor secundária igual à primária
            '#3b82f6',  # Azul para acentos
            None        # updated_by (sistema automático)
        ))
    
    # Inserir tipos padrão de multas se não existirem
    cursor.execute("SELECT COUNT(*) FROM tipos_multa")
    if cursor.fetchone()[0] == 0:
        tipos_multa_padrao = [
            ('RUIDO', 'Perturbação do sossego', 150.00),
            ('AREA_COMUM', 'Uso indevido de área comum', 100.00),
            ('ANIMAIS', 'Infração relacionada a animais', 200.00),
            ('LIXO', 'Descarte irregular de lixo', 80.00),
            ('REFORMA', 'Reforma sem autorização', 500.00),
            ('VAGA', 'Uso indevido de vaga', 100.00),
            ('SEGURANCA', 'Violação de normas de segurança', 300.00),
            ('OUTROS', 'Outras infrações', 100.00)
        ]
        for codigo, descricao, valor in tipos_multa_padrao:
            cursor.execute('''
                INSERT INTO tipos_multa (codigo, descricao, valor_sugerido)
                VALUES (?, ?, ?)
            ''', (codigo, descricao, valor))
    
    # Inserir tipos padrão de advertências se não existirem
    cursor.execute("SELECT COUNT(*) FROM tipos_advertencia")
    if cursor.fetchone()[0] == 0:
        tipos_advertencia_padrao = [
            ('RUIDO_LEVE', 'Ruído em horário inadequado'),
            ('AREA_COMUM_LEVE', 'Uso inadequado de área comum'),
            ('CONVIVENCIA', 'Problema de convivência'),
            ('MANUTENCAO', 'Falta de manutenção'),
            ('REGIMENTO', 'Descumprimento do regimento'),
            ('NOTIFICACAO', 'Notificação preventiva'),
            ('OUTROS', 'Outras advertências')
        ]
        for codigo, descricao in tipos_advertencia_padrao:
            cursor.execute('''
                INSERT INTO tipos_advertencia (codigo, descricao)
                VALUES (?, ?)
            ''', (codigo, descricao))
    
    conn.commit()
    
    # Migração: adicionar campos novos nas tabelas de multas e advertências
    try:
        cursor.execute("SELECT bloco FROM multas LIMIT 1")
    except sqlite3.OperationalError:
        # Coluna bloco não existe em multas, vamos adicioná-la
        cursor.execute("ALTER TABLE multas ADD COLUMN bloco TEXT")
        conn.commit()
    
    try:
        cursor.execute("SELECT assistant_id FROM multas LIMIT 1")
    except sqlite3.OperationalError:
        # Coluna assistant_id não existe em multas, vamos adicioná-la
        cursor.execute("ALTER TABLE multas ADD COLUMN assistant_id TEXT")
        conn.commit()
    
    try:
        cursor.execute("SELECT bloco FROM advertencias LIMIT 1")
    except sqlite3.OperationalError:
        # Coluna bloco não existe em advertências, vamos adicioná-la
        cursor.execute("ALTER TABLE advertencias ADD COLUMN bloco TEXT")
        conn.commit()
    
    try:
        cursor.execute("SELECT assistant_id FROM advertencias LIMIT 1")
    except sqlite3.OperationalError:
        # Coluna assistant_id não existe em advertências, vamos adicioná-la
        cursor.execute("ALTER TABLE advertencias ADD COLUMN assistant_id TEXT")
        conn.commit()
    
    # Migração: recriar tabela advertencias sem colunas desnecessárias
    cursor.execute("PRAGMA table_info(advertencias)")
    columns = cursor.fetchall()
    column_names = [col[1] for col in columns]
    
    if 'tipo_advertencia' in column_names or 'providencias' in column_names:
        print("Migração: removendo colunas desnecessárias da tabela advertencias...")
        
        # Criar nova tabela sem as colunas indesejadas
        cursor.execute('''
        CREATE TABLE advertencias_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero_advertencia TEXT UNIQUE NOT NULL,
            unidade TEXT NOT NULL,
            bloco TEXT,
            assistant_id TEXT,
            data_ocorrencia INTEGER NOT NULL,
            descricao TEXT NOT NULL,
            reincidente INTEGER DEFAULT 0,
            status TEXT DEFAULT 'ativa',
            data_criacao INTEGER NOT NULL,
            criado_por INTEGER NOT NULL,
            arquivo_documento TEXT,
            FOREIGN KEY (criado_por) REFERENCES users (id)
        )
        ''')
        
        # Copiar dados existentes (apenas as colunas que queremos manter)
        cursor.execute('''
        INSERT INTO advertencias_new (
            id, numero_advertencia, unidade, bloco, assistant_id,
            data_ocorrencia, descricao, reincidente, status,
            data_criacao, criado_por, arquivo_documento
        )
        SELECT 
            id, numero_advertencia, unidade, bloco, assistant_id,
            data_ocorrencia, descricao, reincidente, status,
            data_criacao, criado_por, arquivo_documento
        FROM advertencias
        ''')
        
        # Remover tabela antiga e renomear a nova
        cursor.execute("DROP TABLE advertencias")
        cursor.execute("ALTER TABLE advertencias_new RENAME TO advertencias")
        
        conn.commit()
        print("Migração da tabela advertencias concluída!")
    
    # Tabela para transcrições de áudio
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS transcricoes (
        id TEXT PRIMARY KEY,
        nome_arquivo TEXT NOT NULL,
        caminho_arquivo TEXT,
        idioma TEXT DEFAULT 'pt',
        identificar_falantes INTEGER DEFAULT 0,
        status TEXT DEFAULT 'queued',
        progresso INTEGER DEFAULT 0,
        mensagem TEXT,
        texto TEXT,
        arquivo_word TEXT,
        error_message TEXT,
        data_criacao INTEGER NOT NULL,
        data_conclusao INTEGER,
        usuario_id INTEGER NOT NULL,
        transcrever_task_id TEXT,
        FOREIGN KEY (usuario_id) REFERENCES users (id)
    )
    ''')
    
    # Migração: adicionar coluna transcrever_task_id se não existir
    try:
        cursor.execute("SELECT transcrever_task_id FROM transcricoes LIMIT 1")
    except sqlite3.OperationalError:
        # Coluna transcrever_task_id não existe, vamos adicioná-la
        cursor.execute("ALTER TABLE transcricoes ADD COLUMN transcrever_task_id TEXT")
        conn.commit()
    
    conn.commit()
    conn.close()
    print("Banco de dados inicializado com sucesso!")

def store_assistant(assistant_data):
    """Armazena ou atualiza um assistente no banco de dados local"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now = int(datetime.now().timestamp())
    
    # Extrair campos principais
    assistant_id = assistant_data.get('id')
    name = assistant_data.get('name', '')
    description = assistant_data.get('description', '')
    model = assistant_data.get('model', '')
    instructions = assistant_data.get('instructions', '')
    created_at = assistant_data.get('created_at', now)
    raw_data = json.dumps(assistant_data)
    
    # Verificar se o assistente já existe
    cursor.execute('SELECT id FROM assistants WHERE id = ?', (assistant_id,))
    existing = cursor.fetchone()
    
    if existing:
        # Atualizar assistente existente
        cursor.execute('''
        UPDATE assistants 
        SET name = ?, description = ?, model = ?, instructions = ?, 
            updated_at = ?, raw_data = ?, is_deleted = 0
        WHERE id = ?
        ''', (name, description, model, instructions, now, raw_data, assistant_id))
    else:
        # Inserir novo assistente
        cursor.execute('''
        INSERT INTO assistants (id, name, description, model, instructions, 
                               created_at, updated_at, raw_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (assistant_id, name, description, model, instructions, 
              created_at, now, raw_data))
    
    conn.commit()
    conn.close()
    
    return assistant_id

def get_assistants(search_term=None, limit=100, offset=0, include_deleted=False):
    """Recupera assistentes do banco de dados local com opção de pesquisa"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = 'SELECT * FROM assistants WHERE 1=1'
    params = []
    
    if not include_deleted:
        query += ' AND is_deleted = 0'
    
    if search_term:
        # Melhoria na pesquisa para considerar números no início do nome
        # Usar CAST para resolver problema de encoding bytes e UPPER para case-insensitive
        query += ' AND (UPPER(CAST(name AS TEXT)) LIKE UPPER(?) OR UPPER(CAST(description AS TEXT)) LIKE UPPER(?) OR UPPER(CAST(id AS TEXT)) LIKE UPPER(?))'
        search_pattern = f'%{search_term}%'
        params.extend([search_pattern, search_pattern, search_pattern])
    
    query += ' ORDER BY name ASC LIMIT ? OFFSET ?'
    params.extend([limit, offset])
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    
    # Converter para lista de dicionários
    assistants = []
    for row in rows:
        # Primeiro tentar usar os dados brutos originais
        try:
            assistant = json.loads(row['raw_data'])
        except (json.JSONDecodeError, TypeError):
            # Se falhar, montar objeto a partir dos campos individuais
            assistant = {
                'id': row['id'],
                'name': row['name'],
                'description': row['description'],
                'model': row['model'],
                'instructions': row['instructions'],
                'created_at': row['created_at']
            }
        assistants.append(assistant)
    
    conn.close()
    return assistants

def count_assistants(search_term=None, include_deleted=False):
    """Conta o total de assistentes no banco de dados"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = 'SELECT COUNT(*) as total FROM assistants WHERE 1=1'
    params = []
    
    if not include_deleted:
        query += ' AND is_deleted = 0'
    
    if search_term:
        # Usar CAST para resolver problema de encoding bytes e UPPER para case-insensitive
        query += ' AND (UPPER(CAST(name AS TEXT)) LIKE UPPER(?) OR UPPER(CAST(description AS TEXT)) LIKE UPPER(?) OR UPPER(CAST(id AS TEXT)) LIKE UPPER(?))'
        search_pattern = f'%{search_term}%'
        params.extend([search_pattern, search_pattern, search_pattern])
    
    cursor.execute(query, params)
    result = cursor.fetchone()
    
    conn.close()
    return result['total'] if result else 0

def get_assistant_by_id(assistant_id):
    """Recupera um assistente específico pelo ID"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM assistants WHERE id = ? AND is_deleted = 0', (assistant_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return None
    
    # Primeiro tentar usar os dados brutos originais
    try:
        assistant = json.loads(row['raw_data'])
    except (json.JSONDecodeError, TypeError):
        # Se falhar, montar objeto a partir dos campos individuais
        assistant = {
            'id': row['id'],
            'name': row['name'],
            'description': row['description'],
            'model': row['model'],
            'instructions': row['instructions'],
            'created_at': row['created_at']
        }
    
    conn.close()
    return assistant

def mark_assistant_deleted(assistant_id):
    """Marca um assistente como excluído (soft delete)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('UPDATE assistants SET is_deleted = 1 WHERE id = ?', (assistant_id,))
    conn.commit()
    conn.close()

def update_sync_info(cursor_after=None):
    """Atualiza as informações de sincronização"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now = int(datetime.now().timestamp())
    
    # Verificar se já existe uma entrada
    cursor.execute('SELECT id FROM sync_info LIMIT 1')
    existing = cursor.fetchone()
    
    if existing:
        if cursor_after:
            cursor.execute('UPDATE sync_info SET last_sync_time = ?, cursor_after = ?', 
                          (now, cursor_after))
        else:
            cursor.execute('UPDATE sync_info SET last_sync_time = ?', (now,))
    else:
        cursor.execute('INSERT INTO sync_info (last_sync_time, cursor_after) VALUES (?, ?)', 
                      (now, cursor_after or ''))
    
    conn.commit()
    conn.close()

def get_last_sync_info():
    """Obtém as informações da última sincronização"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT last_sync_time, cursor_after FROM sync_info LIMIT 1')
    row = cursor.fetchone()
    
    result = {
        'last_sync_time': row['last_sync_time'] if row else 0,
        'cursor_after': row['cursor_after'] if row and row['cursor_after'] else None
    }
    
    conn.close()
    return result

# Funções para gerenciar usuários
def create_user(username, password, email=None, full_name=None, is_admin=0):
    """Cria um novo usuário no banco de dados"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Verificar se o usuário já existe
    cursor.execute('SELECT id FROM users WHERE username = ?', (username,))
    if cursor.fetchone():
        conn.close()
        return False, "Usuário já existe"
    
    # Verificar se o email já existe (se fornecido)
    if email:
        cursor.execute('SELECT id FROM users WHERE email = ?', (email,))
        if cursor.fetchone():
            conn.close()
            return False, "Email já está em uso"
    
    # Hash da senha
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    now = int(datetime.now().timestamp())
    
    # Definir tipo baseado em is_admin
    tipo = 'administrador' if is_admin else 'usuario'
    
    try:
        cursor.execute('''
        INSERT INTO users (username, password_hash, email, full_name, is_admin, created_at, tipo, carteira, last_update)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (username, password_hash, email, full_name, is_admin, now, tipo, None, now))
        
        conn.commit()
        user_id = cursor.lastrowid
        conn.close()
        return True, user_id
    except Exception as e:
        conn.rollback()
        conn.close()
        return False, str(e)

def register_user(username, password, email, full_name):
    """Registra um novo usuário comum no sistema"""
    return create_user(username, password, email, full_name, is_admin=0)

def authenticate_user(username, password):
    """Autentica um usuário verificando username e senha"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Hash da senha para comparação
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    # Buscar usuário
    cursor.execute('''
    SELECT id, username, email, full_name, is_admin, is_active, tipo, carteira, last_update
    FROM users
    WHERE username = ? AND password_hash = ?
    ''', (username, password_hash))
    
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        return None
    
    # Verificar se a conta está ativa
    if not user['is_active']:
        return None
    
    # Converter para dicionário usando função segura
    return _safe_dict_from_row(user)

def create_session(user_id, ip_address=None, user_agent=None, expiry_days=1):
    """Cria uma nova sessão para o usuário autenticado"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    session_id = str(uuid.uuid4())
    now = int(datetime.now().timestamp())
    expires_at = now + (86400 * expiry_days)  # 86400 segundos = 1 dia
    
    cursor.execute('''
    INSERT INTO sessions (id, user_id, created_at, expires_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
    ''', (session_id, user_id, now, expires_at, ip_address, user_agent))
    
    # Atualizar último login do usuário
    cursor.execute('UPDATE users SET last_login = ? WHERE id = ?', (now, user_id))
    
    conn.commit()
    conn.close()
    
    return session_id

def validate_session(session_id):
    """Verifica se uma sessão é válida e não expirou"""
    if not session_id:
        return None
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now = int(datetime.now().timestamp())
    
    # Buscar sessão válida
    cursor.execute('''
    SELECT s.id, s.user_id, s.created_at, s.expires_at, 
           u.username, u.email, u.full_name, u.is_admin, u.tipo, u.carteira
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ? AND s.expires_at > ? AND u.is_active = 1
    ''', (session_id, now))
    
    session = cursor.fetchone()
    conn.close()
    
    if not session:
        return None
    
    # Converter para dicionário usando função segura
    return _safe_dict_from_row(session)

def delete_session(session_id):
    """Remove uma sessão do banco de dados (logout)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('DELETE FROM sessions WHERE id = ?', (session_id,))
    
    conn.commit()
    conn.close()
    
    return True

def get_all_users():
    """Recupera todos os usuários do banco de dados"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
    SELECT id, username, email, full_name, is_admin, is_active, created_at, last_login, tipo, carteira, last_update
    FROM users
    ORDER BY username
    ''')
    
    users = [_safe_dict_from_row(row) for row in cursor.fetchall()]
    conn.close()
    
    return users

def get_user(user_id):
    """Recupera um usuário específico pelo ID"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
    SELECT id, username, email, full_name, is_admin, is_active, created_at, last_login, tipo, carteira, last_update
    FROM users
    WHERE id = ?
    ''', (user_id,))
    
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        return None
    
    return _safe_dict_from_row(user)

def update_user(user_id, data):
    """Atualiza os dados de um usuário"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Campos que podem ser atualizados
    valid_fields = ['email', 'full_name', 'is_admin', 'is_active']
    
    # Construir a consulta de atualização
    updates = []
    params = []
    
    for field in valid_fields:
        if field in data:
            updates.append(f"{field} = ?")
            params.append(data[field])
    
    # Se tiver senha para atualizar
    if 'password' in data and data['password']:
        updates.append("password_hash = ?")
        params.append(hashlib.sha256(data['password'].encode()).hexdigest())
    
    if not updates:
        conn.close()
        return False, "Nenhum campo válido para atualizar"
    
    # Adicionar o ID do usuário aos parâmetros
    params.append(user_id)
    
    try:
        cursor.execute(f'''
        UPDATE users 
        SET {', '.join(updates)}
        WHERE id = ?
        ''', params)
        
        conn.commit()
        affected = cursor.rowcount
        conn.close()
        
        if affected == 0:
            return False, "Usuário não encontrado"
        
        return True, "Usuário atualizado com sucesso"
    except Exception as e:
        conn.rollback()
        conn.close()
        return False, str(e)

def delete_user(user_id):
    """Remove um usuário do banco de dados"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Verificar se não é o último usuário admin
        cursor.execute('SELECT COUNT(*) as count FROM users WHERE is_admin = 1', ())
        admin_count = cursor.fetchone()['count']
        
        cursor.execute('SELECT is_admin FROM users WHERE id = ?', (user_id,))
        user = cursor.fetchone()
        
        if not user:
            conn.close()
            return False, "Usuário não encontrado"
        
        # Se for o último admin, não permitir exclusão
        if admin_count <= 1 and user['is_admin'] == 1:
            conn.close()
            return False, "Não é possível excluir o último administrador"
        
        # Remover sessões do usuário
        cursor.execute('DELETE FROM sessions WHERE user_id = ?', (user_id,))
        
        # Remover usuário
        cursor.execute('DELETE FROM users WHERE id = ?', (user_id,))
        
        conn.commit()
        conn.close()
        return True, "Usuário removido com sucesso"
    except Exception as e:
        conn.rollback()
        conn.close()
        return False, str(e)

def update_user_wallet(user_id, amount, operation='add'):
    """Atualiza o saldo da carteira do usuário"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Buscar saldo atual
        cursor.execute('SELECT carteira FROM users WHERE id = ?', (user_id,))
        user = cursor.fetchone()
        
        if not user:
            conn.close()
            return False, "Usuário não encontrado"
        
        current_balance = float(user['carteira'] or 0)
        
        if operation == 'add':
            new_balance = current_balance + amount
        elif operation == 'subtract':
            if current_balance < amount:
                conn.close()
                return False, "Saldo insuficiente"
            new_balance = current_balance - amount
        else:
            conn.close()
            return False, "Operação inválida"
        
        # Atualizar saldo e last_update
        now = int(datetime.now().timestamp())
        cursor.execute('''
        UPDATE users 
        SET carteira = ?, last_update = ?
        WHERE id = ?
        ''', (new_balance, now, user_id))
        
        conn.commit()
        conn.close()
        return True, new_balance
        
    except Exception as e:
        conn.rollback()
        conn.close()
        return False, str(e)

def get_user_by_username(username):
    """Busca um usuário pelo nome de usuário"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
    SELECT id, username, email, full_name, is_admin, is_active, created_at, last_login, tipo, carteira
    FROM users 
    WHERE username = ? AND is_active = 1
    ''', (username,))
    
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return {
            'id': row['id'],
            'username': row['username'],
            'email': row['email'],
            'full_name': row['full_name'],
            'is_admin': row['is_admin'],
            'is_active': row['is_active'],
            'created_at': row['created_at'],
            'last_login': row['last_login'],
            'tipo': row['tipo'],
            'carteira': row['carteira']
        }
    
    return None

def get_system_settings():
    """Obtém as configurações do sistema"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
    SELECT primary_color, primary_dark, primary_light, secondary_color, accent_color, updated_at
    FROM system_settings 
    ORDER BY id DESC 
    LIMIT 1
    ''')
    
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return {
            'primary_color': row['primary_color'],
            'primary_dark': row['primary_dark'],
            'primary_light': row['primary_light'],
            'secondary_color': row['secondary_color'],
            'accent_color': row['accent_color'],
            'updated_at': row['updated_at']
        }
    
    # Retornar configurações padrão se não existir
    return {
        'primary_color': '#dc2626',
        'primary_dark': '#b91c1c',
        'primary_light': '#3b82f6',
        'secondary_color': '#6b7280',
        'accent_color': '#3b82f6',
        'updated_at': None
    }

def update_system_settings(settings_data, updated_by=None):
    """Atualiza as configurações do sistema"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now = int(datetime.now().timestamp())
    
    # Verificar se já existe uma configuração
    cursor.execute('SELECT id FROM system_settings LIMIT 1')
    existing = cursor.fetchone()
    
    # Preparar campos para atualização
    update_fields = []
    update_values = []
    
    allowed_fields = ['primary_color', 'primary_dark', 'primary_light', 'secondary_color', 'accent_color']
    
    for field in allowed_fields:
        if field in settings_data:
            update_fields.append(f"{field} = ?")
            update_values.append(settings_data[field])
    
    if not update_fields:
        conn.close()
        return False
    
    # Adicionar campos de controle
    update_fields.append("updated_at = ?")
    update_values.append(now)
    
    if updated_by:
        update_fields.append("updated_by = ?")
        update_values.append(updated_by)
    
    if existing:
        # Atualizar configuração existente
        query = f"UPDATE system_settings SET {', '.join(update_fields)}"
        cursor.execute(query, update_values)
    else:
        # Inserir nova configuração
        fields = ['primary_color', 'primary_dark', 'primary_light', 'secondary_color', 'accent_color', 'updated_at']
        values = [
            settings_data.get('primary_color', '#dc2626'),
            settings_data.get('primary_dark', '#b91c1c'),
            settings_data.get('primary_light', '#3b82f6'),
            settings_data.get('secondary_color', '#6b7280'),
            settings_data.get('accent_color', '#3b82f6'),
            now
        ]
        
        if updated_by:
            fields.append('updated_by')
            values.append(updated_by)
        
        placeholders = ', '.join(['?' for _ in fields])
        query = f"INSERT INTO system_settings ({', '.join(fields)}) VALUES ({placeholders})"
        cursor.execute(query, values)
    
    conn.commit()
    conn.close()
    
    return True

# Funções para gerenciar carteiras
def create_wallet(name, description=None, created_by=None):
    """Cria uma nova carteira"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now = int(datetime.now().timestamp())
    
    try:
        cursor.execute('''
        INSERT INTO wallets (name, description, created_at, updated_at, created_by)
        VALUES (?, ?, ?, ?, ?)
        ''', (name, description, now, now, created_by))
        
        wallet_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return True, wallet_id
    except sqlite3.IntegrityError:
        conn.close()
        return False, "Já existe uma carteira com este nome"
    except Exception as e:
        conn.close()
        return False, str(e)

def get_all_wallets():
    """Recupera todas as carteiras"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
    SELECT w.*, u.username as created_by_username
    FROM wallets w
    LEFT JOIN users u ON w.created_by = u.id
    WHERE w.is_active = 1
    ORDER BY w.name
    ''')
    
    wallets = [_safe_dict_from_row(row) for row in cursor.fetchall()]
    conn.close()
    return wallets

def get_wallet(wallet_id):
    """Recupera uma carteira específica"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
    SELECT w.*, u.username as created_by_username
    FROM wallets w
    LEFT JOIN users u ON w.created_by = u.id
    WHERE w.id = ? AND w.is_active = 1
    ''', (wallet_id,))
    
    wallet = cursor.fetchone()
    conn.close()
    
    if wallet:
        return _safe_dict_from_row(wallet)
    return None

def update_wallet(wallet_id, name=None, description=None):
    """Atualiza uma carteira"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now = int(datetime.now().timestamp())
    
    try:
        updates = []
        params = []
        
        if name is not None:
            updates.append("name = ?")
            params.append(name)
        
        if description is not None:
            updates.append("description = ?")
            params.append(description)
        
        if updates:
            updates.append("updated_at = ?")
            params.append(now)
            params.append(wallet_id)
            
            cursor.execute(f'''
            UPDATE wallets 
            SET {', '.join(updates)}
            WHERE id = ?
            ''', params)
            
            conn.commit()
        
        conn.close()
        return True, "Carteira atualizada com sucesso"
    except sqlite3.IntegrityError:
        conn.close()
        return False, "Já existe uma carteira com este nome"
    except Exception as e:
        conn.close()
        return False, str(e)

def delete_wallet(wallet_id):
    """Remove uma carteira (soft delete)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Verificar se há usuários usando esta carteira
        cursor.execute('SELECT COUNT(*) as count FROM users WHERE carteira = ?', (wallet_id,))
        user_count = cursor.fetchone()['count']
        
        if user_count > 0:
            conn.close()
            return False, f"Não é possível excluir. {user_count} usuário(s) estão usando esta carteira"
        
        # Marcar carteira como inativa
        cursor.execute('UPDATE wallets SET is_active = 0 WHERE id = ?', (wallet_id,))
        
        conn.commit()
        conn.close()
        return True, "Carteira removida com sucesso"
    except Exception as e:
        conn.close()
        return False, str(e)

def add_assistant_to_wallet(wallet_id, assistant_id, added_by=None):
    """Adiciona um assistente a uma carteira"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now = int(datetime.now().timestamp())
    
    try:
        cursor.execute('''
        INSERT INTO wallet_assistants (wallet_id, assistant_id, added_at, added_by)
        VALUES (?, ?, ?, ?)
        ''', (wallet_id, assistant_id, now, added_by))
        
        conn.commit()
        conn.close()
        return True, "Assistente adicionado à carteira"
    except sqlite3.IntegrityError:
        conn.close()
        return False, "Assistente já está nesta carteira"
    except Exception as e:
        conn.close()
        return False, str(e)

def remove_assistant_from_wallet(wallet_id, assistant_id):
    """Remove um assistente de uma carteira"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
        DELETE FROM wallet_assistants 
        WHERE wallet_id = ? AND assistant_id = ?
        ''', (wallet_id, assistant_id))
        
        affected = cursor.rowcount
        conn.commit()
        conn.close()
        
        if affected > 0:
            return True, "Assistente removido da carteira"
        else:
            return False, "Assistente não encontrado nesta carteira"
    except Exception as e:
        conn.close()
        return False, str(e)

def get_wallet_assistants(wallet_id):
    """Recupera todos os assistentes de uma carteira"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
    SELECT wa.*, a.name, a.description, a.model
    FROM wallet_assistants wa
    JOIN assistants a ON wa.assistant_id = a.id
    WHERE wa.wallet_id = ? AND a.is_deleted = 0
    ORDER BY a.name
    ''', (wallet_id,))
    
    assistants = [_safe_dict_from_row(row) for row in cursor.fetchall()]
    conn.close()
    return assistants

def get_user_assistants(user_id):
    """Recupera todos os assistentes disponíveis para um usuário baseado em sua carteira"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Buscar a carteira do usuário
    cursor.execute('SELECT carteira FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    
    if not user or not user['carteira']:
        # Se usuário não tem carteira, retornar lista vazia
        conn.close()
        return []
    
    wallet_id = user['carteira']
    
    # Buscar assistentes da carteira
    cursor.execute('''
    SELECT a.*
    FROM assistants a
    JOIN wallet_assistants wa ON a.id = wa.assistant_id
    WHERE wa.wallet_id = ? AND a.is_deleted = 0
    ORDER BY a.name
    ''', (wallet_id,))
    
    rows = cursor.fetchall()
    
    # Converter para lista de dicionários
    assistants = []
    for row in rows:
        try:
            assistant = json.loads(row['raw_data'])
        except (json.JSONDecodeError, TypeError):
            assistant = {
                'id': row['id'],
                'name': row['name'],
                'description': row['description'],
                'model': row['model'],
                'instructions': row['instructions'],
                'created_at': row['created_at']
            }
        assistants.append(assistant)
    
    conn.close()
    return assistants

def assign_wallet_to_user(user_id, wallet_id):
    """Atribui uma carteira a um usuário"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now = int(datetime.now().timestamp())
    
    try:
        cursor.execute('''
        UPDATE users 
        SET carteira = ?, last_update = ?
        WHERE id = ?
        ''', (wallet_id, now, user_id))
        
        affected = cursor.rowcount
        conn.commit()
        conn.close()
        
        if affected > 0:
            return True, "Carteira atribuída ao usuário"
        else:
            return False, "Usuário não encontrado"
    except Exception as e:
        conn.close()
        return False, str(e)

def get_user_wallet_name(user_id):
    """Obtém o nome da carteira do usuário"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
    SELECT w.name 
    FROM users u
    LEFT JOIN wallets w ON u.carteira = w.id
    WHERE u.id = ?
    ''', (user_id,))
    
    result = cursor.fetchone()
    conn.close()
    
    if result and result['name']:
        return result['name']
    
    return None

def _safe_dict_from_row(row):
    """
    Converte uma row do SQLite em dicionário de forma segura,
    convertendo bytes para strings quando necessário
    """
    if not row:
        return None
        
    result = {}
    
    # Iterar através das chaves e valores
    for key in row.keys():
        value = row[key]
        
        # Se o valor for bytes, converter para string
        if isinstance(value, bytes):
            try:
                # Tentar decodificar como UTF-8
                value = value.decode('utf-8')
            except UnicodeDecodeError:
                # Se falhar, usar latin-1 como fallback
                value = value.decode('latin-1')
        
        result[key] = value
    
    return result

# ============ FUNÇÕES DE API KEYS ============

def create_api_key(name, description=None, permissions='read', created_by=None, expires_days=None):
    """Cria uma nova chave de API"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Gerar chave única
        api_key = f"zng_{secrets.token_urlsafe(32)}"
        hashed_key = hashlib.sha256(api_key.encode()).hexdigest()
        
        now = int(datetime.now().timestamp())
        expires_at = None
        if expires_days:
            expires_at = now + (expires_days * 24 * 60 * 60)
        
        cursor.execute('''
        INSERT INTO api_keys (key_name, api_key, hashed_key, permissions, created_at, created_by, expires_at, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (name, api_key, hashed_key, permissions, now, created_by, expires_at, description))
        
        key_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return True, {'id': key_id, 'api_key': api_key}
        
    except Exception as e:
        return False, str(e)

def validate_api_key(api_key):
    """Valida uma chave de API e atualiza last_used"""
    if not api_key:
        return None
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        hashed_key = hashlib.sha256(api_key.encode()).hexdigest()
        now = int(datetime.now().timestamp())
        
        # Buscar chave ativa e não expirada
        cursor.execute('''
        SELECT id, key_name, permissions, created_by, expires_at
        FROM api_keys
        WHERE hashed_key = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > ?)
        ''', (hashed_key, now))
        
        key_data = cursor.fetchone()
        
        if key_data:
            # Atualizar last_used
            cursor.execute('UPDATE api_keys SET last_used = ? WHERE id = ?', (now, key_data['id']))
            conn.commit()
        
        conn.close()
        
        return _safe_dict_from_row(key_data) if key_data else None
        
    except Exception as e:
        print(f"Erro ao validar API key: {e}")
        return None

def get_all_api_keys():
    """Retorna todas as chaves de API (sem mostrar a chave real)"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
        SELECT ak.id, ak.key_name, ak.permissions, ak.is_active, ak.created_at, 
               ak.last_used, ak.expires_at, ak.description,
               u.username as created_by_username
        FROM api_keys ak
        LEFT JOIN users u ON ak.created_by = u.id
        ORDER BY ak.created_at DESC
        ''')
        
        keys = []
        for row in cursor.fetchall():
            key_data = _safe_dict_from_row(row)
            # Mascarar a chave para segurança
            key_data['api_key_preview'] = 'zng_' + '*' * 40
            keys.append(key_data)
        
        conn.close()
        return keys
        
    except Exception as e:
        print(f"Erro ao obter API keys: {e}")
        return []

def delete_api_key(key_id):
    """Remove uma chave de API"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('DELETE FROM api_keys WHERE id = ?', (key_id,))
        
        if cursor.rowcount > 0:
            conn.commit()
            conn.close()
            return True, "Chave de API removida com sucesso"
        else:
            conn.close()
            return False, "Chave de API não encontrada"
            
    except Exception as e:
        return False, str(e)

def toggle_api_key(key_id, is_active):
    """Ativa/desativa uma chave de API"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('UPDATE api_keys SET is_active = ? WHERE id = ?', (is_active, key_id))
        
        if cursor.rowcount > 0:
            conn.commit()
            conn.close()
            status = "ativada" if is_active else "desativada"
            return True, f"Chave de API {status} com sucesso"
        else:
            conn.close()
            return False, "Chave de API não encontrada"
            
    except Exception as e:
        return False, str(e)

# ========== FUNÇÕES PARA MULTAS E ADVERTÊNCIAS ==========

def get_tipos_multa():
    """Recupera todos os tipos de multa ativos"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM tipos_multa WHERE ativo = 1 ORDER BY descricao')
    rows = cursor.fetchall()
    
    tipos = []
    for row in rows:
        tipos.append(_safe_dict_from_row(row))
    
    conn.close()
    return tipos

def get_tipos_advertencia():
    """Recupera todos os tipos de advertência ativos"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM tipos_advertencia WHERE ativo = 1 ORDER BY descricao')
    rows = cursor.fetchall()
    
    tipos = []
    for row in rows:
        tipos.append(_safe_dict_from_row(row))
    
    conn.close()
    return tipos

def criar_multa(dados):
    """Cria uma nova multa"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Gerar número único da multa
    now = int(datetime.now().timestamp())
    numero_multa = f"M{datetime.now().strftime('%Y%m%d')}{str(now)[-6:]}"
    
    try:
        cursor.execute('''
        INSERT INTO multas (
            numero_multa, unidade, bloco, assistant_id, tipo_multa, valor, 
            data_infracao, descricao, observacoes, status, data_criacao, 
            criado_por, data_vencimento, arquivo_documento
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            numero_multa,
            dados['unidade'],
            dados.get('bloco'),
            dados.get('assistant_id'),
            dados.get('tipo_multa'),
            dados['valor'],
            dados['data_infracao'],
            dados['descricao'],
            dados.get('observacoes'),
            'pendente',
            now,
            dados['criado_por'],
            dados.get('data_vencimento'),
            dados.get('arquivo_documento')
        ))
        
        multa_id = cursor.lastrowid
        conn.commit()
        
        # Recuperar a multa criada
        cursor.execute('SELECT * FROM multas WHERE id = ?', (multa_id,))
        multa = _safe_dict_from_row(cursor.fetchone())
        
        conn.close()
        return multa
        
    except Exception as e:
        conn.rollback()
        conn.close()
        raise e

def criar_advertencia(dados):
    """Cria uma nova advertência"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Log dos dados recebidos
    print(f"[DEBUG] criar_advertencia - dados recebidos: {dados}")
    
    # Gerar número único da advertência
    now = int(datetime.now().timestamp())
    numero_advertencia = f"A{datetime.now().strftime('%Y%m%d')}{str(now)[-6:]}"
    
    print(f"[DEBUG] numero_advertencia gerado: {numero_advertencia}")
    print(f"[DEBUG] timestamp atual: {now}")
    print(f"[DEBUG] data_ocorrencia recebida: {dados['data_ocorrencia']}")
    
    # Verificar se é reincidente
    cursor.execute('''
        SELECT COUNT(*) FROM advertencias 
        WHERE unidade = ? AND status = 'ativa'
    ''', (dados['unidade'],))
    
    reincidente = cursor.fetchone()[0] > 0
    print(f"[DEBUG] reincidente: {reincidente}")
    
    try:
        print(f"[DEBUG] Tentando executar INSERT com dados:")
        print(f"  numero_advertencia: {numero_advertencia}")
        print(f"  unidade: {dados['unidade']}")
        print(f"  bloco: {dados.get('bloco')}")
        print(f"  assistant_id: {dados.get('assistant_id')}")
        print(f"  data_ocorrencia: {dados['data_ocorrencia']} (tipo: {type(dados['data_ocorrencia'])})")
        print(f"  descricao: {dados['descricao']}")
        print(f"  reincidente: {1 if reincidente else 0}")
        print(f"  status: 'ativa'")
        print(f"  data_criacao: {now}")
        print(f"  criado_por: {dados['criado_por']}")
        print(f"  arquivo_documento: {dados.get('arquivo_documento')}")
        
        cursor.execute('''
        INSERT INTO advertencias (
            numero_advertencia, unidade, bloco, assistant_id, 
            data_ocorrencia, descricao, reincidente, status, 
            data_criacao, criado_por, arquivo_documento
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            numero_advertencia,
            dados['unidade'],
            dados.get('bloco'),
            dados.get('assistant_id'),
            dados['data_ocorrencia'],
            dados['descricao'],
            1 if reincidente else 0,
            'ativa',
            now,
            dados['criado_por'],
            dados.get('arquivo_documento')
        ))
        
        print(f"[DEBUG] INSERT executado com sucesso")
        
        advertencia_id = cursor.lastrowid
        print(f"[DEBUG] advertencia_id: {advertencia_id}")
        
        conn.commit()
        print(f"[DEBUG] COMMIT realizado")
        
        # Recuperar a advertência criada
        cursor.execute('SELECT * FROM advertencias WHERE id = ?', (advertencia_id,))
        advertencia = _safe_dict_from_row(cursor.fetchone())
        print(f"[DEBUG] Advertência recuperada: {advertencia}")
        
        conn.close()
        return advertencia
        
    except Exception as e:
        print(f"[DEBUG] ERRO no INSERT: {str(e)}")
        print(f"[DEBUG] Tipo do erro: {type(e)}")
        import traceback
        print(f"[DEBUG] Traceback: {traceback.format_exc()}")
        conn.rollback()
        conn.close()
        raise e

def listar_multas(filtros=None):
    """Lista multas com filtros opcionais"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = '''
        SELECT m.*, u.full_name as criado_por_nome
        FROM multas m
        LEFT JOIN users u ON m.criado_por = u.id
        WHERE 1=1
    '''
    params = []
    
    if filtros:
        if filtros.get('unidade'):
            query += ' AND m.unidade LIKE ?'
            params.append(f"%{filtros['unidade']}%")
        
        if filtros.get('status'):
            query += ' AND m.status = ?'
            params.append(filtros['status'])
        
        if filtros.get('data_inicio'):
            query += ' AND m.data_infracao >= ?'
            params.append(filtros['data_inicio'])
        
        if filtros.get('data_fim'):
            query += ' AND m.data_infracao <= ?'
            params.append(filtros['data_fim'])
    
    query += ' ORDER BY m.data_criacao DESC'
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    
    multas = []
    for row in rows:
        multas.append(_safe_dict_from_row(row))
    
    conn.close()
    return multas

def listar_advertencias(filtros=None):
    """Lista advertências com filtros opcionais"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = '''
        SELECT a.*, u.full_name as criado_por_nome
        FROM advertencias a
        LEFT JOIN users u ON a.criado_por = u.id
        WHERE 1=1
    '''
    params = []
    
    if filtros:
        if filtros.get('unidade'):
            query += ' AND a.unidade LIKE ?'
            params.append(f"%{filtros['unidade']}%")
        
        if filtros.get('status'):
            query += ' AND a.status = ?'
            params.append(filtros['status'])
        
        if filtros.get('data_inicio'):
            query += ' AND a.data_ocorrencia >= ?'
            params.append(filtros['data_inicio'])
        
        if filtros.get('data_fim'):
            query += ' AND a.data_ocorrencia <= ?'
            params.append(filtros['data_fim'])
    
    query += ' ORDER BY a.data_criacao DESC'
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    
    advertencias = []
    for row in rows:
        advertencias.append(_safe_dict_from_row(row))
    
    conn.close()
    return advertencias

def get_multa(multa_id):
    """Recupera uma multa específica"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT m.*, u.full_name as criado_por_nome
        FROM multas m
        LEFT JOIN users u ON m.criado_por = u.id
        WHERE m.id = ?
    ''', (multa_id,))
    
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return _safe_dict_from_row(row)
    return None

def get_advertencia(advertencia_id):
    """Recupera uma advertência específica"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT a.*, u.full_name as criado_por_nome
        FROM advertencias a
        LEFT JOIN users u ON a.criado_por = u.id
        WHERE a.id = ?
    ''', (advertencia_id,))
    
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return _safe_dict_from_row(row)
    return None

def atualizar_status_multa(multa_id, status, data_pagamento=None):
    """Atualiza o status de uma multa"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        if status == 'paga' and data_pagamento:
            cursor.execute('''
                UPDATE multas 
                SET status = ?, data_pagamento = ?
                WHERE id = ?
            ''', (status, data_pagamento, multa_id))
        else:
            cursor.execute('''
                UPDATE multas 
                SET status = ?
                WHERE id = ?
            ''', (status, multa_id))
        
        conn.commit()
        conn.close()
        return True
        
    except Exception as e:
        conn.rollback()
        conn.close()
        raise e

def get_estatisticas_documentos():
    """Retorna estatísticas sobre multas e advertências"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Total de multas
    cursor.execute('SELECT COUNT(*) FROM multas')
    total_multas = cursor.fetchone()[0]
    
    # Multas pendentes
    cursor.execute('SELECT COUNT(*) FROM multas WHERE status = "pendente"')
    multas_pendentes = cursor.fetchone()[0]
    
    # Valor total de multas pendentes
    cursor.execute('SELECT SUM(valor) FROM multas WHERE status = "pendente"')
    valor_pendente = cursor.fetchone()[0] or 0
    
    # Total de advertências
    cursor.execute('SELECT COUNT(*) FROM advertencias')
    total_advertencias = cursor.fetchone()[0]
    
    # Advertências ativas
    cursor.execute('SELECT COUNT(*) FROM advertencias WHERE status = "ativa"')
    advertencias_ativas = cursor.fetchone()[0]
    
    conn.close()
    
    return {
        'total_multas': total_multas,
        'multas_pendentes': multas_pendentes,
        'valor_pendente': valor_pendente,
        'total_advertencias': total_advertencias,
        'advertencias_ativas': advertencias_ativas
    }

# ==================== FUNÇÕES PARA TRANSCRIÇÕES ====================

def save_transcricao(transcription_id, filename, file_path, language, speaker_labels, status, user_id, transcrever_task_id=None):
    """Salva uma nova transcrição no banco de dados"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now = int(datetime.now().timestamp())
    
    cursor.execute('''
        INSERT INTO transcricoes (
            id, nome_arquivo, caminho_arquivo, idioma, identificar_falantes,
            status, data_criacao, usuario_id, transcrever_task_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        transcription_id, filename, file_path, language, 
        1 if speaker_labels else 0, status, now, user_id, transcrever_task_id
    ))
    
    conn.commit()
    conn.close()

def get_transcricao_status(transcription_id):
    """Obtém o status de uma transcrição"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT id, nome_arquivo, status, progresso, mensagem, texto, 
               arquivo_word, error_message, data_criacao, data_conclusao
        FROM transcricoes 
        WHERE id = ?
    ''', (transcription_id,))
    
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return dict(row)
    return None

def update_transcricao_status(transcription_id, status, progress=None, message=None, texto=None, arquivo_word=None):
    """Atualiza o status de uma transcrição"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Construir query dinamicamente baseado nos parâmetros fornecidos
    updates = ['status = ?']
    params = [status]
    
    if progress is not None:
        updates.append('progresso = ?')
        params.append(progress)
    
    if message is not None:
        updates.append('mensagem = ?')
        params.append(message)
    
    if texto is not None:
        updates.append('texto = ?')
        params.append(texto)
    
    if arquivo_word is not None:
        updates.append('arquivo_word = ?')
        params.append(arquivo_word)
    
    if status == 'completed':
        updates.append('data_conclusao = ?')
        params.append(int(datetime.now().timestamp()))
    
    if status == 'failed' and message:
        updates.append('error_message = ?')
        params.append(message)
    
    params.append(transcription_id)
    
    query = f'''
        UPDATE transcricoes 
        SET {', '.join(updates)}
        WHERE id = ?
    '''
    
    cursor.execute(query, params)
    conn.commit()
    conn.close()

def get_transcricao_stats():
    """Retorna estatísticas de transcrições"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Transcrições de hoje
    today_start = int(datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).timestamp())
    cursor.execute('''
        SELECT COUNT(*) FROM transcricoes 
        WHERE data_criacao >= ? AND status = 'completed'
    ''', (today_start,))
    today_count = cursor.fetchone()[0]
    
    # Total de transcrições concluídas
    cursor.execute('''
        SELECT COUNT(*) FROM transcricoes 
        WHERE status = 'completed'
    ''')
    total_count = cursor.fetchone()[0]
    
    # Tempo médio de processamento (em minutos)
    cursor.execute('''
        SELECT AVG(data_conclusao - data_criacao) 
        FROM transcricoes 
        WHERE status = 'completed' AND data_conclusao IS NOT NULL
    ''')
    avg_seconds = cursor.fetchone()[0]
    
    conn.close()
    
    average_time = '-'
    if avg_seconds:
        avg_minutes = avg_seconds / 60
        if avg_minutes < 1:
            average_time = f"{int(avg_seconds)}s"
        else:
            average_time = f"{int(avg_minutes)}min"
    
    return {
        'today': today_count,
        'total': total_count,
        'average_time': average_time
    }

def get_transcricoes_recentes(limit=5):
    """Retorna transcrições recentes concluídas"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT id, nome_arquivo, data_conclusao, arquivo_word
        FROM transcricoes 
        WHERE status = 'completed' AND data_conclusao IS NOT NULL
        ORDER BY data_conclusao DESC
        LIMIT ?
    ''', (limit,))
    
    rows = cursor.fetchall()
    conn.close()
    
    files = []
    for row in rows:
        files.append({
            'name': row[1],
            'date': datetime.fromtimestamp(row[2]).strftime('%d/%m/%Y %H:%M'),
            'download_url': f"/api/transcricao/download/{row[0]}"
        })
    
    return files

# ==================== FUNÇÕES PARA TOKENS DE INTEGRAÇÃO ====================

def generate_integration_token(user_id, platform='solucoes_zangari', description=None):
    """Gera um novo token de integração para um usuário"""
    import secrets
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Primeiro, desativa tokens existentes para esta plataforma
        cursor.execute('''
            UPDATE user_integration_tokens 
            SET is_active = 0 
            WHERE user_id = ? AND platform = ?
        ''', (user_id, platform))
        
        # Gera um token único
        token = secrets.token_urlsafe(32)
        now = int(datetime.now().timestamp())
        
        # Insere o novo token
        cursor.execute('''
            INSERT INTO user_integration_tokens 
            (user_id, integration_token, platform, created_at, is_active, description)
            VALUES (?, ?, ?, ?, 1, ?)
        ''', (user_id, token, platform, now, description))
        
        conn.commit()
        conn.close()
        
        return token
        
    except Exception as e:
        conn.close()
        print(f"Erro ao gerar token de integração: {str(e)}")
        # Se a tabela não existir, tentar criá-la e tentar novamente
        _ensure_integration_tokens_table()
        
        # Tentar novamente
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Gera um token único
        token = secrets.token_urlsafe(32)
        now = int(datetime.now().timestamp())
        
        # Insere o novo token (sem UPDATE pois a tabela é nova)
        cursor.execute('''
            INSERT INTO user_integration_tokens 
            (user_id, integration_token, platform, created_at, is_active, description)
            VALUES (?, ?, ?, ?, 1, ?)
        ''', (user_id, token, platform, now, description))
        
        conn.commit()
        conn.close()
        
        return token

def get_user_integration_token(user_id, platform='solucoes_zangari'):
    """Obtém o token de integração ativo de um usuário"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            SELECT integration_token, created_at, last_used, description
            FROM user_integration_tokens 
            WHERE user_id = ? AND platform = ? AND is_active = 1
            ORDER BY created_at DESC
            LIMIT 1
        ''', (user_id, platform))
        
        row = cursor.fetchone()
        conn.close()
        
        if row:
            # Converter bytes para strings se necessário
            token = row[0].decode('utf-8') if isinstance(row[0], bytes) else row[0]
            description = row[3].decode('utf-8') if isinstance(row[3], bytes) else row[3]
            
            return {
                'token': token,
                'created_at': row[1],
                'last_used': row[2],
                'description': description
            }
        return None
        
    except Exception as e:
        conn.close()
        print(f"Erro ao buscar token de integração: {str(e)}")
        # Se a tabela não existir, tentar criá-la e tentar novamente
        _ensure_integration_tokens_table()
        
        # Tentar novamente após criar a tabela
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT integration_token, created_at, last_used, description
                FROM user_integration_tokens 
                WHERE user_id = ? AND platform = ? AND is_active = 1
                ORDER BY created_at DESC
                LIMIT 1
            ''', (user_id, platform))
            
            row = cursor.fetchone()
            conn.close()
            
            if row:
                # Converter bytes para strings se necessário
                token = row[0].decode('utf-8') if isinstance(row[0], bytes) else row[0]
                description = row[3].decode('utf-8') if isinstance(row[3], bytes) else row[3]
                
                return {
                    'token': token,
                    'created_at': row[1],
                    'last_used': row[2],
                    'description': description
                }
            return None
            
        except Exception as e2:
            print(f"Erro ao buscar token após criar tabela: {str(e2)}")
            return None

def authenticate_by_integration_token(token):
    """Autentica um usuário usando token de integração"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Busca o token e dados do usuário
    cursor.execute('''
        SELECT u.id, u.username, u.email, u.full_name, u.is_admin, u.is_active, u.tipo, u.carteira,
               t.id as token_id, t.platform
        FROM users u
        JOIN user_integration_tokens t ON u.id = t.user_id
        WHERE t.integration_token = ? AND t.is_active = 1 AND u.is_active = 1
    ''', (token,))
    
    user_data = cursor.fetchone()
    
    if not user_data:
        conn.close()
        return None
    
    # Atualiza último uso do token
    now = int(datetime.now().timestamp())
    cursor.execute('''
        UPDATE user_integration_tokens 
        SET last_used = ? 
        WHERE id = ?
    ''', (now, user_data[8]))  # user_data[8] é token_id
    
    conn.commit()
    conn.close()
    
    # Retorna dados do usuário
    return _safe_dict_from_row(user_data)

def revoke_integration_token(user_id, platform='solucoes_zangari'):
    """Revoga o token de integração de um usuário"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            UPDATE user_integration_tokens 
            SET is_active = 0 
            WHERE user_id = ? AND platform = ?
        ''', (user_id, platform))
        
        conn.commit()
        conn.close()
        
        return True
        
    except Exception as e:
        conn.close()
        print(f"Erro ao revogar token de integração: {str(e)}")
        # Se a tabela não existir, tentar criá-la
        _ensure_integration_tokens_table()
        return True  # Não há token para revogar se a tabela não existe

def _ensure_integration_tokens_table():
    """Garante que a tabela de tokens de integração existe"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_integration_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            integration_token TEXT UNIQUE NOT NULL,
            platform TEXT DEFAULT 'solucoes_zangari',
            created_at INTEGER,
            last_used INTEGER,
            is_active INTEGER DEFAULT 1,
            description TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
        ''')
        conn.commit()
        print("Tabela user_integration_tokens criada/verificada com sucesso")
    except Exception as e:
        print(f"Erro ao criar tabela user_integration_tokens: {str(e)}")
    finally:
        conn.close()

def get_all_integration_tokens(user_id=None):
    """Lista todos os tokens de integração (opcionalmente de um usuário específico)"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if user_id:
            cursor.execute('''
                SELECT t.id, t.user_id, t.integration_token, t.platform, t.created_at, 
                       t.last_used, t.is_active, t.description, u.username, u.full_name
                FROM user_integration_tokens t
                JOIN users u ON t.user_id = u.id
                WHERE t.user_id = ?
                ORDER BY t.created_at DESC
            ''', (user_id,))
        else:
            cursor.execute('''
                SELECT t.id, t.user_id, t.integration_token, t.platform, t.created_at, 
                       t.last_used, t.is_active, t.description, u.username, u.full_name
                FROM user_integration_tokens t
                JOIN users u ON t.user_id = u.id
                ORDER BY t.created_at DESC
            ''')
        
        rows = cursor.fetchall()
        conn.close()
        
        tokens = []
        for row in rows:
            tokens.append({
                'id': row[0],
                'user_id': row[1],
                'token': row[2][:8] + '...' + row[2][-8:],  # Mostra apenas início e fim do token
                'platform': row[3],
                'created_at': row[4],
                'last_used': row[5],
                'is_active': bool(row[6]),
                'description': row[7],
                'username': row[8],
                'full_name': row[9]
            })
        
        return tokens
        
    except Exception as e:
        print(f"Erro ao listar tokens de integração: {str(e)}")
        # Se a tabela não existir, tentar criá-la
        _ensure_integration_tokens_table()
        return []  # Retorna lista vazia se a tabela não existe

# Inicializar o banco de dados
init_db()