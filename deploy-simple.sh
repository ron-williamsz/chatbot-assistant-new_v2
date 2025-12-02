#!/bin/bash

# Script de Deploy Simplificado - Chatbot Assistant
# Usa docker-compose.simple.yml (sem nginx)

set -e

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] ERROR: $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING: $1${NC}"
}

# Verificar Docker
if ! command -v docker &> /dev/null; then
    error "Docker não encontrado!"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    error "Docker Compose não encontrado!"
    exit 1
fi

# Verificar .env
if [ ! -f .env ]; then
    error "Arquivo .env não encontrado!"
    echo "Crie um arquivo .env com as configurações necessárias."
    echo "Use o arquivo .env.example como referência."
    exit 1
fi

# Comando principal
case "$1" in
    "start"|"up"|"")
        log "Iniciando aplicação..."
        docker-compose -f docker-compose.simple.yml up -d
        sleep 5
        log "✅ Aplicação iniciada!"
        log "🌐 Acesse: http://localhost:5358"
        ;;
    "stop"|"down")
        log "Parando aplicação..."
        docker-compose -f docker-compose.simple.yml down
        log "✅ Aplicação parada!"
        ;;
    "restart")
        log "Reiniciando aplicação..."
        docker-compose -f docker-compose.simple.yml restart
        log "✅ Aplicação reiniciada!"
        ;;
    "build")
        log "Construindo imagens..."
        docker-compose -f docker-compose.simple.yml build --no-cache
        log "✅ Build concluído!"
        ;;
    "logs")
        docker-compose -f docker-compose.simple.yml logs -f
        ;;
    "status")
        docker-compose -f docker-compose.simple.yml ps
        ;;
    "clean")
        log "Limpando..."
        docker-compose -f docker-compose.simple.yml down -v
        docker system prune -f
        log "✅ Limpeza concluída!"
        ;;
    *)
        echo "Uso: $0 [comando]"
        echo ""
        echo "Comandos:"
        echo "  start   - Inicia a aplicação (padrão)"
        echo "  stop    - Para a aplicação"
        echo "  restart - Reinicia a aplicação"
        echo "  build   - Reconstrói as imagens"
        echo "  logs    - Mostra logs"
        echo "  status  - Mostra status"
        echo "  clean   - Para tudo e limpa"
        ;;
esac 