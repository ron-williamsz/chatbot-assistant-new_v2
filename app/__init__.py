from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv
import os

load_dotenv()

def create_app():
    app = Flask(__name__)
    
    # Configurar CORS para permitir solicitações de qualquer origem
    # e incluir suporte a métodos e cabeçalhos personalizados
    CORS(app, resources={r"/*": {"origins": "*", "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"], "allow_headers": "*"}})
    
    app.secret_key = os.getenv('FLASK_SECRET_KEY', 'dev-secret-key')

    # Configurar limite de upload para 1GB
    app.config['MAX_CONTENT_LENGTH'] = int(os.getenv('MAX_CONTENT_LENGTH', 1024)) * 1024 * 1024

    # Configurações para trabalhar corretamente com Cloudflared/proxy
    app.config['PREFERRED_URL_SCHEME'] = 'https'
    
    # Classe para detectar quando o app está atrás de um proxy como Cloudflare
    class ReverseProxied(object):
        def __init__(self, app):
            self.app = app

        def __call__(self, environ, start_response):
            scheme = environ.get('HTTP_X_FORWARDED_PROTO')
            if scheme:
                environ['wsgi.url_scheme'] = scheme
            return self.app(environ, start_response)
    
    # Aplicar o middleware
    app.wsgi_app = ReverseProxied(app.wsgi_app)
    
    # Configurações da aplicação - desativar sincronização automática
    app.config['AUTO_SYNC_DB'] = False
    
    # Detectar ambiente
    is_docker = os.environ.get('IS_DOCKER', 'false').lower() == 'true'
    app.config['IS_DOCKER'] = is_docker
    app.config['USE_ASYNC'] = is_docker
    
    # Importar e inicializar o banco de dados
    from app import database
    
    # Registrar blueprint
    from app.routes import bp
    app.register_blueprint(bp)
    
    return app