// Adicione isso no início do arquivo
console.log('chat.js carregado');

// Geramos um ID único para o usuário
const userId = localStorage.getItem('userId') || 
               'user_' + Math.random().toString(36).substr(2, 9);
localStorage.setItem('userId', userId);

// Variável para controlar se há uma requisição em andamento
let isProcessing = false;

// Funções para gerenciar histórico de conversas
const MESSAGES_STORAGE_KEY = 'chat_messages_history';
const MAX_CONVERSATIONS = 5; // Número máximo de conversas a manter
const MAX_MESSAGES_PER_CONVERSATION = 100; // Número máximo de mensagens por conversa

// Variáveis para controlar fluxos guiados
let inGuidedFlow = false;
let currentFlow = null;
let flowData = {};
let flowStep = 0;

// Definição de fluxos guiados
const guidedFlows = {
  advertencia: {
    nome: "Advertência",
    passos: [
      { 
        pergunta: "Qual a data do incidente?", 
        campo: "data",
        tipo: "data" 
      },
      { 
        pergunta: "Descreva o incidente detalhadamente:", 
        campo: "descricao",
        tipo: "texto" 
      },
      { 
        pergunta: "Envie até 3 imagens que comprovem o incidente (JPG, PNG ou JPEG - máximo 5MB cada):", 
        campo: "imagens",
        tipo: "imagens",
        maximo: 3
      }
    ]
  },
  multa: {
    nome: "Multa",
    passos: [
      { 
        pergunta: "Qual a data da infração?", 
        campo: "data",
        tipo: "data" 
      },
      { 
        pergunta: "Qual o valor da multa?", 
        campo: "valor",
        tipo: "numero" 
      },
      { 
        pergunta: "Descreva a infração cometida:", 
        campo: "descricao",
        tipo: "texto" 
      },
      { 
        pergunta: "Envie até 3 imagens que comprovem a infração (JPG, PNG ou JPEG - máximo 5MB cada):", 
        campo: "imagens",
        tipo: "imagens",
        maximo: 3
      }
    ]
  }
};

// Função para salvar uma mensagem no histórico
function saveMessageToHistory(message, isUser, assistantId, assistantName) {
    // Obter histórico atual ou iniciar um novo
    let history = JSON.parse(localStorage.getItem(MESSAGES_STORAGE_KEY) || '{}');
    
    // Se não existir entrada para este assistente, criar
    if (!history[assistantId]) {
        history[assistantId] = {
            assistantName: assistantName || 'Assistente',
            lastUpdate: Date.now(),
            messages: []
        };
    }
    
    // Adicionar a mensagem
    history[assistantId].messages.push({
        text: message,
        isUser: isUser,
        timestamp: Date.now()
    });
    
    // Limitar o número de mensagens
    if (history[assistantId].messages.length > MAX_MESSAGES_PER_CONVERSATION) {
        history[assistantId].messages = history[assistantId].messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
    }
    
    // Atualizar a data da última atualização
    history[assistantId].lastUpdate = Date.now();
    
    // Limitar o número de conversas, removendo as mais antigas
    const sortedAssistants = Object.keys(history).sort((a, b) => 
        history[b].lastUpdate - history[a].lastUpdate
    );
    
    if (sortedAssistants.length > MAX_CONVERSATIONS) {
        const assistantsToRemove = sortedAssistants.slice(MAX_CONVERSATIONS);
        assistantsToRemove.forEach(id => {
            delete history[id];
        });
    }
    
    // Salvar o histórico atualizado
    localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(history));
}

// Função para carregar o histórico de um assistente específico
function loadMessageHistory(assistantId) {
    const history = JSON.parse(localStorage.getItem(MESSAGES_STORAGE_KEY) || '{}');
    return history[assistantId]?.messages || [];
}

// Função para carregar todas as conversas recentes
function loadRecentConversations() {
    const history = JSON.parse(localStorage.getItem(MESSAGES_STORAGE_KEY) || '{}');
    
    // Ordenar conversas pela data da última atualização (mais recente primeiro)
    return Object.keys(history)
        .map(assistantId => ({
            id: assistantId,
            name: history[assistantId].assistantName,
            lastUpdate: history[assistantId].lastUpdate,
            messageCount: history[assistantId].messages.length
        }))
        .sort((a, b) => b.lastUpdate - a.lastUpdate);
}

// Funções auxiliares para mostrar/esconder o loading
function showLoading() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    const assistantList = document.getElementById('assistantList');
    
    if (loadingSpinner) {
        loadingSpinner.classList.remove('hidden');
    }
    if (assistantList) {
        assistantList.classList.add('hidden');
    }
}

function hideLoading() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    const assistantList = document.getElementById('assistantList');
    
    if (loadingSpinner) {
        loadingSpinner.classList.add('hidden');
    }
    if (assistantList) {
        assistantList.classList.remove('hidden');
    }
}

// Função para adicionar mensagem ao chat
function addMessage(message, isUser, saveToHistory = true) {
    const chat = document.getElementById("chat");
    const messageContainer = document.createElement('div');
    messageContainer.className = `message-container ${isUser ? 'user' : 'bot'}`;
    
    const messageWrapper = document.createElement('div');
    messageWrapper.className = 'message-wrapper';
    
    // Avatar
    const avatar = document.createElement('div');
    avatar.className = `avatar ${isUser ? 'user' : 'bot'}`;
    avatar.innerHTML = isUser ? window.userInitial || 'U' : '<i class="fas fa-robot"></i>';
    
    // Message bubble
    const messageBubble = document.createElement('div');
    messageBubble.className = 'message-bubble';
    
    // Verificar se a mensagem contém URL de documento e não é do usuário
    if (!isUser && typeof message === 'string') {
        // Procurar por URLs de documentos de advertência ou multa
        const docUrlRegex = /(https?:\/\/[^\s]+\/static\/documentos\/(advertencia|multa)_[^\s"]+\.html)/gi;
        const docMatch = message.match(docUrlRegex);
        
        if (docMatch && docMatch.length > 0) {
            // Extrair informações para exibição
            const docUrl = docMatch[0];
            const isAdvertencia = docUrl.includes('advertencia');
            const docType = isAdvertencia ? 'Advertência' : 'Multa';
            
            // Formatar mensagem com botão de visualizar e baixar
            let formattedMessage = message.replace(docUrlRegex, '');
            
            // Adicionar card de documento
            formattedMessage += `
                <div class="document-card">
                    <div class="document-card-header">
                        <i class="fas fa-file-alt text-${isAdvertencia ? 'yellow' : 'red'}-600"></i>
                        Documento de ${docType}
                    </div>
                    <div class="flex gap-2 mt-2">
                        <a href="${docUrl}" target="_blank" class="inline-flex items-center px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600">
                            <i class="fas fa-eye mr-1"></i> Visualizar
                        </a>
                        <button onclick="prepareDownloadPDF('${docUrl}', '${docType}')" class="inline-flex items-center px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600">
                            <i class="fas fa-file-pdf mr-1"></i> Baixar PDF
                        </button>
                    </div>
                </div>
            `;
            
            messageBubble.innerHTML = formattedMessage;
        } else {
            // Usar innerHTML para permitir renderização de tags HTML
            messageBubble.innerHTML = message;
        }
    } else {
        // Para mensagens do usuário, manter textContent por segurança
        if (isUser) {
            messageBubble.textContent = message;
        } else {
            // Para mensagens do bot, usar innerHTML para permitir formatação com sanitização
            messageBubble.innerHTML = sanitizeAndFormatHTML(message);
        }
    }
    
    // Timestamp
    const messageTime = document.createElement('div');
    messageTime.className = 'message-time';
    const now = new Date();
    messageTime.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    messageBubble.appendChild(messageTime);
    
    // Montar a estrutura
    messageWrapper.appendChild(avatar);
    messageWrapper.appendChild(messageBubble);
    messageContainer.appendChild(messageWrapper);
    
    chat.appendChild(messageContainer);
    chat.scrollTop = chat.scrollHeight;
    
    // Salvar mensagem no histórico se tiver um assistente selecionado e saveToHistory for true
    if (saveToHistory && selectedAssistantId) {
        const assistantName = localStorage.getItem('selectedAssistantName') || 'Assistente';
        saveMessageToHistory(message, isUser, selectedAssistantId, assistantName);
    }
}

// Função para adicionar indicador de digitação
function addTypingIndicator() {
    const chat = document.getElementById("chat");
    const messageContainer = document.createElement('div');
    messageContainer.id = 'typingIndicator';
    messageContainer.className = 'message-container bot';
    
    const messageWrapper = document.createElement('div');
    messageWrapper.className = 'message-wrapper';
    
    // Avatar
    const avatar = document.createElement('div');
    avatar.className = 'avatar bot';
    avatar.innerHTML = '<i class="fas fa-robot"></i>';
    
    // Typing indicator
    const typingBubble = document.createElement('div');
    typingBubble.className = 'typing-indicator';
    typingBubble.innerHTML = '<span></span><span></span><span></span>';
    
    messageWrapper.appendChild(avatar);
    messageWrapper.appendChild(typingBubble);
    messageContainer.appendChild(messageWrapper);
    
    chat.appendChild(messageContainer);
    chat.scrollTop = chat.scrollHeight;
}

// Função para remover indicador de digitação
function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.remove();
    }
}

// Função para detectar intenção de criar documento
function detectarIntencaoDocumento(mensagem) {
  const mensagemLower = mensagem.toLowerCase();
  
  // Padrões para detectar intenção de advertência
  const advertenciaPatterns = [
    /gera\w*\s+(?:uma\s+)?advertência/i,
    /cria\w*\s+(?:uma\s+)?advertência/i,
    /emiti\w*\s+(?:uma\s+)?advertência/i,
    /preciso\s+(?:de\s+)?(?:uma\s+)?advertência/i,
    /quero\s+(?:fazer|criar|gerar)\s+(?:uma\s+)?advertência/i,
    /advertir\s+(?:o|a)\s+/i
  ];
  
  // Padrões para detectar intenção de multa
  const multaPatterns = [
    /gera\w*\s+(?:uma\s+)?multa/i,
    /cria\w*\s+(?:uma\s+)?multa/i,
    /emiti\w*\s+(?:uma\s+)?multa/i,
    /preciso\s+(?:de\s+)?(?:uma\s+)?multa/i,
    /quero\s+(?:fazer|criar|gerar)\s+(?:uma\s+)?multa/i,
    /aplicar\s+(?:uma\s+)?multa/i
  ];
  
  // Verificar padrões de advertência
  for (const pattern of advertenciaPatterns) {
    if (pattern.test(mensagemLower)) {
      return 'advertencia';
    }
  }
  
  // Verificar padrões de multa
  for (const pattern of multaPatterns) {
    if (pattern.test(mensagemLower)) {
      return 'multa';
    }
  }
  
  return null; // Nenhuma intenção detectada
}

// Função para iniciar um fluxo guiado
function iniciarFluxoGuiado(tipo) {
  inGuidedFlow = true;
  currentFlow = tipo;
  flowData = {};
  flowStep = 0;
  
  // Adicionar mensagem de início do fluxo
  addMessage(`Iniciando criação de ${guidedFlows[tipo].nome}. Vou guiá-lo pelo processo.`, false);
  
  // Instruções adicionais sobre fundamentação legal
  const fundamentacaoMsg = `Antes de prosseguirmos, é importante ter uma fundamentação legal adequada para este documento. 
  
Se possível, forneça:
1) A referência específica do regulamento (artigo, cláusula, inciso)
2) Qual parte do documento trata do ocorrido
3) Se houver, a penalidade prevista para este tipo de situação

Estas informações ajudarão a gerar um documento mais preciso e efetivo.`;

  addMessage(fundamentacaoMsg, false);
  
  // Esperamos um pouco antes de mostrar o primeiro passo, para o usuário ler a instrução
  setTimeout(() => proximoPasso(), 1500);
}

// Função para processar o próximo passo do fluxo
function proximoPasso() {
  const fluxo = guidedFlows[currentFlow];
  
  // Verificar se há mais passos
  if (flowStep >= fluxo.passos.length) {
    finalizarFluxo();
    return;
  }
  
  // Obter informações do passo atual
  const passo = fluxo.passos[flowStep];
  
  // Adicionar pergunta ao chat
  addMessage(passo.pergunta, false);
  
  // Se for passo de arquivo, mostrar o controle de upload
  if (passo.tipo === "arquivo") {
    mostrarControleUpload();
  }
  
  // Se for passo de imagens, mostrar o controle de upload de imagens
  if (passo.tipo === "imagens") {
    mostrarControleUploadImagens(passo.maximo || 3);
  }
  
  // Se for passo de data, mostrar seletor de data
  if (passo.tipo === "data") {
    mostrarSeletorData();
  }
}

// Função para processar a resposta do usuário no fluxo guiado
function processarRespostaFluxo(mensagem) {
  const fluxo = guidedFlows[currentFlow];
  const passo = fluxo.passos[flowStep];
  
  // Armazenar resposta no objeto de dados
  flowData[passo.campo] = mensagem;
  
  // Avançar para o próximo passo
  flowStep++;
  proximoPasso();
}

// Função para finalizar o fluxo guiado
function finalizarFluxo() {
  // Mostrar resumo dos dados coletados
  let resumo = `**Resumo de ${guidedFlows[currentFlow].nome}**\n\n`;
  
  const fluxo = guidedFlows[currentFlow];
  fluxo.passos.forEach(passo => {
    resumo += `**${passo.pergunta}**\n${flowData[passo.campo] || 'Não informado'}\n\n`;
  });
  
  addMessage(resumo, false);
  
  // Enviar dados para o servidor gerar o documento
  gerarDocumento();
  
  // Resetar estado do fluxo
  inGuidedFlow = false;
  currentFlow = null;
}

// Função para enviar dados para o servidor e gerar documento
async function gerarDocumento() {
  try {
    addTypingIndicator();
    
    const response = await fetch('/gerar-documento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: currentFlow,
        dados: flowData,
        assistant_id: selectedAssistantId,
        user_id: userId
      })
    });
    
    const data = await response.json();
    removeTypingIndicator();
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    // Adicionar link para download do documento
    if (data.documento_url) {
      addMessage(`Documento gerado com sucesso! <a href="${data.documento_url}" target="_blank" class="btn btn-success btn-sm">Baixar Documento</a>`, false);
    } else {
      addMessage(`Documento gerado com sucesso!`, false);
    }
    
  } catch (error) {
    removeTypingIndicator();
    addMessage(`❌ Erro ao gerar documento: ${error.message}`, false);
  }
}

// Função para gerar HTML do documento
function gerarHTMLDocumento(tipo, dados) {
  const dataFormatada = formatarData(dados.data);
  const timestamp = new Date().toLocaleDateString('pt-BR') + ' ' + 
                    new Date().toLocaleTimeString('pt-BR');
  
  // Formatar a descrição substituindo quebras de linha por <br>
  const descricaoHTML = dados.descricao 
    ? dados.descricao.replace(/\n/g, '<br>')
    : 'Sem descrição disponível';
  
  // Estilos comuns para ambos os documentos
  const estilosComuns = `
    body {
        font-family: Arial, sans-serif;
        margin: 40px;
        line-height: 1.6;
        color: #333;
        background-color: #fff;
    }
    .header {
        text-align: center;
        margin-bottom: 30px;
        padding-bottom: 10px;
        border-bottom: 2px solid #ddd;
    }
    .title {
        font-size: 24px;
        font-weight: bold;
        margin-bottom: 20px;
        text-transform: uppercase;
        color: #333;
    }
    .section {
        margin-bottom: 20px;
        page-break-inside: avoid;
    }
    .section-title {
        font-weight: bold;
        font-size: 16px;
        margin-bottom: 10px;
        color: #555;
    }
    .footer {
        margin-top: 50px;
        font-style: italic;
        font-size: 12px;
        color: #666;
        text-align: center;
        border-top: 1px solid #ddd;
        padding-top: 15px;
    }
    .signature {
        margin-top: 80px;
        border-top: 1px solid #000;
        width: 200px;
        text-align: center;
        padding-top: 10px;
    }
    .description {
        text-align: justify;
        margin-bottom: 20px;
        white-space: pre-line;
    }
    .logo {
        max-width: 150px;
        margin-bottom: 20px;
    }
    @media print {
        body {
            margin: 15mm;
        }
        .no-print {
            display: none;
        }
    }
  `;
  
  if (tipo === 'advertencia') {
    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Advertência Disciplinar</title>
          <style>
              ${estilosComuns}
              .header {
                  background-color: #fff3cd;
                  border-bottom: 2px solid #ffeeba;
                  padding: 10px;
              }
              .title {
                  color: #856404;
              }
          </style>
      </head>
      <body>
          <div class="header">
              <div class="title">Advertência Disciplinar</div>
          </div>
          
          <div class="section">
              <div class="section-title">Data do Incidente:</div>
              <div>${dataFormatada}</div>
          </div>
          
          <div class="section">
              <div class="section-title">Descrição do Incidente:</div>
              <div class="description">${descricaoHTML}</div>
          </div>
          
          <div class="section">
              <div class="section-title">Ciente:</div>
              <div class="signature">
                  Assinatura do Notificado
              </div>
          </div>
          
          <div class="footer">
              Este documento foi gerado automaticamente pelo sistema em ${timestamp}.
          </div>
      </body>
      </html>
    `;
  } else if (tipo === 'multa') {
    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Notificação de Multa</title>
          <style>
              ${estilosComuns}
              .header {
                  background-color: #f8d7da;
                  border-bottom: 2px solid #f5c6cb;
                  padding: 10px;
              }
              .title {
                  color: #721c24;
              }
              .info-table {
                  width: 100%;
                  border-collapse: collapse;
                  margin-bottom: 20px;
              }
              .info-table th, .info-table td {
                  border: 1px solid #ddd;
                  padding: 8px;
                  text-align: left;
              }
              .info-table th {
                  background-color: #f8f9fa;
                  width: 30%;
              }
              .highlight {
                  font-weight: bold;
                  color: #d9534f;
              }
          </style>
      </head>
      <body>
          <div class="header">
              <div class="title">Notificação de Multa</div>
          </div>
          
          <table class="info-table">
              <tr>
                  <th>Data da Infração:</th>
                  <td>${dataFormatada}</td>
              </tr>
              <tr>
                  <th>Valor da Multa:</th>
                  <td class="highlight">R$ ${dados.valor || '0,00'}</td>
              </tr>
          </table>
          
          <div class="section">
              <div class="section-title">Descrição da Infração:</div>
              <div class="description">${descricaoHTML}</div>
          </div>
          
          <div class="section">
              <div class="section-title">Ciente:</div>
              <div class="signature">
                  Assinatura do Notificado
              </div>
          </div>
          
          <div class="footer">
              Este documento foi gerado automaticamente pelo sistema em ${timestamp}.
          </div>
      </body>
      </html>
    `;
  }
  
  return '<p>Tipo de documento não suportado</p>';
}

// Função auxiliar para formatar data
function formatarData(dataStr) {
  // Se a data já estiver no formato brasileiro (DD/MM/YYYY), retornar como está
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(dataStr.trim())) {
    return dataStr.trim();
  }
  
  try {
    // Tentar converter a data para um objeto Date
    let data;
    
    // Verificar se está no formato ISO (YYYY-MM-DD)
    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(dataStr)) {
      data = new Date(dataStr);
    } 
    // Verificar formato DD-MM-YYYY
    else if (/^\d{1,2}-\d{1,2}-\d{4}/.test(dataStr)) {
      const partes = dataStr.split('-');
      data = new Date(partes[2], partes[1] - 1, partes[0]);
    }
    // Outros formatos
    else {
      data = new Date(dataStr);
    }
    
    // Verificar se a data é válida
    if (isNaN(data.getTime())) {
      return dataStr; // Retorna a string original se a data for inválida
    }
    
    return data.toLocaleDateString('pt-BR');
  } catch (e) {
    console.log("Erro ao formatar data:", e);
    return dataStr; // Retorna a string original se falhar
  }
}

// Função para extrair valor da multa do texto
function extrairValorMulta(texto) {
  const valorRegex = /Valor:\s*R?\$?\s*([0-9,.]+)/i;
  const match = texto.match(valorRegex);
  
  if (match && match[1]) {
    return match[1].trim();
  }
  
  return "0,00"; // Valor padrão
}

// Função para processar as respostas do assistente
function processarRespostaAssistente(resposta) {
  // Padrões para detectar documentos gerados
  const advertenciaRegex = /ADVERTÊNCIA GERADA[\s\S]*?(?:FIM DOCUMENTO|$)/i;
  const multaRegex = /MULTA GERADA[\s\S]*?(?:FIM DOCUMENTO|$)/i;
  
  // Detectar formatação mais livre também
  const advertenciaSimples = /(?:advertência gerada|⚠️ ADVERTÊNCIA GERADA)[\s\S]*/i;
  const multaSimples = /(?:multa gerada|🔴 MULTA GERADA)[\s\S]*/i;
  
  // Verificar se contém documento
  let advertenciaMatch = resposta.match(advertenciaRegex);
  let multaMatch = resposta.match(multaRegex);
  
  // Se não encontrou com o formato exato, tenta o mais simples
  if (!advertenciaMatch) {
    advertenciaMatch = resposta.match(advertenciaSimples);
  }
  
  if (!multaMatch) {
    multaMatch = resposta.match(multaSimples);
  }
  
  if (advertenciaMatch || multaMatch) {
    // Determinar tipo e conteúdo
    const isMulta = !!multaMatch;
    const documentoTexto = isMulta ? multaMatch[0] : advertenciaMatch[0];
    const tipoDocumento = isMulta ? "multa" : "advertencia";
    
    console.log("Documento detectado:", documentoTexto);
    
    // Extrair as partes relevantes
    let data = '';
    let valor = '';
    let descricao = '';
    let fundamentacao = '';
    
    // Expressões regulares para extrair campos específicos - mais abrangentes
    const dataRegex = /Data:?\s*([^\n]+)/i;
    const valorRegex = /Valor:?\s*R?\$?\s*([0-9.,]+)/i;
    const motivoRegex = /(?:Motivo|Descrição|Infração):?\s*([^\n]+(?:\n[^\n]+)*)/i;
    const descricaoRegex = /Descrição:?\s*([^\n]+(?:\n[^\n]+)*)/i;
    const fundamentacaoRegex = /(?:Fundamentação|Base Legal|Artigo|Lei):?\s*([^\n]+(?:\n[^\n]+)*)/i;
    
    // Extrair data
    const dataMatch = documentoTexto.match(dataRegex);
    if (dataMatch && dataMatch[1]) {
      data = dataMatch[1].trim();
    } else {
      // Tentar encontrar uma data no formato DD/MM/YYYY ou similar
      const dataFormatadaRegex = /(\d{1,2}\/\d{1,2}\/\d{2,4})/;
      const dataFormatadaMatch = documentoTexto.match(dataFormatadaRegex);
      if (dataFormatadaMatch && dataFormatadaMatch[1]) {
        data = dataFormatadaMatch[1];
      } else {
        data = new Date().toLocaleDateString('pt-BR'); // Data atual como fallback
      }
    }
    
    // Extrair valor (apenas para multas)
    if (isMulta) {
      const valorMatch = documentoTexto.match(valorRegex);
      if (valorMatch && valorMatch[1]) {
        valor = valorMatch[1].trim();
      } else {
        // Tentar encontrar um valor monetário no formato R$ X,XX ou similar
        const valorFormatadoRegex = /R\$\s*(\d+[.,]\d+)/i;
        const valorFormatadoMatch = documentoTexto.match(valorFormatadoRegex);
        if (valorFormatadoMatch && valorFormatadoMatch[1]) {
          valor = valorFormatadoMatch[1];
        } else {
          valor = "0,00"; // Valor padrão
        }
      }
    }
    
    // Extrair descrição/motivo - mais abrangente para capturar parágrafos inteiros
    const motivoMatch = documentoTexto.match(motivoRegex) || documentoTexto.match(descricaoRegex);
    if (motivoMatch && motivoMatch[1]) {
      descricao = motivoMatch[1].trim();
    } else {
      // Se não encontrou campos explícitos, tenta extrair o conteúdo principal
      // Remove cabeçalhos, data, valor e rodapé
      let textoLimpo = documentoTexto
        .replace(/(?:ADVERTÊNCIA GERADA:?|MULTA GERADA:?|FIM DOCUMENTO|⚠️ ADVERTÊNCIA GERADA|🔴 MULTA GERADA)/gi, '')
        .replace(/Data:?\s*[^\n]+/i, '')
        .replace(/Valor:?\s*R?\$?\s*[0-9.,]+/i, '')
        .replace(/(?:Fundamentação|Base Legal|Artigo|Lei):?\s*[^\n]+/i, '')
        .trim();
        
      // Remover linhas em branco extras
      textoLimpo = textoLimpo.replace(/\n\s*\n/g, '\n');
      
      // Se ainda tiver conteúdo, use como descrição
      if (textoLimpo) {
        descricao = textoLimpo;
      } else {
        // Último recurso: pegar todo o conteúdo depois do título
        const tituloRegex = isMulta ? /(?:MULTA GERADA:?|🔴 MULTA GERADA:?)/i : /(?:ADVERTÊNCIA GERADA:?|⚠️ ADVERTÊNCIA GERADA:?)/i;
        const partes = documentoTexto.split(tituloRegex);
        if (partes.length > 1) {
          descricao = partes[1].trim();
        } else {
          descricao = documentoTexto;
        }
      }
    }
    
    // Extrair fundamentação - mais abrangente para capturar parágrafos inteiros
    const fundamentacaoMatch = documentoTexto.match(fundamentacaoRegex);
    if (fundamentacaoMatch && fundamentacaoMatch[1]) {
      fundamentacao = fundamentacaoMatch[1].trim();
    } else {
      // Buscar por palavras-chave que indicam fundamentação legal
      const legalKeywords = /(?:(?:de acordo com|conforme|segundo|baseado n[ao]|nos termos d[ao]|[ao]rt(?:igo)?\.?)\s+(?:[0-9]+|[IVXLCDM]+))/i;
      const legalMatch = documentoTexto.match(legalKeywords);
      if (legalMatch) {
        // Extrair a sentença completa que contém a fundamentação
        const sentences = documentoTexto.split(/[.!?]\s+/);
        for (const sentence of sentences) {
          if (legalKeywords.test(sentence)) {
            fundamentacao = sentence.trim();
            break;
          }
        }
      }
    }
    
    // Adicionar fundamentação à descrição se estiver disponível e não estiver já incluída
    if (fundamentacao && !descricao.includes(fundamentacao)) {
      descricao += "\n\nFundamentação: " + fundamentacao;
    }
    
    console.log("Dados extraídos:", {
      tipo: tipoDocumento,
      data: data,
      descricao: descricao,
      valor: valor
    });
    
    // Configurar dados do documento
    const dadosDocumento = {
      tipo: tipoDocumento,
      data: data,
      descricao: descricao,
      valor: valor
    };
    
    // Mostrar botão para o documento
    setTimeout(() => mostrarBotaoPDF(tipoDocumento, dadosDocumento), 100);
    
    // Formatar a resposta para exibição
    const tituloOriginal = isMulta ? 
      (resposta.includes("🔴 MULTA GERADA") ? "🔴 MULTA GERADA" : "MULTA GERADA:") : 
      (resposta.includes("⚠️ ADVERTÊNCIA GERADA") ? "⚠️ ADVERTÊNCIA GERADA" : "ADVERTÊNCIA GERADA:");
    
    const tituloFormatado = isMulta 
      ? "<strong class='text-danger'>🔴 MULTA GERADA</strong>"
      : "<strong class='text-warning'>⚠️ ADVERTÊNCIA GERADA</strong>";
    
    // Formatar a resposta para exibição
    let respostaFormatada = resposta;
    if (tituloOriginal) {
      respostaFormatada = resposta.replace(tituloOriginal, tituloFormatado);
    }
    
    // Remover o marcador de fim se existir
    return respostaFormatada.replace("FIM DOCUMENTO", "");
  }
  
  return resposta; // Sem alterações se não for documento
}

// Função para mostrar botão de PDF
function mostrarBotaoPDF(tipo, dados) {
    const chat = document.getElementById("chat");
    const messageContainer = document.createElement('div');
    messageContainer.className = 'message-container bot';
    
    const messageWrapper = document.createElement('div');
    messageWrapper.className = 'message-wrapper';
    
    // Avatar
    const avatar = document.createElement('div');
    avatar.className = 'avatar bot';
    avatar.innerHTML = '<i class="fas fa-robot"></i>';
    
    // Message bubble com card
    const messageBubble = document.createElement('div');
    messageBubble.className = 'message-bubble';
    
    const tipoLabel = tipo === "multa" ? "Multa" : "Advertência";
    const corBadge = tipo === "multa" ? "red" : "yellow";
    const iconeBadge = tipo === "multa" ? "exclamation-circle" : "exclamation-triangle";
    
    // Formatar descrição para exibição no card, limitando a 150 caracteres com ellipsis
    let descricaoExibicao = dados.descricao;
    if (descricaoExibicao && descricaoExibicao.length > 150) {
        descricaoExibicao = descricaoExibicao.substring(0, 147) + '...';
    }
    
    // Substituir quebras de linha por <br> para exibição HTML
    descricaoExibicao = descricaoExibicao ? descricaoExibicao.replace(/\n/g, '<br>') : '';
    
    messageBubble.innerHTML = `
        <div class="document-card">
            <div class="document-card-header">
                <i class="fas fa-${iconeBadge} text-${corBadge}-600"></i>
                Documento de ${tipoLabel} Gerado
            </div>
            <div class="text-sm mt-2">
                <p><strong>Data:</strong> ${formatarData(dados.data)}</p>
                ${tipo === "multa" ? `<p><strong>Valor:</strong> R$ ${dados.valor}</p>` : ''}
                <p class="mt-1"><strong>Descrição:</strong><br>${descricaoExibicao}</p>
            </div>
            <div class="flex gap-2 mt-3">
                <button onclick="imprimirDocumento('${tipo}', ${JSON.stringify(dados).replace(/"/g, '&quot;')})" 
                        class="inline-flex items-center px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600">
                    <i class="fas fa-print mr-1"></i> Imprimir/PDF
                </button>
                <button onclick="gerarPDFSimples('${tipo}', ${JSON.stringify(dados).replace(/"/g, '&quot;')})" 
                        class="inline-flex items-center px-3 py-1 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50">
                    <i class="fas fa-file-pdf mr-1"></i> Alternativo
                </button>
            </div>
        </div>
    `;
    
    // Timestamp
    const messageTime = document.createElement('div');
    messageTime.className = 'message-time';
    const now = new Date();
    messageTime.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    messageBubble.appendChild(messageTime);
    
    messageWrapper.appendChild(avatar);
    messageWrapper.appendChild(messageBubble);
    messageContainer.appendChild(messageWrapper);
    
    chat.appendChild(messageContainer);
    chat.scrollTop = chat.scrollHeight;
}

// Nova função para gerar PDF de forma mais simples com jsPDF
async function gerarPDFSimples(tipo, dados) {
  try {
    // Mostrar mensagem de carregamento
    const loadingToast = new bootstrap.Toast(document.getElementById('loadingToast'));
    loadingToast.show();
    
    console.log("Gerando PDF simples com dados:", dados);
    
    // Pré-processamento dos dados
    const dadosProcessados = {
      tipo: tipo,
      data: formatarData(dados.data || new Date().toLocaleDateString('pt-BR')),
      descricao: dados.descricao || 'Descrição não fornecida',
      valor: dados.valor || '0,00'
    };
    
    // Criar um elemento temporário para o conteúdo formatado
    const tempElement = document.createElement('div');
    tempElement.style.width = '210mm';
    tempElement.style.padding = '15mm';
    tempElement.style.position = 'absolute';
    tempElement.style.left = '-9999px';
    tempElement.style.backgroundColor = 'white';
    tempElement.style.fontSize = '14px';
    tempElement.style.fontFamily = 'Arial, sans-serif';
    
    // Definir conteúdo do documento
    const titulo = tipo === 'multa' ? 'NOTIFICAÇÃO DE MULTA' : 'ADVERTÊNCIA DISCIPLINAR';
    const corCabecalho = tipo === 'multa' ? '#f8d7da' : '#fff3cd';
    
    // Criar HTML simples e direto
    tempElement.innerHTML = `
      <div style="text-align: center; margin-bottom: 20px; padding: 10px; background-color: ${corCabecalho};">
        <h1 style="font-size: 20px; font-weight: bold; margin: 0;">${titulo}</h1>
      </div>
      
      <div style="margin-bottom: 20px;">
        <p><strong>Data:</strong> ${dadosProcessados.data}</p>
        ${tipo === 'multa' ? `<p><strong>Valor da Multa:</strong> R$ ${dadosProcessados.valor}</p>` : ''}
      </div>
      
      <div style="margin-bottom: 20px;">
        <p><strong>Descrição:</strong></p>
        <p style="margin-left: 10px;">${dadosProcessados.descricao.replace(/\n/g, '<br>')}</p>
      </div>
      
      <div style="margin-top: 80px;">
        <div style="width: 200px; border-top: 1px solid #000; text-align: center; padding-top: 10px;">
          Assinatura do Notificado
        </div>
      </div>
      
      <div style="margin-top: 40px; font-style: italic; font-size: 12px; color: #666; text-align: center;">
        Este documento foi gerado automaticamente pelo sistema em ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}.
      </div>
    `;
    
    // Adicionar ao documento para renderização
    document.body.appendChild(tempElement);
    
    // Garantir que o elemento esteja visível para o html2canvas
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Usar html2canvas para renderizar o elemento como imagem
    const canvas = await html2canvas(tempElement, {
      scale: 2,
      useCORS: true,
      logging: true,
      backgroundColor: '#FFFFFF'
    });
    
    // Definir as dimensões do PDF (A4)
    const imgWidth = 210;
    const imgHeight = canvas.height * imgWidth / canvas.width;
    
    // Criar PDF usando jsPDF
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    // Adicionar a imagem ao PDF
    pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, imgWidth, imgHeight);
    
    // Configurar o nome do arquivo
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${tipo === 'multa' ? 'multa' : 'advertencia'}_${timestamp}.pdf`;
    
    // Salvar o PDF
    pdf.save(filename);
    
    // Limpar o elemento temporário
    document.body.removeChild(tempElement);
    
    // Esconder loading e mostrar sucesso
    loadingToast.hide();
    const successToast = new bootstrap.Toast(document.getElementById('successToast'));
    successToast.show();
    
    console.log("PDF gerado com sucesso (método simples)");
    
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    
    // Mostrar mensagem de erro
    const errorToast = new bootstrap.Toast(document.getElementById('errorToast'));
    document.getElementById('errorToastMessage').textContent = 'Erro ao gerar PDF: ' + error.message;
    errorToast.show();
  }
}

// Função para preparar e baixar o documento como PDF
async function prepareDownloadPDF(docUrl, docType) {
    try {
        // Mostrar mensagem de carregamento
        showLoadingToast();
        
        // Buscar o conteúdo HTML do documento
        const response = await fetch(docUrl);
        if (!response.ok) {
            throw new Error('Não foi possível carregar o documento');
        }
        
        // Obter o HTML do documento
        const html = await response.text();
        
        // Criar um elemento temporário para renderizar o HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        document.body.appendChild(tempDiv);
        
        // Remover elementos que não devem aparecer no PDF (como botões de impressão)
        const noPrintElements = tempDiv.querySelectorAll('.no-print');
        noPrintElements.forEach(el => el.remove());
        
        // Configurar opções do PDF
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${docType.toLowerCase()}_${timestamp}.pdf`;
        
        // Gerar o PDF usando html2pdf
        const pdfOptions = {
            margin: 10,
            filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        
        // Gerar e baixar o PDF
        await html2pdf().from(tempDiv).set(pdfOptions).save();
        
        // Limpar o elemento temporário
        tempDiv.remove();
        
        // Esconder mensagem de carregamento e mostrar mensagem de sucesso
        hideLoadingToast();
        showSuccessToast();
    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        hideLoadingToast();
        showErrorToast('Erro ao gerar PDF: ' + error.message);
    }
}

// Função para gerar o PDF localmente (sem chamar o servidor)
async function gerarPDFLocal(tipo, dados) {
  try {
    // Mostrar mensagem de carregamento
    const loadingToast = new bootstrap.Toast(document.getElementById('loadingToast'));
    loadingToast.show();
    
    console.log("Gerando PDF com dados:", dados);
    
    // Pré-processamento dos dados para garantir que estão corretos
    const dadosProcessados = {
      tipo: tipo,
      data: formatarData(dados.data || new Date().toLocaleDateString('pt-BR')),
      descricao: dados.descricao || 'Descrição não fornecida',
      valor: dados.valor || '0,00'
    };
    
    // Validar dados críticos
    if (!dadosProcessados.descricao || dadosProcessados.descricao.trim() === '') {
      throw new Error('A descrição do documento não pode estar vazia');
    }
    
    // Gerar HTML do documento baseado nos dados processados
    const htmlContent = gerarHTMLDocumento(tipo, dadosProcessados);
    
    // Criar elemento temporário para gerar o PDF
    const element = document.createElement('div');
    element.innerHTML = htmlContent;
    document.body.appendChild(element);
    
    // Tornar visível para renderização, mas fora da tela
    element.style.position = 'absolute';
    element.style.left = '-9999px';
    element.style.top = '-9999px';
    element.style.width = '210mm'; // Tamanho A4
    element.style.height = 'auto';
    element.style.visibility = 'visible'; // Ter certeza que está visível para renderização
    
    // Garantir que todas as imagens e fontes foram carregadas
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Configurar opções do PDF
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${tipo === 'multa' ? 'multa' : 'advertencia'}_${timestamp}.pdf`;
    
    const pdfOptions = {
      margin: [15, 15, 15, 15], // margens maiores [top, left, bottom, right]
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2,
        useCORS: true,
        logging: true,
        letterRendering: true
      },
      jsPDF: { 
        unit: 'mm', 
        format: 'a4', 
        orientation: 'portrait',
        compress: true
      }
    };
    
    // Gerar e baixar o PDF
    try {
      console.log("Iniciando geração do PDF...");
      const pdf = await html2pdf()
        .from(element)
        .set(pdfOptions)
        .toPdf()
        .get('pdf');
      
      // Verificar se o PDF tem páginas
      if (pdf.internal.getNumberOfPages() === 0) {
        throw new Error("Falha ao renderizar o conteúdo do PDF");
      }
      
      // Salvar o PDF
      pdf.save();
      console.log("PDF gerado com sucesso");
    } catch (pdfError) {
      console.error("Erro específico de PDF:", pdfError);
      throw pdfError;
    }
    
    // Remover elemento temporário após um tempo para garantir que o PDF foi gerado
    setTimeout(() => {
      element.remove();
    }, 1000);
    
    // Mostrar mensagem de sucesso
    loadingToast.hide();
    const successToast = new bootstrap.Toast(document.getElementById('successToast'));
    successToast.show();
    
    console.log("Processo de geração de PDF concluído com sucesso");
    
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    
    // Mostrar mensagem de erro
    const errorToast = new bootstrap.Toast(document.getElementById('errorToast'));
    document.getElementById('errorToastMessage').textContent = 'Erro ao gerar PDF: ' + error.message;
    errorToast.show();
  }
}

// Nova função para imprimir documento direto como PDF
function imprimirDocumento(tipo, dados) {
  try {
    console.log("Gerando documento para impressão:", dados);
    
    // Salvar conteúdo atual da página
    const conteudoOriginal = document.body.innerHTML;
    
    // Criar um conteúdo simples para impressão
    const titulo = tipo === 'multa' ? 'NOTIFICAÇÃO DE MULTA' : 'ADVERTÊNCIA DISCIPLINAR';
    const corCabecalho = tipo === 'multa' ? '#f8d7da' : '#fff3cd';
    const corTitulo = tipo === 'multa' ? '#721c24' : '#856404';
    
    // Processando os dados
    const dataFormatada = formatarData(dados.data || new Date().toLocaleDateString('pt-BR'));
    const descricaoFormatada = (dados.descricao || 'Descrição não fornecida').replace(/\n/g, '<br>');
    const valorMulta = dados.valor || '0,00';
    const timestamp = new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR');
    
    // Criar conteúdo do documento
    const conteudoImpressao = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>${titulo}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            color: #333;
          }
          .cabecalho {
            background-color: ${corCabecalho};
            padding: 15px;
            margin-bottom: 20px;
            text-align: center;
            border-radius: 5px;
          }
          h1 {
            color: ${corTitulo};
            margin: 0;
            font-size: 24px;
          }
          .data {
            margin-bottom: 20px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 10px;
          }
          .descricao {
            margin-bottom: 30px;
            text-align: justify;
          }
          .assinatura {
            margin-top: 100px;
            width: 200px;
            border-top: 1px solid #000;
            padding-top: 10px;
            text-align: center;
          }
          .rodape {
            margin-top: 80px;
            font-size: 12px;
            color: #666;
            text-align: center;
            font-style: italic;
          }
          h2 {
            font-size: 16px;
            margin-top: 20px;
            border-bottom: 1px solid #eee;
            padding-bottom: 5px;
          }
          .valor {
            font-weight: bold;
            color: ${tipo === 'multa' ? '#d9534f' : '#333'};
          }
          @media print {
            body {
              padding: 0;
              margin: 15mm;
            }
            .no-print {
              display: none !important;
            }
            .aviso-imprimir {
              display: none !important;
            }
          }
          .aviso-imprimir {
            background-color: #f8f9fa;
            padding: 15px;
            margin-bottom: 20px;
            border: 1px solid #ddd;
            border-radius: 5px;
            text-align: center;
          }
          .btn-imprimir {
            background-color: #007bff;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="aviso-imprimir">
          <p>Seu documento está pronto para impressão!</p>
          <button class="btn-imprimir" onclick="window.print();">Clique aqui para Imprimir/Salvar como PDF</button>
        </div>
        
        <div class="cabecalho">
          <h1>${titulo}</h1>
        </div>
        
        <div class="data">
          <strong>Data:</strong> ${dataFormatada}
          ${tipo === 'multa' ? `<br><strong>Valor da Multa:</strong> <span class="valor">R$ ${valorMulta}</span>` : ''}
        </div>
        
        <h2>Descrição:</h2>
        <div class="descricao">
          ${descricaoFormatada}
        </div>
        
        <div class="assinatura">
          Assinatura do Notificado
        </div>
        
        <div class="rodape">
          Este documento foi gerado automaticamente pelo sistema em ${timestamp}.
        </div>
      </body>
      </html>
    `;
    
    // Substituir o conteúdo da página com o documento para impressão
    document.body.innerHTML = conteudoImpressao;
    
    // Adicionar evento para restaurar a página após impressão
    window.onafterprint = function() {
      document.body.innerHTML = conteudoOriginal;
      
      // Restaurar event listeners e scripts
      eval(document.querySelectorAll('script[src*="chat.js"]')[0].outerHTML);
      
      // Exibir mensagem de sucesso
      const successToast = new bootstrap.Toast(document.getElementById('successToast'));
      successToast.show();
    };
    
    // Focar no botão de impressão
    setTimeout(() => {
      const btnImprimir = document.querySelector('.btn-imprimir');
      if (btnImprimir) btnImprimir.focus();
    }, 100);
    
    console.log("Documento de impressão preparado");
    
  } catch (error) {
    console.error('Erro ao preparar documento:', error);
    
    // Mostrar mensagem de erro
    const errorToast = new bootstrap.Toast(document.getElementById('errorToast'));
    document.getElementById('errorToastMessage').textContent = 'Erro ao gerar documento: ' + error.message;
    errorToast.show();
  }
}

// Função para mostrar seletor de data
function mostrarSeletorData() {
    const chat = document.getElementById("chat");
    const dateDiv = document.createElement('div');
    dateDiv.id = 'dateControl';
    dateDiv.className = 'date-control';
    dateDiv.innerHTML = `
        <input type="date" id="dateInput" class="form-control">
        <button id="submitDate" class="btn btn-primary mt-2">Confirmar Data</button>
    `;
    chat.appendChild(dateDiv);
    
    // Configurar eventos do seletor de data
    document.getElementById('submitDate').addEventListener('click', () => {
        const dateValue = document.getElementById('dateInput').value;
        
        if (dateValue) {
            // Remover controle de data
            document.getElementById('dateControl').remove();
            
            // Adicionar mensagem com a data
            addMessage(dateValue, true);
            
            // Processar resposta no fluxo
            processarRespostaFluxo(dateValue);
        } else {
            alert('Por favor, selecione uma data.');
        }
    });
}

// Função para lidar com tecla Enter
function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey && !isProcessing) {
        event.preventDefault();
        sendMessage();
    }
}

// Modificação da função sendMessage existente
async function sendMessage() {
    if (isProcessing) return; // Evitar múltiplas chamadas durante o processamento
    
    if (!selectedAssistantId) {
        alert('Por favor, selecione um assistente primeiro!');
        return;
    }

    const input = document.getElementById("input");
    const message = input.value.trim();
    
    if (!message) return;

    input.value = "";
    input.style.height = 'auto'; // Reset altura do textarea
    addMessage(message, true);
    
    // Verificar se estamos em um fluxo guiado
    if (inGuidedFlow) {
        processarRespostaFluxo(message);
        return;
    }
    
    // Detectar intenção de criar documento
    const intencao = detectarIntencaoDocumento(message);
    if (intencao) {
        iniciarFluxoGuiado(intencao);
        return;
    }
    
    // Desabilitar entrada do usuário
    disableUserInput();

    try {
        addTypingIndicator();

        // Usar o ID do usuário logado (definido no template)
        const userId = window.currentUserId || 'default_user';
        
        fetch(`${baseUrl}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                assistant_id: selectedAssistantId,
                message: message,
                user_id: userId
            })
        })
        .then(response => response.json())
        .then(data => {
            removeTypingIndicator();

            if (data.error) {
                throw new Error(data.error);
            }

            // Processar a resposta antes de exibir
            const processedResponse = processarRespostaAssistente(data.response);
            addMessage(processedResponse, false);
        })
        .catch(error => {
            removeTypingIndicator();
            addMessage(`❌ Erro: ${error.message}`, false);
        });
    } catch (error) {
        removeTypingIndicator();
        addMessage(`❌ Erro: ${error.message}`, false);
    } finally {
        // Habilitar entrada do usuário novamente
        enableUserInput();
    }
}

// Função auxiliar para formatar o nome do assistente
function formatAssistantName(fullName) {
    // Se não houver nome, retorna um valor padrão
    if (!fullName) return 'Assistente';
    
    // Remove o número e hífen do início do nome
    // Exemplo: "467 - CUBE ITAIM" -> "CUBE ITAIM"
    return fullName.replace(/^\d+\s*-\s*/, '');
}

// Função para resetar thread
async function resetThread(loadHistory = false) {
    if (!loadHistory && !confirm('Tem certeza que deseja iniciar uma nova conversa? O histórico atual será perdido.')) {
        return;
    }

    try {
        // Só faz a requisição se não estiver carregando histórico
        if (!loadHistory) {
            const response = await fetch('/reset-thread', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });

            if (!response.ok) {
                throw new Error('Erro ao reiniciar a conversa');
            }
        }

        // Buscar o nome do assistente do localStorage
        const assistantName = localStorage.getItem('selectedAssistantName');
        const formattedName = formatAssistantName(assistantName);

        // Limpar a área de chat
        const chatElement = document.getElementById("chat");
        if (chatElement) {
            chatElement.innerHTML = '';
        }
        
        if (loadHistory && selectedAssistantId) {
            // Carregar histórico do localStorage
            const messages = loadMessageHistory(selectedAssistantId);
            
            if (messages && messages.length > 0) {
                // Adicionar cada mensagem do histórico ao chat
                messages.forEach(msg => {
                    addMessage(msg.text, msg.isUser, false); // false para não salvar novamente no histórico
                });
            } else {
                // Se não tiver histórico, mostrar mensagem inicial
                addMessage(`✨ Nova conversa iniciada com ${formattedName}!`, false);
            }
        } else {
            // Mensagem padrão para nova conversa
            addMessage(`✨ Nova conversa iniciada com ${formattedName}!`, false);
        }
    } catch (error) {
        addMessage(`❌ Erro ao reiniciar conversa: ${error.message}`, false);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM carregado');
    
    // Variáveis para controle de paginação
    let currentPage = 0;
    const pageSize = 100;
    let allAssistants = []; // Armazenar todos os assistentes carregados
    let isLoading = false;
    let hasMoreAssistants = false;
    
    // Adicionar listener para o campo de pesquisa
    const searchInput = document.getElementById('searchAssistantInput');
    
    if (searchInput) {
        searchInput.addEventListener('keyup', function(event) {
            if (event.key === 'Enter') {
                currentPage = 0;
                window.currentPage = 0;
                loadAssistants(true);
            }
        });
    }
    
    // Adiciona foco inicial ao input quando a página carrega
    const inputElement = document.getElementById('input');
    if (inputElement) {
        inputElement.focus();
    }
    
    // Função para exibir os assistentes na lista
    function displayAssistants(assistantsToDisplay) {
        const assistantList = document.getElementById('assistantList');
        if (!assistantList) return;
        
        assistantList.innerHTML = ''; // Limpar lista
        
        if (assistantsToDisplay.length === 0) {
            const emptyItem = document.createElement('div');
            emptyItem.className = 'text-center py-8';
            
            if (currentPage === 0) {
                // Se for a primeira página e não tiver assistentes, adicionar mensagem especial
                emptyItem.innerHTML = `
                    <div class="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-200 rounded-xl p-6 shadow-lg">
                        <div class="text-center">
                            <i class="fas fa-exclamation-triangle text-yellow-600 text-3xl mb-3"></i>
                            <h3 class="text-lg font-semibold text-gray-800 mb-2">Nenhum assistente encontrado</h3>
                            <p class="text-gray-600 mb-3">Não há assistentes disponíveis no banco de dados.</p>
                            <p class="text-sm text-gray-500">Acesse a tela de <strong>Configurações</strong> e clique em "Atualizar Assistentes da API".</p>
                        </div>
                    </div>
                `;
            } else {
                emptyItem.innerHTML = `
                    <div class="text-center py-8">
                        <i class="fas fa-search text-gray-400 text-3xl mb-3"></i>
                        <p class="text-gray-500 font-medium">Nenhum assistente encontrado</p>
                        <p class="text-sm text-gray-400 mt-1">Tente ajustar os termos de busca</p>
                    </div>
                `;
            }
            
            assistantList.appendChild(emptyItem);
            return;
        }

        // Adicionar assistentes à lista
        assistantsToDisplay.forEach(assistant => {
            const listItem = document.createElement('div');
            listItem.className = 'flex justify-between items-center p-4 bg-gradient-to-r from-white to-gray-50 border border-gray-200 rounded-xl hover:shadow-lg hover:border-blue-300 transition-all duration-300 transform hover:-translate-y-1';
            
            listItem.innerHTML = `
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                        <i class="fas fa-robot"></i>
                    </div>
                    <div>
                        <p class="font-semibold text-gray-900">${assistant.name || 'Assistente sem nome'}</p>
                        <p class="text-sm text-gray-500">${assistant.id}</p>
                    </div>
                </div>
                <button onclick="selectAssistant('${assistant.id}', '${assistant.name}')" 
                        class="px-6 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-blue-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 transform hover:scale-105">
                    Selecionar
                </button>
            `;
            
            assistantList.appendChild(listItem);
        });
        
        // Exibir botão "Carregar mais" se houver mais assistentes
        if (hasMoreAssistants) {
            updateLoadMoreButton();
        }
    }
    
    // Função para atualizar o botão "Carregar mais"
    function updateLoadMoreButton() {
        // Remover botão existente se houver
        const existingButton = document.getElementById('loadMoreButton');
        if (existingButton) {
            existingButton.remove();
        }
        
        // Adicionar novo botão se houver mais assistentes
        if (hasMoreAssistants) {
            const assistantList = document.getElementById('assistantList');
            const loadMoreDiv = document.createElement('div');
            loadMoreDiv.className = 'text-center mt-6';
            
            loadMoreDiv.innerHTML = `
                <button id="loadMoreButton" onclick="loadAssistants()" 
                        class="px-6 py-3 bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 font-medium border border-gray-300 rounded-xl hover:from-gray-200 hover:to-gray-300 hover:shadow-lg transition-all duration-200 transform hover:scale-105">
                    <i class="fas fa-chevron-down mr-2"></i>
                    Carregar mais assistentes
                </button>
            `;
            
            assistantList.appendChild(loadMoreDiv);
        }
    }
    
    // Definir loadAssistants globalmente
    window.loadAssistants = async function(forceRefresh = false) {
        if (isLoading && !forceRefresh) return;
        
        isLoading = true;
        showLoading();
        
        try {
            // Montar a URL com paginação
            const apiUrl = `/list-assistants?limit=${pageSize}&offset=${currentPage * pageSize}`;
            
            // Se há termo de pesquisa, adicionar ao parâmetro de busca
            const searchTerm = document.getElementById('searchAssistantInput')?.value || '';
            const finalUrl = searchTerm 
                ? `${apiUrl}&search=${encodeURIComponent(searchTerm)}` 
                : apiUrl;
            
            // Fazer a requisição à API
            const response = await fetch(finalUrl);
            
            if (!response.ok) {
                throw new Error(`Erro ao carregar assistentes: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Primeira página: limpar a lista existente
            if (currentPage === 0 || forceRefresh) {
                allAssistants = [];
            }
            
            // Adicionar os novos assistentes à lista completa
            if (data.assistants && data.assistants.length > 0) {
                allAssistants = allAssistants.concat(data.assistants);
                currentPage++;
                hasMoreAssistants = data.has_more || false;
            } else {
                hasMoreAssistants = false;
            }
            
            // Exibir os assistentes
            displayAssistants(allAssistants);
            
            // Atualizar botão de carregar mais
            updateLoadMoreButton();
            
        } catch (error) {
            console.error('Erro ao carregar assistentes:', error);
            const assistantList = document.getElementById('assistantList');
            if (assistantList) {
                assistantList.innerHTML = `
                    <div class="bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 rounded-xl p-6 shadow-lg">
                        <div class="text-center">
                            <i class="fas fa-exclamation-circle text-red-600 text-3xl mb-3"></i>
                            <h3 class="text-lg font-semibold text-gray-800 mb-2">Erro ao carregar assistentes</h3>
                            <p class="text-gray-600">${error.message}</p>
                        </div>
                    </div>
                `;
            }
        } finally {
            isLoading = false;
            hideLoading();
        }
    };
    
    // Função para pesquisar assistentes (chamada pelo botão de lupa)
    window.searchAssistants = function() {
        currentPage = 0;
        window.currentPage = 0;
        loadAssistants(true);
    };
    
    // Função para carregar e exibir a lista de conversas recentes
    function loadRecentConversationsList() {
        const conversationsList = document.getElementById('recentConversationsList');
        if (!conversationsList) return;
        
        // Limpar lista atual
        conversationsList.innerHTML = '';
        
        // Obter conversas recentes
        const recentConversations = loadRecentConversations();
        
        if (recentConversations.length === 0) {
            conversationsList.innerHTML = `
                <div class="text-center py-12">
                    <div class="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6 shadow-lg">
                        <i class="fas fa-comments text-blue-400 text-4xl mb-4"></i>
                        <h3 class="text-lg font-semibold text-gray-800 mb-2">Nenhuma conversa recente</h3>
                        <p class="text-gray-600">Suas conversas aparecerão aqui após você começar a usar os assistentes.</p>
                    </div>
                </div>
            `;
            return;
        }
        
        // Adicionar cada conversa à lista
        recentConversations.forEach(conv => {
            const listItem = document.createElement('div');
            listItem.className = 'flex justify-between items-center p-4 bg-gradient-to-r from-white to-gray-50 border border-gray-200 rounded-xl hover:shadow-lg hover:border-blue-300 transition-all duration-300 transform hover:-translate-y-1';
            
            // Formatação da data
            const date = new Date(conv.lastUpdate);
            const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            listItem.innerHTML = `
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 bg-gradient-to-r from-green-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                        <i class="fas fa-comments"></i>
                    </div>
                    <div>
                        <p class="font-semibold text-gray-900">${conv.name}</p>
                        <p class="text-sm text-gray-500">${formattedDate} - ${conv.messageCount} mensagens</p>
                    </div>
                </div>
                <button onclick="resumeConversation('${conv.id}', '${conv.name}')" 
                        class="px-6 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white text-sm font-medium rounded-lg hover:from-green-600 hover:to-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-all duration-200 transform hover:scale-105">
                    Continuar
                </button>
            `;
            
            conversationsList.appendChild(listItem);
        });
    }
    
    // Adicionar função global para retomar conversa
    window.resumeConversation = function(assistantId, assistantName) {
        // Selecionar o assistente e carregar o histórico
        window.selectAssistant(assistantId, assistantName);
        
        // Fechar o modal
        closeConversationsModal();
    };
    
    // Adicionar evento para carregar conversas quando o modal abrir
    window.openConversationsModal = function() {
        document.getElementById('conversationsModal').classList.remove('hidden');
        loadRecentConversationsList();
    };
    
    // Tornar funções necessárias globais
    window.displayAssistants = displayAssistants;
    window.updateLoadMoreButton = updateLoadMoreButton;
});

// Função para selecionar um assistente (precisa ser global)
window.selectAssistant = function(assistantId, assistantName) {
    selectedAssistantId = assistantId;
    localStorage.setItem('selectedAssistantId', assistantId);
    localStorage.setItem('selectedAssistantName', assistantName); // Armazenar o nome
    
    // Atualizar o nome no header se o elemento existir
    const assistantNameElement = document.getElementById('assistantName');
    if (assistantNameElement) {
        assistantNameElement.textContent = assistantName;
    }
    
    // Fechar o modal
    closeAssistantModal();
    
    // Mostrar mensagem de sucesso
    showSuccessToast();
    addMessage(`✨ Assistente "${assistantName}" selecionado com sucesso!`, false);
    
    // Verificar se temos histórico para este assistente
    const history = loadMessageHistory(assistantId);
    
    if (history && history.length > 0) {
        // Perguntar se deseja carregar o histórico
        showConfirmDialog(
            `Existe uma conversa anterior com ${assistantName}. Deseja carregá-la?`,
            () => {
                // Usuário clicou em "Sim" - carregar histórico
                resetThread(true);
            },
            () => {
                // Usuário clicou em "Não" - limpar histórico
                resetThread();
            }
        );
        return;
    }
    
    // Se não tiver histórico ou usuário não quiser carregar, limpar histórico atual
    resetThread();
}

// Função para desabilitar a entrada do usuário durante o processamento
function disableUserInput() {
    isProcessing = true;
    const inputElement = document.getElementById('input');
    const sendButton = document.getElementById('sendButton');
    
    if (inputElement) {
        inputElement.disabled = true;
    }
    if (sendButton) {
        sendButton.disabled = true;
    }
}

// Função para habilitar a entrada do usuário após o processamento
function enableUserInput() {
    isProcessing = false;
    const inputElement = document.getElementById('input');
    const sendButton = document.getElementById('sendButton');
    
    if (inputElement) {
        inputElement.disabled = false;
        // Focar no campo de entrada para facilitar a digitação da próxima mensagem
        inputElement.focus();
    }
    if (sendButton) {
        sendButton.disabled = false;
    }
}

// Funções auxiliares para os controles especiais

// Função para mostrar controle de upload de arquivos
function mostrarControleUpload() {
    const chat = document.getElementById("chat");
    const uploadDiv = document.createElement('div');
    uploadDiv.id = 'uploadControl';
    uploadDiv.className = 'upload-control';
    uploadDiv.innerHTML = `
        <div class="dropzone" id="dropzone">
            <i class="fas fa-cloud-upload-alt"></i>
            <p>Arraste arquivos aqui ou clique para selecionar</p>
            <input type="file" id="fileInput" multiple style="display: none;">
        </div>
        <div id="fileList" class="file-list"></div>
        <button id="submitFiles" class="btn btn-primary mt-2">Enviar Arquivos</button>
    `;
    chat.appendChild(uploadDiv);
    
    // Configurar eventos de upload
    configurarUpload();
}

// Função para configurar os eventos de upload
function configurarUpload() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const fileList = document.getElementById('fileList');
    const submitButton = document.getElementById('submitFiles');
    
    // Armazenar arquivos selecionados
    let selectedFiles = [];
    
    // Configurar evento de clique
    dropzone.addEventListener('click', () => {
        fileInput.click();
    });
    
    // Configurar evento de seleção de arquivo
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        selectedFiles = files;
        mostrarArquivos(files);
    });
    
    // Configurar eventos de drag and drop
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    
    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });
    
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        
        const files = Array.from(e.dataTransfer.files);
        selectedFiles = files;
        mostrarArquivos(files);
    });
    
    // Configurar envio de arquivos
    submitButton.addEventListener('click', () => {
        if (selectedFiles.length > 0) {
            // Armazenar arquivos no flowData
            flowData[guidedFlows[currentFlow].passos[flowStep].campo] = selectedFiles;
            
            // Remover controle de upload
            document.getElementById('uploadControl').remove();
            
            // Adicionar mensagem com lista de arquivos
            const fileNames = selectedFiles.map(f => f.name).join(', ');
            addMessage(`Arquivos selecionados: ${fileNames}`, true);
            
            // Avançar para o próximo passo
            flowStep++;
            proximoPasso();
        } else {
            alert('Por favor, selecione pelo menos um arquivo.');
        }
    });
    
    // Função para mostrar arquivos selecionados
    function mostrarArquivos(files) {
        fileList.innerHTML = '';
        
        files.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <span>${file.name}</span>
                <button class="btn btn-sm btn-danger remove-file">×</button>
            `;
            fileList.appendChild(fileItem);
            
            // Configurar remoção de arquivo
            fileItem.querySelector('.remove-file').addEventListener('click', () => {
                const index = selectedFiles.indexOf(file);
                if (index !== -1) {
                    selectedFiles.splice(index, 1);
                    mostrarArquivos(selectedFiles);
                }
            });
        });
    }
}

// Função para processar HTML de forma segura
function sanitizeAndFormatHTML(html) {
    // Lista de tags permitidas para formatação básica
    const allowedTags = ['b', 'strong', 'i', 'em', 'u', 'br', 'p', 'span', 'div'];
    
    // Converter quebras de linha em <br>
    html = html.replace(/\n/g, '<br>');
    
    // Permitir apenas tags básicas de formatação
    // Esta é uma implementação simples - em produção, considere usar uma biblioteca como DOMPurify
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Remover scripts e outros elementos perigosos
    const scripts = tempDiv.querySelectorAll('script');
    scripts.forEach(script => script.remove());
    
    const links = tempDiv.querySelectorAll('a');
    links.forEach(link => {
        // Manter apenas links seguros
        if (link.href && (link.href.startsWith('http') || link.href.startsWith('mailto:'))) {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        }
    });
    
    return tempDiv.innerHTML;
}

// Função para adicionar mensagem ao chat
function addMessage(message, isUser, saveToHistory = true) {
    const chat = document.getElementById("chat");
    const messageContainer = document.createElement('div');
    messageContainer.className = `message-container ${isUser ? 'user' : 'bot'}`;
    
    const messageWrapper = document.createElement('div');
    messageWrapper.className = 'message-wrapper';
    
    // Avatar
    const avatar = document.createElement('div');
    avatar.className = `avatar ${isUser ? 'user' : 'bot'}`;
    avatar.innerHTML = isUser ? window.userInitial || 'U' : '<i class="fas fa-robot"></i>';
    
    // Message bubble
    const messageBubble = document.createElement('div');
    messageBubble.className = 'message-bubble';
    
    // Verificar se a mensagem contém URL de documento e não é do usuário
    if (!isUser && typeof message === 'string') {
        // Procurar por URLs de documentos de advertência ou multa
        const docUrlRegex = /(https?:\/\/[^\s]+\/static\/documentos\/(advertencia|multa)_[^\s"]+\.html)/gi;
        const docMatch = message.match(docUrlRegex);
        
        if (docMatch && docMatch.length > 0) {
            // Extrair informações para exibição
            const docUrl = docMatch[0];
            const isAdvertencia = docUrl.includes('advertencia');
            const docType = isAdvertencia ? 'Advertência' : 'Multa';
            
            // Formatar mensagem com botão de visualizar e baixar
            let formattedMessage = message.replace(docUrlRegex, '');
            
            // Adicionar card de documento
            formattedMessage += `
                <div class="document-card">
                    <div class="document-card-header">
                        <i class="fas fa-file-alt text-${isAdvertencia ? 'yellow' : 'red'}-600"></i>
                        Documento de ${docType}
                    </div>
                    <div class="flex gap-2 mt-2">
                        <a href="${docUrl}" target="_blank" class="inline-flex items-center px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600">
                            <i class="fas fa-eye mr-1"></i> Visualizar
                        </a>
                        <button onclick="prepareDownloadPDF('${docUrl}', '${docType}')" class="inline-flex items-center px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600">
                            <i class="fas fa-file-pdf mr-1"></i> Baixar PDF
                        </button>
                    </div>
                </div>
            `;
            
            messageBubble.innerHTML = formattedMessage;
        } else {
            // Usar innerHTML para permitir renderização de tags HTML com sanitização
            messageBubble.innerHTML = sanitizeAndFormatHTML(message);
        }
    } else {
        // Para mensagens do usuário, manter textContent por segurança
        if (isUser) {
            messageBubble.textContent = message;
        } else {
            // Para mensagens do bot, usar innerHTML para permitir formatação com sanitização
            messageBubble.innerHTML = sanitizeAndFormatHTML(message);
        }
    }
    
    // Timestamp
    const messageTime = document.createElement('div');
    messageTime.className = 'message-time';
    const now = new Date();
    messageTime.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    messageBubble.appendChild(messageTime);
    
    // Montar a estrutura
    messageWrapper.appendChild(avatar);
    messageWrapper.appendChild(messageBubble);
    messageContainer.appendChild(messageWrapper);
    
    chat.appendChild(messageContainer);
    chat.scrollTop = chat.scrollHeight;
    
    // Salvar mensagem no histórico se tiver um assistente selecionado e saveToHistory for true
    if (saveToHistory && selectedAssistantId) {
        const assistantName = localStorage.getItem('selectedAssistantName') || 'Assistente';
        saveMessageToHistory(message, isUser, selectedAssistantId, assistantName);
    }
}

// Função para mostrar modal de confirmação personalizado
function showConfirmDialog(message, onConfirm, onCancel) {
    // Criar overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;
    
    // Criar modal
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        text-align: center;
    `;
    
    // Ícone de aviso
    const icon = document.createElement('div');
    icon.style.cssText = `
        width: 48px;
        height: 48px;
        background-color: #fef3c7;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 16px;
    `;
    icon.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: #f59e0b; font-size: 20px;"></i>';
    
    // Título
    const title = document.createElement('h3');
    title.textContent = 'Confirmação';
    title.style.cssText = `
        margin: 0 0 12px 0;
        font-size: 18px;
        font-weight: 600;
        color: #1f2937;
    `;
    
    // Mensagem
    const messageEl = document.createElement('p');
    messageEl.textContent = message;
    messageEl.style.cssText = `
        margin: 0 0 24px 0;
        color: #6b7280;
        line-height: 1.5;
    `;
    
    // Container dos botões
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex;
        gap: 12px;
        justify-content: center;
    `;
    
    // Botão Não
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Não';
    cancelButton.style.cssText = `
        padding: 8px 16px;
        border: 1px solid #d1d5db;
        background: white;
        color: #374151;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
    `;
    
    // Botão Sim
    const confirmButton = document.createElement('button');
    confirmButton.textContent = 'Sim';
    confirmButton.style.cssText = `
        padding: 8px 16px;
        border: none;
        background: #3b82f6;
        color: white;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
    `;
    
    // Eventos dos botões
    cancelButton.addEventListener('click', () => {
        document.body.removeChild(overlay);
        if (onCancel) onCancel();
    });
    
    confirmButton.addEventListener('click', () => {
        document.body.removeChild(overlay);
        if (onConfirm) onConfirm();
    });
    
    // Hover effects
    cancelButton.addEventListener('mouseenter', () => {
        cancelButton.style.backgroundColor = '#f9fafb';
    });
    cancelButton.addEventListener('mouseleave', () => {
        cancelButton.style.backgroundColor = 'white';
    });
    
    confirmButton.addEventListener('mouseenter', () => {
        confirmButton.style.backgroundColor = '#2563eb';
    });
    confirmButton.addEventListener('mouseleave', () => {
        confirmButton.style.backgroundColor = '#3b82f6';
    });
    
    // Montar o modal
    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(confirmButton);
    
    modal.appendChild(icon);
    modal.appendChild(title);
    modal.appendChild(messageEl);
    modal.appendChild(buttonContainer);
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Fechar com ESC
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            document.body.removeChild(overlay);
            document.removeEventListener('keydown', handleEscape);
            if (onCancel) onCancel();
        }
    };
    document.addEventListener('keydown', handleEscape);
    
    // Focar no botão "Sim" por padrão
    confirmButton.focus();
}

// Função para salvar uma mensagem no histórico