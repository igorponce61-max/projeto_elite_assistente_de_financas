# Elite Faturamento API

API REST em Python/FastAPI para cadastrar operações e consultar indicadores agregados, usando MySQL.

## Requisitos

- Python 3.10+
- MySQL local em `127.0.0.1:3306`
- Schema `elitefaturamento` criado no MySQL

## Configuração e execução (Windows PowerShell)

```powershell
cd cliente/backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edite `DATABASE_URL` no `.env` com usuário e senha do MySQL. A API cria as tabelas `operacoes`, `emprestimos` e `pagamentos_emprestimos` ao iniciar, desde que o schema exista e o usuário tenha permissão.

```powershell
uvicorn app.main:app --reload
```

Swagger: http://127.0.0.1:8000/docs  
ReDoc: http://127.0.0.1:8000/redoc

## Empréstimos e pagamentos

- `POST`, `GET /api/v1/emprestimos` e `GET`, `PUT`, `DELETE /api/v1/emprestimos/{id}` gerenciam empréstimos.
- `GET /api/v1/analises/emprestimos` retorna principal emprestado, juros a receber, taxa média, clientes únicos e vencimentos.
- `GET /api/v1/pagamentos` retorna cada vencimento e `PATCH /api/v1/pagamentos/{id}` marca a parcela como paga ou pendente.

Os juros são calculados como `valor emprestado × taxa / 100`; em contratos parcelados, esse total é dividido entre as parcelas. A multa configurada é um valor fixo em reais por dia de atraso e é somada aos juros da parcela. Ao marcar como pago, o atraso exibido volta a zero. Empréstimos parcelados vencem mensalmente, com a primeira parcela um mês após a data do empréstimo. As tabelas `emprestimos` e `pagamentos_emprestimos` são criadas ao iniciar a API; em uma tabela de empréstimos já existente, a coluna de multa recebe uma migração automática.


## Endpoints

- `POST /api/v1/operacoes` — cadastra operação.
- `GET /api/v1/operacoes` — lista operações.
- `GET /api/v1/operacoes/{id}` — consulta uma operação.
- `PUT /api/v1/operacoes/{id}` — atualiza uma operação.
- `DELETE /api/v1/operacoes/{id}` — exclui uma operação.
- `GET /api/v1/analises/operacoes` — retorna os totais e percentuais calculados a partir das operações cadastradas.

Os campos monetários aceitam valores não negativos com até duas casas decimais. A margem de lucro é `valor_lucro / faturamento × 100`; quando o denominador é zero, o percentual retornado é `0.00`.

## Exemplo de cadastro

```json
{
  "nome": "Unidade Centro",
  "faturamento": 100000.00,
  "valor_lucro": 25000.00,
  "valor_custo": 75000.00,
  "quantidade_funcionarios": 12
}
```
