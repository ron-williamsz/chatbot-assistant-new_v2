# 🚀 Guia de Deploy - Chatbot Assistant

Este guia explica como fazer o deploy da aplicação Chatbot Assistant no servidor de produção usando Git e GitHub.

## 📋 Pré-requisitos

### No seu computador local:
- Git instalado
- Conta no GitHub
- Acesso SSH ao servidor de produção

### No servidor de produção (18.212.110.51):
- Docker e Docker Compose instalados
- Git instalado
- Acesso SSH configurado
- Usuário com permissões sudo

## 🔧 Configuração Inicial

### 1. Preparar o Repositório Local

```bash
# Inicializar repositório Git (se ainda não foi feito)
git init

# Adicionar todos os arquivos
git add .

# Fazer commit inicial
git commit -m "Initial commit - Chatbot Assistant"
```

### 2. Criar Repositório no GitHub

1. Acesse [GitHub](https://github.com)
2. Clique em "New repository"
3. Nome: `chatbot-assistant`
4. Descrição: `Sistema de Chatbot com Assistentes OpenAI`
5. Deixe como **público** ou **privado** conforme preferir
6. **NÃO** inicialize com README, .gitignore ou license (já temos esses arquivos)
7. Clique em "Create repository"

### 3. Conectar Repositório Local ao GitHub

```bash
# Adicionar remote origin (substitua SEU_USUARIO pelo seu username do GitHub)
git remote add origin https://github.com/SEU_USUARIO/chatbot-assistant.git

# Fazer push inicial
git branch -M main
git push -u origin main
```

## 🛠️ Preparação do Servidor

### 1. Instalar Docker (se não estiver instalado)

```bash
# Conectar ao servidor
ssh ubuntu@18.212.110.51

# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Adicionar usuário ao grupo docker
sudo usermod -aG docker $USER

# Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Reiniciar sessão para aplicar mudanças de grupo
exit
```

### 2. Configurar Firewall (se necessário)

```bash
# Conectar novamente
ssh ubuntu@18.212.110.51

# Permitir porta da aplicação
sudo ufw allow 5358/tcp

# Verificar status
sudo ufw status
```

## 🚀 Deploy da Aplicação

### 1. Atualizar Script de Deploy

Antes de fazer o deploy, edite o arquivo `deploy-production.sh` e ajuste:

```bash
# Linha 89: Substitua SEU_USUARIO pelo seu username do GitHub
REPO_URL="https://github.com/SEU_USUARIO/chatbot-assistant.git"

# Linha 17: Ajuste o usuário se necessário (padrão: ubuntu)
PRODUCTION_USER="ubuntu"
```

### 2. Executar Deploy

```bash
# Tornar script executável
chmod +x deploy-production.sh

# Executar deploy
./deploy-production.sh
```

### 3. Configurar Variáveis de Ambiente no Servidor

```bash
# Conectar ao servidor
ssh ubuntu@18.212.110.51

# Ir para diretório da aplicação
cd /opt/chatbot-assistant

# Editar arquivo .env
nano .env
```

Configure as seguintes variáveis obrigatórias:

```env
# OpenAI API Key (OBRIGATÓRIO)
OPENAI_API_KEY=sk-your-openai-api-key-here

# Flask Secret Key (OBRIGATÓRIO)
FLASK_SECRET_KEY=your-very-secure-secret-key-here

# Configurações de Segurança SQLite
SQLITE_SECURE=true
DB_BACKUP_ENABLED=true
SQLITE_ENCRYPTION_KEY=your-64-character-encryption-key-here
```

### 4. Iniciar Aplicação

```bash
# Iniciar containers
docker-compose -f docker-compose.simple.yml up -d

# Verificar status
docker-compose -f docker-compose.simple.yml ps

# Ver logs
docker-compose -f docker-compose.simple.yml logs -f
```

## 🔍 Verificação do Deploy

### 1. Verificar Containers

```bash
# Status dos containers
docker-compose -f docker-compose.simple.yml ps

# Logs da aplicação
docker-compose -f docker-compose.simple.yml logs chatbot-assistant

# Logs do Redis
docker-compose -f docker-compose.simple.yml logs redis
```

### 2. Testar Aplicação

- Acesse: `http://18.212.110.51:5358`
- Login padrão: `admin` / `admin`
- Verifique se todas as funcionalidades estão funcionando

### 3. Health Check

```bash
# Verificar health check
curl http://18.212.110.51:5358/health
```

## 🔄 Atualizações Futuras

### 1. Fazer Mudanças Localmente

```bash
# Fazer suas alterações no código
# ...

# Commit das mudanças
git add .
git commit -m "Descrição das mudanças"

# Push para GitHub
git push origin main
```

### 2. Deploy das Atualizações

```bash
# Executar script de deploy novamente
./deploy-production.sh
```

### 3. Reiniciar Aplicação no Servidor

```bash
# Conectar ao servidor
ssh ubuntu@18.212.110.51

# Ir para diretório da aplicação
cd /opt/chatbot-assistant

# Reiniciar containers
docker-compose -f docker-compose.simple.yml restart

# Ou fazer rebuild se necessário
docker-compose -f docker-compose.simple.yml down
docker-compose -f docker-compose.simple.yml up -d --build
```

## 🛡️ Segurança e Manutenção

### 1. Backups Automáticos

A aplicação já possui sistema de backup automático do SQLite. Para backups completos:

```bash
# Script de backup completo
#!/bin/bash
BACKUP_DIR="/opt/backups/chatbot-assistant"
DATE=$(date +%Y%m%d-%H%M%S)

# Backup do código
tar -czf "$BACKUP_DIR/code-backup-$DATE.tar.gz" /opt/chatbot-assistant

# Backup dos volumes Docker
docker run --rm -v chatbot-assistant_sqlite_data:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/sqlite-data-$DATE.tar.gz -C /data .
```

### 2. Monitoramento

```bash
# Verificar uso de recursos
docker stats

# Verificar logs de erro
docker-compose -f docker-compose.simple.yml logs --tail=100 | grep -i error

# Verificar espaço em disco
df -h
```

### 3. SSL/HTTPS (Recomendado)

Para produção, configure SSL usando Nginx ou Cloudflare:

```bash
# Instalar Nginx
sudo apt install nginx

# Configurar proxy reverso
sudo nano /etc/nginx/sites-available/chatbot-assistant
```

## 🆘 Troubleshooting

### Problemas Comuns

1. **Erro de conexão com OpenAI**
   - Verifique se `OPENAI_API_KEY` está configurada corretamente
   - Teste a chave: `curl -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models`

2. **Containers não iniciam**
   - Verifique logs: `docker-compose logs`
   - Verifique espaço em disco: `df -h`
   - Reinicie Docker: `sudo systemctl restart docker`

3. **Aplicação não responde**
   - Verifique se a porta 5358 está aberta
   - Teste health check: `curl localhost:5358/health`
   - Verifique firewall: `sudo ufw status`

### Comandos Úteis

```bash
# Parar todos os containers
docker-compose -f docker-compose.simple.yml down

# Remover volumes (CUIDADO: apaga dados)
docker-compose -f docker-compose.simple.yml down -v

# Rebuild completo
docker-compose -f docker-compose.simple.yml build --no-cache

# Ver uso de recursos
docker system df

# Limpar recursos não utilizados
docker system prune -a
```

## 📞 Suporte

Para problemas ou dúvidas:

1. Verifique os logs da aplicação
2. Consulte a documentação do Docker
3. Verifique as configurações de rede e firewall
4. Teste a conectividade com a API da OpenAI

---

**Importante**: Sempre faça backup antes de atualizações importantes e teste em ambiente de desenvolvimento primeiro. 