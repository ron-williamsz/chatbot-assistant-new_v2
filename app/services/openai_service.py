import os
import requests
from typing import List, Dict, Any, Optional
import json
from datetime import datetime
from openai import OpenAI
from app import database as db
import re

class OpenAIService:
    """
    Classe para interagir com a API da OpenAI para assistentes e outras funcionalidades
    """
    
    def __init__(self):
        self.api_key = None
        self.client = None
        self._load_api_key()
        self.base_url = "https://api.openai.com/v1"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "OpenAI-Beta": "assistants=v2"
        }
    
    def _load_api_key(self):
        """Carrega a chave da API do banco de dados ou variável de ambiente"""
        try:
            # Primeiro tentar do banco
            conn = db.get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM system_config WHERE key = 'openai_api_key'")
            result = cursor.fetchone()
            conn.close()
            
            if result:
                self.api_key = result['value']
            else:
                # Fallback para variável de ambiente
                self.api_key = os.getenv('OPENAI_API_KEY')
            
            if self.api_key:
                # Criar cliente OpenAI (versão simplificada)
                self.client = OpenAI(api_key=self.api_key)
                print("Cliente OpenAI inicializado com sucesso")
                
        except Exception as e:
            print(f"Erro ao carregar chave da API: {e}")
            # Tentar variável de ambiente como fallback
            self.api_key = os.getenv('OPENAI_API_KEY')
            if self.api_key:
                try:
                    self.client = OpenAI(api_key=self.api_key)
                    print("Cliente OpenAI inicializado via fallback")
                except Exception as init_error:
                    print(f"Erro na inicialização OpenAI (fallback): {init_error}")
                    # Definir client como None para evitar erros posteriores
                    self.client = None
    
    def list_assistants(self, limit: int = 20, order: str = "desc", after: Optional[str] = None) -> Dict[str, Any]:
        """
        Lista assistentes da API da OpenAI
        """
        params = {
            "limit": limit,
            "order": order
        }
        
        if after:
            params["after"] = after
            
        response = requests.get(
            f"{self.base_url}/assistants",
            headers=self.headers,
            params=params
        )
        
        if response.status_code != 200:
            raise Exception(f"Erro ao listar assistentes: {response.text}")
            
        return response.json()
    
    def get_assistant(self, assistant_id: str) -> Dict[str, Any]:
        """
        Obtém detalhes de um assistente específico
        """
        response = requests.get(
            f"{self.base_url}/assistants/{assistant_id}",
            headers=self.headers
        )
        
        if response.status_code != 200:
            raise Exception(f"Erro ao obter assistente: {response.text}")
            
        return response.json()
    
    def update_assistant(self, assistant_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Atualiza um assistente existente
        """
        response = requests.post(
            f"{self.base_url}/assistants/{assistant_id}",
            headers=self.headers,
            json=data
        )
        
        if response.status_code != 200:
            raise Exception(f"Erro ao atualizar assistente: {response.text}")
            
        return response.json()
    
    def delete_assistant(self, assistant_id: str) -> Dict[str, Any]:
        """
        Exclui um assistente
        """
        response = requests.delete(
            f"{self.base_url}/assistants/{assistant_id}",
            headers=self.headers
        )
        
        if response.status_code != 200:
            raise Exception(f"Erro ao excluir assistente: {response.text}")
            
        return response.json()
    
    def create_assistant(self, model: str, name: Optional[str] = None, 
                       instructions: Optional[str] = None, 
                       description: Optional[str] = None,
                       tools: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """
        Cria um novo assistente
        """
        data = {
            "model": model
        }
        
        if name:
            data["name"] = name
        if instructions:
            data["instructions"] = instructions
        if description:
            data["description"] = description
        if tools:
            data["tools"] = tools
            
        response = requests.post(
            f"{self.base_url}/assistants",
            headers=self.headers,
            json=data
        )
        
        if response.status_code != 200:
            raise Exception(f"Erro ao criar assistente: {response.text}")
            
        return response.json()
    
    async def gerar_documento_com_assistant(self, ocorrencia, tipo):
        """Gera documento usando o assistente do condomínio - versão detalhada baseada no openai.ts"""
        try:
            if not self.client:
                raise Exception("Cliente OpenAI não configurado")
            
            if not ocorrencia.get('external_assistant_id'):
                raise Exception("Assistente do condomínio não especificado")
            
            # Log para verificar o ID do assistente
            print('==== INFORMAÇÕES DE DEPURAÇÃO ====')
            print(f'ID do assistente selecionado: {ocorrencia.get("external_assistant_id")}')
            
            # Tentar obter informações do assistente
            try:
                assistant_info = db.get_assistant_by_id(ocorrencia['external_assistant_id'])
                if assistant_info:
                    print(f'Nome do assistente: {assistant_info.get("name")}')
                    print(f'Modelo usado: {assistant_info.get("model")}')
                else:
                    print('Não foi possível obter informações detalhadas do assistente')
            except Exception as e:
                print(f'Erro ao obter informações do assistente: {e}')
            
            # Formatar data
            data = ocorrencia.get('data')
            if isinstance(data, (int, float)):
                # Se for timestamp
                data_obj = datetime.fromtimestamp(data)
                data_formatada = data_obj.strftime('%d/%m/%Y')
            elif isinstance(data, str):
                try:
                    # Tentar diferentes formatos de data
                    if '-' in data:
                        partes = data.split('-')
                        if len(partes) == 3:
                            data_formatada = f"{partes[2]}/{partes[1]}/{partes[0]}"
                        else:
                            data_formatada = data
                    else:
                        data_formatada = data
                except:
                    data_formatada = data
            else:
                data_formatada = 'Não informada'
            
            # Construir dados do morador
            morador = ocorrencia.get('morador', {})
            nome = morador.get('nome', 'Morador(a)')
            unidade = morador.get('apartamento', 'Não informada')
            bloco = morador.get('bloco', '')
            descricao = ocorrencia.get('descricao', 'Não informada')
            
            # Construir prompt detalhado baseado no openai.ts
            if tipo == 'advertencia':
                prompt = f"""Elabore APENAS o corpo do texto de uma advertência para o condômino {nome}, 
                {f'do Bloco {bloco}, ' if bloco else ''}
                da unidade {unidade}, 
                referente à ocorrência de {data_formatada}: {descricao}
                
                IMPORTANTE: Forneça APENAS o texto principal da advertência que começa com "Prezado Sr./Sra." e termina antes das assinaturas.
                
                O texto deve seguir EXATAMENTE este formato:
                
                1. Iniciar com "Prezado Sr./Sra. [Nome],"
                2. Um parágrafo breve informando sobre a ocorrência e que a atividade está sujeita a regulamentação específica
                3. ANTES de elaborar o documento, você deve se perguntar: "De qual documento específico estou obtendo este artigo?" Identifique CLARAMENTE a fonte usando as referências a seguir.
                
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
                
                4. Após identificar a fonte correta, cite o artigo completo precedido pela fonte exata
                5. Após o artigo, um breve parágrafo sobre as consequências de reincidência
                6. Encerrar com "Atenciosamente."
                
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
                
                IMPORTANTE: NUNCA inclua frases como [VERIFICAR ARTIGO APLICÁVEL] no documento final."""
            else:  # multa
                valor = ocorrencia.get('valor', 0)
                valor_formatado = f"{valor:.2f}".replace('.', ',')
                
                prompt = f"""Elabore APENAS o corpo do texto de uma multa no valor de R$ {valor_formatado} para o condômino {nome}, 
                {f'do Bloco {bloco}, ' if bloco else ''}
                da unidade {unidade}, 
                referente à ocorrência de {data_formatada}: {descricao}
                
                IMPORTANTE: Forneça APENAS o texto principal da multa que começa com "Prezado Sr./Sra." e termina antes das assinaturas.
                
                O texto deve seguir esta estrutura:
                
                1. Iniciar com "Prezado Sr./Sra. [Nome],"
                2. Descrever claramente a infração cometida, incluindo a data e detalhes do ocorrido
                3. ANTES de elaborar o documento, você deve se perguntar: "De qual documento específico estou obtendo este artigo?" Identifique CLARAMENTE a fonte usando as referências a seguir.
                
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
                
                4. Após identificar a fonte correta, cite o artigo completo precedido pela fonte exata
                5. Informar sobre o valor da multa aplicada e o prazo para pagamento
                6. Explicar as consequências em caso de não pagamento
                7. Encerrar com "Atenciosamente."
                8. A unidade e o bloco informados identificam a unidade do condômino, mas não devem ser citados no texto.
                
                NÃO inclua cabeçalho, rodapé, espaços para assinatura ou formatação adicional. Forneça SOMENTE o texto principal.
                
                IMPORTANTE: NUNCA inclua frases como [VERIFICAR ARTIGO APLICÁVEL] no documento final."""
            
            print(f'Tipo de documento: {tipo}')
            print(f'Prompt enviado ao assistente (parcial): {prompt[:150]}...')
            
            # Criar thread e enviar mensagem
            thread = self.client.beta.threads.create()
            print(f'Thread criada com ID: {thread.id}')
            
            self.client.beta.threads.messages.create(
                thread_id=thread.id,
                role="user",
                content=prompt
            )
            print('Mensagem adicionada à thread')
            
            # Executar com o assistente
            run = self.client.beta.threads.runs.create(
                thread_id=thread.id,
                assistant_id=ocorrencia['external_assistant_id']
            )
            print(f'Run iniciado com ID: {run.id}')
            
            # Aguardar conclusão com logs detalhados
            import time
            max_attempts = 30
            attempts = 0
            
            while attempts < max_attempts:
                run_status = self.client.beta.threads.runs.retrieve(
                    thread_id=thread.id,
                    run_id=run.id
                )
                
                if run_status.status == 'completed':
                    break
                elif run_status.status == 'failed':
                    print(f"Falha na execução: {run_status.last_error}")
                    raise Exception(f"Falha ao executar assistente: {run_status.last_error}")
                
                if attempts % 5 == 0:  # Log a cada 5 segundos
                    print(f'Status da execução após {attempts} segundos: {run_status.status}')
                
                time.sleep(1)
                attempts += 1
            
            print(f'Status final da execução: {run_status.status}')
            
            if attempts >= max_attempts:
                raise Exception("Timeout ao aguardar resposta do assistente")
            
            # Obter resposta
            messages = self.client.beta.threads.messages.list(thread_id=thread.id)
            print(f'Total de mensagens na thread: {len(messages.data)}')
            
            # Encontrar mensagem do assistente
            assistant_messages = [msg for msg in messages.data if msg.role == 'assistant']
            print(f'Total de mensagens do assistente: {len(assistant_messages)}')
            
            if not assistant_messages:
                raise Exception("Nenhuma resposta do assistente")
            
                    # Extrair texto da resposta
            last_message = assistant_messages[0]
            response_text = ""
            
            if last_message.content:
                for content_part in last_message.content:
                    if content_part.type == 'text':
                        response_text += content_part.text.value
            
            print('==== RESPOSTA ORIGINAL DO ASSISTENTE ====')
            print(response_text[:500] + ('...' if len(response_text) > 500 else ''))
            
            # Limpar marcadores (baseado no openai.ts)
            response_text = re.sub(r'【[^】]*】', '', response_text).strip()
            
            # Pós-processar documento (baseado na função posProcessarDocumento do openai.ts)
            response_text = self._pos_processar_documento(response_text, tipo)
            
            print('==== RESPOSTA APÓS PROCESSAMENTO ====')
            print(response_text[:500] + ('...' if len(response_text) > 500 else ''))
            print('==== FIM DOS LOGS DE DEPURAÇÃO ====')
            
            return response_text or "Não foi possível gerar o documento."
            
        except Exception as e:
            print(f"Erro detalhado ao comunicar com a API da OpenAI: {e}")
            print('Usando método fallback devido a erro com assistente')
            # Fallback para geração simples
            return self._gerar_documento_fallback(ocorrencia, tipo)
    
    def _pos_processar_documento(self, documento, tipo):
        """Pós-processa o documento para remover repetições (baseado no openai.ts)"""
        # Corrigir atribuição equivocada do Art. 10 da Lei de Condomínio ao Regimento Interno
        documento = re.sub(
            r'De acordo com o Regimento Interno, Art\. 10[^\.]+ - É defeso a qualquer condômino',
            'De acordo com a Lei de Condomínio nº 4.591/64, Art. 10 - É defeso a qualquer condômino',
            documento,
            flags=re.IGNORECASE
        )
        
        # Remover marcadores de foto
        documento = re.sub(r'\[FOTO\(S\)\]|\[FOTO\]|\[FOTOS\]|\[FOTO\(s\)\]', '', documento, flags=re.IGNORECASE)
        
        # Remover marcadores de verificação
        documento = re.sub(
            r'\[VERIFICAR ARTIGO APLICÁVEL\]|\[VERIFICAR ARTIGO\]|\[ARTIGO APLICÁVEL\]',
            'Art. aplicável do regulamento',
            documento,
            flags=re.IGNORECASE
        )
        
        # Remover linhas vazias duplicadas
        documento = re.sub(r'\n\s*\n\s*\n', '\n\n', documento)
        
        # Processar linhas para remover repetições de cabeçalho
        linhas = documento.split('\n')
        linhas_processadas = []
        
        encontrou_condominio = False
        encontrou_titulo = False
        dentro_do_corpo = False
        
        titulo_principal = 'ADVERTÊNCIA' if tipo == 'advertencia' else 'NOTIFICAÇÃO DE MULTA'
        
        for linha in linhas:
            linha_limpa = linha.strip()
            
            # Pular linhas vazias consecutivas
            if linha_limpa == '' and linhas_processadas and linhas_processadas[-1].strip() == '':
                continue
            
            # Verificar se estamos no corpo do texto
            if not dentro_do_corpo:
                if ((encontrou_condominio and encontrou_titulo) and linha_limpa.startswith('Prezado')):
                    dentro_do_corpo = True
                    linhas_processadas.append(linha)
                    continue
                
                # Cabeçalho "CONDOMÍNIO"
                if linha_limpa == 'CONDOMÍNIO':
                    if not encontrou_condominio:
                        encontrou_condominio = True
                        linhas_processadas.append(linha)
                    continue
                
                # Título
                if linha_limpa == titulo_principal:
                    if not encontrou_titulo:
                        encontrou_titulo = True
                        linhas_processadas.append(linha)
                    continue
                
                linhas_processadas.append(linha)
            else:
                # No corpo, remover repetições de cabeçalho
                if linha_limpa in ['CONDOMÍNIO', titulo_principal]:
                    continue
                linhas_processadas.append(linha)
        
        # Remover linhas vazias duplicadas no resultado final
        resultado = []
        ultima_linha_vazia = False
        
        for linha in linhas_processadas:
            linha_limpa = linha.strip()
            
            if linha_limpa == '':
                if not ultima_linha_vazia:
                    resultado.append(linha)
                    ultima_linha_vazia = True
            else:
                resultado.append(linha)
                ultima_linha_vazia = False
        
        return '\n'.join(resultado)
    
    def _gerar_documento_fallback(self, ocorrencia, tipo):
        """Fallback para gerar documento quando o assistente falha"""
        try:
            if not self.client:
                raise Exception("Cliente OpenAI não configurado")
            
            # Obter nome do condomínio a partir do assistente se possível
            condominio_nome = 'Condomínio'
            if ocorrencia.get('external_assistant_id'):
                try:
                    assistant_info = db.get_assistant_by_id(ocorrencia['external_assistant_id'])
                    if assistant_info:
                        condominio_nome = assistant_info.get('name', 'Condomínio')
                except:
                    pass
            
            # Preparar dados
            morador = ocorrencia.get('morador', {})
            nome = morador.get('nome', 'Morador(a)')
            unidade = morador.get('apartamento', 'Não informada')
            bloco = morador.get('bloco', '')
            descricao = ocorrencia.get('descricao', 'Não informada')
            
            # Formatar data
            data = ocorrencia.get('data')
            if isinstance(data, (int, float)):
                data_obj = datetime.fromtimestamp(data)
                data_formatada = data_obj.strftime('%d/%m/%Y')
            else:
                data_formatada = str(data) if data else 'Não informada'
            
            if tipo == 'advertencia':
                prompt = f"""Elabore o texto de uma advertência para o condômino {nome}, da unidade {unidade}, referente à ocorrência de {data_formatada}: {descricao}
                
                Inclua:
                1. Saudação formal
                2. Descrição da ocorrência
                3. Referência aos regulamentos
                4. Consequências de reincidência
                5. Encerramento cordial"""
            else:
                valor = ocorrencia.get('valor', 0)
                valor_formatado = f"{valor:.2f}".replace('.', ',')
                prompt = f"""Elabore o texto de uma multa no valor de R$ {valor_formatado} para o condômino {nome}, da unidade {unidade}, referente à infração de {data_formatada}: {descricao}
                
                Inclua:
                1. Saudação formal
                2. Descrição da infração
                3. Valor da multa
                4. Prazo de pagamento
                5. Consequências do não pagamento"""
            
            response = self.client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {
                        "role": "system",
                        "content": f"Você é um especialista em elaborar documentos formais para o {condominio_nome}."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.7,
            )
            
            response_text = response.choices[0].message.content or "Não foi possível gerar o documento."
            
            # Aplicar pós-processamento
            response_text = self._pos_processar_documento(response_text, tipo)
            
            return response_text
            
        except Exception as e:
            print(f"Erro no fallback: {e}")
            # Último recurso: texto simples
            
            # Preparar dados básicos
            morador = ocorrencia.get('morador', {})
            descricao = ocorrencia.get('descricao', 'Não informada')
            
            # Formatar data
            data = ocorrencia.get('data')
            if isinstance(data, (int, float)):
                data_obj = datetime.fromtimestamp(data)
                data_formatada = data_obj.strftime('%d/%m/%Y')
            else:
                data_formatada = str(data) if data else 'Não informada'
            
            if tipo == 'advertencia':
                return f"""Prezado(a) Sr./Sra.,

Informamos que foi constatada ocorrência em {data_formatada}: {descricao}

Esta atividade está sujeita a regulamentação específica conforme estabelecido no regimento interno do condomínio.

Em caso de reincidência, serão aplicadas as sanções previstas no regulamento interno.

Atenciosamente."""
            else:
                valor = ocorrencia.get('valor', 0)
                valor_formatado = f"{valor:.2f}".replace('.', ',')
                return f"""Prezado(a) Sr./Sra.,

Informamos que foi aplicada multa no valor de R$ {valor_formatado} referente à infração de {data_formatada}: {descricao}

O pagamento deverá ser realizado no prazo de 30 dias.

Atenciosamente.""" 