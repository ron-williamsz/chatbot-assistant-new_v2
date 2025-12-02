#!/bin/bash

# Script de Deploy para Servidor de Produção
# IP: 18.212.110.51

set -e  # Parar em caso de erro

echo "🚀 Iniciando deploy para servidor de produção..."

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configurações
PRODUCTION_IP="18.212.110.51"
PRODUCTION_USER="ubuntu"  # Ajuste conforme necessário
APP_NAME="chatbot-assistant"
DEPLOY_PATH="/opt/chatbot-assistant"
BACKUP_PATH="/opt/backups/chatbot-assistant"

# Configuração da chave SSH
SSH_KEY_PATH="/c/Users/zangari/Desktop/ssh/solucoes.pem"
SSH_OPTIONS="-i $SSH_KEY_PATH -o ConnectTimeout=10 -o StrictHostKeyChecking=no"

# Função para log colorido
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

info() {
    echo -e "${BLUE}[INFO] $1${NC}"
}

# Verificar se a chave SSH existe
if [ ! -f "$SSH_KEY_PATH" ]; then
    error "Chave SSH não encontrada em: $SSH_KEY_PATH"
fi

# Verificar permissões da chave SSH (importante para segurança)
info "Verificando permissões da chave SSH..."
chmod 600 "$SSH_KEY_PATH" 2>/dev/null || warning "Não foi possível ajustar permissões da chave SSH"

# Verificar se estamos no diretório correto
if [ ! -f "docker-compose.simple.yml" ]; then
    error "Arquivo docker-compose.simple.yml não encontrado. Execute este script no diretório raiz do projeto."
fi

# Verificar se o Git está configurado
if [ ! -d ".git" ]; then
    error "Repositório Git não encontrado. Execute 'git init' primeiro."
fi

# Verificar se há mudanças não commitadas
if ! git diff-index --quiet HEAD --; then
    warning "Há mudanças não commitadas. Faça commit antes do deploy."
    echo "Mudanças pendentes:"
    git status --porcelain
    read -p "Deseja continuar mesmo assim? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Obter informações do commit atual
COMMIT_HASH=$(git rev-parse HEAD)
COMMIT_SHORT=$(git rev-parse --short HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)

log "Preparando deploy do commit $COMMIT_SHORT da branch $BRANCH"

# Criar arquivo de informações do deploy
cat > deploy-info.txt << EOF
Deploy Information
==================
Date: $(date)
Commit: $COMMIT_HASH
Branch: $BRANCH
Target Server: $PRODUCTION_IP
Deploy Path: $DEPLOY_PATH
SSH Key: $SSH_KEY_PATH
EOF

log "Arquivo de informações do deploy criado"

# Verificar conectividade com o servidor
info "Verificando conectividade com o servidor $PRODUCTION_IP..."
# Comentando teste de ping pois pode não funcionar se ICMP estiver bloqueado
# if ! ping -c 1 $PRODUCTION_IP > /dev/null 2>&1; then
#     error "Não foi possível conectar ao servidor $PRODUCTION_IP"
# fi

# log "Conectividade com o servidor verificada"

# Testar conexão SSH (este é o teste mais importante)
info "Testando conexão SSH..."
if ! ssh $SSH_OPTIONS $PRODUCTION_USER@$PRODUCTION_IP "echo 'Conexão SSH OK'" > /dev/null 2>&1; then
    error "Falha na conexão SSH. Verifique a chave e as permissões."
fi

log "Conexão SSH verificada com sucesso"

# Comandos para executar no servidor
REMOTE_COMMANDS=$(cat << 'EOF'
#!/bin/bash

# Configurações
DEPLOY_PATH="/opt/chatbot-assistant"
BACKUP_PATH="/opt/backups/chatbot-assistant"
REPO_URL="https://github.com/zangari/chatbot-assistant.git"

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

# Verificar se Docker está instalado
if ! command -v docker &> /dev/null; then
    error "Docker não está instalado no servidor"
fi

if ! command -v docker-compose &> /dev/null; then
    error "Docker Compose não está instalado no servidor"
fi

# Criar diretórios necessários
sudo mkdir -p $DEPLOY_PATH
sudo mkdir -p $BACKUP_PATH
sudo mkdir -p /opt/logs

# Verificar se o diretório de deploy existe
if [ ! -d "$DEPLOY_PATH" ]; then
    log "Criando diretório de deploy..."
    sudo mkdir -p $DEPLOY_PATH
    sudo chown $USER:$USER $DEPLOY_PATH
fi

cd $DEPLOY_PATH

# Fazer backup se já existir uma instalação
if [ -f "docker-compose.simple.yml" ]; then
    log "Fazendo backup da instalação atual..."
    BACKUP_NAME="backup-$(date +%Y%m%d-%H%M%S)"
    sudo cp -r . "$BACKUP_PATH/$BACKUP_NAME"
    log "Backup criado em $BACKUP_PATH/$BACKUP_NAME"
    
    # Parar containers existentes
    log "Parando containers existentes..."
    docker-compose -f docker-compose.simple.yml down || true
fi

# Clonar ou atualizar repositório
if [ ! -d ".git" ]; then
    log "Clonando repositório..."
    git clone $REPO_URL .
else
    log "Atualizando repositório..."
    git fetch origin
    git reset --hard origin/main
fi

# Verificar se arquivo .env existe
if [ ! -f ".env" ]; then
    warning "Arquivo .env não encontrado. Criando arquivo de exemplo..."
    cp production.env.example .env
    warning "IMPORTANTE: Configure as variáveis de ambiente no arquivo .env antes de continuar"
fi

# Criar diretórios necessários para volumes
mkdir -p app/data
mkdir -p app/static/uploads
mkdir -p logs

# Definir permissões corretas
sudo chown -R $USER:$USER .
chmod +x deploy-simple.sh

log "Aplicação atualizada com sucesso!"
log "Para iniciar a aplicação, execute:"
log "cd $DEPLOY_PATH && docker-compose -f docker-compose.simple.yml up -d"

EOF
)

# Salvar comandos remotos em arquivo temporário
echo "$REMOTE_COMMANDS" > /tmp/remote-deploy.sh
chmod +x /tmp/remote-deploy.sh

log "Executando deploy no servidor remoto..."

# Executar comandos no servidor remoto usando a chave SSH
if ssh $SSH_OPTIONS $PRODUCTION_USER@$PRODUCTION_IP 'bash -s' < /tmp/remote-deploy.sh; then
    log "Deploy executado com sucesso no servidor!"
else
    error "Falha ao executar deploy no servidor"
fi

# Limpar arquivo temporário
rm /tmp/remote-deploy.sh

log "Deploy concluído!"
info "Para verificar o status da aplicação:"
info "ssh $SSH_OPTIONS $PRODUCTION_USER@$PRODUCTION_IP 'cd $DEPLOY_PATH && docker-compose -f docker-compose.simple.yml ps'"
info ""
info "Para ver os logs:"
info "ssh $SSH_OPTIONS $PRODUCTION_USER@$PRODUCTION_IP 'cd $DEPLOY_PATH && docker-compose -f docker-compose.simple.yml logs -f'"
info ""
info "Para acessar a aplicação:"
info "http://$PRODUCTION_IP:5358"

echo ""
echo "🎉 Deploy finalizado com sucesso!" 