import os
from app import create_app

# Definir porta (usada apenas se executado diretamente, não pelo Gunicorn)
port = int(os.environ.get('PORT', 5358))

# Criar a aplicação para o Gunicorn usar
app = create_app()

if __name__ == "__main__":
    # Para executar diretamente este arquivo (sem Gunicorn)
    app.run(host='0.0.0.0', port=port) 