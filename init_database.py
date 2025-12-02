#!/usr/bin/env python3
"""
Script para inicializar o banco de dados manualmente
"""

import sys
import os

# Adicionar o diretório do projeto ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import database as db
import sqlite3

def main():
    print("=== INICIALIZANDO BANCO DE DADOS ===\n")
    
    # Verificar se o diretório app/data existe
    data_dir = os.path.join('app', 'data')
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)
        print(f"✅ Diretório {data_dir} criado")
    
    try:
        # Chamar a função init_db do módulo database
        print("🔄 Executando init_db()...")
        db.init_db()
        print("✅ Banco de dados inicializado com sucesso!")
        
        # Verificar se as tabelas foram criadas
        print("\n📋 Verificando tabelas criadas:")
        conn = db.get_db_connection()
        cursor = conn.cursor()
        
        # Habilitar FOREIGN KEYS
        cursor.execute("PRAGMA foreign_keys = ON")
        
        # Listar todas as tabelas
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        
        for table in tables:
            table_name = table[0]
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            count = cursor.fetchone()[0]
            print(f"   ✅ {table_name}: {count} registros")
        
        # Verificar se o usuário admin foi criado
        cursor.execute("SELECT username, tipo FROM users WHERE is_admin = 1")
        admin_users = cursor.fetchall()
        
        if admin_users:
            print(f"\n👤 Usuários administradores encontrados:")
            for user in admin_users:
                print(f"   - {user[0]} ({user[1]})")
        else:
            print("\n⚠️  Nenhum usuário administrador encontrado!")
        
        # Testar FOREIGN KEY constraint
        print("\n🔍 Testando FOREIGN KEY constraints:")
        try:
            # Tentar inserir uma transcrição com user_id inválido
            cursor.execute("""
                INSERT INTO transcricoes (
                    id, nome_arquivo, caminho_arquivo, idioma, identificar_falantes,
                    status, data_criacao, usuario_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, ("test_fk", "teste.mp3", "/tmp/teste.mp3", "pt", 0, "test", 
                  int(datetime.now().timestamp()), 99999))  # user_id inválido
            
            print("   ❌ FOREIGN KEY constraint NÃO está funcionando!")
            cursor.execute("DELETE FROM transcricoes WHERE id = 'test_fk'")
            
        except sqlite3.IntegrityError as e:
            if "FOREIGN KEY constraint failed" in str(e):
                print("   ✅ FOREIGN KEY constraint funcionando corretamente")
            else:
                print(f"   ⚠️  Erro diferente: {e}")
        
        conn.commit()
        conn.close()
        
        print("\n✅ Inicialização concluída com sucesso!")
        print("\nAgora você pode tentar processar uma transcrição novamente.")
        
    except Exception as e:
        print(f"❌ Erro durante a inicialização: {e}")
        import traceback
        print(f"Detalhes: {traceback.format_exc()}")
        return 1
    
    return 0

if __name__ == "__main__":
    from datetime import datetime
    exit_code = main()
    sys.exit(exit_code) 