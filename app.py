from flask import Flask
import os
from dotenv import load_dotenv
from app import create_app

# Carregar variáveis de ambiente
load_dotenv()

# A função create_app() está sendo importada do módulo app,
# e o app já é criado no arquivo wsgi.py para uso do Gunicorn

if __name__ == '__main__':
    # Criar app apenas quando executado diretamente (não pelo Gunicorn)
    app = create_app()
    # No ambiente de desenvolvimento, usamos app.run
    # No Docker, o gunicorn irá cuidar de iniciar a aplicação
    app.run(debug=True, host='0.0.0.0', port=int(os.environ.get('PORT', 5359)))

    