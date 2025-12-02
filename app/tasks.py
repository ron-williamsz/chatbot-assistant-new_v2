import os
from celery import Celery
import requests
import re
from dotenv import load_dotenv

# Carregar variáveis de ambiente
load_dotenv()

# Configurar Celery
redis_host = os.getenv('REDIS_HOST', 'redis')
redis_port = os.getenv('REDIS_PORT', '6379')
redis_url = os.getenv('REDIS_URL', f'redis://{redis_host}:{redis_port}/0')

# Inicialização com try/except para falhas de conexão com Redis
try:
    celery_app = Celery('tasks', broker=redis_url, backend=redis_url)
except Exception as e:
    print(f"Erro ao conectar ao Redis ({redis_url}): {str(e)}")
    print("Celery será executado em modo de compatibilidade.")
    # Fallback para execução local se Redis não estiver disponível
    celery_app = Celery('tasks')
    celery_app.conf.task_always_eager = True  # Executar tarefas síncronas

# Configurar OpenAI Client
class CeleryOpenAIClient:
    def __init__(self):
        self.api_key = os.getenv('OPENAI_API_KEY')
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY não encontrada no arquivo .env")
            
        self.base_url = "https://api.openai.com/v1"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "OpenAI-Beta": "assistants=v2"
        }
    
    def create_thread(self):
        """Cria uma nova thread para o usuário."""
        response = requests.post(
            f"{self.base_url}/threads",
            headers=self.headers,
            json={}
        )
        response.raise_for_status()
        return response.json()["id"]
    
    def add_message(self, thread_id, content):
        """Adiciona uma mensagem à thread."""
        response = requests.post(
            f"{self.base_url}/threads/{thread_id}/messages",
            headers=self.headers,
            json={
                "role": "user",
                "content": content
            }
        )
        response.raise_for_status()
    
    def run_assistant(self, thread_id, assistant_id):
        """Executa o assistente na thread."""
        response = requests.post(
            f"{self.base_url}/threads/{thread_id}/runs",
            headers=self.headers,
            json={"assistant_id": assistant_id}
        )
        response.raise_for_status()
        return response.json()["id"]
    
    def wait_for_completion(self, thread_id, run_id, max_retries=60, delay=1):
        """Aguarda a conclusão da execução do assistente."""
        import time
        for _ in range(max_retries):
            response = requests.get(
                f"{self.base_url}/threads/{thread_id}/runs/{run_id}",
                headers=self.headers
            )
            response.raise_for_status()
            status = response.json()["status"]
            
            if status == "completed":
                return True
            elif status in ["failed", "cancelled", "expired"]:
                return False
            time.sleep(delay)
        return False
    
    def get_latest_message(self, thread_id):
        """Obtém a última mensagem da thread."""
        response = requests.get(
            f"{self.base_url}/threads/{thread_id}/messages",
            headers=self.headers
        )
        response.raise_for_status()
        messages = response.json()["data"]
        
        if messages and messages[0]["role"] == "assistant":
            message = messages[0]["content"][0]["text"]["value"]
            return self.process_response(message)
        return None
    
    def process_response(self, message):
        """Remove conteúdo entre 【 】 da resposta."""
        return re.sub(r'【[^】]*】', '', message)

# Criar o cliente OpenAI para tarefas Celery
openai_client = CeleryOpenAIClient()

# Definir a tarefa de processamento de chat
@celery_app.task(bind=True, max_retries=3)
def process_chat_message(self, assistant_id, message, thread_id=None):
    try:
        # Se não tiver thread_id, criar uma nova
        if not thread_id:
            thread_id = openai_client.create_thread()
        
        # Adicionar mensagem à thread
        openai_client.add_message(thread_id, message)
        
        # Executar o assistente
        run_id = openai_client.run_assistant(thread_id, assistant_id)
        
        # Aguardar conclusão
        if not openai_client.wait_for_completion(thread_id, run_id):
            raise Exception("Timeout ou falha ao processar a mensagem")
        
        # Obter a resposta
        response = openai_client.get_latest_message(thread_id)
        if not response:
            raise Exception("Não foi possível obter a resposta do assistente")
        
        # Retornar o resultado
        return {
            'response': response,
            'thread_id': thread_id,
            'run_id': run_id
        }
    except Exception as e:
        # Tentar novamente em caso de erro
        self.retry(exc=e, countdown=2)
        return {
            'error': str(e)
        } 