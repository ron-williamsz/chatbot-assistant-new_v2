#!/bin/bash

# Script de Verificação Pré-Deploy
# Verifica se todos os requisitos estão atendidos antes do deploy

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Contadores
CHECKS_PASSED=0
CHECKS_FAILED=0
WARNINGS=0

# Função para log colorido
success() {
    echo -e "${GREEN}✓ $1${NC}"
    ((CHECKS_PASSED++))
}

error() {
    echo -e "${RED}✗ $1${NC}"
    ((CHECKS_FAILED++))
}

warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
    ((WARNINGS++))
}

info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

echo "🔍 Verificando pré-requisitos para deploy..."
echo "=============================================="

# Verificar se estamos no diretório correto
if [ -f "docker-compose.simple.yml" ] && [ -f "app.py" ]; then
    success "Diretório do projeto correto"
else
    error "Não está no diretório raiz do projeto"
    exit 1
fi

# Verificar Git
if [ -d ".git" ]; then
    success "Repositório Git inicializado"
    
    # Verificar se há mudanças não commitadas
    if git diff-index --quiet HEAD --; then
        success "Todas as mudanças estão commitadas"
    else
        warning "Há mudanças não commitadas"
        git status --porcelain
    fi
    
    # Verificar se há remote configurado
    if git remote -v | grep -q origin; then
        success "Remote origin configurado"
        info "Remote: $(git remote get-url origin)"
    else
        warning "Remote origin não configurado"
        info "Configure com: git remote add origin https://github.com/SEU_USUARIO/chatbot-assistant.git"
    fi
else
    error "Repositório Git não inicializado"
    info "Execute: git init"
fi

# Verificar arquivos essenciais
ESSENTIAL_FILES=(
    "docker-compose.simple.yml"
    "Dockerfile"
    "requirements.txt"
    "app.py"
    "wsgi.py"
    "app/__init__.py"
    "app/routes.py"
    "app/database.py"
)

for file in "${ESSENTIAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        success "Arquivo $file existe"
    else
        error "Arquivo $file não encontrado"
    fi
done

# Verificar estrutura de diretórios
ESSENTIAL_DIRS=(
    "app"
    "app/templates"
    "app/static"
    "app/services"
    "app/security"
)

for dir in "${ESSENTIAL_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        success "Diretório $dir existe"
    else
        error "Diretório $dir não encontrado"
    fi
done

# Verificar scripts de deploy
if [ -f "deploy-production.sh" ] && [ -x "deploy-production.sh" ]; then
    success "Script de deploy existe e é executável"
else
    error "Script de deploy não encontrado ou não é executável"
    info "Execute: chmod +x deploy-production.sh"
fi

# Verificar configurações de exemplo
if [ -f "production.env.example" ]; then
    success "Arquivo de configuração de exemplo existe"
else
    warning "Arquivo production.env.example não encontrado"
fi

if [ -f "security-config.example.env" ]; then
    success "Arquivo de configuração de segurança existe"
else
    warning "Arquivo security-config.example.env não encontrado"
fi

# Verificar .gitignore
if [ -f ".gitignore" ]; then
    success "Arquivo .gitignore existe"
    
    # Verificar se ignora arquivos sensíveis
    if grep -q ".env" .gitignore && grep -q "*.log" .gitignore; then
        success ".gitignore configurado corretamente"
    else
        warning ".gitignore pode não estar completo"
    fi
else
    error "Arquivo .gitignore não encontrado"
fi

# Verificar Docker Compose
if command -v docker-compose &> /dev/null; then
    success "Docker Compose está instalado"
    
    # Verificar sintaxe do docker-compose
    if docker-compose -f docker-compose.simple.yml config > /dev/null 2>&1; then
        success "docker-compose.simple.yml tem sintaxe válida"
    else
        error "docker-compose.simple.yml tem erro de sintaxe"
    fi
else
    warning "Docker Compose não está instalado localmente"
    info "Isso é normal se você só vai fazer deploy remoto"
fi

# Verificar se há arquivos grandes que não deveriam estar no Git
info "Verificando arquivos grandes..."
LARGE_FILES=$(find . -type f -size +10M 2>/dev/null | grep -v ".git" | head -5)
if [ -n "$LARGE_FILES" ]; then
    warning "Arquivos grandes encontrados (>10MB):"
    echo "$LARGE_FILES"
    info "Considere adicionar ao .gitignore se não forem necessários"
else
    success "Nenhum arquivo muito grande encontrado"
fi

# Verificar se há arquivos executáveis desnecessários
if [ -f "cloudflared.exe" ] || [ -f "ngrok.exe" ]; then
    warning "Executáveis encontrados (cloudflared.exe, ngrok.exe)"
    info "Estes arquivos estão no .gitignore e não serão enviados"
fi

# Verificar documentação
if [ -f "README-DEPLOY.md" ]; then
    success "Documentação de deploy existe"
else
    warning "README-DEPLOY.md não encontrado"
fi

if [ -f "SECURITY-SQLite.md" ]; then
    success "Documentação de segurança existe"
else
    warning "SECURITY-SQLite.md não encontrado"
fi

# Resumo final
echo ""
echo "=============================================="
echo "📊 RESUMO DA VERIFICAÇÃO"
echo "=============================================="
echo -e "${GREEN}✓ Verificações passaram: $CHECKS_PASSED${NC}"
echo -e "${RED}✗ Verificações falharam: $CHECKS_FAILED${NC}"
echo -e "${YELLOW}⚠ Avisos: $WARNINGS${NC}"

if [ $CHECKS_FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 Projeto pronto para deploy!${NC}"
    echo ""
    echo "Próximos passos:"
    echo "1. Crie um repositório no GitHub"
    echo "2. Configure o remote: git remote add origin https://github.com/SEU_USUARIO/chatbot-assistant.git"
    echo "3. Faça push: git push -u origin main"
    echo "4. Edite deploy-production.sh com a URL correta do repositório"
    echo "5. Execute: ./deploy-production.sh"
    
    if [ $WARNINGS -gt 0 ]; then
        echo ""
        echo -e "${YELLOW}⚠ Há alguns avisos acima que você pode querer revisar.${NC}"
    fi
else
    echo ""
    echo -e "${RED}❌ Há problemas que precisam ser corrigidos antes do deploy.${NC}"
    echo "Revise os erros acima e tente novamente."
    exit 1
fi 