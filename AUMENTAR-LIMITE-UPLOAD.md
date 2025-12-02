# Guia: Aumentar Limite de Upload de 100MB para 1GB + Corrigir Timeouts

Este documento contém instruções COMPLETAS para aumentar o limite de upload de arquivos de áudio de 100MB para 1GB e corrigir todos os timeouts no servidor de produção.

## 📋 Índice

- [PARTE 1: Aumentar Limite de Upload](#parte-1-aumentar-limite-de-upload)
- [PARTE 2: Corrigir Timeouts](#parte-2-corrigir-timeouts-para-arquivos-grandes)
- [Comandos Completos](#comandos-completos-para-aplicar-no-servidor)
- [Verificação e Testes](#verificação-pós-deploy)

---

# PARTE 1: Aumentar Limite de Upload

## Arquivos que precisam ser modificados

### 1. Frontend - Template HTML
**Arquivo:** `app/templates/admin/transcricao.html`

**Linha 134:** Alterar texto informativo
```html
<!-- DE: -->
<p class="text-xs text-gray-400 mt-2">Formatos suportados: MP3, WAV, M4A, FLAC, OGG, OPUS (máx. 100MB)</p>

<!-- PARA: -->
<p class="text-xs text-gray-400 mt-2">Formatos suportados: MP3, WAV, M4A, FLAC, OGG, OPUS (máx. 1GB)</p>
```

**Linha 326:** Alterar validação JavaScript
```javascript
// DE:
const maxSize = 100 * 1024 * 1024; // 100MB

// PARA:
const maxSize = 1024 * 1024 * 1024; // 1GB
```

**Linha 341:** Alterar mensagem de erro
```javascript
// DE:
if (file.size > maxSize) {
    alert('Arquivo muito grande. Máximo 100MB.');
    return;
}

// PARA:
if (file.size > maxSize) {
    alert('Arquivo muito grande. Máximo 1GB.');
    return;
}
```

### 2. Backend - Configuração Flask
**Arquivo:** `app/__init__.py`

**Após linha 15:** Adicionar configuração de limite de upload
```python
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'dev-secret-key')

# Configurar limite de upload para 1GB
app.config['MAX_CONTENT_LENGTH'] = int(os.getenv('MAX_CONTENT_LENGTH', 1024)) * 1024 * 1024

# Configurações para trabalhar corretamente com Cloudflared/proxy
app.config['PREFERRED_URL_SCHEME'] = 'https'
```

### 3. Nginx - Configuração de Proxy
**Arquivo:** `nginx.conf`

**Após linha 26:** Adicionar limite de upload no bloco http
```nginx
# Gzip compression
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

# Aumentar limite de upload para 1GB
client_max_body_size 1024M;

# Security headers
```

### 4. Variáveis de Ambiente
**Arquivo:** `production.env.example` (linha 87-88)

```bash
# DE:
# Tamanho máximo de upload em MB
MAX_CONTENT_LENGTH=16

# PARA:
# Tamanho máximo de upload em MB (1024 = 1GB)
MAX_CONTENT_LENGTH=1024
```

**Arquivo de produção:** `.env` (criar/atualizar no servidor)
```bash
# Adicionar ou atualizar esta linha:
MAX_CONTENT_LENGTH=1024
```

## Comandos para aplicar no servidor

### Passo 1: Fazer backup dos arquivos
```bash
cd /caminho/do/projeto
cp app/templates/admin/transcricao.html app/templates/admin/transcricao.html.backup
cp app/__init__.py app/__init__.py.backup
cp nginx.conf nginx.conf.backup
cp .env .env.backup
```

### Passo 2: Aplicar as alterações
Edite os arquivos conforme descrito acima usando `nano`, `vim` ou outro editor:

```bash
# Editar template HTML
nano app/templates/admin/transcricao.html

# Editar configuração Flask
nano app/__init__.py

# Editar configuração Nginx
nano nginx.conf

# Atualizar variável de ambiente
nano .env
```

### Passo 3: Reiniciar os serviços
```bash
# Se estiver usando Docker Compose:
docker-compose restart

# Ou reiniciar serviços específicos:
docker-compose restart chatbot-assistant
docker-compose restart nginx

# Verificar logs para confirmar que não há erros:
docker-compose logs -f chatbot-assistant
docker-compose logs -f nginx
```

### Passo 4: Verificar se as alterações funcionaram
```bash
# Verificar configuração do Nginx
docker-compose exec nginx nginx -t

# Verificar logs da aplicação
docker-compose logs -f chatbot-assistant

# Testar upload de arquivo grande (se possível)
```

## Verificação pós-deploy

1. Acesse a interface de transcrição
2. Verifique se o texto mostra "máx. 1GB" em vez de "máx. 100MB"
3. Teste o upload de um arquivo maior que 100MB (mas menor que 1GB)
4. Confirme que o arquivo é aceito e processado corretamente

## Rollback (se necessário)

Se algo der errado, restaure os backups:

```bash
cp app/templates/admin/transcricao.html.backup app/templates/admin/transcricao.html
cp app/__init__.py.backup app/__init__.py
cp nginx.conf.backup nginx.conf
cp .env.backup .env
docker-compose restart
```

## Resumo das alterações

| Arquivo | Linha | Alteração |
|---------|-------|-----------|
| `transcricao.html` | 134 | Texto: "máx. 100MB" → "máx. 1GB" |
| `transcricao.html` | 326 | JavaScript: `100 * 1024 * 1024` → `1024 * 1024 * 1024` |
| `transcricao.html` | 341 | Mensagem: "Máximo 100MB" → "Máximo 1GB" |
| `app/__init__.py` | ~17-18 | Adicionar `MAX_CONTENT_LENGTH = 1GB` |
| `nginx.conf` | ~29 | Adicionar `client_max_body_size 1024M;` |
| `.env` | - | `MAX_CONTENT_LENGTH=1024` |

## PARTE 2: CORRIGIR TIMEOUTS PARA ARQUIVOS GRANDES

### Problema identificado
Mesmo com o limite de 1GB configurado, arquivos acima de 250MB estavam falhando com erro:
```
Timeout após 300 segundos. Tente novamente com um arquivo menor.
```

### Arquivos de timeout que precisam ser ajustados

#### 5. Timeout de polling - `app/routes.py`
**Linha 3562:** Aumentar tempo máximo de espera
```python
# DE:
max_wait_time = 300  # 5 minutos

# PARA:
max_wait_time = 3600  # 60 minutos (1 hora) para arquivos grandes
```

#### 6. Timeouts do Nginx - `nginx.conf`
**Linhas 68-73 e 125-130:** Aumentar todos os timeouts (aparecem 2 vezes no arquivo)
```nginx
# DE:
# Timeouts
proxy_connect_timeout 30s;
proxy_send_timeout 30s;
proxy_read_timeout 30s;

# PARA:
# Timeouts (aumentados para suportar uploads e processamento de arquivos grandes)
proxy_connect_timeout 60s;
proxy_send_timeout 3600s;
proxy_read_timeout 3600s;
```

#### 7. Timeout do Gunicorn - `Dockerfile`
**Linha 51:** Aumentar timeout do worker
```dockerfile
# DE:
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT} --workers ${WORKERS} --threads 2 --timeout 120 --access-logfile /app/logs/access.log --error-logfile /app/logs/error.log --log-level info wsgi:app"]

# PARA:
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT} --workers ${WORKERS} --threads 2 --timeout 3600 --access-logfile /app/logs/access.log --error-logfile /app/logs/error.log --log-level info wsgi:app"]
```

#### 8. Timeout de upload - `app/services/transcriber_client.py`
**Linha 18:** Aumentar timeout de upload
```python
# DE:
self.timeout = 30

# PARA:
self.timeout = 600  # 10 minutos para upload de arquivos grandes
```

### ✅ Configurações que JÁ ESTÃO CORRETAS

#### Celery Worker - `docker-compose.yml` (linha 105)
```yaml
command: ["celery", "-A", "tasks", "worker", "--loglevel=info", "--time-limit=7200", "--soft-time-limit=7000", "--concurrency=2"]
```
✅ **2 horas** de limite - suficiente para processar arquivos grandes

#### Redis - `docker-compose.yml` (linha 146)
```yaml
--maxmemory 256mb
```
✅ Redis apenas armazena metadados, não os arquivos completos

### Resumo completo de timeouts

| Componente | Antes | Depois | Motivo |
|------------|-------|--------|--------|
| Polling (routes.py) | 300s (5min) | 3600s (1h) | Tempo de espera pelo processamento |
| Nginx read_timeout | 30s | 3600s (1h) | Aguardar resposta do backend |
| Nginx send_timeout | 30s | 3600s (1h) | Envio de dados grandes |
| Nginx connect_timeout | 30s | 60s | Estabelecer conexão |
| Gunicorn timeout | 120s (2min) | 3600s (1h) | Worker processar requisição |
| Upload timeout | 30s | 600s (10min) | Upload de arquivo grande |
| Celery worker | 7200s (2h) | 7200s (2h) | ✅ Já adequado |

---

# 🚀 GUIA PASSO A PASSO PARA APLICAR NO SERVIDOR

## ⚠️ ATENÇÃO ANTES DE COMEÇAR

**IMPORTANTE:** Este guia faz 10 alterações em 7 arquivos diferentes. Leia tudo antes de começar!

### Pré-requisitos
- Acesso SSH ao servidor
- Permissões para editar arquivos e executar Docker
- Tempo estimado: 20-30 minutos
- **Downtime:** Sim, ~2-3 minutos durante o rebuild

---

## 📝 PASSO 1: Conectar ao Servidor e Fazer Backup

```bash
# Conectar ao servidor
ssh usuario@seu-servidor.com

# Navegar até o diretório do projeto
cd /var/www/chatbot-assistant-new
# OU o caminho onde seu projeto está

# FAZER BACKUP DE TODOS OS ARQUIVOS
cp app/templates/admin/transcricao.html app/templates/admin/transcricao.html.backup
cp app/__init__.py app/__init__.py.backup
cp app/routes.py app/routes.py.backup
cp app/services/transcriber_client.py app/services/transcriber_client.py.backup
cp nginx.conf nginx.conf.backup
cp Dockerfile Dockerfile.backup
cp .env .env.backup 2>/dev/null || echo ".env não existe, será criado"

# Verificar se os backups foram criados
ls -la *.backup app/*.backup app/templates/admin/*.backup app/services/*.backup
```

---

## 📝 PASSO 2: Editar Arquivo 1 - Frontend (transcricao.html)

```bash
nano app/templates/admin/transcricao.html
```

**Alteração 1 (Linha ~134):** Pressione `Ctrl+W` para buscar, digite `máx. 100MB` e altere:
```html
DE:  <p class="text-xs text-gray-400 mt-2">Formatos suportados: MP3, WAV, M4A, FLAC, OGG, OPUS (máx. 100MB)</p>
PARA: <p class="text-xs text-gray-400 mt-2">Formatos suportados: MP3, WAV, M4A, FLAC, OGG, OPUS (máx. 1GB)</p>
```

**Alteração 2 (Linha ~326):** Pressione `Ctrl+W`, busque `const maxSize = 100` e altere:
```javascript
DE:  const maxSize = 100 * 1024 * 1024; // 100MB
PARA: const maxSize = 1024 * 1024 * 1024; // 1GB
```

**Alteração 3 (Linha ~341):** Pressione `Ctrl+W`, busque `Máximo 100MB` e altere:
```javascript
DE:  alert('Arquivo muito grande. Máximo 100MB.');
PARA: alert('Arquivo muito grande. Máximo 1GB.');
```

Salvar: `Ctrl+O`, `Enter`, Sair: `Ctrl+X`

---

## 📝 PASSO 3: Editar Arquivo 2 - Configuração Flask (__init__.py)

```bash
nano app/__init__.py
```

**Alteração 4 (Após linha ~15):** Adicionar DUAS novas linhas após `app.secret_key = ...`
```python
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'dev-secret-key')

# Configurar limite de upload para 1GB
app.config['MAX_CONTENT_LENGTH'] = int(os.getenv('MAX_CONTENT_LENGTH', 1024)) * 1024 * 1024

# Configurações para trabalhar corretamente com Cloudflared/proxy
```

Salvar: `Ctrl+O`, `Enter`, Sair: `Ctrl+X`

---

## 📝 PASSO 4: Editar Arquivo 3 - Timeout de Polling (routes.py)

```bash
nano app/routes.py
```

**Alteração 5 (Linha ~3562):** Pressione `Ctrl+W`, busque `max_wait_time = 300` e altere:
```python
DE:  max_wait_time = 300  # 5 minutos
PARA: max_wait_time = 3600  # 60 minutos (1 hora) para arquivos grandes
```

Salvar: `Ctrl+O`, `Enter`, Sair: `Ctrl+X`

---

## 📝 PASSO 5: Editar Arquivo 4 - Timeout de Upload (transcriber_client.py)

```bash
nano app/services/transcriber_client.py
```

**Alteração 6 (Linha ~18):** Pressione `Ctrl+W`, busque `self.timeout = 30` e altere:
```python
DE:  self.timeout = 30
PARA: self.timeout = 600  # 10 minutos para upload de arquivos grandes
```

Salvar: `Ctrl+O`, `Enter`, Sair: `Ctrl+X`

---

## 📝 PASSO 6: Editar Arquivo 5 - Nginx (nginx.conf)

```bash
nano nginx.conf
```

**Alteração 7 (Após linha ~26):** Adicionar DUAS linhas após `gzip_types ...`:
```nginx
gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

# Aumentar limite de upload para 1GB
client_max_body_size 1024M;

# Security headers
```

**Alteração 8 (Linhas ~68-73):** Buscar primeiro bloco de timeouts e alterar:
```nginx
DE:
# Timeouts
proxy_connect_timeout 30s;
proxy_send_timeout 30s;
proxy_read_timeout 30s;

PARA:
# Timeouts (aumentados para suportar uploads e processamento de arquivos grandes)
proxy_connect_timeout 60s;
proxy_send_timeout 3600s;
proxy_read_timeout 3600s;
```

**Alteração 9 (Linhas ~125-130):** Buscar segundo bloco de timeouts (mais abaixo no arquivo) e fazer a MESMA alteração:
```nginx
DE:
# Timeouts
proxy_connect_timeout 30s;
proxy_send_timeout 30s;
proxy_read_timeout 30s;

PARA:
# Timeouts (aumentados para suportar uploads e processamento de arquivos grandes)
proxy_connect_timeout 60s;
proxy_send_timeout 3600s;
proxy_read_timeout 3600s;
```

Salvar: `Ctrl+O`, `Enter`, Sair: `Ctrl+X`

---

## 📝 PASSO 7: Editar Arquivo 6 - Gunicorn Timeout (Dockerfile)

```bash
nano Dockerfile
```

**Alteração 10 (Linha ~51):** Buscar `--timeout 120` e alterar:
```dockerfile
DE:  CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT} --workers ${WORKERS} --threads 2 --timeout 120 --access-logfile /app/logs/access.log --error-logfile /app/logs/error.log --log-level info wsgi:app"]

PARA: CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT} --workers ${WORKERS} --threads 2 --timeout 3600 --access-logfile /app/logs/access.log --error-logfile /app/logs/error.log --log-level info wsgi:app"]
```

Salvar: `Ctrl+O`, `Enter`, Sair: `Ctrl+X`

---

## 📝 PASSO 8: Editar/Criar Arquivo 7 - Variável de Ambiente (.env)

```bash
# Verificar se .env existe
ls -la .env

# Se existir, editar
nano .env

# Se não existir, criar a partir do exemplo
cp production.env.example .env
nano .env
```

**Adicionar ou alterar esta linha:**
```bash
MAX_CONTENT_LENGTH=1024
```

Salvar: `Ctrl+O`, `Enter`, Sair: `Ctrl+X`

---

## 📝 PASSO 9: Verificar Todas as Alterações

```bash
# Verificar se todas as alterações foram feitas
echo "=== Verificando alterações ==="

# 1. Verificar transcricao.html
echo "1. Verificando frontend (deve mostrar 1GB):"
grep "máx. 1GB" app/templates/admin/transcricao.html
grep "1024 \* 1024 \* 1024" app/templates/admin/transcricao.html

# 2. Verificar __init__.py
echo "2. Verificando Flask config (deve mostrar MAX_CONTENT_LENGTH):"
grep "MAX_CONTENT_LENGTH" app/__init__.py

# 3. Verificar routes.py
echo "3. Verificando timeout de polling (deve mostrar 3600):"
grep "max_wait_time = 3600" app/routes.py

# 4. Verificar transcriber_client.py
echo "4. Verificando timeout de upload (deve mostrar 600):"
grep "self.timeout = 600" app/services/transcriber_client.py

# 5. Verificar nginx.conf
echo "5. Verificando nginx (deve mostrar 1024M e 3600s):"
grep "client_max_body_size 1024M" nginx.conf
grep "proxy_read_timeout 3600s" nginx.conf

# 6. Verificar Dockerfile
echo "6. Verificando Gunicorn (deve mostrar timeout 3600):"
grep "timeout 3600" Dockerfile

# 7. Verificar .env
echo "7. Verificando .env:"
grep "MAX_CONTENT_LENGTH" .env

echo "=== Verificação completa! ==="
```

---

## 📝 PASSO 10: Rebuild e Restart (DOWNTIME ~2-3 minutos)

```bash
# ATENÇÃO: Os comandos abaixo vão derrubar o serviço temporariamente!

# Parar todos os containers
docker-compose down

# Rebuild do container principal (necessário por causa do Dockerfile)
docker-compose build --no-cache chatbot-assistant

# Subir todos os serviços
docker-compose up -d

# Aguardar containers iniciarem
sleep 10

# Verificar status
docker-compose ps
```

---

## 📝 PASSO 11: Verificar Logs

```bash
# Verificar se há erros nos logs
echo "=== Logs do chatbot-assistant ==="
docker-compose logs --tail=50 chatbot-assistant

echo "=== Logs do nginx ==="
docker-compose logs --tail=50 nginx

echo "=== Logs do transcrever ==="
docker-compose logs --tail=50 transcrever-new

# Testar configuração do Nginx
docker-compose exec nginx nginx -t
```

---

## 📝 PASSO 12: Teste Final

```bash
# Verificar health dos serviços
curl http://localhost:5359/health
curl http://localhost:3024/healthcheck

# Se tudo estiver OK, você verá:
# {"status": "ok"} ou similar
```

## Resumo das alterações COMPLETO

| Arquivo | Linha | Alteração | Tipo |
|---------|-------|-----------|------|
| `transcricao.html` | 134 | "máx. 100MB" → "máx. 1GB" | Limite |
| `transcricao.html` | 326 | `100 * 1024 * 1024` → `1024 * 1024 * 1024` | Limite |
| `transcricao.html` | 341 | "Máximo 100MB" → "Máximo 1GB" | Limite |
| `app/__init__.py` | ~17-18 | Adicionar `MAX_CONTENT_LENGTH = 1GB` | Limite |
| `nginx.conf` | ~29 | `client_max_body_size 1024M;` | Limite |
| `app/routes.py` | 3562 | `300` → `3600` segundos | Timeout |
| `nginx.conf` | 68-73 | Timeouts de 30s → 3600s | Timeout |
| `nginx.conf` | 125-130 | Timeouts de 30s → 3600s | Timeout |
| `Dockerfile` | 51 | Gunicorn timeout `120` → `3600` | Timeout |
| `transcriber_client.py` | 18 | `timeout = 30` → `600` | Timeout |
| `.env` | - | `MAX_CONTENT_LENGTH=1024` | Limite |

---

## 🎯 Teste na Interface Web

1. Acesse o painel de transcrição: `https://seu-dominio.com/admin/transcricao`
2. Tente fazer upload de um arquivo de áudio com mais de 100MB
3. Verifique se o texto mostra "máx. 1GB"
4. Inicie a transcrição e monitore o progresso
5. Arquivos grandes (250MB+) podem levar 15-30 minutos para processar

---

## 🔄 Rollback (se algo der errado)

```bash
# Restaurar todos os arquivos dos backups
cp app/templates/admin/transcricao.html.backup app/templates/admin/transcricao.html
cp app/__init__.py.backup app/__init__.py
cp app/routes.py.backup app/routes.py
cp app/services/transcriber_client.py.backup app/services/transcriber_client.py
cp nginx.conf.backup nginx.conf
cp Dockerfile.backup Dockerfile
cp .env.backup .env

# Rebuild e restart
docker-compose down
docker-compose build --no-cache chatbot-assistant
docker-compose up -d
```

---

## 📊 Checklist de Verificação Final

- [ ] ✅ Backup de todos os arquivos criado
- [ ] ✅ 10 alterações aplicadas em 7 arquivos
- [ ] ✅ Script de verificação executado sem erros
- [ ] ✅ Containers rebuilded e reiniciados
- [ ] ✅ Logs verificados (sem erros críticos)
- [ ] ✅ Health checks passando
- [ ] ✅ Interface mostra "máx. 1GB"
- [ ] ✅ Teste com arquivo > 100MB realizado

---

## ❓ Troubleshooting

### Problema: Nginx não inicia após restart
**Solução:**
```bash
# Testar configuração
docker-compose exec nginx nginx -t

# Se houver erro de sintaxe, restaurar backup
cp nginx.conf.backup nginx.conf
docker-compose restart nginx
```

### Problema: Upload ainda falha com timeout
**Verificar:**
```bash
# Ver se todas as alterações de timeout foram aplicadas
grep "3600" app/routes.py Dockerfile nginx.conf
grep "600" app/services/transcriber_client.py

# Se algum não aparecer, refazer a edição
```

### Problema: Erro 413 "Request Entity Too Large"
**Verificar:**
```bash
# Confirmar que client_max_body_size está no nginx.conf
grep "client_max_body_size" nginx.conf

# Deve retornar: client_max_body_size 1024M;
```

### Problema: Container não sobe após rebuild
**Solução:**
```bash
# Ver logs detalhados
docker-compose logs chatbot-assistant

# Verificar se há erro de sintaxe Python
docker-compose exec chatbot-assistant python -m py_compile app/__init__.py
docker-compose exec chatbot-assistant python -m py_compile app/routes.py
```

---

## 📝 Observações Importantes

- ⚠️ **Espaço em disco:** Certifique-se de ter pelo menos 10GB livres para processar arquivos de 1GB
- ⚠️ **Rebuild obrigatório:** Por causa do Dockerfile, o rebuild não é opcional
- ⚠️ **Tempo de processamento:** Arquivos grandes podem levar até 1 hora
- ⚠️ **RAM:** Transcrições grandes podem usar até 1.5GB de RAM
- ⚠️ **Downtime:** Planeje para ~2-3 minutos de indisponibilidade
- ✅ **Celery e Redis:** Já estavam corretamente configurados (2 horas de limite)
- 💡 **Dica:** Execute as alterações em horário de baixo tráfego

---

## 📚 Documentação Técnica

### Timeouts Configurados

| Camada | Componente | Timeout | Propósito |
|--------|------------|---------|-----------|
| Frontend | JavaScript | N/A | Validação apenas |
| Upload | transcriber_client | 600s (10min) | Upload do arquivo para microserviço |
| Processing | Celery Worker | 7200s (2h) | Processamento AssemblyAI |
| Polling | routes.py | 3600s (1h) | Aguardar resultado |
| HTTP | Nginx | 3600s (1h) | Proxy reverso |
| WSGI | Gunicorn | 3600s (1h) | Worker Python |

### Fluxo de Upload Completo

1. **Frontend:** Usuário seleciona arquivo (validação 1GB)
2. **Upload:** Arquivo enviado para backend Flask (timeout 600s)
3. **Backend:** Flask salva temporariamente e envia para microserviço
4. **Microserviço:** Recebe arquivo e cria task Celery
5. **Celery Worker:** Processa com AssemblyAI (até 7200s)
6. **Polling:** Backend Flask verifica status a cada 3s (até 3600s)
7. **Download:** Backend baixa resultado e entrega para usuário
8. **Cleanup:** Arquivos temporários removidos

---

## ✅ Conclusão

Após seguir todos os passos, seu servidor estará configurado para:

- ✅ Aceitar uploads de até **1GB**
- ✅ Processar transcrições por até **1 hora**
- ✅ Suportar arquivos grandes sem timeout
- ✅ Manter compatibilidade com arquivos pequenos

**Tempo total estimado:** 20-30 minutos
**Downtime:** ~2-3 minutos durante rebuild
**Alterações:** 10 modificações em 7 arquivos
