"""
Módulo de segurança para o Chatbot Assistant
Contém funcionalidades de segurança para SQLite e outras operações sensíveis
"""

from .sqlite_security import SQLiteSecurityManager, configure_sqlite_security

__all__ = ['SQLiteSecurityManager', 'configure_sqlite_security'] 