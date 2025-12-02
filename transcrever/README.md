# Transcrever - Sistema de Transcrição de Áudio

Este é um sistema web para transcrição de áudio usando Flask e AssemblyAI.

## Pré-requisitos

- Python 3.9 ou superior
- Docker (opcional, para execução via container)
- Redis (necessário para o Celery)

## Instalação

### Opção 1: Instalação Local

1. Clone o repositório:
```bash
git clone [URL_DO_REPOSITÓRIO]
cd transcrever
```

2. Crie um ambiente virtual Python:
```bash
python -m venv venv
```

3. Ative o ambiente virtual:
- Windows:
```bash
.\venv\Scripts\activate
```
- Linux/Mac:
```bash
source venv/bin/activate
```

4. Instale as dependências:
```bash
pip install -r requirements.txt
```

5. Configure as variáveis de ambiente:
- Crie um arquivo `.env` na raiz do projeto
- Adicione sua chave da API AssemblyAI:
```
ASSEMBLYAI_API_KEY=sua_chave_aqui
```

6. Inicie o Redis:
- Windows: Instale e inicie o Redis Server
- Linux/Mac: `redis-server`

7. Inicie o worker do Celery:
```bash
celery -A tasks worker --pool=solo --concurrency=1 --loglevel=info
```

8. Em outro terminal, inicie a aplicação Flask:
```bash
python app.py
```

### Opção 2: Usando Docker

1. Certifique-se de ter o Docker instalado

2. Construa a imagem:
```bash
docker build -t transcrever .
```

3. Execute o container:
```bash
docker run -p 3002:3002 -e ASSEMBLYAI_API_KEY=sua_chave_aqui transcrever
```

## Acesso à Aplicação

Após iniciar a aplicação, acesse:
```
http://localhost:3002
```

## Estrutura do Projeto

```
transcrever/
├── app.py              # Aplicação principal Flask
├── tasks.py            # Tarefas do Celery
├── static/             # Arquivos estáticos
│   └── fonts/         # Fontes utilizadas
├── templates/          # Templates HTML
├── requirements.txt    # Dependências do projeto
└── Dockerfile         # Configuração do Docker
```

## Solução de Problemas

1. Se o Celery não iniciar, verifique se o Redis está rodando
2. Certifique-se de que a chave da API AssemblyAI está configurada corretamente
3. Para problemas com fontes, verifique se a pasta `static/fonts` está presente

## Suporte

Para suporte ou dúvidas, abra uma issue no repositório do projeto.

# Serviço de Transcrição de Áudio

Este serviço permite transcrever arquivos de áudio em texto usando a API AssemblyAI.

## Autenticação

O acesso ao serviço é protegido por uma chave API. A autenticação deve ser realizada incluindo um dos seguintes cabeçalhos HTTP em todas as requisições:

### Opção 1: Cabeçalho X-API-Key
```
X-API-Key: sua_chave_api
```

### Opção 2: Cabeçalho Authorization com Bearer Token
```
Authorization: Bearer sua_chave_api
```

## Endpoints

### `GET /` ou `POST /`
Página principal para upload de arquivo e início de transcrição.

### `GET /status/<task_id>`
Verifica o status de uma transcrição em andamento.

### `GET /download/<filename>`
Baixa um arquivo de transcrição processado.

## Exemplo de Uso com cURL

```bash
# Upload de arquivo com autenticação via X-API-Key
curl -X POST -H "X-API-Key: sua_chave_api" -F "file=@caminho/para/arquivo.mp3" http://localhost:3023/

# Verificar status de uma tarefa com autenticação via Authorization
curl -H "Authorization: Bearer sua_chave_api" http://localhost:3023/status/task_id

# Download de um arquivo processado
curl -H "X-API-Key: sua_chave_api" -o arquivo_local.pdf http://localhost:3023/download/transcricao_20240501_123456.pdf
```

## Integração com iFrames

Para integrar o serviço em um iframe, é necessário garantir que a requisição inclua o cabeçalho de autenticação. Como não é possível definir cabeçalhos personalizados diretamente em um iframe, é recomendado criar um proxy ou utilizar postMessage para comunicação segura. 