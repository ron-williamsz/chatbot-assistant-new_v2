#!/bin/bash

# Script para gerar certificado SSL para assistente.grupozangari.com.br
# Certifique-se de que o DNS já está apontando para este servidor

echo "🔐 Gerando certificado SSL para assistente.grupozangari.com.br..."

# Instalar certbot se não estiver instalado
if ! command -v certbot &> /dev/null; then
    echo "📦 Instalando certbot..."
    sudo apt update
    sudo apt install -y certbot python3-certbot-nginx
fi

# Parar nginx temporariamente para gerar o certificado
echo "⏸️ Parando nginx..."
docker-compose stop nginx

# Gerar certificado usando standalone (método HTTP)
echo "🔄 Gerando certificado SSL..."
sudo certbot certonly --standalone \
    --email admin@grupozangari.com.br \
    --agree-tos \
    --no-eff-email \
    -d assistente.grupozangari.com.br

# Copiar certificados para a pasta SSL do projeto
echo "📂 Copiando certificados..."
sudo mkdir -p ./ssl
sudo cp /etc/letsencrypt/live/assistente.grupozangari.com.br/fullchain.pem ./ssl/assistente.grupozangari.com.br.crt
sudo cp /etc/letsencrypt/live/assistente.grupozangari.com.br/privkey.pem ./ssl/assistente.grupozangari.com.br.key

# Ajustar permissões
sudo chown $USER:$USER ./ssl/assistente.grupozangari.com.br.*
sudo chmod 644 ./ssl/assistente.grupozangari.com.br.crt
sudo chmod 600 ./ssl/assistente.grupozangari.com.br.key

# Reiniciar nginx
echo "🚀 Reiniciando nginx..."
docker-compose up -d nginx

echo "✅ Certificado SSL configurado com sucesso!"
echo "🌐 Acesse: https://assistente.grupozangari.com.br"

# Configurar renovação automática (crontab)
echo "⚙️ Configurando renovação automática..."
(crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet && docker-compose -f $(pwd)/docker-compose.yml restart nginx") | crontab -

echo "🔄 Renovação automática configurada no crontab" 