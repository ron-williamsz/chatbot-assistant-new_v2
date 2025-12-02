# 🐳 Docker Deploy - Chatbot Assistant

Este documento contém todas as instruções para fazer deploy da aplicação Chatbot Assistant usando Docker no seu servidor.

## 📋 Pré-requisitos

### No Servidor:
- Docker Engine 20.10+
- Docker Compose v2.0+
- Git
- Pelo menos 2GB de RAM livres
- Pelo menos 5GB de espaço em disco

### Verificar se está tudo instalado:
```bash
docker --version
docker-compose --version
git --version
```

## 🚀 Deploy Rápido

### 1. Clone o repositório:
```bash
git clone <seu-repositorio>
cd chatbot_assistant
```

### 2. Configure as variáveis de ambiente:
```bash
# Copie o arquivo de exemplo (se existir) ou crie um novo
cp .env.example .env  # ou crie um novo

# Edite o arquivo .env
nano .env
```

**Configuração mínima do .env:**
```env
# OpenAI API Key - OBRIGATÓRIO
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Flask Secret Key - será gerado automaticamente se não definido
FLASK_SECRET_KEY=sua_chave_secreta_aqui

# Configurações do Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_URL=redis://redis:6379/0

# Configurações da aplicação
PORT=5358
WORKERS=4
```

### 3. Execute o deploy:
```bash
# Dar permissão de execução ao script
chmod +x deploy.sh

# Executar deploy completo
./deploy.sh deploy
```

## 📚 Comandos Disponíveis

O script `deploy.sh` oferece vários comandos úteis:

```bash
./deploy.sh deploy     # Deploy completo (recomendado)
./deploy.sh build      # Apenas constrói as imagens
./deploy.sh start      # Inicia os serviços
./deploy.sh stop       # Para os serviços
./deploy.sh restart    # Reinicia os serviços
./deploy.sh status     # Mostra status dos serviços
./deploy.sh logs       # Mostra logs de todos os serviços
./deploy.sh logs chatbot-assistant  # Logs apenas da aplicação
./deploy.sh backup     # Cria backup dos dados
./deploy.sh cleanup    # Para tudo e limpa recursos
./deploy.sh help       # Mostra ajuda
```

## 🏗️ Arquitetura dos Containers

A aplicação é composta por:

### 1. **chatbot-assistant** (Aplicação Principal)
- **Porta:** 5358
- **Função:** Aplicação Flask principal
- **Recursos:** 512MB-1GB RAM, 0.5-2 CPUs
- **Volumes:** 
  - `sqlite_data` - Banco de dados
  - `uploads_data` - Arquivos enviados
  - `logs_data` - Logs da aplicação

### 2. **celery-worker** (Processamento Assíncrono)
- **Função:** Worker Celery para tarefas assíncronas
- **Recursos:** 256MB-512MB RAM, 0.25-1 CPU
- **Volumes:** Compartilhados com a aplicação principal

### 3. **redis** (Cache e Mensageria)
- **Porta:** 6379 (apenas localhost)
- **Função:** Cache e broker para Celery
- **Recursos:** 128MB-512MB RAM, 0.1-0.5 CPU
- **Volumes:** `redis_data` - Dados persistentes do Redis

### 4. **nginx** (Proxy Reverso - Opcional)
- **Portas:** 80, 443
- **Função:** Proxy reverso, SSL, rate limiting
- **Configuração:** `nginx.conf`

## 🔧 Configurações Avançadas

### Configurar SSL (HTTPS)

1. **Obter certificados SSL:**
```bash
# Usando Certbot (Let's Encrypt)
sudo apt install certbot
sudo certbot certonly --standalone -d seu-dominio.com
```

2. **Criar diretório SSL:**
```bash
mkdir ssl
sudo cp /etc/letsencrypt/live/seu-dominio.com/fullchain.pem ssl/cert.pem
sudo cp /etc/letsencrypt/live/seu-dominio.com/privkey.pem ssl/key.pem
sudo chown $USER:$USER ssl/*
```

3. **Editar nginx.conf:**
```bash
# Descomente e configure a seção HTTPS no nginx.conf
nano nginx.conf
```

4. **Restart do nginx:**
```bash
docker-compose restart nginx
```

### Configurar Domínio Personalizado

1. **No seu DNS:** Aponte o domínio para o IP do servidor
2. **No nginx.conf:** Substitua `_` por `seu-dominio.com`
3. **Reinicie:** `./deploy.sh restart`

### Ajustar Recursos

Edite o `docker-compose.yml` para ajustar recursos:

```yaml
deploy:
  resources:
    limits:
      cpus: '2'      # Máximo de CPUs
      memory: 1G     # Máximo de RAM
    reservations:
      cpus: '0.5'    # CPUs reservadas
      memory: 512M   # RAM reservada
```

## 📊 Monitoramento

### Ver Status dos Serviços:
```bash
./deploy.sh status
```

### Monitorar Logs em Tempo Real:
```bash
# Todos os serviços
./deploy.sh logs

# Apenas a aplicação
./deploy.sh logs chatbot-assistant

# Apenas o Redis
./deploy.sh logs redis
```

### Verificar Health Checks:
```bash
# Health check da aplicação
curl http://localhost:5358/health

# Status dos containers
docker-compose ps
```

### Monitorar Recursos:
```bash
# Uso de recursos dos containers
docker stats

# Uso do disco
docker system df
```

## 🔒 Segurança

### Configurações de Segurança Implementadas:

1. **Container não-root:** Aplicação roda com usuário `appuser`
2. **Network isolation:** Rede privada entre containers
3. **Rate limiting:** Nginx limita requisições por IP
4. **Security headers:** Headers de segurança configurados
5. **Redis protegido:** Acesso apenas localhost e rede interna
6. **Logs rotacionados:** Logs limitados para evitar enchimento do disco

### Recomendações Adicionais:

```bash
# Configurar firewall
sudo ufw enable
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS

# Configurar fail2ban (opcional)
sudo apt install fail2ban
```

## 🔧 Troubleshooting

### Container não inicia:
```bash
# Ver logs detalhados
./deploy.sh logs chatbot-assistant

# Verificar configuração
docker-compose config

# Rebuild sem cache
./deploy.sh build
```

### Problemas de conectividade:
```bash
# Testar rede entre containers
docker-compose exec chatbot-assistant ping redis

# Verificar portas
netstat -tlnp | grep :5358
```

### Problemas de performance:
```bash
# Verificar recursos
docker stats

# Verificar espaço em disco
df -h
docker system df
```

### Backup e Restore:

```bash
# Criar backup
./deploy.sh backup

# Restore manual (se necessário)
docker run --rm -v chatbot_assistant_sqlite_data:/data -v $(pwd)/backups/backup_YYYYMMDD_HHMMSS:/backup alpine tar xzf /backup/sqlite_data.tar.gz -C /data
```

## 📈 Otimizações para Produção

### 1. **Tune do Gunicorn:**
```env
# No .env
WORKERS=4              # 2x número de cores
```

### 2. **Configurar Nginx Cache:**
```nginx
# No nginx.conf
location /static/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### 3. **Configurar Redis Persistence:**
```bash
# Já configurado no docker-compose.yml
# Redis salva automaticamente
```

### 4. **Monitoramento Avançado:**
```bash
# Instalar Portainer (opcional)
docker run -d -p 9000:9000 --name portainer --restart always -v /var/run/docker.sock:/var/run/docker.sock portainer/portainer-ce
```

## 🆘 Suporte

### Logs importantes:
- **Aplicação:** `./deploy.sh logs chatbot-assistant`
- **Redis:** `./deploy.sh logs redis`
- **Nginx:** `./deploy.sh logs nginx`

### Comandos úteis:
```bash
# Entrar no container da aplicação
docker-compose exec chatbot-assistant bash

# Verificar variáveis de ambiente
docker-compose exec chatbot-assistant env

# Reiniciar apenas um serviço
docker-compose restart chatbot-assistant
```

### Em caso de problemas:
1. Verifique os logs: `./deploy.sh logs`
2. Verifique o status: `./deploy.sh status`
3. Tente reiniciar: `./deploy.sh restart`
4. Se persistir, rebuilde: `./deploy.sh cleanup && ./deploy.sh deploy`

---

## 🎉 Pronto!

Após seguir este guia, sua aplicação deve estar rodando em:
- **Aplicação:** http://seu-ip:5358
- **Nginx (se habilitado):** http://seu-ip:80

**Login padrão:** admin / admin (altere após o primeiro login!) 