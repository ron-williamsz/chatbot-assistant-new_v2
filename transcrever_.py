from flask import Flask, request, render_template, redirect, url_for, send_from_directory, jsonify, abort
import os
import logging
from tasks import process_file, app as celery_app
from celery.result import AsyncResult
from redis.exceptions import ConnectionError

# Configurar o Celery para usar o mesmo backend
redis_host = os.environ.get("REDIS_HOST", "localhost")
broker_url = os.environ.get("CELERY_BROKER_URL", f"redis://{redis_host}:6379/0")
result_backend = os.environ.get("CELERY_RESULT_BACKEND", f"redis://{redis_host}:6379/0")
celery_app.conf.update(
    broker_url=broker_url,
    result_backend=result_backend
)

# Configuração de logs
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads/'
app.config['PROCESSED_FOLDER'] = 'processed/'

# Token secreto compartilhado entre as aplicações
SECRET_TOKEN = os.environ.get('SECRET_TOKEN', 'seu_token_secreto_aqui')

@app.before_request
def validate_token():
    # Lista de caminhos públicos (se houver)
    public_paths = ['/static']
    
    # Verificar se o caminho atual está entre os públicos
    if any(request.path.startswith(path) for path in public_paths):
        return
    
    # Buscar token do cabeçalho ou query parameter
    token = request.headers.get('X-Access-Token') or request.args.get('token')
    
    # Log para debug (remova após resolver)
    app.logger.info(f"Requisição para: {request.path} | Token: {token}")
    
    if not token or token != SECRET_TOKEN:
        app.logger.warning(f"Acesso negado: {request.remote_addr} -> {request.path}")
        return abort(403, "Acesso não autorizado")

@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        logging.info('Requisição POST recebida.')
        if 'file' not in request.files:
            logging.warning('Nenhum arquivo encontrado na requisição.')
            return render_template('index.html', error='Nenhum arquivo selecionado')
        
        file = request.files['file']
        if file.filename == '':
            logging.warning('Nenhum arquivo foi selecionado para upload.')
            return render_template('index.html', error='Nome do arquivo vazio')
        
        if file:
            try:
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
                logging.info(f'Salvando o arquivo em: {filepath}')
                file.save(filepath)

                task = process_file.delay(filepath)
                logging.info(f'Arquivo enviado para processamento assíncrono. Task ID: {task.id}')
                return render_template('index.html', task_id=task.id)
            except Exception as e:
                logging.error(f'Erro ao processar arquivo: {str(e)}')
                return render_template('index.html', error=str(e))
    
    return render_template('index.html')

@app.route('/status/<task_id>')
def task_status(task_id):
    try:
        task = AsyncResult(task_id, app=celery_app)
        
        if task.state == 'PENDING':
            response = {
                'state': task.state,
                'status': 'Tarefa pendente...'
            }
        elif task.state == 'FAILURE' or task.failed():
            # Tratamento aprimorado para falhas
            error_msg = 'Erro desconhecido'
            
            if hasattr(task, 'info') and task.info:
                if isinstance(task.info, Exception):
                    error_msg = str(task.info)
                elif isinstance(task.info, dict) and 'error' in task.info:
                    error_msg = task.info['error']
                
            # Tratar específicos tipos de erro
            if 'NotImplementedError' in error_msg:
                # Fornecer uma mensagem mais amigável para o erro específico de docx2pdf no Linux
                error_msg = "Não foi possível gerar o PDF no ambiente Linux, mas o arquivo DOCX está disponível."
            
            response = {
                'state': 'FAILURE',
                'error': error_msg
            }
        elif task.state == 'SUCCESS':
            # Verificar se a tarefa tem resultados antes de tentar acessá-los
            try:
                result = task.get(timeout=2)  # Timeout para evitar bloqueios
                response = {
                    'state': task.state,
                    'result': result
                }
            except Exception as e:
                logging.error(f"Erro ao acessar resultado da tarefa: {str(e)}")
                response = {
                    'state': 'FAILURE',
                    'error': f"Erro ao acessar resultado: {str(e)}"
                }
        else:
            # Para estados como STARTED, PROGRESS, etc.
            status = ''
            if hasattr(task, 'info') and task.info:
                if isinstance(task.info, dict) and 'status' in task.info:
                    status = task.info['status']
                else:
                    status = str(task.info)
                    
            response = {
                'state': task.state,
                'status': status
            }
        
        return jsonify(response)
    except Exception as e:
        logging.error(f'Erro ao verificar status da task: {str(e)}')
        return jsonify({
            'state': 'ERROR',
            'error': str(e)
        }), 500

@app.route('/download/<filename>')
def download_file(filename):
    logging.info(f'Solicitação para download do arquivo: {filename}')
    try:
        return send_from_directory(app.config['PROCESSED_FOLDER'], filename)
    except Exception as e:
        logging.error(f'Erro ao fazer download do arquivo: {e}')
        return f"Erro ao baixar arquivo: {str(e)}", 404

@app.route('/static/fonts/<path:filename>')
def serve_font(filename):
    return send_from_directory('static/fonts', filename, mimetype='font/woff2')

if __name__ == '__main__':
    if not os.path.exists(app.config['UPLOAD_FOLDER']):
        os.makedirs(app.config['UPLOAD_FOLDER'])
    if not os.path.exists(app.config['PROCESSED_FOLDER']):
        os.makedirs(app.config['PROCESSED_FOLDER'])
    app.run(host='0.0.0.0', debug=True, port=3024)
