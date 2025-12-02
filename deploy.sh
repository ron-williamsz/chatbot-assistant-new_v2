#!/bin/bash

# Script de Deploy - Chatbot Assistant
# Este script facilita o deploy da aplicação no servidor

set -e  # Parar em caso de erro

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para log colorido
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

# Verificar se Docker está instalado
check_docker() {
    if ! command -v docker &> /dev/null; then
        error "Docker não está instalado. Por favor, instale o Docker primeiro."
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose não está instalado. Por favor, instale o Docker Compose primeiro."
        exit 1
    fi
    
    log "Docker e Docker Compose encontrados ✓"
}

# Verificar se .env existe
check_env() {
    if [ ! -f .env ]; then
        warn "Arquivo .env não encontrado. Criando um modelo..."
        cat > .env << EOF
# OpenAI API Key - OBRIGATÓRIO
OPENAI_API_KEY=sua_api_key_aqui

# Flask Secret Key - será gerado automaticamente se não definido
FLASK_SECRET_KEY=$(openssl rand -hex 32)

# Configurações do Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_URL=redis://redis:6379/0

# Configurações da aplicação
PORT=5358
WORKERS=4
EOF
        error "Por favor, edite o arquivo .env e adicione sua OPENAI_API_KEY antes de continuar."
        exit 1
    fi
    
    # Verificar se OPENAI_API_KEY está definida
    source .env
    if [ -z "$OPENAI_API_KEY" ] || [ "$OPENAI_API_KEY" = "sua_api_key_aqui" ]; then
        error "OPENAI_API_KEY não está definida no arquivo .env. Por favor, configure antes de continuar."
        exit 1
    fi
    
    log "Arquivo .env configurado ✓"
}

# Função para backup
backup_data() {
    if [ -d "backups" ]; then
        log "Criando backup dos dados..."
        BACKUP_DIR="backups/backup_$(date +'%Y%m%d_%H%M%S')"
        mkdir -p "$BACKUP_DIR"
        
        # Backup do banco de dados se existir
        if docker volume inspect chatbot_assistant_sqlite_data &> /dev/null; then
            docker run --rm -v chatbot_assistant_sqlite_data:/data -v $(pwd)/$BACKUP_DIR:/backup alpine tar czf /backup/sqlite_data.tar.gz -C /data .
            log "Backup do banco de dados criado em $BACKUP_DIR ✓"
        fi
        
        # Backup dos uploads se existir
        if docker volume inspect chatbot_assistant_uploads_data &> /dev/null; then
            docker run --rm -v chatbot_assistant_uploads_data:/data -v $(pwd)/$BACKUP_DIR:/backup alpine tar czf /backup/uploads_data.tar.gz -C /data .
            log "Backup dos uploads criado em $BACKUP_DIR ✓"
        fi
    else
        mkdir -p backups
        log "Diretório de backup criado ✓"
    fi
}

# Função para build
build_app() {
    log "Construindo a aplicação..."
    docker-compose build --no-cache
    log "Build concluído ✓"
}

# Função para deploy
deploy() {
    log "Iniciando deploy..."
    
    # Parar containers existentes se estiverem rodando
    if docker-compose ps | grep -q "Up"; then
        log "Parando containers existentes..."
        docker-compose down
    fi
    
    # Subir os serviços
    log "Iniciando serviços..."
    docker-compose up -d
    
    # Aguardar os serviços ficarem prontos
    log "Aguardando serviços ficarem prontos..."
    sleep 10
    
    # Verificar se os serviços estão rodando
    if docker-compose ps | grep -q "Up"; then
        log "✅ Deploy realizado com sucesso!"
        log "🌐 Aplicação disponível em: http://localhost:5358"
        log "📊 Nginx (se habilitado) disponível em: http://localhost:80"
        
        # Mostrar logs dos últimos 20 segundos
        info "Últimos logs da aplicação:"
        docker-compose logs --tail=20 chatbot-assistant
    else
        error "❌ Falha no deploy. Verificando logs..."
        docker-compose logs
        exit 1
    fi
}

# Função para logs
show_logs() {
    if [ "$1" ]; then
        docker-compose logs -f "$1"
    else
        docker-compose logs -f
    fi
}

# Função para status
show_status() {
    log "Status dos serviços:"
    docker-compose ps
    
    log "\nUso de recursos:"
    docker stats --no-stream $(docker-compose ps -q)
    
    log "\nHealth checks:"
    for container in $(docker-compose ps -q); do
        health=$(docker inspect --format='{{.State.Health.Status}}' $container 2>/dev/null || echo "N/A")
        name=$(docker inspect --format='{{.Name}}' $container | sed 's|/||')
        echo "  $name: $health"
    done
}

# Função para parar
stop_app() {
    log "Parando a aplicação..."
    docker-compose down
    log "Aplicação parada ✓"
}

# Função para restart
restart_app() {
    log "Reiniciando a aplicação..."
    docker-compose restart
    log "Aplicação reiniciada ✓"
}

# Função para limpeza
cleanup() {
    log "Realizando limpeza..."
    docker-compose down -v --remove-orphans
    docker system prune -f
    log "Limpeza concluída ✓"
}

# Menu principal
show_help() {
    echo "Uso: $0 [COMANDO]"
    echo ""
    echo "Comandos disponíveis:"
    echo "  deploy     - Realiza o deploy completo (build + up)"
    echo "  build      - Apenas constrói as imagens"
    echo "  start      - Inicia os serviços"
    echo "  stop       - Para os serviços"
    echo "  restart    - Reinicia os serviços"
    echo "  status     - Mostra status dos serviços"
    echo "  logs       - Mostra logs (use 'logs [serviço]' para logs específicos)"
    echo "  backup     - Cria backup dos dados"
    echo "  cleanup    - Para tudo e limpa recursos"
    echo "  help       - Mostra esta ajuda"
    echo ""
    echo "Exemplos:"
    echo "  $0 deploy                    # Deploy completo"
    echo "  $0 logs chatbot-assistant    # Logs apenas da aplicação"
    echo "  $0 status                    # Status dos serviços"
}

# Main
main() {
    case "$1" in
        deploy)
            check_docker
            check_env
            backup_data
            build_app
            deploy
            ;;
        build)
            check_docker
            check_env
            build_app
            ;;
        start)
            check_docker
            check_env
            log "Iniciando serviços..."
            docker-compose up -d
            log "Serviços iniciados ✓"
            ;;
        stop)
            stop_app
            ;;
        restart)
            restart_app
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs "$2"
            ;;
        backup)
            backup_data
            ;;
        cleanup)
            cleanup
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            if [ -z "$1" ]; then
                show_help
            else
                error "Comando desconhecido: $1"
                show_help
                exit 1
            fi
            ;;
    esac
}

# Executar função principal
main "$@" 