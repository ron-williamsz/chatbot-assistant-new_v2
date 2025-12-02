#!/bin/bash

# Script para conectar facilmente no servidor de produção
# Usando a chave SSH configurada

# Configurações
PRODUCTION_IP="18.212.110.51"
PRODUCTION_USER="ubuntu"
SSH_KEY_PATH="/c/Users/zangari/Desktop/ssh/solucoes.pem"

# Cores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}🔗 Conectando no servidor de produção...${NC}"
echo -e "${BLUE}Servidor: $PRODUCTION_USER@$PRODUCTION_IP${NC}"
echo -e "${BLUE}Chave SSH: $SSH_KEY_PATH${NC}"
echo ""

# Verificar se a chave existe
if [ ! -f "$SSH_KEY_PATH" ]; then
    echo "❌ Chave SSH não encontrada em: $SSH_KEY_PATH"
    exit 1
fi

# Ajustar permissões da chave
chmod 600 "$SSH_KEY_PATH" 2>/dev/null

# Conectar no servidor
ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no $PRODUCTION_USER@$PRODUCTION_IP 