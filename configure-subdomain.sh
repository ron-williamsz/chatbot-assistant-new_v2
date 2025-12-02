#!/bin/bash

# Script para configurar o subdomínio assistente.grupozangari.com.br
# Execute este script após configurar o DNS

DOMAIN="assistente.grupozangari.com.br"
EMAIL="admin@grupozangari.com.br"

echo "🚀 Configurando subdomínio $DOMAIN..."

# Verificar se o DNS está resolvendo
echo "🔍 Verificando DNS..."
if ! nslookup $DOMAIN > /dev/null 2>&1; then
    echo "❌ DNS não está resolvendo para $DOMAIN"
    echo "👉 Configure o DNS primeiro:"
    echo "   Tipo: A"
    echo "   Nome: assistente"
    echo "   Valor: $(curl -s ifconfig.me)"
    echo "   TTL: 300"
    exit 1
fi

echo "✅ DNS configurado corretamente"

# Parar containers se estiverem rodando
echo "⏸️ Parando containers..."
docker-compose down

# Gerar certificado SSL
echo "🔐 Configurando SSL..."
chmod +x ./generate-ssl.sh
./generate-ssl.sh

# Verificar se certificados foram criados
if [ ! -f "./ssl/${DOMAIN}.crt" ] || [ ! -f "./ssl/${DOMAIN}.key" ]; then
    echo "❌ Erro ao gerar certificados SSL"
    echo "👉 Execute manualmente: ./generate-ssl.sh"
    exit 1
fi

echo "✅ Certificados SSL configurados"

# Atualizar docker-compose para produção
echo "🐳 Configurando Docker para produção..."

# Subir containers
echo "🚀 Iniciando containers..."
docker-compose up -d

# Aguardar containers ficarem prontos
echo "⏳ Aguardando containers ficarem prontos..."
sleep 30

# Testar se está funcionando
echo "🧪 Testando configuração..."
if curl -s -k "https://$DOMAIN/health" > /dev/null; then
    echo "✅ HTTPS funcionando!"
else
    echo "⚠️ Testando HTTP..."
    if curl -s "http://$DOMAIN/health" > /dev/null; then
        echo "✅ HTTP funcionando (HTTPS pode levar alguns minutos)"
    else
        echo "❌ Erro na configuração"
        docker-compose logs nginx
        exit 1
    fi
fi

echo ""
echo "🎉 Configuração concluída!"
echo "🌐 Acesse: https://$DOMAIN"
echo "📊 Logs: docker-compose logs -f"
echo "🔄 Restart: docker-compose restart nginx" 