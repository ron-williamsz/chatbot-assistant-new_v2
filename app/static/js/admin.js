// Funções auxiliares para mostrar/esconder o loading
function showLoading() {
    document.getElementById('loadingSpinner').style.display = 'block';
    document.getElementById('assistantList').style.display = 'none';
}

function hideLoading() {
    document.getElementById('loadingSpinner').style.display = 'none';
    document.getElementById('assistantList').style.display = 'block';
}

// Variáveis globais para controle de assistentes
let allAssistants = []; // Armazenar todos os assistentes carregados
let currentPage = 0;
let hasMoreAssistants = false;
let isLoading = false;
const pageSize = 100;

// Função para exibir os assistentes na lista - definida globalmente
function displayAssistants(assistantsToDisplay) {
    const assistantList = document.getElementById('assistantList');
    assistantList.innerHTML = ''; // Limpar lista
    
    if (assistantsToDisplay.length === 0) {
        const emptyItem = document.createElement('li');
        emptyItem.className = 'list-group-item text-center';
        
        if (currentPage === 0) {
            // Se for a primeira página e não tiver assistentes, adicionar mensagem especial
            emptyItem.innerHTML = `
                <div class="alert alert-warning mb-0">
                    <i class="fas fa-exclamation-triangle"></i> Nenhum assistente encontrado no banco de dados. 
                    <br>
                    <small>Use o botão "<b>Atualizar Assistentes da API</b>" para carregar assistentes da OpenAI.</small>
                </div>
            `;
        } else {
            emptyItem.textContent = 'Nenhum assistente encontrado';
        }
        
        assistantList.appendChild(emptyItem);
            return;
        }

    // Adicionar assistentes à lista
    assistantsToDisplay.forEach(assistant => {
            const listItem = document.createElement('li');
            listItem.className = 'list-group-item d-flex justify-content-between align-items-center';
            
            const infoSpan = document.createElement('span');
            infoSpan.textContent = assistant.name || 'Assistente sem nome';
            infoSpan.className = 'fw-medium';
            
            // Criar div para os botões
            const buttonGroup = document.createElement('div');
            buttonGroup.className = 'btn-group';
            
            // Botão de upload
            const uploadButton = document.createElement('button');
            uploadButton.className = 'btn btn-sm btn-outline-success me-2';
            uploadButton.innerHTML = '<i class="fas fa-upload"></i>';
            uploadButton.addEventListener('click', () => handleFileUpload(assistant.id, assistant.name));
            
            // Botão de editar
            const editButton = document.createElement('button');
            editButton.className = 'btn btn-sm btn-outline-primary me-2';
            editButton.innerHTML = '<i class="fas fa-edit"></i>';
            editButton.addEventListener('click', () => editAssistant(assistant.id, assistant.name, assistant.description, assistant.model, assistant.instructions));

            // Botão de deletar
            const deleteButton = document.createElement('button');
            deleteButton.className = 'btn btn-sm btn-outline-danger';
            deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
            deleteButton.addEventListener('click', () => deleteAssistant(assistant.id, assistant.name));

            // Adicionar botões ao grupo
            buttonGroup.appendChild(uploadButton);
            buttonGroup.appendChild(editButton);
            buttonGroup.appendChild(deleteButton);

            listItem.appendChild(infoSpan);
            listItem.appendChild(buttonGroup);
            assistantList.appendChild(listItem);
        });
    
    // Exibir botão "Carregar mais" se houver mais assistentes
    if (hasMoreAssistants) {
        updateLoadMoreButton();
    }
}

// Função para atualizar o botão "Carregar mais" - definida globalmente
function updateLoadMoreButton() {
    // Remover botão existente se houver
    const existingButton = document.getElementById('loadMoreButton');
    if (existingButton) {
        existingButton.remove();
    }
    
    // Adicionar novo botão se houver mais assistentes
    if (hasMoreAssistants) {
        const assistantList = document.getElementById('assistantList');
        const loadMoreItem = document.createElement('li');
        loadMoreItem.className = 'list-group-item text-center';
        
        const loadMoreButton = document.createElement('button');
        loadMoreButton.id = 'loadMoreButton';
        loadMoreButton.className = 'btn btn-sm btn-outline-primary';
        loadMoreButton.textContent = 'Carregar mais assistentes';
        loadMoreButton.addEventListener('click', () => loadAssistants());
        
        loadMoreItem.appendChild(loadMoreButton);
        assistantList.appendChild(loadMoreItem);
    }
}

// Função para carregar assistentes usando o banco de dados local - definida globalmente
async function loadAssistants(forceRefresh = false) {
    if (isLoading) return;
    isLoading = true;

    try {
        showLoading();
        
        // Construir a URL com parâmetros de paginação e pesquisa
        let url = `/admin/list-assistants?limit=${pageSize}&offset=${currentPage * pageSize}`;
        
        // Adicionar termo de pesquisa se existir
        const searchInput = document.getElementById('searchAssistantInput');
        const searchTerm = searchInput ? searchInput.value.trim() : '';
        if (searchTerm) {
            url += `&search=${encodeURIComponent(searchTerm)}`;
        }
        
        // Apenas buscar da API se explicitamente solicitado pelo botão de atualização
        // Nunca buscar automaticamente
        if (forceRefresh) {
            url += '&fetch_remote=true';
        } else {
            url += '&fetch_remote=false';
        }
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error('Erro ao carregar assistentes:', data.error);
            return;
        }
        
        // Se é a primeira página (ou pesquisa), limpar a lista
        if (currentPage === 0) {
            allAssistants = [];
        }
        
        // Adicionar assistentes recebidos à lista
        if (data.assistants && data.assistants.length > 0) {
            allAssistants = [...allAssistants, ...data.assistants];
            hasMoreAssistants = data.has_more;
            currentPage++;
        } else {
            hasMoreAssistants = false;
        }
        
        // Exibir os assistentes
        displayAssistants(allAssistants);
        
    } catch (error) {
        console.error('Erro ao carregar assistentes:', error);
    } finally {
        hideLoading();
        isLoading = false;
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    // Adicionar botão de sincronização ao lado do botão Criar Assistente
    const headerDiv = document.querySelector('.d-flex.justify-content-between.align-items-center.mb-4');
    const syncButton = document.createElement('button');
    syncButton.className = 'btn btn-success me-2';
    syncButton.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar Assistentes da API';
    syncButton.addEventListener('click', syncAssistants);
    
    // Inserir o botão ao lado do botão Criar Assistente
    const createButton = headerDiv.querySelector('.btn.btn-primary');
    headerDiv.insertBefore(syncButton, createButton);
    
    // Adicionar event listener para o campo de pesquisa
    const searchInput = document.getElementById('searchAssistantInput');
    const searchButton = document.getElementById('searchAssistantButton');
    
    if (searchInput) {
        searchInput.addEventListener('keyup', function(event) {
            if (event.key === 'Enter') {
                currentPage = 0;
                loadAssistants(true);
            }
        });
    }
    
    if (searchButton) {
        searchButton.addEventListener('click', function() {
            currentPage = 0;
            loadAssistants(true);
        });
    }
    
    // Função para sincronizar assistentes com a API
    async function syncAssistants() {
        try {
            const confirmSync = confirm("Deseja atualizar todos os assistentes a partir da API da OpenAI? Isso pode levar algum tempo.");
            if (!confirmSync) return;
            
            showLoading();
            
            // Adicionar uma mensagem de sincronização em andamento
            const syncMessage = document.createElement('div');
            syncMessage.className = 'alert alert-info mt-3';
            syncMessage.id = 'syncMessage';
            syncMessage.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Atualizando assistentes da API, por favor aguarde... <br><small>Isso pode levar alguns minutos dependendo da quantidade de assistentes</small>';
            document.getElementById('responseMessage').innerHTML = '';
            document.getElementById('responseMessage').appendChild(syncMessage);
            
            const response = await fetch('/admin/sync-assistants', {
                method: 'POST'
            });
            
            const data = await response.json();
            
            // Remover mensagem de sincronização
            document.getElementById('syncMessage').remove();
            
            if (response.ok) {
                document.getElementById('responseMessage').innerHTML = `
                    <div class="alert alert-success">
                        <i class="fas fa-check-circle"></i> ${data.message}
                        <br>
                        <small>Agora você pode usar a busca para filtrar os assistentes disponíveis.</small>
                    </div>
                `;
                
                // Recarregar os assistentes após a sincronização usando apenas o banco de dados
                // Não precisa forceRefresh=true pois a API já atualizou o banco
                currentPage = 0;
                allAssistants = [];
                loadAssistants(false);
            } else {
                throw new Error(data.error || 'Erro ao sincronizar assistentes');
            }
        } catch (error) {
            document.getElementById('responseMessage').innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-circle"></i> Erro ao atualizar assistentes: ${error.message}
                </div>
            `;
        } finally {
            hideLoading();
        }
    }
    
    // Função para carregar modelos no select
    async function loadModels() {
        showLoading();
        try {
            const modelResponse = await fetch('/admin/get-models');
            const modelData = await modelResponse.json();
            
            if (modelData.error) {
                console.error('Erro ao carregar modelos:', modelData.error);
                return;
            }
            
            const modelSelect = document.getElementById('model');
            const editModelSelect = document.getElementById('editModel');
            
            if (modelSelect) {
                modelSelect.innerHTML = ''; // Limpar opções existentes
                modelData.models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model.id;
                    option.textContent = model.id;
                    modelSelect.appendChild(option);
                });
            }
            
            if (editModelSelect) {
                editModelSelect.innerHTML = ''; // Limpar opções existentes
                modelData.models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model.id;
                    option.textContent = model.id;
                    editModelSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Erro ao carregar modelos:', error);
        }
    }
    
    // Coisas para carregar ao iniciar a página
    try {
        // Carregar modelos disponíveis
        await loadModels();
        
        // Iniciar carregamento de assistentes
        await loadAssistants();
    } catch (error) {
        console.error('Erro ao carregar dados iniciais:', error);
    }
    
    // Adicionar o evento de clique ao botão 'Criar Assistente'
    const createAssistantForm = document.getElementById('createAssistantForm');
    if (createAssistantForm) {
        createAssistantForm.addEventListener('submit', function(e) {
            e.preventDefault();
            createAssistant();
        });
    }
    
    // Configurar o botão de salvar alterações na edição
    const saveEditButton = document.getElementById('saveEditButton');
    if (saveEditButton) {
        saveEditButton.addEventListener('click', function() {
            const assistantId = document.getElementById('editAssistantId').value;
            editAssistantSubmit(assistantId);
        });
    }
});

// Função para criar um novo assistente
async function createAssistant() {
    const model = document.getElementById('model').value.trim();
    const name = document.getElementById('name').value.trim();
    const description = document.getElementById('description').value.trim();
    const instructions = document.getElementById('instructions').value.trim();

    // Coletar ferramentas selecionadas
    const tools = [];
    const toolCheckboxes = ['toolCodeInterpreter', 'toolFileSearch', 'toolFunction'];
    
    toolCheckboxes.forEach(checkboxId => {
        const checkbox = document.getElementById(checkboxId);
        if (checkbox && checkbox.checked) {
            tools.push({ "type": checkbox.value });
        }
    });

    try {
        showLoading();
        const response = await fetch('/admin/create-assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                model, 
                name, 
                description, 
                instructions,
                tools 
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Erro ao criar assistente');
        }

        // Se chegou aqui, o assistente foi criado com sucesso
        document.getElementById('responseMessage').innerHTML = `
            <div class="alert alert-success">
                Assistente criado com sucesso!
            </div>
        `;

        // Fechar o modal após a criação
        const modal = bootstrap.Modal.getInstance(document.getElementById('createAssistantModal'));
        modal.hide();
        
        // Limpar campos do formulário
        document.getElementById('name').value = '';
        document.getElementById('description').value = '';
        document.getElementById('instructions').value = '';
        
        // Adicionar o novo assistente à lista e atualizar a exibição
        if (data.id) {
            const newAssistant = {
                id: data.id,
                name: name,
                description: description,
                instructions: instructions,
                model: model
            };
            allAssistants.unshift(newAssistant); // Adicionar ao início da lista
            displayAssistants(allAssistants);
        } else {
            // Se não conseguir obter o ID do novo assistente, recarregar a lista
            currentPage = 0;
            hasMoreAssistants = false;
            allAssistants = [];
            await loadAssistants(true);
        }

    } catch (error) {
        document.getElementById('responseMessage').innerHTML = `
            <div class="alert alert-danger">
                Erro: ${error.message}
            </div>
        `;
    } finally {
        hideLoading();
    }
}

// Função para editar assistente (prepara o modal)
function editAssistant(assistantId, name, description, model, instructions) {
    // Preencher o formulário com os dados atuais
    document.getElementById('editAssistantId').value = assistantId;
    document.getElementById('editName').value = name || '';
    document.getElementById('editDescription').value = description || '';
    document.getElementById('editInstructions').value = instructions || '';
    
    // Selecionar o modelo correto se existir
    const editModelSelect = document.getElementById('editModel');
    if (editModelSelect) {
        for (let i = 0; i < editModelSelect.options.length; i++) {
            if (editModelSelect.options[i].value === model) {
                editModelSelect.selectedIndex = i;
                break;
            }
        }
    }
    
    // Abrir o modal
    const editModal = new bootstrap.Modal(document.getElementById('editAssistantModal'));
    editModal.show();
}

// Função para enviar os dados de edição do assistente
async function editAssistantSubmit(assistantId) {
    const updatedName = document.getElementById('editName').value.trim();
    const updatedDescription = document.getElementById('editDescription').value.trim();
    const updatedInstructions = document.getElementById('editInstructions').value.trim();
    const updatedModel = document.getElementById('editModel').value;
    
    try {
        showLoading();
        const response = await fetch(`/admin/modify-assistant/${assistantId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name: updatedName, 
                description: updatedDescription, 
                instructions: updatedInstructions,
                model: updatedModel
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Erro ao atualizar assistente');
        }
        
        // Mostrar mensagem de sucesso
        document.getElementById('responseMessage').innerHTML = `
            <div class="alert alert-success">
                Assistente atualizado com sucesso!
            </div>
        `;
        
        // Fechar o modal
        const editModal = bootstrap.Modal.getInstance(document.getElementById('editAssistantModal'));
        editModal.hide();
        
        // Atualizar o assistente na lista local
        const index = allAssistants.findIndex(a => a.id === assistantId);
        if (index !== -1) {
            allAssistants[index].name = updatedName;
            allAssistants[index].description = updatedDescription;
            allAssistants[index].instructions = updatedInstructions;
            allAssistants[index].model = updatedModel;
            
            // Re-exibir a lista atualizada
            displayAssistants(allAssistants);
        } else {
            // Se não encontrar o assistente na lista local, recarregar todos
            currentPage = 0;
            hasMoreAssistants = false;
            allAssistants = [];
            await loadAssistants(true);
        }

    } catch (error) {
        document.getElementById('responseMessage').innerHTML = `
            <div class="alert alert-danger">
                Erro: ${error.message}
            </div>
        `;
    } finally {
        hideLoading();
    }
}

// Função para deletar assistente
async function deleteAssistant(assistantId, assistantName) {
    if (!confirm(`Tem certeza que deseja deletar o assistente "${assistantName}"?`)) {
        return;
    }

    try {
        showLoading();
        const response = await fetch(`/admin/delete-assistant/${assistantId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Erro ao deletar assistente');
        }

        // Mostrar mensagem de sucesso
        document.getElementById('responseMessage').innerHTML = `
            <div class="alert alert-success">
                Assistente deletado com sucesso!
            </div>
        `;

        // Remover o assistente da lista local
        allAssistants = allAssistants.filter(a => a.id !== assistantId);
        
        // Atualizar a exibição
        displayAssistants(allAssistants);

    } catch (error) {
        document.getElementById('responseMessage').innerHTML = `
            <div class="alert alert-danger">
                Erro: ${error.message}
            </div>
        `;
    } finally {
        hideLoading();
    }
}

// Função para lidar com o upload de arquivos
async function handleFileUpload(assistantId, assistantName) {
    try {
        showLoading();
        
        // Verificar se o assistente já tem um vector store
        const response = await fetch(`/admin/check-vector-store/${assistantId}`);
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        let vectorStoreId = null;
        let vectorStoreName = null;

        if (data.hasVectorStore) {
            // Se já existe um vector store, perguntar se quer adicionar mais arquivos
            if (confirm(`Deseja adicionar mais arquivos ao Vector Store "${data.vectorStoreName}"?`)) {
                vectorStoreId = data.vectorStoreId;
                vectorStoreName = data.vectorStoreName;
            } else {
                return;
            }
        } else {
            // Se não existe, criar um novo vector store
            vectorStoreName = `Vector store for ${assistantName}`;
            const createResponse = await fetch('/admin/create-vector-store', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name: vectorStoreName,
                    assistantId: assistantId
                })
            });
            
            const createData = await createResponse.json();
            if (createData.error) throw new Error(createData.error);
            vectorStoreId = createData.vectorStoreId;
        }

        // Criar input de arquivo invisível e disparar clique
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;
        fileInput.accept = '.pdf,.txt,.doc,.docx';
        
        fileInput.onchange = async (e) => {
            const files = e.target.files;
            if (!files.length) return;

            // Mostrar mensagem de início do upload
            const messageDiv = document.createElement('div');
            messageDiv.className = 'alert alert-info position-fixed top-50 start-50 translate-middle';
            messageDiv.style.zIndex = '9999';
            messageDiv.innerHTML = `
                <div class="d-flex align-items-center">
                    <div class="spinner-border spinner-border-sm me-2" role="status">
                        <span class="visually-hidden">Carregando...</span>
                    </div>
                    <div>Fazendo upload dos arquivos, por favor aguarde...</div>
                </div>
            `;
            document.body.appendChild(messageDiv);

            const formData = new FormData();
            for (let file of files) {
                formData.append('files', file);
            }
            formData.append('vectorStoreId', vectorStoreId);
            formData.append('assistantId', assistantId);

            try {
                const uploadResponse = await fetch('/admin/upload-files', {
                    method: 'POST',
                    body: formData
                });

                const uploadData = await uploadResponse.json();
                if (uploadData.error) throw new Error(uploadData.error);

                // Remover mensagem de loading
                messageDiv.remove();

                if (uploadData.file_counts.completed === 0) {
                    // Criar overlay para fechar ao clicar fora
                    const overlay = document.createElement('div');
                    overlay.className = 'modal-backdrop fade show';
                    overlay.style.opacity = '0.5';
                    document.body.appendChild(overlay);

                    // Mostrar mensagem de erro para arquivos não legíveis com opção de OCR
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'alert alert-warning position-fixed top-50 start-50 translate-middle';
                    errorDiv.style.zIndex = '9999';
                    errorDiv.style.maxWidth = '80%';
                    errorDiv.innerHTML = `
                        <div class="d-flex justify-content-between">
                            <div class="d-flex align-items-center">
                                <i class="fas fa-exclamation-circle me-2"></i>
                                <div>
                                    <strong>O arquivo não está legível</strong><br>
                                    Você deve tornar o arquivo um documento com texto localizável para poder realizar o upload.
                                </div>
                            </div>
                            <button type="button" class="btn-close ms-3" aria-label="Fechar"></button>
                        </div>
                        <div class="mt-3">
                            <p class="mb-2">Deseja processar este arquivo com OCR para torná-lo pesquisável?</p>
                            <button type="button" class="btn btn-primary btn-sm me-2" id="processOcrBtn">
                                Sim, processar com OCR
                            </button>
                            <button type="button" class="btn btn-secondary btn-sm" id="cancelOcrBtn">
                                Não, cancelar
                            </button>
                        </div>
                    `;
                    document.body.appendChild(errorDiv);

                    // Função para fechar a mensagem e o overlay
                    const closeMessage = () => {
                        errorDiv.remove();
                        overlay.remove();
                    };

                    // Função para processar OCR e reenviar arquivo
                    const processOCR = async () => {
                        try {
                            // Mostrar loading durante o processamento OCR
                            errorDiv.innerHTML = `
                                <div class="d-flex align-items-center justify-content-center">
                                    <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                                    <div>Processando arquivo com OCR, por favor aguarde...</div>
                                </div>
                            `;

                            // Criar FormData com o arquivo original
                            const ocrFormData = new FormData();
                            ocrFormData.append('file', files[0]);

                            // Enviar para o serviço de OCR
                            let ocrResponse;
                            try {
                                ocrResponse = await fetch('http://localhost:5111/process', {
                                    method: 'POST',
                                    body: ocrFormData
                                });
                            } catch (networkError) {
                                // Erro de conexão com o serviço OCR
                                errorDiv.innerHTML = `
                                    <div class="d-flex justify-content-between">
                                        <div class="d-flex align-items-center">
                                            <i class="fas fa-exclamation-triangle me-2"></i>
                                            <div>
                                                <strong>Não foi possível tratar o documento</strong><br>
                                                Verifique com o departamento de TI
                                            </div>
                                        </div>
                                        <button type="button" class="btn-close ms-3" aria-label="Fechar"></button>
                                    </div>
                                `;
                                errorDiv.querySelector('.btn-close').addEventListener('click', closeMessage);
                                return;
                            }

                            if (!ocrResponse.ok) {
                                throw new Error('Não foi possível tratar o documento. Verifique com o departamento de TI');
                            }

                            // Converter a resposta em blob
                            const processedPdfBlob = await ocrResponse.blob();
                            
                            // Criar novo arquivo com o PDF processado
                            const processedFile = new File([processedPdfBlob], files[0].name, {
                                type: 'application/pdf'
                            });

                            // Criar novo FormData para enviar ao vector store
                            const newFormData = new FormData();
                            newFormData.append('files', processedFile);
                            newFormData.append('vectorStoreId', vectorStoreId);
                            newFormData.append('assistantId', assistantId);

                            // Tentar upload novamente
                            const newUploadResponse = await fetch('/admin/upload-files', {
                                method: 'POST',
                                body: newFormData
                            });

                            const newUploadData = await newUploadResponse.json();
                            
                            if (newUploadData.error) {
                                throw new Error(newUploadData.error);
                            }

                            if (newUploadData.file_counts.completed > 0) {
                                // Sucesso! Mostrar mensagem de sucesso
                                closeMessage();
                                const successDiv = document.createElement('div');
                                successDiv.className = 'alert alert-success position-fixed top-50 start-50 translate-middle';
                                successDiv.style.zIndex = '9999';
                                successDiv.innerHTML = `
                                    <div class="d-flex align-items-center">
                                        <i class="fas fa-check-circle me-2"></i>
                                        <div>
                                            <strong>Arquivo processado e enviado com sucesso!</strong><br>
                                            O documento foi convertido com OCR e adicionado ao assistente.
                                        </div>
                                    </div>
                                `;
                                document.body.appendChild(successDiv);
                                setTimeout(() => successDiv.remove(), 3000);
                            } else {
                                throw new Error('Arquivo processado ainda não está legível');
                            }

                        } catch (error) {
                            errorDiv.innerHTML = `
                                <div class="d-flex justify-content-between">
                                    <div class="d-flex align-items-center">
                                        <i class="fas fa-exclamation-triangle me-2"></i>
                                        <div>
                                            <strong>Não foi possível tratar o documento</strong><br>
                                            Verifique com o departamento de TI
                                        </div>
                                    </div>
                                    <button type="button" class="btn-close ms-3" aria-label="Fechar"></button>
                                </div>
                            `;
                            errorDiv.querySelector('.btn-close').addEventListener('click', closeMessage);
                        }
                    };

                    // Adicionar eventos de clique
                    errorDiv.querySelector('.btn-close').addEventListener('click', closeMessage);
                    overlay.addEventListener('click', closeMessage);
                    errorDiv.querySelector('#processOcrBtn').addEventListener('click', processOCR);
                    errorDiv.querySelector('#cancelOcrBtn').addEventListener('click', closeMessage);
                } else {
                    // Mostrar mensagem de sucesso
                    const successDiv = document.createElement('div');
                    successDiv.className = 'alert alert-success position-fixed top-50 start-50 translate-middle';
                    successDiv.style.zIndex = '9999';
                    successDiv.innerHTML = `
                        <div class="d-flex align-items-center">
                            <i class="fas fa-check-circle me-2"></i>
                            <div>
                                <strong>Upload concluído com sucesso!</strong><br>
                                ${uploadData.file_counts.completed} arquivo(s) processado(s)
                            </div>
                        </div>
                    `;
                    document.body.appendChild(successDiv);

                    // Remover mensagem de sucesso após 3 segundos
                    setTimeout(() => {
                        successDiv.remove();
                    }, 3000);
                }

            } catch (error) {
                // Remover mensagem de loading
                messageDiv.remove();

                // Criar overlay para fechar ao clicar fora
                const overlay = document.createElement('div');
                overlay.className = 'modal-backdrop fade show';
                overlay.style.opacity = '0.5';
                document.body.appendChild(overlay);

                // Mostrar mensagem de erro genérica
                const errorDiv = document.createElement('div');
                errorDiv.className = 'alert alert-danger position-fixed top-50 start-50 translate-middle';
                errorDiv.style.zIndex = '9999';
                errorDiv.innerHTML = `
                    <div class="d-flex justify-content-between">
                        <div class="d-flex align-items-center">
                            <i class="fas fa-exclamation-circle me-2"></i>
                            <div>
                                <strong>Erro ao enviar arquivos:</strong><br>
                                ${error.message}
                            </div>
                        </div>
                        <button type="button" class="btn-close ms-3" aria-label="Fechar"></button>
                    </div>
                `;
                document.body.appendChild(errorDiv);

                // Função para fechar a mensagem e o overlay
                const closeMessage = () => {
                    errorDiv.remove();
                    overlay.remove();
                };

                // Adicionar eventos de clique para fechar
                errorDiv.querySelector('.btn-close').addEventListener('click', closeMessage);
                overlay.addEventListener('click', closeMessage);
            }
        };

        fileInput.click();

    } catch (error) {
        alert(`Erro: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// Função updateAssistant como alias para editAssistantSubmit (para compatibilidade com o HTML)
function updateAssistant() {
    const assistantId = document.getElementById('editAssistantId').value;
    editAssistantSubmit(assistantId);
} 