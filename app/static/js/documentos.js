// JavaScript para a página de documentos (usuários comuns)

let currentTab = 'multas';
let allMultas = [];
let allAdvertencias = [];
let assistants = [];
let documentoId = null;

// Função para carregar estatísticas
async function carregarEstatisticas() {
    try {
        const response = await fetch('/api/documentos/estatisticas');
        const stats = await response.json();
        
        const container = document.getElementById('statsContainer');
        container.innerHTML = `
            <div class="stats-card bg-white rounded-lg shadow-sm p-6">
                <div class="flex items-center">
                    <div class="p-3 rounded-full bg-red-100">
                        <i class="fas fa-dollar-sign text-2xl text-red-600"></i>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600">Total de Multas</p>
                        <p class="text-2xl font-semibold text-gray-900">${stats.total_multas || 0}</p>
                    </div>
                </div>
            </div>
            
            <div class="stats-card bg-white rounded-lg shadow-sm p-6">
                <div class="flex items-center">
                    <div class="p-3 rounded-full bg-orange-100">
                        <i class="fas fa-exclamation-triangle text-2xl text-orange-600"></i>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600">Total Advertências</p>
                        <p class="text-2xl font-semibold text-gray-900">${stats.total_advertencias || 0}</p>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
    }
}

// Função para carregar assistentes
async function carregarAssistants() {
    try {
        const response = await fetch('/list-assistants');
        const data = await response.json();
        assistants = data.assistants || [];
    } catch (error) {
        console.error('Erro ao carregar assistentes:', error);
    }
}

// Função para alterar aba
function alterarAba(tipo) {
    currentTab = tipo;
    
    // Atualizar visual das abas
    document.getElementById('tabMultas').classList.toggle('active', tipo === 'multas');
    document.getElementById('tabAdvertencias').classList.toggle('active', tipo === 'advertencias');
    
    // Atualizar texto do botão
    const btnTexto = document.getElementById('btnNovoTexto');
    btnTexto.textContent = tipo === 'multas' ? 'Nova Multa' : 'Nova Advertência';
    
    // Carregar documentos do tipo selecionado
    carregarDocumentos(tipo);
}

// Função para carregar documentos
async function carregarDocumentos(tipo) {
    try {
        const endpoint = tipo === 'multas' ? '/api/multas' : '/api/advertencias';
        const response = await fetch(endpoint);
        const data = await response.json();
        
        if (tipo === 'multas') {
            allMultas = data || [];
            renderizarMultas(allMultas);
        } else {
            allAdvertencias = data || [];
            renderizarAdvertencias(allAdvertencias);
        }
    } catch (error) {
        console.error(`Erro ao carregar ${tipo}:`, error);
        showToast(`Erro ao carregar ${tipo}`, 'error');
    }
}

// Função para renderizar multas
function renderizarMultas(multas) {
    const container = document.getElementById('documentosContainer');
    
    if (multas.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-dollar-sign text-6xl text-gray-300 mb-4"></i>
                <p class="text-gray-500">Nenhuma multa encontrada</p>
            </div>
        `;
        return;
    }
    
    const html = multas.map(multa => `
        <div class="document-item border-b border-gray-100 p-4 hover:bg-gray-50">
            <div class="flex justify-between items-start">
                <div class="flex-1">
                    <div class="flex items-center space-x-4 mb-2">
                        <h3 class="font-semibold text-gray-900">Multa #${multa.numero_multa}</h3>
                        <span class="status-badge status-${multa.status}">${multa.status}</span>
                    </div>
                    <p class="text-sm text-gray-600 mb-1">Unidade: ${multa.unidade}</p>
                    <p class="text-sm text-gray-600 mb-1">Valor: R$ ${multa.valor}</p>
                    <p class="text-sm text-gray-600">Data: ${new Date(multa.data_infracao * 1000).toLocaleDateString('pt-BR')}</p>
                </div>
                <div class="flex space-x-2">
                    ${multa.arquivo_documento ? `<a href="${multa.arquivo_documento}" target="_blank" class="text-blue-600 hover:text-blue-800"><i class="fas fa-download"></i></a>` : ''}
                    <button onclick="editarDocumento('multa', ${multa.id})" class="text-gray-600 hover:text-gray-800">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

// Função para renderizar advertências
function renderizarAdvertencias(advertencias) {
    const container = document.getElementById('documentosContainer');
    
    if (advertencias.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-exclamation-triangle text-6xl text-gray-300 mb-4"></i>
                <p class="text-gray-500">Nenhuma advertência encontrada</p>
            </div>
        `;
        return;
    }
    
    const html = advertencias.map(advertencia => `
        <div class="document-item border-b border-gray-100 p-4 hover:bg-gray-50">
            <div class="flex justify-between items-start">
                <div class="flex-1">
                    <div class="flex items-center space-x-4 mb-2">
                        <h3 class="font-semibold text-gray-900">Advertência #${advertencia.numero_advertencia}</h3>
                        <span class="status-badge status-ativa">Ativa</span>
                    </div>
                    <p class="text-sm text-gray-600 mb-1">Unidade: ${advertencia.unidade}</p>
                    <p class="text-sm text-gray-600">Data: ${new Date(advertencia.data_ocorrencia * 1000).toLocaleDateString('pt-BR')}</p>
                </div>
                <div class="flex space-x-2">
                    ${advertencia.arquivo_documento ? `<a href="${advertencia.arquivo_documento}" target="_blank" class="text-blue-600 hover:text-blue-800"><i class="fas fa-download"></i></a>` : ''}
                    <button onclick="editarDocumento('advertencia', ${advertencia.id})" class="text-gray-600 hover:text-gray-800">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

// Função para mostrar toast de notificação
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';
    
    toast.className = `fixed top-4 right-4 ${bgColor} text-white px-6 py-4 rounded-lg shadow-lg z-50`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// Função para filtrar documentos
function filtrarDocumentos() {
    const unidade = document.getElementById('filterUnidade').value.toLowerCase();
    const status = document.getElementById('filterStatus').value;
    
    if (currentTab === 'multas') {
        let filtradas = allMultas;
        
        if (unidade) {
            filtradas = filtradas.filter(m => m.unidade.toLowerCase().includes(unidade));
        }
        
        if (status) {
            filtradas = filtradas.filter(m => m.status === status);
        }
        
        renderizarMultas(filtradas);
    } else {
        let filtradas = allAdvertencias;
        
        if (unidade) {
            filtradas = filtradas.filter(a => a.unidade.toLowerCase().includes(unidade));
        }
        
        renderizarAdvertencias(filtradas);
    }
}

// Função para limpar filtros
function limparFiltros() {
    document.getElementById('filterUnidade').value = '';
    document.getElementById('filterStatus').value = '';
    
    if (currentTab === 'multas') {
        renderizarMultas(allMultas);
    } else {
        renderizarAdvertencias(allAdvertencias);
    }
}

// Placeholder para outras funções
function abrirModalNovoDocumento() {
    const modal = document.getElementById('modalNovoDocumento');
    const title = document.getElementById('modalTitle');
    const form = document.getElementById('formDocumento');
    
    // Configurar título baseado na aba atual
    title.textContent = currentTab === 'multas' ? 'Nova Multa' : 'Nova Advertência';
    
    // Gerar campos do formulário baseado no tipo
    if (currentTab === 'multas') {
        form.innerHTML = gerarFormularioMulta();
    } else {
        form.innerHTML = gerarFormularioAdvertencia();
    }
    
    // Carregar assistentes no formulário
    carregarAssistentesFormulario();
    
    // Mostrar modal
    modal.classList.remove('hidden');
}

function gerarFormularioMulta() {
    return `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Unidade *</label>
                <input type="text" name="unidade" required
                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                       placeholder="Ex: 101, 203A">
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Bloco</label>
                <input type="text" name="bloco"
                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                       placeholder="Ex: A, B">
            </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Valor da Multa (R$) *</label>
                <input type="number" name="valor" step="0.01" min="0" required
                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                       placeholder="0,00">
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Data da Infração *</label>
                <input type="date" name="data_infracao" required
                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500">
            </div>
        </div>
        
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Condomínio/Assistente *</label>
            <select name="assistant_id" id="assistentSelect" required
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500">
                <option value="">Selecione o condomínio...</option>
            </select>
        </div>
        
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Descrição da Infração *</label>
            <textarea name="descricao" rows="4" required
                      class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="Descreva detalhadamente a infração cometida..."></textarea>
        </div>
        
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Observações</label>
            <textarea name="observacoes" rows="2"
                      class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="Observações adicionais (opcional)"></textarea>
        </div>
        
        <div class="flex items-center">
            <input type="checkbox" name="gerar_documento" id="gerarDocumento" checked
                   class="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded">
            <label for="gerarDocumento" class="ml-2 block text-sm text-gray-900">
                Gerar documento automaticamente com IA
            </label>
        </div>
        
        <div class="flex justify-end space-x-3 pt-6 border-t">
            <button type="button" onclick="fecharModal()"
                    class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">
                Cancelar
            </button>
            <button type="submit" id="btnCriarMulta"
                    class="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg">
                <span>Criar Multa</span>
            </button>
        </div>
    `;
}

function gerarFormularioAdvertencia() {
    return `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Unidade *</label>
                <input type="text" name="unidade" required
                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                       placeholder="Ex: 101, 203A">
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Bloco</label>
                <input type="text" name="bloco"
                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                       placeholder="Ex: A, B">
            </div>
        </div>
        
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Data da Ocorrência *</label>
            <input type="date" name="data_ocorrencia" required
                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500">
        </div>
        
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Condomínio/Assistente *</label>
            <select name="assistant_id" id="assistentSelect" required
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500">
                <option value="">Selecione o condomínio...</option>
            </select>
        </div>
        
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Descrição da Ocorrência *</label>
            <textarea name="descricao" rows="4" required
                      class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="Descreva detalhadamente a ocorrência..."></textarea>
        </div>
        
        <div class="flex items-center">
            <input type="checkbox" name="reincidente" id="reincidente"
                   class="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded">
            <label for="reincidente" class="ml-2 block text-sm text-gray-900">
                Reincidente
            </label>
        </div>
        
        <div class="flex items-center">
            <input type="checkbox" name="gerar_documento" id="gerarDocumento" checked
                   class="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded">
            <label for="gerarDocumento" class="ml-2 block text-sm text-gray-900">
                Gerar documento automaticamente com IA
            </label>
        </div>
        
        <div class="flex justify-end space-x-3 pt-6 border-t">
            <button type="button" onclick="fecharModal()"
                    class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">
                Cancelar
            </button>
            <button type="submit" id="btnCriarAdvertencia"
                    class="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg">
                <span>Criar Advertência</span>
            </button>
        </div>
    `;
}

async function carregarAssistentesFormulario() {
    const select = document.getElementById('assistentSelect');
    if (!select) return;
    
    try {
        if (assistants.length === 0) {
            await carregarAssistants();
        }
        
        // Limpar opções existentes (exceto a primeira)
        select.innerHTML = '<option value="">Selecione o condomínio...</option>';
        
        // Adicionar assistentes
        assistants.forEach(assistant => {
            const option = document.createElement('option');
            option.value = assistant.id;
            option.textContent = assistant.name || assistant.id;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar assistentes:', error);
        showToast('Erro ao carregar lista de condomínios', 'error');
    }
}

function editarDocumento(tipo, id) {
    showToast('Funcionalidade de edição em desenvolvimento', 'info');
}

function fecharModal() {
    document.getElementById('modalNovoDocumento').classList.add('hidden');
}

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    carregarEstatisticas();
    carregarAssistants();
    carregarDocumentos('multas');
    
    // Event listeners para as abas
    document.getElementById('tabMultas').addEventListener('click', () => {
        alterarAba('multas');
    });
    
    document.getElementById('tabAdvertencias').addEventListener('click', () => {
        alterarAba('advertencias');
    });
    
    // Event listener para o formulário
    document.getElementById('formDocumento').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (currentTab === 'multas') {
            await criarMulta(e);
        } else {
            await criarAdvertencia(e);
        }
    });
});

// Funções para criar documentos
async function criarMulta(e) {
    const btn = document.getElementById('btnCriarMulta');
    const btnText = btn.querySelector('span');
    const originalText = btnText.textContent;
    
    // Desabilitar botão e mostrar loading
    btn.disabled = true;
    btnText.textContent = 'Gerando...';
    
    try {
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);
        
        // Verificar se assistant_id foi selecionado
        if (!data.assistant_id) {
            throw new Error('Por favor, selecione um condomínio/assistente');
        }
        
        // Converter para o formato esperado pela API
        const multaData = {
            unidade: data.unidade,
            bloco: data.bloco || null,
            valor: parseFloat(data.valor),
            data_infracao: Math.floor(new Date(data.data_infracao).getTime() / 1000),
            descricao: data.descricao,
            observacoes: data.observacoes || null,
            assistant_id: data.assistant_id,
            status: 'pendente',
            gerar_documento: data.gerar_documento === 'on'
        };

        console.log('Enviando dados para criação de multa:', multaData);

        const response = await fetch('/api/multas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(multaData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erro ao criar multa');
        }

        const result = await response.json();

        // Se gerou documento, abrir em nova aba
        if (result.multa && result.multa.arquivo_documento) {
            window.open(result.multa.arquivo_documento, '_blank');
        }
        
        // Fechar modal e recarregar dados
        fecharModal();
        await carregarEstatisticas();
        await carregarDocumentos('multas');
        
        showToast('Multa criada com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro ao criar multa:', error);
        showToast(error.message || 'Erro ao criar multa', 'error');
    } finally {
        btn.disabled = false;
        btnText.textContent = originalText;
    }
}

async function criarAdvertencia(e) {
    const btn = document.getElementById('btnCriarAdvertencia');
    const btnText = btn.querySelector('span');
    const originalText = btnText.textContent;
    
    // Desabilitar botão e mostrar loading
    btn.disabled = true;
    btnText.textContent = 'Gerando...';
    
    try {
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);
        
        // Verificar se assistant_id foi selecionado
        if (!data.assistant_id) {
            throw new Error('Por favor, selecione um condomínio/assistente');
        }
        
        // Converter para o formato esperado pela API
        const advertenciaData = {
            unidade: data.unidade,
            bloco: data.bloco || null,
            data_ocorrencia: Math.floor(new Date(data.data_ocorrencia).getTime() / 1000),
            descricao: data.descricao,
            reincidente: data.reincidente === 'on',
            assistant_id: data.assistant_id,
            gerar_documento: data.gerar_documento === 'on'
        };

        console.log('Enviando dados para criação de advertência:', advertenciaData);

        const response = await fetch('/api/advertencias', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(advertenciaData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erro ao criar advertência');
        }

        const result = await response.json();

        // Se gerou documento, abrir em nova aba
        if (result.advertencia && result.advertencia.arquivo_documento) {
            window.open(result.advertencia.arquivo_documento, '_blank');
        }
        
        // Fechar modal e recarregar dados
        fecharModal();
        await carregarEstatisticas();
        await carregarDocumentos('advertencias');
        
        showToast('Advertência criada com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro ao criar advertência:', error);
        showToast(error.message || 'Erro ao criar advertência', 'error');
    } finally {
        btn.disabled = false;
        btnText.textContent = originalText;
    }
} 