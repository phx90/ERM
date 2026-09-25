# Diagnóstico técnico da planilha

Arquivo analisado: `SOLICITACAO_DE_COMPRA_ERM.xlsx` (SHA-256 `D9C37A21293FD4FC4B7B9A0E923014C4D715075764D56C7344AD5E65590A70E6`).

## Mapeamento

Foram identificadas 15 abas, 13 ocultas. `LISTA ESTOQUE` contém 9.655 linhas XML e 86.822 células não vazias. As abas operacionais principais são `Lista de compra - 2024` (cabeçalho na linha 4), `Lista de compra - 2025` (linha 2), `Lista de compra - 2026` (linha 2), `Controle` (linha 4) e `Falta comprar` (linha 1). Abas auxiliares: `Indicadores`, `Planilha1/2/3`, `ESTOQUE MINIMO`, `Lista de compra Lixadeira 2025`, `UNIFORME AZUL`, `UNIFORME PRETO` e `BANCO DE DADOS`.

O inventário técnico completo, incluindo dimensões, amostras, validações, filtros, células mescladas e fórmulas, está em `workbook-analysis.json`.

## Entidades e relacionamentos

As entidades inferidas são organização, usuário, departamento, projeto, produto, solicitação, item da solicitação, status, fornecedor, ordem e item de compra, rateio de compra parcial, entrega, movimentação de estoque, anexo, importação, relatório, histórico de status e auditoria. Uma SC agrupa várias linhas/itens; uma SC não é criada por linha. Um item pode ser atendido por várias ordens e uma ordem pode agrupar itens de várias SCs.

## Regras inferidas

- Código de produto é identificador textual, incluindo zeros à esquerda.
- Número de SC é único por organização; histórico pode ser informado manualmente somente por administrador.
- Criticidades da origem variam em acentuação/caixa e são normalizadas para `BAIXA`, `MEDIA` ou `ALTA`.
- Status da aba `BANCO DE DADOS` alimenta validações; o sistema mantém catálogo administrável e impede exclusão quando usado.
- Lead time é calculado no backend em dias corridos, sem `ABS`; datas invertidas viram inconsistência.
- Entrega parcial e compra parcial exigem entidades de rateio, não campos simples na solicitação.
- Atualizações usam `version` e retornam HTTP 409 em conflito.

## Inconsistências encontradas

- A estrutura anual mudou: 2024 possui 9 colunas operacionais e duas colunas de catálogo; 2025 possui 9; 2026 possui 19 colunas operacionais.
- A aba 2026 declara dimensão `A1:XDX10567`, embora a tabela útil termine em `S`; há conteúdo residual fora da área normal.
- Há 12 fórmulas com `#REF!` em `Lista de compra - 2026` (`S237:S248`) e 2 em `Planilha2` (`A60:B60`).
- Fórmulas antigas usam `ABS`, ocultando datas invertidas. Há também valores evidentemente incoerentes, como lead time igual ao serial da data.
- `LISTA ESTOQUE` usa códigos numericamente armazenados em parte das linhas, colocando em risco zeros à esquerda.
- Quantidades e unidades aparecem combinadas (`69kg`, `50M³`, `10pct`) e exigem revisão.
- Nomes, departamentos, unidades, status e fornecedores variam em caixa, acentuação e grafia.
- Há milhares de linhas preformatadas com status/lead time padrão na aba 2026; elas não devem ser importadas como itens.
- Abas históricas e auxiliares misturam tabelas operacionais, listas de validação e cotações.

## Estratégia de migração

O importador deve calcular hash do arquivo, gerar prévia, detectar cabeçalhos por aba, ignorar linhas sem identidade mínima, agrupar por SC, converter datas seriais, normalizar valores sem apagar o original e persistir tudo em uma única transação. Reexecução do mesmo hash é idempotente. Duplicidades aproximadas são sugestões de revisão, nunca mescladas silenciosamente.

## Decisões técnicas

Foi adotado monólito modular NestJS/React, PostgreSQL como fonte oficial, Prisma, tokens em cookies HttpOnly, Argon2id, auditoria append-only, exclusão lógica e controle otimista. O relatório trabalha sobre cópia do template com ExcelJS. O template original no projeto é imutável e sua integridade pode ser verificada pelo hash acima.
