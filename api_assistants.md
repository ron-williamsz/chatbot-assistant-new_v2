# Documentação da API de Assistants

## Listagem de Assistants

A API para listar assistants está disponível através do endpoint `/list-assistants`. Ela fornece funcionalidades de busca e paginação.

### Curl básico
```bash
curl -X GET "http://localhost:5358/list-assistants"
```

### Parâmetros de consulta
A API suporta os seguintes parâmetros:

| Parâmetro | Tipo   | Descrição                                        | Padrão |
|-----------|--------|--------------------------------------------------|--------|
| search    | string | Termo para filtrar assistants                    | ""     |
| limit     | int    | Número máximo de assistants por página           | 100    |
| offset    | int    | Posição inicial para paginação                   | 0      |

### Exemplos de uso

#### Busca por termo específico
```bash
curl -X GET "http://localhost:5358/list-assistants?search=atendimento"
```

#### Limitando resultados (paginação)
```bash
curl -X GET "http://localhost:5358/list-assistants?limit=10&offset=0"
```

#### Combinando parâmetros
```bash
curl -X GET "http://localhost:5358/list-assistants?search=suporte&limit=20&offset=40"
```

### Formato da resposta
```json
{
  "assistants": [
    {
      "id": "asst_123456",
      "name": "Nome do assistant",
      "description": "Descrição do assistant",
      "model": "gpt-4"
    }
  ],
  "has_more": true,
  "source": "local"
}
```

- `assistants`: Lista dos assistants encontrados
- `has_more`: Indica se há mais resultados disponíveis após o limite atual
- `source`: Origem dos dados ("local" para banco de dados local)

### Códigos de resposta
- 200: Sucesso
- 500: Erro interno do servidor

## Criação de Thread e Execução de Assistant

O endpoint `/create-thread-and-run` permite criar uma nova thread e executar um assistant com uma mensagem inicial.

### Requisição
```bash
curl -X POST "http://localhost:5358/create-thread-and-run" \
  -H "Content-Type: application/json" \
  -d '{
    "assistant_id": "asst_123456",
    "message": "Olá, preciso de ajuda com...",
    "user_id": "user123",
    "instructions": "Responda como se fosse um especialista em..."
  }'
```

### Parâmetros do corpo da requisição

| Parâmetro    | Tipo   | Obrigatório | Descrição                                         |
|--------------|--------|-------------|---------------------------------------------------|
| assistant_id | string | Sim         | ID do assistant a ser executado                   |
| message      | string | Sim         | Mensagem inicial do usuário                       |
| user_id      | string | Não         | Identificador do usuário (default: "default_user")|
| instructions | string | Não         | Instruções personalizadas para o assistant        |

### Formato da resposta
```json
{
  "response": "Resposta do assistente para a mensagem...",
  "thread_id": "thread_123456",
  "assistant_id": "asst_123456"
}
```

- `response`: Conteúdo da resposta do assistente
- `thread_id`: ID da thread criada ou recuperada
- `assistant_id`: ID do assistente utilizado

### Códigos de resposta
- 200: Sucesso
- 400: Dados inválidos/incompletos
- 404: Assistente não encontrado
- 500: Erro interno do servidor 