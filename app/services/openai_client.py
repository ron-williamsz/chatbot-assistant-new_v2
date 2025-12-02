import os
import time
import re
import requests
from typing import Optional, Dict

class OpenAIAssistantClient:
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
        self.active_threads: Dict[str, str] = {}

    def create_thread(self, user_id: str) -> str:
        response = requests.post(
            f"{self.base_url}/threads",
            headers=self.headers
        )
        if response.status_code == 200:
            thread_id = response.json()['id']
            self.active_threads[user_id] = thread_id
            return thread_id
        raise Exception(f"Erro ao criar thread: {response.text}")

    def get_or_create_thread(self, user_id: str) -> str:
        return self.active_threads.get(user_id) or self.create_thread(user_id)

    def add_message(self, thread_id: str, message: str) -> None:
        response = requests.post(
            f"{self.base_url}/threads/{thread_id}/messages",
            headers=self.headers,
            json={"role": "user", "content": message}
        )
        if response.status_code != 200:
            raise Exception(f"Erro ao adicionar mensagem: {response.text}")

    def run_assistant(self, thread_id: str, assistant_id: str, instructions: Optional[str] = None) -> str:
        request_data = {"assistant_id": assistant_id}
        
        # Adicionar instruções personalizadas se fornecidas
        if instructions:
            request_data["instructions"] = instructions
        
        response = requests.post(
            f"{self.base_url}/threads/{thread_id}/runs",
            headers=self.headers,
            json=request_data
        )
        if response.status_code == 200:
            return response.json()['id']
        raise Exception(f"Erro ao executar assistente: {response.text}")

    def get_run_status(self, thread_id: str, run_id: str) -> str:
        response = requests.get(
            f"{self.base_url}/threads/{thread_id}/runs/{run_id}",
            headers=self.headers
        )
        if response.status_code == 200:
            return response.json()['status']
        raise Exception(f"Erro ao obter status: {response.text}")

    def get_messages(self, thread_id: str) -> list:
        response = requests.get(
            f"{self.base_url}/threads/{thread_id}/messages",
            headers=self.headers
        )
        if response.status_code == 200:
            return response.json()['data']
        raise Exception(f"Erro ao obter mensagens: {response.text}")

    def wait_for_completion(self, thread_id: str, run_id: str, timeout: int = 300) -> None:
        start_time = time.time()
        while True:
            if time.time() - start_time > timeout:
                raise Exception("Timeout esperando pela conclusão do assistente")
            
            status = self.get_run_status(thread_id, run_id)
            if status == "completed":
                return
            elif status in ["failed", "cancelled", "expired"]:
                raise Exception(f"Run falhou com status: {status}")
            
            time.sleep(1)

    def chat(self, assistant_id: str, message: str, user_id: str, instructions: Optional[str] = None) -> str:
        thread_id = self.get_or_create_thread(user_id)
        self.add_message(thread_id, message)
        run_id = self.run_assistant(thread_id, assistant_id, instructions)
        self.wait_for_completion(thread_id, run_id)
        messages = self.get_messages(thread_id)
        
        if messages:
            latest_message = messages[0]
            if latest_message['role'] == 'assistant':
                response = latest_message['content'][0]['text']['value']
                
                # Remove caracteres entre 【】
                response = re.sub(r'【.*?】', '', response)
                
                # Converte texto entre asteriscos para HTML bold
                response = re.sub(r'\*{1,}(.*?)\*{1,}', r'<b>\1</b>', response)
                
                return response
        
        return "Não foi possível obter uma resposta do assistente."

    def reset_thread(self, user_id: str) -> None:
        if user_id in self.active_threads:
            del self.active_threads[user_id]