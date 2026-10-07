# Elite — frontend web

Frontend responsivo e mobile first em HTML, CSS e JavaScript puro, integrado com a API em `../backend`.

## Executar localmente

1. Siga as instruções de `../backend/README.md` para configurar MySQL e iniciar FastAPI em `http://127.0.0.1:8000`.
2. Em outro terminal, a partir de `cliente/frontend`, execute:

   ```powershell
   py -m http.server 5500
   ```

3. Abra `http://127.0.0.1:5500`.

O endereço da API padrão está definido no início de `app.js` como `http://127.0.0.1:8000/api/v1`. Para alterá-lo antes de carregar o script, defina `window.ELITE_API_BASE` no HTML.

## Telas

- **Início:** resumo de faturamento, lucro, custo e operações; cards para as três áreas.
- **Gráfico:** pizza com participação de cada operação no faturamento, lucro, custo ou número de funcionários.
- **Análise:** totais consolidados, margem de lucro e dados individuais por operação.
- **Operações:** cadastro, visualização/edição e remoção. Ao excluir, os dados são recarregados da API e o gráfico reflete a alteração.

O backend permite a origem `http://127.0.0.1:5500` e `http://localhost:5500` por CORS; para outra origem, configure `CORS_ORIGINS` no `.env` do backend.

## Referência visual

A interface usa uma direção editorial inspirada na hierarquia tipográfica ampla, paleta sóbria, composições assimétricas e cartões da referência Redo Media, adaptada para um painel de finanças e sem reutilizar seus textos ou imagens.

- **Cr?dito:** cadastro, consulta, edi??o e exclus?o de empr?stimos, com prazo em dias ou parcelas mensais.
- **Controle de pagamentos:** lista os vencimentos de cada empr?stimo e dias restantes (ou atraso). Gr?ficos e an?lises alternam entre opera??es e empr?stimos.
- **Pagamentos:** cada parcela pode ser marcada como paga; contratos aceitam multa fixa em reais por dia de atraso, somada ao valor de juros da parcela. Valores monet?rios aceitam o formato brasileiro, como `40.000,00`.
