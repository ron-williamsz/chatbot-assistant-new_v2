// Funções para upload de imagens no fluxo guiado

// Função para mostrar controle de upload de imagens
function mostrarControleUploadImagens(maximo = 3) {
    const chat = document.getElementById("chat");
    const uploadDiv = document.createElement('div');
    uploadDiv.id = 'uploadImageControl';
    uploadDiv.className = 'upload-container';
    
    uploadDiv.innerHTML = `
        <div class="upload-area" id="uploadArea">
            <div class="upload-icon">
                <i class="fas fa-cloud-upload-alt"></i>
            </div>
            <div class="upload-text">
                <strong>Clique para selecionar imagens</strong> ou arraste aqui<br>
                <small>Máximo ${maximo} imagens • JPG, PNG ou JPEG • Até 5MB cada</small>
            </div>
            <input type="file" id="imageInput" multiple accept=".jpg,.jpeg,.png" style="display: none;">
        </div>
        <div id="uploadedImages" class="uploaded-images"></div>
        <div class="upload-actions">
            <button id="selectImages" class="btn-upload">
                <i class="fas fa-plus"></i> Selecionar Imagens
            </button>
            <button id="skipImages" class="btn-skip">
                <i class="fas fa-arrow-right"></i> Pular
            </button>
            <button id="confirmImages" class="btn-confirm" style="display: none;">
                <i class="fas fa-check"></i> Confirmar
            </button>
        </div>
    `;
    
    chat.appendChild(uploadDiv);
    chat.scrollTop = chat.scrollHeight;
    
    // Configurar eventos
    configurarUploadImagens(maximo);
}

// Função para configurar eventos de upload de imagens
function configurarUploadImagens(maximo) {
    const uploadArea = document.getElementById('uploadArea');
    const imageInput = document.getElementById('imageInput');
    const selectButton = document.getElementById('selectImages');
    const skipButton = document.getElementById('skipImages');
    const confirmButton = document.getElementById('confirmImages');
    const uploadedImagesDiv = document.getElementById('uploadedImages');
    
    let selectedImages = [];
    
    // Evento de clique na área de upload
    uploadArea.addEventListener('click', () => {
        imageInput.click();
    });
    
    // Evento de clique no botão selecionar
    selectButton.addEventListener('click', () => {
        imageInput.click();
    });
    
    // Evento de seleção de arquivos
    imageInput.addEventListener('change', (e) => {
        processarImagens(e.target.files, maximo);
    });
    
    // Eventos de drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        processarImagens(e.dataTransfer.files, maximo);
    });
    
    // Evento de pular
    skipButton.addEventListener('click', () => {
        // Remove controle de upload
        document.getElementById('uploadImageControl').remove();
        
        // Adicionar mensagem indicando que pulou
        addMessage("📷 Upload de imagens foi pulado", true);
        
        // Continuar para o próximo passo sem imagens
        flowData[guidedFlows[currentFlow].passos[flowStep].campo] = [];
        flowStep++;
        proximoPasso();
    });
    
    // Evento de confirmar
    confirmButton.addEventListener('click', () => {
        confirmarImagens();
    });
    
    // Função para processar imagens selecionadas
    function processarImagens(files, maximo) {
        const newImages = Array.from(files);
        
        // Verificar limite
        if (selectedImages.length + newImages.length > maximo) {
            alert(`Você pode selecionar no máximo ${maximo} imagens`);
            return;
        }
        
        // Validar cada arquivo
        for (let file of newImages) {
            // Verificar formato
            if (!file.type.match('image/(jpeg|jpg|png)')) {
                alert(`Formato não suportado: ${file.name}. Use apenas JPG, PNG ou JPEG.`);
                continue;
            }
            
            // Verificar tamanho (5MB)
            if (file.size > 5 * 1024 * 1024) {
                alert(`Arquivo muito grande: ${file.name}. Máximo 5MB por imagem.`);
                continue;
            }
            
            selectedImages.push(file);
        }
        
        // Atualizar visualização
        atualizarPreviewImagens();
        
        // Mostrar botão confirmar se tiver imagens
        if (selectedImages.length > 0) {
            confirmButton.style.display = 'inline-flex';
            selectButton.innerHTML = '<i class="fas fa-plus"></i> Adicionar Mais';
        }
    }
    
    // Função para atualizar preview das imagens
    function atualizarPreviewImagens() {
        uploadedImagesDiv.innerHTML = '';
        
        selectedImages.forEach((file, index) => {
            const imageDiv = document.createElement('div');
            imageDiv.className = 'image-preview';
            
            // Criar URL para preview
            const imageUrl = URL.createObjectURL(file);
            
            imageDiv.innerHTML = `
                <img src="${imageUrl}" alt="${file.name}">
                <button class="btn-remove" onclick="removerImagem(${index})">
                    <i class="fas fa-times"></i>
                </button>
                <div class="image-info">
                    <div class="image-name">${file.name}</div>
                    <div class="image-size">${formatarTamanho(file.size)}</div>
                </div>
            `;
            
            uploadedImagesDiv.appendChild(imageDiv);
        });
    }
    
    // Função global para remover imagem
    window.removerImagem = function(index) {
        // Revogar URL para liberar memória
        const file = selectedImages[index];
        const imageDiv = uploadedImagesDiv.children[index];
        const img = imageDiv.querySelector('img');
        if (img && img.src.startsWith('blob:')) {
            URL.revokeObjectURL(img.src);
        }
        
        selectedImages.splice(index, 1);
        atualizarPreviewImagens();
        
        if (selectedImages.length === 0) {
            confirmButton.style.display = 'none';
            selectButton.innerHTML = '<i class="fas fa-plus"></i> Selecionar Imagens';
        }
    };
    
    // Função para formatar tamanho do arquivo
    function formatarTamanho(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // Função para confirmar imagens
    function confirmarImagens() {
        if (selectedImages.length === 0) {
            alert('Selecione pelo menos uma imagem para continuar.');
            return;
        }
        
        // Gerar ID único para este documento
        const documentoId = Date.now().toString();
        
        // Fazer upload das imagens
        uploadImagensParaServidor(selectedImages, documentoId);
    }
}

// Função para fazer upload das imagens para o servidor
async function uploadImagensParaServidor(images, documentoId) {
    try {
        const formData = new FormData();
        formData.append('documento_id', documentoId);
        formData.append('tipo', currentFlow);
        
        // Adicionar cada imagem ao FormData
        images.forEach((file, index) => {
            formData.append(`imagem_${index}`, file);
        });
        
        // Mostrar loading
        if (typeof showLoadingToast === 'function') {
            showLoadingToast();
        }
        
        // Fazer upload
        const response = await fetch('/upload-imagens-documento', {
            method: 'POST',
            body: formData
        });
        
        if (typeof hideLoadingToast === 'function') {
            hideLoadingToast();
        }
        
        if (!response.ok) {
            throw new Error('Erro ao fazer upload das imagens');
        }
        
        const result = await response.json();
        
        if (result.success) {
            // Remover controle de upload
            document.getElementById('uploadImageControl').remove();
            
            // Adicionar mensagem de sucesso
            addMessage(`📷 ${result.total} imagem(ns) enviada(s) com sucesso`, true);
            
            // Armazenar informações das imagens no flowData
            flowData[guidedFlows[currentFlow].passos[flowStep].campo] = {
                documento_id: documentoId,
                imagens: result.imagens,
                total: result.total
            };
            
            // Avançar para o próximo passo
            flowStep++;
            proximoPasso();
        } else {
            throw new Error(result.error || 'Erro desconhecido no upload');
        }
        
    } catch (error) {
        if (typeof hideLoadingToast === 'function') {
            hideLoadingToast();
        }
        if (typeof showErrorToast === 'function') {
            showErrorToast('Erro no upload: ' + error.message);
        }
        console.error('Erro no upload de imagens:', error);
    }
}

// Tornar as funções globais disponíveis
window.mostrarControleUploadImagens = mostrarControleUploadImagens;
window.configurarUploadImagens = configurarUploadImagens;
window.uploadImagensParaServidor = uploadImagensParaServidor;

console.log('image-upload.js carregado - funções de upload de imagens disponíveis'); 