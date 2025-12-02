# Usar uma única imagem para simplificar e evitar problemas de dependências
FROM python:3.11-slim

# Criar usuário não-root para segurança
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Atualizar sistema e instalar dependências básicas (MESMO PADRÃO DO SOLUCOES_ZANGARI_NEW)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    gnupg2 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Criar diretórios necessários
RUN mkdir -p /app/app/data && \
    mkdir -p /app/logs && \
    chown -R appuser:appuser /app

WORKDIR /app

# Copiar e instalar dependências Python
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copiar o código da aplicação
COPY --chown=appuser:appuser . .

# Configurar variáveis de ambiente
ENV PORT=5359
ENV WORKERS=4
ENV IS_DOCKER=true
ENV FLASK_APP=wsgi.py
ENV FLASK_ENV=production
ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Trocar para usuário não-root
USER appuser

# Expor a porta
EXPOSE ${PORT}

# Healthcheck para verificar se a aplicação está funcionando
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Comando para iniciar a aplicação
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT} --workers ${WORKERS} --threads 2 --timeout 3600 --access-logfile /app/logs/access.log --error-logfile /app/logs/error.log --log-level info wsgi:app"] 