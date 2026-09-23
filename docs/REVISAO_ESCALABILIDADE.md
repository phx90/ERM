# Revisão de desempenho e escalabilidade

## Alterações implementadas

- Paginação no servidor para demanda de compras, ordens e retiradas, com limite máximo por página.
- A demanda de compras é paginada por solicitação completa; os itens de uma mesma solicitação não são separados entre páginas.
- Busca com atraso curto no navegador para evitar uma requisição a cada tecla.
- Carregamento sob demanda dos módulos, reduzindo o JavaScript inicial de aproximadamente 550 kB para 444 kB antes da compressão.
- Cache de consultas por 30 segundos e desativação da recarga automática ao alternar janelas.
- Índices compostos para organização, status e data nas tabelas de maior crescimento.
- Índices de relacionamento para itens, alocações, entregas, históricos e anexos.
- Índices trigram do PostgreSQL nas pesquisas parciais de descrições, solicitantes, fornecedores, finalidade e obra.
- Rotação dos logs Docker, memória compartilhada adicional para o PostgreSQL e limite de memória do processo Node.
- Backup completo, validação por SHA-256, retenção configurável e restauração documentada.

## Comportamento para grandes volumes

As telas alteradas carregam 20 registros por vez e permitem no máximo 50 por chamada. Pesquisas são executadas no banco, e não sobre uma coleção de centenas de registros no navegador. Na demanda, o total representa solicitações; cada página retorna todos os itens das solicitações selecionadas.

O catálogo de retirada continua limitado a 300 resultados para evitar uma lista excessiva; a busca deve ser usada quando houver um catálogo grande. Produtos e solicitações gerais já utilizavam paginação. Fornecedores e usuários ainda são cadastros menores e podem receber paginação própria quando o volume operacional justificar.

## Recomendações de operação

- Use SSD, 16 GB de RAM e conexão de rede cabeada no servidor.
- Monitore espaço em disco, uso de memória e tempo das consultas semanalmente.
- Arquive documentos muito antigos apenas por política definida; não apague histórico operacional diretamente no banco.
- Mantenha o `autovacuum` do PostgreSQL ativado.
- Faça teste de carga antes de ampliar significativamente o número de usuários simultâneos.
- Teste uma restauração completa pelo menos a cada três meses.

## Próxima etapa recomendada

Quando houver dados reais suficientes, medir as consultas lentas com `pg_stat_statements` e ajustar índices com base no uso observado. Evite adicionar índices indiscriminadamente, pois eles também aumentam custo de escrita e espaço em disco.
