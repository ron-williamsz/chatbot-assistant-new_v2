import sqlite3
import os
import hashlib
import hmac
import secrets
import time
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class SQLiteSecurityManager:
    """
    Gerenciador de segurança para SQLite com configurações avançadas
    """
    
    def __init__(self, db_path, encryption_key=None):
        self.db_path = db_path
        self.encryption_key = encryption_key or self._generate_key()
        self.backup_enabled = os.getenv('DB_BACKUP_ENABLED', 'false').lower() == 'true'
        
    def _generate_key(self):
        """Gerar chave de criptografia se não fornecida"""
        key = os.getenv('SQLITE_ENCRYPTION_KEY')
        if not key:
            key = secrets.token_hex(32)
            logger.warning("Chave de criptografia SQLite gerada automaticamente. Configure SQLITE_ENCRYPTION_KEY para persistência.")
        return key
    
    def get_secure_connection(self):
        """
        Criar conexão SQLite com configurações de segurança
        """
        conn = sqlite3.connect(
            self.db_path,
            timeout=30.0,  # Timeout para evitar deadlocks
            isolation_level='IMMEDIATE',  # Controle de transação mais rigoroso
            check_same_thread=False  # Necessário para aplicações web
        )
        
        # Configurações de segurança do SQLite
        cursor = conn.cursor()
        
        # Habilitar foreign keys
        cursor.execute("PRAGMA foreign_keys = ON;")
        
        # Configurar WAL mode para melhor concorrência
        cursor.execute("PRAGMA journal_mode = WAL;")
        
        # Configurar sincronização segura
        cursor.execute("PRAGMA synchronous = FULL;")
        
        # Configurar secure_delete
        cursor.execute("PRAGMA secure_delete = ON;")
        
        # Configurar page_size otimizado
        cursor.execute("PRAGMA page_size = 4096;")
        
        # Configurar cache_size
        cursor.execute("PRAGMA cache_size = 10000;")
        
        # Configurar temp_store em memória para segurança
        cursor.execute("PRAGMA temp_store = MEMORY;")
        
        # Configurar auto_vacuum
        cursor.execute("PRAGMA auto_vacuum = INCREMENTAL;")
        
        # Log das configurações aplicadas
        logger.info("Configurações de segurança SQLite aplicadas")
        
        return conn
    
    def create_backup(self, backup_path=None):
        """
        Criar backup seguro do banco de dados
        """
        if not self.backup_enabled:
            return False
            
        try:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            if not backup_path:
                backup_dir = os.path.join(os.path.dirname(self.db_path), 'backups')
                os.makedirs(backup_dir, exist_ok=True)
                backup_path = os.path.join(backup_dir, f'backup_{timestamp}.db')
            
            # Criar backup usando SQLite backup API
            source = sqlite3.connect(self.db_path)
            backup = sqlite3.connect(backup_path)
            
            # Fazer backup página por página
            source.backup(backup, pages=1000, progress=self._backup_progress)
            
            backup.close()
            source.close()
            
            # Criar hash do backup para verificação de integridade
            backup_hash = self._calculate_file_hash(backup_path)
            hash_file = f"{backup_path}.sha256"
            with open(hash_file, 'w') as f:
                f.write(f"{backup_hash}  {os.path.basename(backup_path)}\n")
            
            logger.info(f"Backup criado: {backup_path}")
            return backup_path
            
        except Exception as e:
            logger.error(f"Erro ao criar backup: {str(e)}")
            return False
    
    def verify_backup(self, backup_path):
        """
        Verificar integridade do backup
        """
        try:
            hash_file = f"{backup_path}.sha256"
            if not os.path.exists(hash_file):
                return False
                
            # Ler hash esperado
            with open(hash_file, 'r') as f:
                expected_hash = f.read().split()[0]
            
            # Calcular hash atual
            current_hash = self._calculate_file_hash(backup_path)
            
            return hmac.compare_digest(expected_hash, current_hash)
            
        except Exception as e:
            logger.error(f"Erro ao verificar backup: {str(e)}")
            return False
    
    def _backup_progress(self, status, remaining, total):
        """Callback de progresso do backup"""
        if total > 0:
            progress = ((total - remaining) / total) * 100
            if progress % 10 == 0:  # Log a cada 10%
                logger.info(f"Progresso do backup: {progress:.1f}%")
    
    def _calculate_file_hash(self, file_path):
        """Calcular hash SHA256 de um arquivo"""
        hash_sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_sha256.update(chunk)
        return hash_sha256.hexdigest()
    
    def optimize_database(self):
        """
        Otimizar e manter o banco de dados
        """
        try:
            conn = self.get_secure_connection()
            cursor = conn.cursor()
            
            # Executar VACUUM para desfragmentar
            cursor.execute("VACUUM;")
            
            # Executar ANALYZE para atualizar estatísticas
            cursor.execute("ANALYZE;")
            
            # Executar auto_vacuum incremental
            cursor.execute("PRAGMA incremental_vacuum;")
            
            conn.close()
            logger.info("Otimização do banco de dados concluída")
            return True
            
        except Exception as e:
            logger.error(f"Erro na otimização: {str(e)}")
            return False
    
    def check_integrity(self):
        """
        Verificar integridade do banco de dados
        """
        try:
            conn = self.get_secure_connection()
            cursor = conn.cursor()
            
            # Verificar integridade
            cursor.execute("PRAGMA integrity_check;")
            result = cursor.fetchone()
            
            conn.close()
            
            is_ok = result[0] == 'ok'
            if is_ok:
                logger.info("Verificação de integridade: OK")
            else:
                logger.error(f"Problemas de integridade: {result[0]}")
                
            return is_ok
            
        except Exception as e:
            logger.error(f"Erro na verificação de integridade: {str(e)}")
            return False
    
    def get_database_stats(self):
        """
        Obter estatísticas do banco de dados
        """
        try:
            conn = self.get_secure_connection()
            cursor = conn.cursor()
            
            stats = {}
            
            # Tamanho do arquivo
            stats['file_size'] = os.path.getsize(self.db_path)
            
            # Número de páginas
            cursor.execute("PRAGMA page_count;")
            stats['page_count'] = cursor.fetchone()[0]
            
            # Tamanho da página
            cursor.execute("PRAGMA page_size;")
            stats['page_size'] = cursor.fetchone()[0]
            
            # Espaço livre
            cursor.execute("PRAGMA freelist_count;")
            stats['free_pages'] = cursor.fetchone()[0]
            
            # Número de tabelas
            cursor.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table';")
            stats['table_count'] = cursor.fetchone()[0]
            
            conn.close()
            
            return stats
            
        except Exception as e:
            logger.error(f"Erro ao obter estatísticas: {str(e)}")
            return {}

# Configuração global de segurança
def configure_sqlite_security():
    """
    Configurar segurança global do SQLite
    """
    # Configurações de segurança no nível do processo
    sqlite3.register_adapter(str, lambda s: s.encode('utf-8'))
    sqlite3.register_converter("text", lambda b: b.decode('utf-8'))
    
    logger.info("Configurações globais de segurança SQLite aplicadas")

# Inicializar configurações de segurança
configure_sqlite_security() 