from flask import Blueprint, request, jsonify, send_file, current_app
import os
import uuid
from werkzeug.utils import secure_filename
import requests
import time
import tempfile

bp = Blueprint('transcricao_simples', __name__)

@bp.route('/api/transcricao/upload-simples', methods=['POST'])
def upload_simples():
    """Upload e transcrição simples - apenas gera e retorna o arquivo"""
    try:
        if 'audio' not in request.files:
            return jsonify({'success': False, 'error': 'Nenhum arquivo enviado'}), 400
        
        file = request.files['audio']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Nenhum arquivo selecionado'}), 400
        
        # Validar tipo de arquivo
        allowed_extensions = {'.mp3', '.wav', '.m4a', '.flac', '.ogg', '.opus'}
        if not any(file.filename.lower().endswith(ext) for ext in allowed_extensions):
            return jsonify({'success': False, 'error': 'Formato de arquivo não suportado'}), 400
        
        # Salvar arquivo temporariamente
        filename = secure_filename(file.filename)
        temp_id = str(uuid.uuid4())
        temp_dir = os.path.join(current_app.root_path, 'static', 'temp_audio')
        os.makedirs(temp_dir, exist_ok=True)
        
        file_path = os.path.join(temp_dir, f"{temp_id}_{filename}")
        file.save(file_path)
        
        current_app.logger.info(f"Arquivo salvo temporariamente: {file_path}")
        
        # Enviar para o transcrever
        try:
            with open(file_path, 'rb') as f:
                files = {'file': (filename, f, 'audio/opus')}
                
                response = requests.post(
                    'http://localhost:3023/',
                    files=files,
                    timeout=30
                )
            
            if response.status_code == 200:
                result = response.json()
                task_id = result.get('task_id')
                
                if task_id:
                    # Aguardar processamento (polling)
                    max_wait = 300  # 5 minutos máximo
                    wait_time = 0
                    
                    current_app.logger.info(f"Aguardando processamento do task: {task_id}")
                    
                    while wait_time < max_wait:
                        try:
                            status_response = requests.get(
                                f'http://localhost:3023/status/{task_id}',
                                timeout=10
                            )
                            
                            if status_response.status_code == 200:
                                status_data = status_response.json()
                                
                                if status_data.get('status') == 'SUCCESS':
                                    # Processamento concluído!
                                    docx_filename = status_data.get('result', {}).get('docx')
                                    
                                    if docx_filename:
                                        # Baixar o arquivo do transcrever
                                        download_response = requests.get(
                                            f'http://localhost:3023/download/{docx_filename}',
                                            timeout=30
                                        )
                                        
                                        if download_response.status_code == 200:
                                            # Salvar temporariamente e retornar
                                            with tempfile.NamedTemporaryFile(delete=False, suffix='.docx') as temp_file:
                                                temp_file.write(download_response.content)
                                                temp_docx_path = temp_file.name
                                            
                                            # Limpar arquivo de áudio
                                            try:
                                                os.remove(file_path)
                                            except:
                                                pass
                                            
                                            return send_file(
                                                temp_docx_path,
                                                as_attachment=True,
                                                download_name=f"transcricao_{filename}.docx",
                                                mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                                            )
                                        else:
                                            return jsonify({
                                                'success': False, 
                                                'error': 'Erro ao baixar arquivo processado'
                                            }), 500
                                    else:
                                        return jsonify({
                                            'success': False, 
                                            'error': 'Arquivo DOCX não foi gerado'
                                        }), 500
                                
                                elif status_data.get('status') == 'FAILURE':
                                    return jsonify({
                                        'success': False, 
                                        'error': f"Erro no processamento: {status_data.get('error', 'Erro desconhecido')}"
                                    }), 500
                                
                                # Ainda processando, aguardar mais
                                time.sleep(5)
                                wait_time += 5
                                
                            else:
                                time.sleep(5)
                                wait_time += 5
                                
                        except Exception as e:
                            current_app.logger.error(f"Erro ao verificar status: {e}")
                            time.sleep(5)
                            wait_time += 5
                    
                    # Timeout
                    return jsonify({
                        'success': False, 
                        'error': 'Tempo limite de processamento excedido'
                    }), 408
                
                else:
                    return jsonify({
                        'success': False, 
                        'error': 'Task ID não retornado pelo transcrever'
                    }), 500
            
            else:
                return jsonify({
                    'success': False, 
                    'error': f'Erro no transcrever: {response.status_code}'
                }), 500
                
        except Exception as e:
            current_app.logger.error(f"Erro ao comunicar com transcrever: {e}")
            return jsonify({
                'success': False, 
                'error': 'Erro de comunicação com o serviço de transcrição'
            }), 500
        
        finally:
            # Limpar arquivo temporário em caso de erro
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
            except:
                pass
        
    except Exception as e:
        current_app.logger.error(f"Erro geral no upload: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500 