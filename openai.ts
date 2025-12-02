import OpenAI from 'openai';
import type { Ocorrencia } from '../types';
import axios from 'axios';
import { getAssistantById } from './assistants';
import { buscarConfiguracoes } from './configuracoes';

// URL da API do serviço de assistentes
const ASSISTANT_API_URL = 'http://localhost:5358';

// Função para obter uma instância do cliente OpenAI com a chave da API
const getOpenAIClient = async (): Promise<OpenAI> => {
  try {
    // Buscar a chave da API das configurações
    const configs = await buscarConfiguracoes();
    const apiKey = configs.openai_api_key;
    
    if (!apiKey) {
      throw new Error("Chave da API da OpenAI não configurada");
    }
    
    // Retornar uma nova instância com a chave configurada
    return new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true, // Para uso no frontend (em produção, use um backend)
    });
  } catch (error) {
    console.error("Erro ao inicializar cliente OpenAI:", error);
    
    // Fallback para variável de ambiente (caso exista)
    return new OpenAI({
      apiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
      dangerouslyAllowBrowser: true,
    });
  }
};

// Interface para a requisição de thread
interface ThreadRequest {
  assistantId: string;
  messages: {
    role: 'user';
    content: string;
  }[];
}

// Interface para a resposta da API
interface AssistantResponse {
  id: string;
  response: string;
  status: 'completed' | 'error';
}

// Formatar data para exibição
const formatarData = (data: string): string => {
  try {
    const partes = data.split('-');
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  } catch (error) {
    return data;
  }
};

// Função para limpar a resposta do assistant, removendo marcadores e referências
const limparRespostaAssistant = (resposta: string): string => {
  // Remove marcadores como 【4:0†00388 - CONVENÇÃO.pdf】
  // mas preserva todo o conteúdo real da resposta
  return resposta.replace(/【[^】]*】/g, '').trim();
};

// Função para pós-processar o documento e remover repetições indesejadas
const posProcessarDocumento = (documento: string, tipo: 'multa' | 'advertencia'): string => {
  // Corrigir atribuição equivocada do Art. 10 da Lei de Condomínio ao Regimento Interno
  documento = documento.replace(/De acordo com o Regimento Interno, Art\. 10[^\.]+ - É defeso a qualquer condômino/gi, 
    'De acordo com a Lei de Condomínio nº 4.591/64, Art. 10 - É defeso a qualquer condômino');
  
  // Primeiro, remover o marcador [FOTO(S)] do texto - usar expressão regular para pegar inclusive variações
  documento = documento.replace(/\[FOTO\(S\)\]|\[FOTO\]|\[FOTOS\]|\[FOTO\(s\)\]/gi, '');
  
  // Remover também qualquer marcador de verificação que possa ter sido incluído
  documento = documento.replace(/\[VERIFICAR ARTIGO APLICÁVEL\]|\[VERIFICAR ARTIGO\]|\[ARTIGO APLICÁVEL\]/gi, 'Art. aplicável do regulamento');
  
  // Remover linhas vazias duplicadas que podem ter sido criadas após as remoções
  documento = documento.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  // Dividir o documento em linhas para processamento
  const linhas = documento.split('\n');
  const linhasProcessadas: string[] = [];
  
  // Verificar se já encontramos os cabeçalhos principais
  let encontrouCondominio = false;
  let encontrouTitulo = false;
  let encontrouLinha = false;
  let dentroDoCorpo = false;
  
  // Palavra a procurar baseada no tipo de documento
  const tituloPrincipal = tipo === 'advertencia' ? 'ADVERTÊNCIA' : 'NOTIFICAÇÃO DE MULTA';
  
  for (const linha of linhas) {
    const linhaLimpa = linha.trim();
    
    // Pular linhas vazias consecutivas que podem ter sido criadas pela remoção do marcador [FOTO(S)]
    if (linhaLimpa === '' && linhasProcessadas.length > 0 && linhasProcessadas[linhasProcessadas.length - 1].trim() === '') {
      continue;
    }
    
    // Verifica se estamos na parte inicial do documento
    if (!dentroDoCorpo) {
      // Se já temos o cabeçalho inicial completo e encontramos uma linha com "Prezado"
      // consideramos que estamos no corpo do texto
      if ((encontrouCondominio && encontrouTitulo && encontrouLinha) && 
          linhaLimpa.startsWith('Prezado')) {
        dentroDoCorpo = true;
        linhasProcessadas.push(linha);
        continue;
      }
      
      // Verifica se é o cabeçalho "CONDOMÍNIO"
      if (linhaLimpa === 'CONDOMÍNIO') {
        if (!encontrouCondominio) {
          encontrouCondominio = true;
          linhasProcessadas.push(linha);
        }
        // Se já encontramos, ignoramos
        continue;
      }
      
      // Verifica se é o título (ADVERTÊNCIA ou NOTIFICAÇÃO DE MULTA)
      if (linhaLimpa === tituloPrincipal) {
        if (!encontrouTitulo) {
          encontrouTitulo = true;
          linhasProcessadas.push(linha);
        }
        // Se já encontramos, ignoramos
        continue;
      }
      
      // Verifica se é uma linha horizontal (geralmente uma sequência de hífens ou underscores)
      if (linhaLimpa.match(/^[-_]{3,}$/)) {
        if (!encontrouLinha) {
          encontrouLinha = true;
          linhasProcessadas.push(linha);
        }
        // Se já encontramos, ignoramos
        continue;
      }
      
      // Adiciona todas as outras linhas normalmente
      linhasProcessadas.push(linha);
    } else {
      // No corpo do texto, removemos qualquer linha que seja apenas "CONDOMÍNIO" ou o título
      if (linhaLimpa === 'CONDOMÍNIO' || linhaLimpa === tituloPrincipal) {
        continue;
      }
      
      // Adicionamos todas as outras linhas normalmente
      linhasProcessadas.push(linha);
    }
  }
  
  // Remover linhas vazias duplicadas consecutivas
  const resultado: string[] = [];
  let ultimaLinhaVazia = false;
  
  for (const linha of linhasProcessadas) {
    const linhaLimpa = linha.trim();
    
    if (linhaLimpa === '') {
      if (!ultimaLinhaVazia) {
        resultado.push(linha);
        ultimaLinhaVazia = true;
      }
    } else {
      resultado.push(linha);
      ultimaLinhaVazia = false;
    }
  }
  
  return resultado.join('\n');
};

// Usamos uma flag para evitar tentativas repetidas quando o serviço está indisponível
let assistantServiceAvailable = true;

// Gerar documento usando o assistant específico do condomínio
export const gerarDocumentoComAssistant = async (ocorrencia: Ocorrencia, tipo: 'multa' | 'advertencia'): Promise<string> => {
  try {
    if (!ocorrencia.external_assistant_id) {
      throw new Error("Assistente do condomínio não especificado");
    }

    // Log para verificar o ID do assistente
    console.log('==== INFORMAÇÕES DE DEPURAÇÃO ====');
    console.log(`ID do assistente selecionado: ${ocorrencia.external_assistant_id}`);
    
    // Tenta obter informações do assistente
    try {
      const assistentInfo = await getAssistantById(ocorrencia.external_assistant_id);
      if (assistentInfo) {
        console.log(`Nome do assistente: ${assistentInfo.name}`);
        console.log(`Modelo usado: ${assistentInfo.model}`);
        console.log(`Instruções: ${assistentInfo.instructions}`);
      } else {
        console.log('Não foi possível obter informações detalhadas do assistente');
      }
    } catch (error) {
      console.log('Erro ao obter informações do assistente:', error);
    }

    // Constrói o prompt conforme solicitado
    let prompt = '';
    
    if (tipo === 'advertencia') {
      prompt = `Elabore APENAS o corpo do texto de uma advertência para o condômino ${ocorrencia.morador.nome}, 
      ${ocorrencia.morador.bloco ? `do Bloco ${ocorrencia.morador.bloco}, ` : ''}
      da unidade ${ocorrencia.morador.apartamento}, 
      referente à ocorrência de ${formatarData(ocorrencia.data)}: ${ocorrencia.descricao}
      
      IMPORTANTE: Forneça APENAS o texto principal da advertência que começa com "Prezado Sr./Sra." e termina antes das assinaturas.
      
      O texto deve seguir EXATAMENTE este formato:
      
      1. Iniciar com "Prezado Sr./Sra. [Nome],"
      2. Um parágrafo breve informando sobre a ocorrência e que a atividade está sujeita a regulamentação específica
      3. Incluir uma linha em branco onde as evidências fotográficas serão inseridas posteriormente
      4. ANTES de elaborar o documento, você deve se perguntar: "De qual documento específico estou obtendo este artigo?" Identifique CLARAMENTE a fonte usando as referências a seguir.
      
      REFERÊNCIAS PARA IDENTIFICAÇÃO CORRETA DOS ARTIGOS:
      
      a) Lei de Condomínio nº 4.591/64 (lei federal que regulamenta condomínios):
         - Art. 10 - É defeso a qualquer condômino: I - alterar a forma externa da fachada; II - decorar as partes e esquadriais externas com tonalidades ou côres diversas das empregadas no conjunto da edificação; III - destinar a unidade a utilização diversa de finalidade do prédio, ou usá-la de forma nociva ou perigosa ao sossêgo, à salubridade e à segurança dos demais condôminos; IV - embaraçar o uso das partes comuns.
         - Art. 19 - Cada condômino tem o direito de usar e fruir, com exclusividade, de sua unidade autônoma, segundo suas conveniências e interêsses, condicionados, umas e outros às normas de boa vizinhança, e poderá usar as partes e coisas comuns de maneira a não causar dano ou incômodo aos demais condôminos ou moradores, nem obstáculo ou embaraço ao bom uso das mesmas partes por todos.
      
      b) Convenção do Condomínio (documento específico elaborado e registrado para este condomínio):
         - Geralmente contém regras sobre assembleias, administração, sanções, etc.
         - Exemplo: "Art. 15 - As unidades destinam-se exclusivamente para fins residenciais."
      
      c) Regimento Interno (normas de convivência do dia a dia no condomínio):
         - Regras mais específicas sobre uso de áreas comuns, barulho, obras, etc.
         - Exemplo: "Art. 7º - É proibido estacionar nas áreas de circulação da garagem."
         - Exemplo: "Art. 12º - É vedado o trânsito de animais nas áreas comuns do condomínio, salvo autorização especial."
      
      IMPORTANTE: O Art. 10 e seus incisos que falam sobre "É defeso a qualquer condômino" pertencem SEMPRE à Lei de Condomínio nº 4.591/64, NUNCA ao Regimento Interno.
      
      5. Após identificar a fonte correta, cite o artigo completo precedido pela fonte exata
      6. Após o artigo, um breve parágrafo sobre as consequências de reincidência
      7. Encerrar com "Atenciosamente."
      
      ATENÇÃO - EXTREMAMENTE IMPORTANTE SOBRE A CITAÇÃO DO ARTIGO:
      - Você DEVE reproduzir LITERALMENTE o texto do artigo, mantendo EXATAMENTE a mesma numeração, letras, parênteses e formatação do original
      - NÃO altere, resuma ou reinterprete o texto do artigo sob hipótese alguma
      - Preste especial atenção à numeração dos artigos (Art. 1°, Art. 2°, etc.) e à identificação das alíneas (a-, b-, c-, d-, etc.)
      - Verifique duas vezes se está citando o artigo e alínea CORRETOS que se aplicam à infração específica
      - NUNCA inclua frases como [VERIFICAR ARTIGO APLICÁVEL] no documento final
      - Se não tiver certeza absoluta sobre qual artigo específico aplicar, utilize uma redação mais genérica, como: "De acordo com o Regimento Interno, é vedado o trânsito de animais nas áreas comuns do condomínio, salvo autorização especial, e recomenda-se o uso de coleira e focinheira, quando necessário, para a segurança do animal e dos condôminos."
      
      Siga EXATAMENTE este exemplo de formatação:
      
      "Prezado Sr./Sra. [Nome],

      Informamos que foi constatado o uso de furadeira em sua unidade na data [data do ocorrido], o que resultou em incômodo para os demais moradores do condomínio. Essa atividade está sujeita a regulamentação específica.

      De acordo com o Regimento Interno, Art. 19º - A troca ou raspagem de pisos, assoalhos, utilização de furadeiras elétricas e demais serviços de obras nos apartamentos que produzam ruídos suscetíveis a incomodar os condôminos, fora do seguinte horário: dias úteis de 2ª à 6ª feira, das 08:00 às 18:00 horas e aos sábados, das 08:00 às 13:00 horas, sendo proibido aos domingos e feriados.

      Alertamos que, em caso de reincidência, serão aplicadas sanções, incluindo multas conforme previsto no regulamento interno. Agradecemos a sua compreensão e colaboração para manter um ambiente harmonioso para todos.

      Atenciosamente."
      
      IMPORTANTE: NÃO inclua o marcador '[FOTO(S)]' no texto - deixe apenas um espaço em branco onde as fotos seriam inseridas.`;
    } else {
      prompt = `Elabore APENAS o corpo do texto de uma multa no valor de R$ ${ocorrencia.valor?.toFixed(2)} para o condômino ${ocorrencia.morador.nome}, 
      ${ocorrencia.morador.bloco ? `do Bloco ${ocorrencia.morador.bloco}, ` : ''}
      da unidade ${ocorrencia.morador.apartamento}, 
      referente à ocorrência de ${formatarData(ocorrencia.data)}: ${ocorrencia.descricao}
      
      IMPORTANTE: Forneça APENAS o texto principal da multa que começa com "Prezado Sr./Sra." e termina antes das assinaturas.
      
      O texto deve seguir esta estrutura:
      
      1. Iniciar com "Prezado Sr./Sra. [Nome],"
      2. Descrever claramente a infração cometida, incluindo a data e detalhes do ocorrido
      3. Incluir uma linha em branco onde as evidências fotográficas serão inseridas posteriormente
      4. ANTES de elaborar o documento, você deve se perguntar: "De qual documento específico estou obtendo este artigo?" Identifique CLARAMENTE a fonte usando as referências a seguir.
      
      REFERÊNCIAS PARA IDENTIFICAÇÃO CORRETA DOS ARTIGOS:
      
      a) Lei de Condomínio nº 4.591/64 (lei federal que regulamenta condomínios):
         - Art. 10 - É defeso a qualquer condômino: I - alterar a forma externa da fachada; II - decorar as partes e esquadriais externas com tonalidades ou côres diversas das empregadas no conjunto da edificação; III - destinar a unidade a utilização diversa de finalidade do prédio, ou usá-la de forma nociva ou perigosa ao sossêgo, à salubridade e à segurança dos demais condôminos; IV - embaraçar o uso das partes comuns.
         - Art. 19 - Cada condômino tem o direito de usar e fruir, com exclusividade, de sua unidade autônoma, segundo suas conveniências e interêsses, condicionados, umas e outros às normas de boa vizinhança, e poderá usar as partes e coisas comuns de maneira a não causar dano ou incômodo aos demais condôminos ou moradores, nem obstáculo ou embaraço ao bom uso das mesmas partes por todos.
      
      b) Convenção do Condomínio (documento específico elaborado e registrado para este condomínio):
         - Geralmente contém regras sobre assembleias, administração, sanções, etc.
         - Exemplo: "Art. 15 - As unidades destinam-se exclusivamente para fins residenciais."
      
      c) Regimento Interno (normas de convivência do dia a dia no condomínio):
         - Regras mais específicas sobre uso de áreas comuns, barulho, obras, etc.
         - Exemplo: "Art. 7º - É proibido estacionar nas áreas de circulação da garagem."
         - Exemplo: "Art. 12º - É vedado o trânsito de animais nas áreas comuns do condomínio, salvo autorização especial."
      
      IMPORTANTE: O Art. 10 e seus incisos que falam sobre "É defeso a qualquer condômino" pertencem SEMPRE à Lei de Condomínio nº 4.591/64, NUNCA ao Regimento Interno.
      
      5. Após identificar a fonte correta, cite o artigo completo precedido pela fonte exata
      6. Informar sobre o valor da multa aplicada e o prazo para pagamento
      7. Explicar as consequências em caso de não pagamento
      8. Encerrar com uma frase cordial
      9. A unidade e o bloco informados identificam a unidade do condômino, mas não devem ser citados no texto.
      
      NÃO inclua cabeçalho, rodapé, espaços para assinatura ou formatação adicional. Forneça SOMENTE o texto principal.
      
      IMPORTANTE: NUNCA inclua frases como [VERIFICAR ARTIGO APLICÁVEL] no documento final. NÃO inclua o marcador '[FOTO(S)]' no texto - deixe apenas um espaço em branco onde as fotos seriam inseridas.`;
    }

    console.log(`Tipo de documento: ${tipo}`);
    console.log(`Prompt enviado ao assistente (parcial): ${prompt.substring(0, 150)}...`);

    try {
      // Obter o cliente OpenAI configurado
      const openai = await getOpenAIClient();
      
      // Criamos uma thread
      const thread = await openai.beta.threads.create();
      console.log(`Thread criada com ID: ${thread.id}`);
      
      // Adicionamos a mensagem à thread
      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: prompt
      });
      console.log('Mensagem adicionada à thread');
      
      // Executamos a thread com o assistente
      const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: ocorrencia.external_assistant_id
      });
      console.log(`Run iniciado com ID: ${run.id}`);
      
      // Verificamos o status a cada 1 segundo até que esteja completo
      let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      
      let tentativas = 0;
      const maxTentativas = 30; // Timeout após 30 tentativas (30 segundos)
      
      while (runStatus.status !== 'completed' && runStatus.status !== 'failed' && tentativas < maxTentativas) {
        // Aguardar 1 segundo antes de verificar novamente
        await new Promise(resolve => setTimeout(resolve, 1000));
        runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
        tentativas++;
        
        if (tentativas % 5 === 0) { // Log a cada 5 segundos
          console.log(`Status da execução após ${tentativas} segundos: ${runStatus.status}`);
        }
      }
      
      console.log(`Status final da execução: ${runStatus.status}`);
      
      if (runStatus.status === 'failed') {
        console.error("Falha na execução:", runStatus.last_error);
        throw new Error("Falha ao executar o assistente: " + (runStatus.last_error?.message || "Erro desconhecido"));
      }
      
      // Obtemos as mensagens da thread
      const messages = await openai.beta.threads.messages.list(thread.id);
      console.log(`Total de mensagens na thread: ${messages.data.length}`);
      
      // A resposta do assistente é a última mensagem na thread
      const assistantMessages = messages.data.filter(msg => msg.role === 'assistant');
      console.log(`Total de mensagens do assistente: ${assistantMessages.length}`);
      
      if (assistantMessages.length === 0) {
        throw new Error("Nenhuma resposta do assistente");
      }
      
      // Obter o texto da última mensagem do assistente
      const lastMessage = assistantMessages[0];
      let responseText = '';
      
      // Extrair o texto de cada parte da mensagem
      if (lastMessage.content && lastMessage.content.length > 0) {
        for (const contentPart of lastMessage.content) {
          if (contentPart.type === 'text') {
            responseText += contentPart.text.value;
          }
        }
      }
      
      console.log('==== RESPOSTA ORIGINAL DO ASSISTENTE ====');
      console.log(responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));
      
      // Limpar a resposta para remover marcadores
      responseText = limparRespostaAssistant(responseText);
      
      // Pós-processar o documento para remover repetições
      responseText = posProcessarDocumento(responseText, tipo);
      
      console.log('==== RESPOSTA APÓS PROCESSAMENTO ====');
      console.log(responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));
      console.log('==== FIM DOS LOGS DE DEPURAÇÃO ====');
      
      return responseText || "Não foi possível gerar o documento.";
    } catch (error) {
      console.error("Erro detalhado ao comunicar com a API da OpenAI:", error);
      
      // Usar método fallback
      console.log('Usando método fallback devido a erro com assistente');
      return gerarDocumento(ocorrencia, tipo);
    }
  } catch (error) {
    console.error("Erro ao preparar chamada para API da OpenAI:", error);
    
    // Fallback para o método tradicional se houver falha com o assistente
    return gerarDocumento(ocorrencia, tipo);
  }
};

// Método original como fallback
export const gerarDocumento = async (ocorrencia: Ocorrencia, tipo: 'multa' | 'advertencia'): Promise<string> => {
  try {
    // Tenta obter o nome do condomínio a partir do ID do assistente
    let condominioNome = 'Condomínio';
    
    if (ocorrencia.external_assistant_id) {
      console.log('==== FALLBACK: INFORMAÇÕES DE DEPURAÇÃO ====');
      console.log(`ID do assistente original (não utilizado diretamente): ${ocorrencia.external_assistant_id}`);
      
      const assistentInfo = await getAssistantById(ocorrencia.external_assistant_id);
      if (assistentInfo) {
        condominioNome = assistentInfo.name;
        console.log(`Nome do condomínio obtido do assistente: ${condominioNome}`);
      } else {
        console.log('Não foi possível obter informações do assistente, usando nome padrão');
      }
    }
    
    // Constrói o prompt conforme solicitado
    let prompt = '';
    
    if (tipo === 'advertencia') {
      prompt = `Elabore APENAS o corpo do texto de uma advertência para o condômino ${ocorrencia.morador.nome}, 
      ${ocorrencia.morador.bloco ? `do Bloco ${ocorrencia.morador.bloco}, ` : ''}
      da unidade ${ocorrencia.morador.apartamento}, 
      referente à ocorrência de ${formatarData(ocorrencia.data)}: ${ocorrencia.descricao}
      
      IMPORTANTE: Forneça APENAS o texto principal da advertência que começa com "Prezado Sr./Sra." e termina antes das assinaturas.
      
      O texto deve seguir EXATAMENTE este formato:
      
      1. Iniciar com "Prezado Sr./Sra. [Nome],"
      2. Um parágrafo breve informando sobre a ocorrência e que a atividade está sujeita a regulamentação específica
      3. Incluir uma linha em branco onde as evidências fotográficas serão inseridas posteriormente
      4. ANTES de elaborar o documento, você deve se perguntar: "De qual documento específico estou obtendo este artigo?" Identifique CLARAMENTE a fonte usando as referências a seguir.
      
      REFERÊNCIAS PARA IDENTIFICAÇÃO CORRETA DOS ARTIGOS:
      
      a) Lei de Condomínio nº 4.591/64 (lei federal que regulamenta condomínios):
         - Art. 10 - É defeso a qualquer condômino: I - alterar a forma externa da fachada; II - decorar as partes e esquadriais externas com tonalidades ou côres diversas das empregadas no conjunto da edificação; III - destinar a unidade a utilização diversa de finalidade do prédio, ou usá-la de forma nociva ou perigosa ao sossêgo, à salubridade e à segurança dos demais condôminos; IV - embaraçar o uso das partes comuns.
         - Art. 19 - Cada condômino tem o direito de usar e fruir, com exclusividade, de sua unidade autônoma, segundo suas conveniências e interêsses, condicionados, umas e outros às normas de boa vizinhança, e poderá usar as partes e coisas comuns de maneira a não causar dano ou incômodo aos demais condôminos ou moradores, nem obstáculo ou embaraço ao bom uso das mesmas partes por todos.
      
      b) Convenção do Condomínio (documento específico elaborado e registrado para este condomínio):
         - Geralmente contém regras sobre assembleias, administração, sanções, etc.
         - Exemplo: "Art. 15 - As unidades destinam-se exclusivamente para fins residenciais."
      
      c) Regimento Interno (normas de convivência do dia a dia no condomínio):
         - Regras mais específicas sobre uso de áreas comuns, barulho, obras, etc.
         - Exemplo: "Art. 7º - É proibido estacionar nas áreas de circulação da garagem."
         - Exemplo: "Art. 12º - É vedado o trânsito de animais nas áreas comuns do condomínio, salvo autorização especial."
      
      IMPORTANTE: O Art. 10 e seus incisos que falam sobre "É defeso a qualquer condômino" pertencem SEMPRE à Lei de Condomínio nº 4.591/64, NUNCA ao Regimento Interno.
      
      5. Após identificar a fonte correta, cite o artigo completo precedido pela fonte exata
      6. Após o artigo, um breve parágrafo sobre as consequências de reincidência
      7. Encerrar com "Atenciosamente."
      
      ATENÇÃO - EXTREMAMENTE IMPORTANTE SOBRE A CITAÇÃO DO ARTIGO:
      - Você DEVE reproduzir LITERALMENTE o texto do artigo, mantendo EXATAMENTE a mesma numeração, letras, parênteses e formatação do original
      - NÃO altere, resuma ou reinterprete o texto do artigo sob hipótese alguma
      - Preste especial atenção à numeração dos artigos (Art. 1°, Art. 2°, etc.) e à identificação das alíneas (a-, b-, c-, d-, etc.)
      - Verifique duas vezes se está citando o artigo e alínea CORRETOS que se aplicam à infração específica
      - NUNCA inclua frases como [VERIFICAR ARTIGO APLICÁVEL] no documento final
      - Se não tiver certeza absoluta sobre qual artigo específico aplicar, utilize uma redação mais genérica, como: "De acordo com o Regimento Interno, é vedado o trânsito de animais nas áreas comuns do condomínio, salvo autorização especial, e recomenda-se o uso de coleira e focinheira, quando necessário, para a segurança do animal e dos condôminos."
      
      Siga EXATAMENTE este exemplo de formatação:
      
      "Prezado Sr./Sra. [Nome],

      Informamos que foi constatado o uso de furadeira em sua unidade na data [data do ocorrido], o que resultou em incômodo para os demais moradores do condomínio. Essa atividade está sujeita a regulamentação específica.

      De acordo com o Regimento Interno, Art. 19º - A troca ou raspagem de pisos, assoalhos, utilização de furadeiras elétricas e demais serviços de obras nos apartamentos que produzam ruídos suscetíveis a incomodar os condôminos, fora do seguinte horário: dias úteis de 2ª à 6ª feira, das 08:00 às 18:00 horas e aos sábados, das 08:00 às 13:00 horas, sendo proibido aos domingos e feriados.

      Alertamos que, em caso de reincidência, serão aplicadas sanções, incluindo multas conforme previsto no regulamento interno. Agradecemos a sua compreensão e colaboração para manter um ambiente harmonioso para todos.

      Atenciosamente."
      
      IMPORTANTE: NÃO inclua o marcador '[FOTO(S)]' no texto - deixe apenas um espaço em branco onde as fotos seriam inseridas.`;
    } else {
      prompt = `Elabore APENAS o corpo do texto de uma multa no valor de R$ ${ocorrencia.valor?.toFixed(2)} para o condômino ${ocorrencia.morador.nome}, 
      ${ocorrencia.morador.bloco ? `do Bloco ${ocorrencia.morador.bloco}, ` : ''}
      da unidade ${ocorrencia.morador.apartamento}, 
      referente à ocorrência de ${formatarData(ocorrencia.data)}: ${ocorrencia.descricao}
      
      IMPORTANTE: Forneça APENAS o texto principal da multa que começa com "Prezado Sr./Sra." e termina antes das assinaturas.
      
      O texto deve seguir esta estrutura:
      
      1. Iniciar com "Prezado Sr./Sra. [Nome],"
      2. Descrever claramente a infração cometida, incluindo a data e detalhes do ocorrido
      3. Incluir uma linha em branco onde as evidências fotográficas serão inseridas posteriormente
      4. ANTES de elaborar o documento, você deve se perguntar: "De qual documento específico estou obtendo este artigo?" Identifique CLARAMENTE a fonte usando as referências a seguir.
      
      REFERÊNCIAS PARA IDENTIFICAÇÃO CORRETA DOS ARTIGOS:
      
      a) Lei de Condomínio nº 4.591/64 (lei federal que regulamenta condomínios):
         - Art. 10 - É defeso a qualquer condômino: I - alterar a forma externa da fachada; II - decorar as partes e esquadriais externas com tonalidades ou côres diversas das empregadas no conjunto da edificação; III - destinar a unidade a utilização diversa de finalidade do prédio, ou usá-la de forma nociva ou perigosa ao sossêgo, à salubridade e à segurança dos demais condôminos; IV - embaraçar o uso das partes comuns.
         - Art. 19 - Cada condômino tem o direito de usar e fruir, com exclusividade, de sua unidade autônoma, segundo suas conveniências e interêsses, condicionados, umas e outros às normas de boa vizinhança, e poderá usar as partes e coisas comuns de maneira a não causar dano ou incômodo aos demais condôminos ou moradores, nem obstáculo ou embaraço ao bom uso das mesmas partes por todos.
      
      b) Convenção do Condomínio (documento específico elaborado e registrado para este condomínio):
         - Geralmente contém regras sobre assembleias, administração, sanções, etc.
         - Exemplo: "Art. 15 - As unidades destinam-se exclusivamente para fins residenciais."
      
      c) Regimento Interno (normas de convivência do dia a dia no condomínio):
         - Regras mais específicas sobre uso de áreas comuns, barulho, obras, etc.
         - Exemplo: "Art. 7º - É proibido estacionar nas áreas de circulação da garagem."
         - Exemplo: "Art. 12º - É vedado o trânsito de animais nas áreas comuns do condomínio, salvo autorização especial."
      
      IMPORTANTE: O Art. 10 e seus incisos que falam sobre "É defeso a qualquer condômino" pertencem SEMPRE à Lei de Condomínio nº 4.591/64, NUNCA ao Regimento Interno.
      
      5. Após identificar a fonte correta, cite o artigo completo precedido pela fonte exata
      6. Informar sobre o valor da multa aplicada e o prazo para pagamento
      7. Explicar as consequências em caso de não pagamento
      8. Encerrar com uma frase cordial
      
      NÃO inclua cabeçalho, rodapé, espaços para assinatura ou formatação adicional. Forneça SOMENTE o texto principal.
      
      IMPORTANTE: NUNCA inclua frases como [VERIFICAR ARTIGO APLICÁVEL] no documento final. NÃO inclua o marcador '[FOTO(S)]' no texto - deixe apenas um espaço em branco onde as fotos seriam inseridas.`;
    }

    // Obter cliente OpenAI com a chave configurada
    const openai = await getOpenAIClient();
    
    console.log(`FALLBACK: Usando modelo de chat completion em vez do assistente`);
    console.log(`Tipo de documento: ${tipo}`);

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "system",
          content: `Você é um especialista em elaborar documentos formais para o ${condominioNome}. 
          Com base na descrição da ocorrência, sua tarefa é identificar a regra ESPECÍFICA do regimento interno deste condomínio que foi violada 
          e elaborar um documento formal de ${tipo === 'advertencia' ? 'advertência' : 'multa'} seguindo a estrutura 
          oficial dos documentos de condomínio. NÃO use artigos genéricos como "Art. 58º" ou outros, 
          apenas cite artigos que existem realmente no regimento interno deste condomínio específico.`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
    });

    let responseText = response.choices[0]?.message?.content || "Não foi possível gerar o documento.";
    
    console.log('==== FALLBACK: RESPOSTA ORIGINAL DO CHAT ====');
    console.log(responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));
    
    // Limpar a resposta para remover marcadores
    responseText = limparRespostaAssistant(responseText);
    
    // Pós-processar o documento para remover repetições
    responseText = posProcessarDocumento(responseText, tipo);
    
    console.log('==== FALLBACK: RESPOSTA APÓS PROCESSAMENTO ====');
    console.log(responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));
    console.log('==== FIM DOS LOGS DE DEPURAÇÃO ====');
    
    return responseText;
  } catch (error) {
    console.error("Erro ao comunicar com a API da OpenAI:", error);
    throw new Error("Falha ao gerar o documento. Tente novamente mais tarde.");
  }
}; 