import requests
import os
import time
from typing import Optional, Dict, Any
from flask import current_app


class TranscriberClient:
    """Cliente para comunicação com o microserviço de transcrição"""
    
    def __init__(self):
        self.base_url = os.getenv('TRANSCRIBER_API_URL', 'http://localhost:3023')
        self.api_key = os.getenv('TRANSCRIBER_API_KEY', 'zangari_solucoes_2024')
        self.headers = {
            'X-API-Key': self.api_key,
            'User-Agent': 'Chatbot-Assistant/1.0'
        }
        self.timeout = 600  # 10 minutos para upload de arquivos grandes
    
    def health_check(self) -> bool:
        """Verifica se o serviço de transcrição está disponível"""
        try:
            response = requests.get(
                f"{self.base_url}/healthcheck",
                timeout=5
            )
            return response.status_code == 200
        except Exception as e:
            current_app.logger.error(f"Transcrever health check failed: {str(e)}")
            return False
    
    def upload_audio_file(self, file_path: str, language: str = 'pt', speaker_labels: bool = False) -> Optional[Dict[str, Any]]:
        """
        Faz upload de um arquivo de áudio para transcrição
        
        Args:
            file_path: Caminho para o arquivo de áudio
            language: Idioma para transcrição (padrão: 'pt')
            speaker_labels: Se deve identificar speakers (padrão: False)
            
        Returns:
            Dict com task_id se sucesso, None se erro
        """
        try:
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"Arquivo não encontrado: {file_path}")
            
            # Preparar arquivo para upload
            with open(file_path, 'rb') as audio_file:
                files = {
                    'file': (os.path.basename(file_path), audio_file, 'audio/mpeg')
                }
                
                # Dados do formulário
                data = {
                    'language': language,
                    'speaker_labels': str(speaker_labels).lower()
                }
                
                # Headers incluindo Accept para garantir resposta JSON
                headers = self.headers.copy()
                headers['Accept'] = 'application/json'
                
                current_app.logger.info(f"Enviando arquivo para transcrição: {file_path}")
                current_app.logger.info(f"Parâmetros: language={language}, speaker_labels={speaker_labels}")
                
                response = requests.post(
                    f"{self.base_url}/",
                    files=files,
                    data=data,
                    headers=headers,
                    timeout=self.timeout
                )
                
                current_app.logger.info(f"Resposta do transcrever: {response.status_code}")
                current_app.logger.info(f"Conteúdo da resposta: {response.text[:200]}...")
                
                if response.status_code == 200:
                    try:
                        # Tentar interpretar como JSON
                        data = response.json()
                        
                        if data.get('success') and data.get('task_id'):
                            current_app.logger.info(f"Upload realizado com sucesso. Task ID: {data['task_id']}")
                            return {
                                'success': True,
                                'task_id': data['task_id'],
                                'message': data.get('message', 'Upload realizado com sucesso')
                            }
                        else:
                            return {
                                'success': False,
                                'error': data.get('error', 'Resposta inválida do servidor')
                            }
                            
                    except ValueError:
                        # Se não for JSON, tentar extrair task_id do HTML (fallback)
                        content = response.text
                        if 'task_id' in content:
                            import re
                            task_id_match = re.search(r'task_id["\s]*[:=]["\s]*([a-f0-9-]+)', content, re.IGNORECASE)
                            if task_id_match:
                                task_id = task_id_match.group(1)
                                current_app.logger.info(f"Task ID extraído do HTML: {task_id}")
                                return {
                                    'success': True,
                                    'task_id': task_id,
                                    'message': 'Upload realizado com sucesso'
                                }
                        
                        current_app.logger.warning("Resposta não é JSON e task_id não foi encontrado")
                        return {
                            'success': False,
                            'error': 'Formato de resposta inválido do servidor'
                        }
                else:
                    error_msg = f"Erro no upload: {response.status_code} - {response.text}"
                    current_app.logger.error(error_msg)
                    return {
                        'success': False,
                        'error': error_msg
                    }
                    
        except Exception as e:
            error_msg = f"Erro ao fazer upload do arquivo: {str(e)}"
            current_app.logger.error(error_msg)
            return {
                'success': False,
                'error': error_msg
            }
    
    def check_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """
        Verifica o status de uma tarefa de transcrição
        
        Args:
            task_id: ID da tarefa
            
        Returns:
            Dict com informações do status
        """
        try:
            response = requests.get(
                f"{self.base_url}/status/{task_id}",
                headers=self.headers,
                timeout=self.timeout
            )
            
            if response.status_code == 200:
                data = response.json()
                current_app.logger.debug(f"Status da task {task_id}: {data.get('state', 'unknown')}")
                return data
            else:
                error_msg = f"Erro ao verificar status: {response.status_code}"
                current_app.logger.error(error_msg)
                return {
                    'state': 'ERROR',
                    'error': error_msg
                }
                
        except Exception as e:
            error_msg = f"Erro ao verificar status da task: {str(e)}"
            current_app.logger.error(error_msg)
            return {
                'state': 'ERROR',
                'error': error_msg
            }
    
    def download_file(self, filename: str) -> Optional[bytes]:
        """
        Baixa o conteúdo do arquivo como bytes
        
        Args:
            filename: Nome do arquivo no servidor
            
        Returns:
            Conteúdo do arquivo como bytes ou None se erro
        """
        try:
            response = requests.get(
                f"{self.base_url}/download/{filename}",
                headers=self.headers,
                timeout=60,  # Timeout maior para download
                stream=True
            )
            
            if response.status_code == 200:
                current_app.logger.info(f"Arquivo baixado com sucesso: {filename}")
                return response.content
            else:
                current_app.logger.error(f"Erro no download: {response.status_code}")
                return None
                
        except Exception as e:
            current_app.logger.error(f"Erro ao baixar arquivo: {str(e)}")
            return None
    
    def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """
        Verifica o status de uma tarefa de transcrição (método mantido para compatibilidade)
        """
        return self.check_task_status(task_id)
    
    def download_result(self, filename: str, save_path: str) -> bool:
        """
        Baixa o resultado da transcrição
        
        Args:
            filename: Nome do arquivo no servidor
            save_path: Caminho local onde salvar
            
        Returns:
            True se sucesso, False se erro
        """
        try:
            response = requests.get(
                f"{self.base_url}/download/{filename}",
                headers=self.headers,
                timeout=60,  # Timeout maior para download
                stream=True
            )
            
            if response.status_code == 200:
                # Criar diretório se não existir
                os.makedirs(os.path.dirname(save_path), exist_ok=True)
                
                # Salvar arquivo
                with open(save_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                
                current_app.logger.info(f"Arquivo baixado com sucesso: {save_path}")
                return True
            else:
                current_app.logger.error(f"Erro no download: {response.status_code}")
                return False
                
        except Exception as e:
            current_app.logger.error(f"Erro ao baixar arquivo: {str(e)}")
            return False
    
    def wait_for_completion(self, task_id: str, max_wait_time: int = 3600) -> Optional[Dict[str, Any]]:
        """
        Aguarda a conclusão de uma tarefa (polling)
        
        Args:
            task_id: ID da tarefa
            max_wait_time: Tempo máximo de espera em segundos
            
        Returns:
            Dict com resultado final ou None se timeout
        """
        start_time = time.time()
        check_interval = 5  # Verificar a cada 5 segundos
        
        current_app.logger.info(f"Aguardando conclusão da task {task_id}...")
        
        while time.time() - start_time < max_wait_time:
            status = self.check_task_status(task_id)
            
            if not status:
                return None
            
            state = status.get('state', '').upper()
            
            if state == 'SUCCESS':
                current_app.logger.info(f"Task {task_id} concluída com sucesso!")
                return status
            elif state == 'FAILURE':
                current_app.logger.error(f"Task {task_id} falhou: {status.get('error', 'Erro desconhecido')}")
                return status
            elif state in ['PENDING', 'PROGRESS', 'RETRY']:
                # Continuar aguardando
                current_app.logger.debug(f"Task {task_id} ainda em andamento: {state}")
                time.sleep(check_interval)
            else:
                current_app.logger.warning(f"Estado desconhecido para task {task_id}: {state}")
                time.sleep(check_interval)
        
        current_app.logger.warning(f"Timeout aguardando conclusão da task {task_id}")
        return {
            'state': 'TIMEOUT',
            'error': f'Timeout após {max_wait_time} segundos'
        }


# Instância global do cliente (singleton)
transcriber_client = TranscriberClient() 