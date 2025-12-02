# 🤖 Chatbot Assistant v2

Sistema completo de chatbot com integração OpenAI Assistants API, transcrição de áudio com IA e gestão de usuários. Desenvolvido com Flask, Docker e microserviços.

## 📋 Índice

- [Características](#-características)
- [Tecnologias](#-tecnologias)
- [Arquitetura](#-arquitetura)
- [Pré-requisitos](#-pré-requisitos)
- [Instalação](#-instalação)
- [Configuração](#-configuração)
- [Uso](#-uso)
- [API](#-api)
- [Deploy](#-deploy)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Licença](#-licença)

## ✨ Características

### 🎯 Funcionalidades Principais

- **Chatbot Inteligente**: Integração completa com OpenAI Assistants API (GPT-4, GPT-3.5)
- **Transcrição de Áudio**: Sistema de transcrição com IA (AssemblyAI) com suporte a múltiplos speakers
- **Sistema de Autenticação**: Login/registro com sessões seguras e API keys
- **Gestão de Assistentes**: Criação, edição e gerenciamento de assistentes personalizados
- **Dashboard Administrativo**: Painel completo para gestão de usuários e API keys
- **Upload de Arquivos**: Suporte para documentos (PDF, DOCX) e imagens para contexto
- **Threads e Histórico**: Conversas organizadas em threads com histórico completo
- **Sistema de Usuários**: Múltiplos perfis com permissões (admin/usuário comum)

### 🔐 Segurança

- Autenticação com sessões criptografadas
- API Keys com permissões granulares (read/write/admin)
- Proteção contra CSRF
- Rate limiting
- Criptografia de dados sensíveis no SQLite
- CORS configurável

### 🚀 Performance

- Cache Redis para melhor performance
- Workers assíncronos com Celery
- Healthchecks automáticos
- Logs estruturados
- Limite de recursos configurável

## 🛠 Tecnologias

### Backend
- **Flask 2.3.3** - Framework web Python
- **OpenAI API 1.51.2** - Integração com GPT-4/GPT-3.5
- **Gunicorn 21.2.0** - WSGI HTTP Server
- **SQLAlchemy 2.0.23** - ORM para banco de dados
- **Celery 5.3.4** - Task queue assíncrono
- **Redis 7** - Cache e message broker

### Frontend
- HTML5/CSS3/JavaScript
- Interface responsiva
- Markdown rendering
- Real-time updates

### Infraestrutura
- **Docker & Docker Compose** - Containerização
- **Nginx** - Reverse proxy (opcional)
- **SQLite** - Banco de dados
- **AssemblyAI** - API de transcrição

## 🏗 Arquitetura

O sistema é composto por 4 serviços principais em containers Docker:

```
┌─────────────────────────────────────────────────────────────┐
│                      CHATBOT ASSISTANT                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │    Flask     │  │   OpenAI     │  │   Database   │      │
│  │  Web Server  │──│  Assistant   │──│    SQLite    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────┬────────────────────────────────────────────────┘
             │
             ├──────────────────┐
             ▼                  ▼
┌─────────────────────┐  ┌─────────────────────┐
│   TRANSCREVER API   │  │       REDIS         │
│  ┌────────────────┐ │  │  ┌──────────────┐  │
│  │  Flask API     │ │  │  │    Cache     │  │
│  │  AssemblyAI    │ │  │  │   Broker     │  │
│  └────────────────┘ │  │  └──────────────┘  │
└─────────────────────┘  └─────────────────────┘
             │
             ▼
┌─────────────────────┐
│   CELERY WORKER     │
│  ┌────────────────┐ │
│  │  Transcription │ │
│  │    Tasks       │ │
│  └────────────────┘ │
└─────────────────────┘
```

## 📦 Pré-requisitos

- **Docker** e **Docker Compose** instalados
- **OpenAI API Key** ([obter aqui](https://platform.openai.com/api-keys))
- **AssemblyAI API Key** ([obter aqui](https://www.assemblyai.com/))
- Pelo menos **4GB de RAM** disponível
- Portas **5359** e **3024** livres

## 🚀 Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/ron-williamsz/chatbot-assistant-new_v2.git
cd chatbot-assistant-new_v2
```

### 2. Configure as variáveis de ambiente

```bash
# Copie o arquivo de exemplo
cp env.example .env

# Edite o arquivo .env com suas credenciais
nano .env
```

**Configurações obrigatórias no `.env`:**

```env
# OpenAI API Key (obrigatória)
OPENAI_API_KEY=sk-your-openai-api-key-here

# AssemblyAI API Key (obrigatória para transcrições)
ASSEMBLYAI_API_KEY=your-assemblyai-api-key-here

# Flask Secret Key (gere uma chave segura)
FLASK_SECRET_KEY=sua_chave_secreta_super_segura_aqui
```

**Gerar uma chave secreta forte:**
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 3. Crie a rede Docker

```bash
docker network create proxy-network
```

### 4. Inicie os serviços

```bash
docker-compose up -d --build
```

### 5. Verifique o status

```bash
docker-compose ps
docker-compose logs -f chatbot-assistant
```

## ⚙️ Configuração

### Primeiro Acesso

1. Acesse: `http://localhost:5359`
2. Clique em **"Registrar"**
3. Crie sua conta (primeiro usuário é automaticamente admin)
4. Faça login com suas credenciais

### Criar um Assistente

1. Acesse o **Dashboard**
2. Clique em **"Criar Novo Assistente"**
3. Configure:
   - **Nome**: Nome do assistente
   - **Modelo**: gpt-4-turbo-preview, gpt-3.5-turbo, etc.
   - **Instruções**: Comportamento e personalidade
   - **Tools**: Code Interpreter, File Search, Function Calling

### Gerar API Key

Para integração via API:

1. Acesse **"Perfil"** → **"Minhas API Keys"**
2. Clique em **"Gerar Nova API Key"**
3. Escolha as permissões (read, write, admin)
4. Copie e guarde a key com segurança

## 💻 Uso

### Interface Web

**Chat:**
```
http://localhost:5359/chat
```

**Dashboard:**
```
http://localhost:5359/dashboard
```

**Transcrição:**
```
http://localhost:5359/transcrever
```

### Exemplos de Uso

#### 1. Conversar com o Assistente

1. Selecione um assistente
2. Digite sua mensagem
3. Aguarde a resposta
4. Continue a conversa (mantém contexto)

#### 2. Upload de Arquivos

- **Documentos**: PDF, DOCX para análise
- **Imagens**: PNG, JPG para análise visual
- **Áudio**: MP3, WAV, OPUS para transcrição

#### 3. Transcrição de Áudio

1. Acesse `/transcrever`
2. Faça upload do arquivo de áudio
3. Configure número de speakers (opcional)
4. Aguarde o processamento (assíncrono)
5. Baixe a transcrição em DOCX

## 🔌 API

### Autenticação

Todas as requisições API precisam de uma API Key:

```bash
curl -H "Authorization: Bearer sua_api_key_aqui" \
     http://localhost:5359/api/endpoint
```

### Endpoints Principais

#### Chat - Enviar Mensagem

```bash
POST /api/chat
Content-Type: application/json
Authorization: Bearer <api_key>

{
  "assistant_id": "asst_xxxxx",
  "message": "Sua mensagem aqui",
  "thread_id": "thread_xxxxx" # opcional
}
```

#### Listar Assistentes

```bash
GET /api/assistants
Authorization: Bearer <api_key>
```

#### Criar Assistente

```bash
POST /api/assistants
Content-Type: application/json
Authorization: Bearer <api_key>

{
  "name": "Meu Assistente",
  "model": "gpt-4-turbo-preview",
  "instructions": "Você é um assistente útil..."
}
```

#### Upload de Arquivo

```bash
POST /api/upload
Content-Type: multipart/form-data
Authorization: Bearer <api_key>

file: <arquivo>
purpose: assistants # ou vision
```

#### Transcrição de Áudio

```bash
POST /api/transcrever
Content-Type: multipart/form-data
Authorization: Bearer <api_key>

audio: <arquivo_audio>
speakers_expected: 2 # opcional
```

#### Status de Transcrição

```bash
GET /api/transcrever/status/<task_id>
Authorization: Bearer <api_key>
```

### Exemplos com Python

```python
import requests

API_KEY = "sua_api_key_aqui"
BASE_URL = "http://localhost:5359"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# Enviar mensagem
response = requests.post(
    f"{BASE_URL}/api/chat",
    headers=headers,
    json={
        "assistant_id": "asst_xxxxx",
        "message": "Olá! Como você está?"
    }
)

print(response.json())
```

## 🌐 Deploy

### Deploy com Docker (Recomendado)

Já está pronto para produção! Configure:

1. **Variáveis de ambiente** em `production.env`
2. **Nginx** como reverse proxy (veja `nginx.conf`)
3. **SSL/TLS** com Let's Encrypt
4. **Backup** automático do banco de dados

Scripts auxiliares incluídos:

- `deploy-production.sh` - Deploy completo
- `generate-ssl.sh` - Gerar certificados SSL
- `configure-subdomain.sh` - Configurar subdomínio

### Deploy Manual

```bash
# Instalar dependências
pip install -r requirements.txt

# Configurar variáveis de ambiente
export OPENAI_API_KEY=sk-xxxxx
export FLASK_SECRET_KEY=xxxxx

# Iniciar Redis
redis-server

# Iniciar Celery Worker (transcrição)
cd transcrever
celery -A tasks worker --loglevel=info

# Iniciar aplicação
gunicorn -w 4 -b 0.0.0.0:5359 wsgi:application
```

### Deploy em Cloud

O projeto suporta deploy em:

- **AWS** (EC2, ECS, Elastic Beanstalk)
- **Google Cloud** (Cloud Run, GKE)
- **Azure** (Container Instances, AKS)
- **DigitalOcean** (Droplets, App Platform)
- **Heroku** (com containers)

## 📁 Estrutura do Projeto

```
chatbot-assistant-new_v2/
├── app/                          # Aplicação principal
│   ├── __init__.py              # Factory do Flask
│   ├── routes.py                # Rotas da aplicação
│   ├── database.py              # Gerenciamento de banco de dados
│   ├── services/                # Serviços
│   │   ├── openai_client.py    # Cliente OpenAI
│   │   ├── openai_service.py   # Serviço OpenAI
│   │   └── transcriber_client.py # Cliente de transcrição
│   ├── static/                  # Arquivos estáticos
│   │   ├── css/                # Estilos
│   │   ├── js/                 # Scripts
│   │   ├── images/             # Imagens
│   │   └── uploads/            # Uploads de usuários
│   ├── templates/              # Templates HTML
│   │   ├── base.html
│   │   ├── chat.html
│   │   ├── dashboard.html
│   │   └── admin/              # Templates admin
│   └── data/                   # Dados da aplicação
│       └── database.db         # Banco de dados SQLite
├── transcrever/                 # Microserviço de transcrição
│   ├── app.py                  # API Flask
│   ├── tasks.py                # Tasks Celery
│   ├── uploads/                # Uploads de áudio
│   └── processed/              # Áudios processados
├── docker-compose.yml          # Configuração Docker
├── Dockerfile                  # Imagem Docker principal
├── requirements.txt            # Dependências Python
├── .env.example               # Exemplo de variáveis
├── nginx.conf                 # Configuração Nginx
├── wsgi.py                    # Entry point WSGI
├── app.py                     # Entry point desenvolvimento
└── README.md                  # Este arquivo
```

## 🔧 Manutenção

### Ver Logs

```bash
# Logs de todos os serviços
docker-compose logs -f

# Logs do chatbot
docker-compose logs -f chatbot-assistant

# Logs do transcrever
docker-compose logs -f transcrever-new

# Logs do Celery
docker-compose logs -f transcriber-celery-new
```

### Backup do Banco de Dados

```bash
# Backup manual
docker-compose exec chatbot-assistant \
  sqlite3 /app/app/data/database.db ".backup '/app/app/data/backup.db'"

# Copiar backup para host
docker cp chatbot-assistant-new:/app/app/data/backup.db ./backup.db
```

### Atualizar o Sistema

```bash
# Parar serviços
docker-compose down

# Atualizar código
git pull origin main

# Reconstruir e reiniciar
docker-compose up -d --build
```

### Limpar Recursos

```bash
# Limpar containers parados
docker-compose down --volumes

# Limpar cache do Docker
docker system prune -a
```

## 🐛 Troubleshooting

### Problema: Containers não iniciam

**Solução:**
```bash
# Verificar logs
docker-compose logs

# Recriar containers
docker-compose down -v
docker-compose up -d --build
```

### Problema: Erro de API Key

**Solução:**
- Verifique se as keys estão corretas no `.env`
- Teste as keys diretamente na API da OpenAI/AssemblyAI
- Recrie o arquivo `.env` a partir do `env.example`

### Problema: Transcrição falha

**Solução:**
```bash
# Verificar worker Celery
docker-compose logs transcriber-celery-new

# Reiniciar serviço
docker-compose restart transcriber-celery-new transcrever-new
```

### Problema: Porta ocupada

**Solução:**
```bash
# Alterar porta no docker-compose.yml
services:
  chatbot-assistant:
    ports:
      - "5360:5359"  # Porta externa alterada
```

## 📊 Monitoramento

### Health Checks

O sistema possui health checks automáticos:

- **Chatbot**: `http://localhost:5359/health`
- **Transcrever**: `http://localhost:3024/healthcheck`
- **Redis**: `docker-compose exec redis-new redis-cli ping`

### Métricas

```bash
# Status dos containers
docker-compose ps

# Uso de recursos
docker stats

# Informações do sistema
docker-compose exec chatbot-assistant python -c "import psutil; print(f'CPU: {psutil.cpu_percent()}% | RAM: {psutil.virtual_memory().percent}%')"
```

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/NovaFuncionalidade`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/NovaFuncionalidade`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 👤 Autor
**Wesley Pestana**
**Ron Williamsz**
- GitHub: [@ron-williamsz](https://github.com/ron-williamsz)

## 📞 Suporte

Para suporte e dúvidas:
- Abra uma [issue](https://github.com/ron-williamsz/chatbot-assistant-new_v2/issues)
- Consulte a [documentação](docs/)

---

⭐ Se este projeto foi útil, considere dar uma estrela no GitHub!
