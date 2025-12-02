from flask import Flask, request, render_template, redirect, url_for, send_from_directory, jsonify
import os
import logging
from tasks import process_file, app as celery_app
from celery.result import AsyncResult
from redis.exceptions import ConnectionError
from functools import wraps
from flask_cors import CORS

# Configurar o Celery para usar o mesmo backend
celery_app.conf.update(
    # Usando o sistema de arquivos local como backend temporário em vez do Redis
    broker_url='filesystem://',
    broker_transport_options={
        'data_folder_in': './celery/broker/in',
        'data_folder_out': './celery/broker/out',
        'data_folder_processed': './celery/broker/processed'
    },
    result_backend='file://./celery/results'
)

# Criar pastas necessárias para o broker baseado em arquivos
os.makedirs('./celery/broker/in', exist_ok=True)
os.makedirs('./celery/broker/out', exist_ok=True)
os.makedirs('./celery/broker/processed', exist_ok=True)
os.makedirs('./celery/results', exist_ok=True)

# Configuração de logs
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
# Permitir CORS para todas as origens
CORS(app)

app.config['UPLOAD_FOLDER'] = 'uploads/'
app.config['PROCESSED_FOLDER'] = 'processed/'
app.config['API_KEY'] = os.environ.get('API_KEY', 'zangari_solucoes_2024')  # Obter chave do ambiente ou usar padrão

def require_api_key(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Log de todas as informações da requisição para diagnóstico
        logger.debug(f"Requisição recebida: {request.method} {request.path}")
        logger.debug(f"Headers: {dict(request.headers)}")
        logger.debug(f"Args: {dict(request.args)}")
        
        # Verificar API key no cabeçalho HTTP 'X-API-Key'
        api_key = request.headers.get('X-API-Key')
        logger.debug(f"X-API-Key no cabeçalho: {api_key}")
        
        # Verificar também no Authorization header como alternativa
        if not api_key and 'Authorization' in request.headers:
            auth_header = request.headers.get('Authorization', '')
            if auth_header.startswith('Bearer '):
                api_key = auth_header[7:]  # Remover 'Bearer ' do início
                logger.debug(f"API Key do Authorization Bearer: {api_key}")
        
        # Verificar parâmetro na URL como última alternativa (para compatibilidade)
        if not api_key:
            api_key = request.args.get('api_key')
            logger.debug(f"API Key da URL: {api_key}")
                
        if api_key and api_key == app.config['API_KEY']:
            logger.debug("API Key válida, autenticação bem-sucedida")
            return f(*args, **kwargs)
        else:
            logger.warning(f"Falha na autenticação. API key recebida: {api_key}")
            return jsonify({'error': 'Acesso não autorizado. API key inválida ou ausente.'}), 401
    return decorated_function

@app.route('/', methods=['GET', 'POST'])
@require_api_key
def index():
    if request.method == 'POST':
        logger.info('Requisição POST recebida.')
        if 'file' not in request.files:
            logger.warning('Nenhum arquivo encontrado na requisição.')
            
            # Verificar se é requisição API
            if is_api_request():
                return jsonify({'success': False, 'error': 'Nenhum arquivo selecionado'}), 400
            return render_template('index.html', error='Nenhum arquivo selecionado')
        
        file = request.files['file']
        if file.filename == '':
            logger.warning('Nenhum arquivo foi selecionado para upload.')
            
            # Verificar se é requisição API
            if is_api_request():
                return jsonify({'success': False, 'error': 'Nome do arquivo vazio'}), 400
            return render_template('index.html', error='Nome do arquivo vazio')
        
        if file:
            try:
                # Obter parâmetros de configuração
                language = request.form.get('language', 'pt')
                speaker_labels = request.form.get('speaker_labels', 'false').lower() == 'true'
                
                logger.info(f'Parâmetros recebidos: language={language}, speaker_labels={speaker_labels}')
                
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
                logger.info(f'Salvando o arquivo em: {filepath}')
                file.save(filepath)

                # Passar parâmetros para o task
                task = process_file.delay(filepath, language, speaker_labels)
                logger.info(f'Arquivo enviado para processamento assíncrono. Task ID: {task.id}')
                
                # Verificar se é requisição API
                if is_api_request():
                    return jsonify({
                        'success': True,
                        'task_id': task.id,
                        'message': 'Arquivo enviado para processamento'
                    })
                
                return render_template('index.html', task_id=task.id)
            except Exception as e:
                logger.error(f'Erro ao processar arquivo: {str(e)}', exc_info=True)
                
                # Verificar se é requisição API
                if is_api_request():
                    return jsonify({'success': False, 'error': str(e)}), 500
                return render_template('index.html', error=str(e))
    
    logger.info('Renderizando página inicial')
    return render_template('index.html')

def is_api_request():
    """Verifica se a requisição é proveniente de uma API (não do browser)"""
    user_agent = request.headers.get('User-Agent', '').lower()
    accept = request.headers.get('Accept', '').lower()
    
    # Verificar se é um user-agent de aplicação (não browser)
    api_indicators = [
        'chatbot-assistant',
        'python',
        'requests',
        'curl',
        'postman',
        'insomnia'
    ]
    
    # Verificar se aceita JSON
    wants_json = 'application/json' in accept
    
    # Verificar user-agent
    is_api_user_agent = any(indicator in user_agent for indicator in api_indicators)
    
    # Verificar se tem X-API-Key (indicativo de chamada API)
    has_api_key = request.headers.get('X-API-Key') is not None
    
    return wants_json or is_api_user_agent or has_api_key

@app.route('/status/<task_id>')
@require_api_key
def task_status(task_id):
    try:
        task = AsyncResult(task_id, app=celery_app)
        
        if task.state == 'PENDING':
            response = {
                'state': task.state,
                'status': 'Tarefa pendente...'
            }
        elif task.state == 'FAILURE':
            # Tratar diferentes tipos de erros que podem ocorrer
            error_message = 'Erro desconhecido'
            if hasattr(task, 'info') and task.info is not None:
                if isinstance(task.info, dict) and 'error' in task.info:
                    error_message = task.info['error']
                elif isinstance(task.info, Exception):
                    error_message = str(task.info)
                    
            response = {
                'state': task.state,
                'error': error_message
            }
        elif task.state == 'SUCCESS':
            response = {
                'state': task.state,
                'result': task.get()
            }
        else:
            status = ''
            if hasattr(task, 'info') and task.info is not None:
                if isinstance(task.info, dict) and 'status' in task.info:
                    status = task.info['status']
            
            response = {
                'state': task.state,
                'status': status
            }
        
        return jsonify(response)
    except Exception as e:
        logger.error(f'Erro ao verificar status da task: {str(e)}', exc_info=True)
        return jsonify({
            'state': 'ERROR',
            'error': str(e)
        }), 500

@app.route('/download/<filename>')
@require_api_key
def download_file(filename):
    logger.info(f'Solicitação para download do arquivo: {filename}')
    try:
        return send_from_directory(app.config['PROCESSED_FOLDER'], filename)
    except Exception as e:
        logger.error(f'Erro ao fazer download do arquivo: {e}', exc_info=True)
        return f"Erro ao baixar arquivo: {str(e)}", 404

@app.route('/static/fonts/<path:filename>')
def serve_font(filename):
    return send_from_directory('static/fonts', filename, mimetype='font/woff2')

@app.route('/healthcheck')
def healthcheck():
    return jsonify({"status": "ok", "api_key_required": True}), 200

@app.route('/teste')
def iframe_test():
    return render_template('iframe_test.html')

if __name__ == '__main__':
    if not os.path.exists(app.config['UPLOAD_FOLDER']):
        os.makedirs(app.config['UPLOAD_FOLDER'])
    if not os.path.exists(app.config['PROCESSED_FOLDER']):
        os.makedirs(app.config['PROCESSED_FOLDER'])
    
    # Usar variável de ambiente para a porta, padrão 3023
    port = int(os.environ.get('PORT', 3023))
    logger.info(f"Iniciando servidor na porta {port}")
    app.run(host='0.0.0.0', debug=True, port=port)
