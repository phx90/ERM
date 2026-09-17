# Controle básico de estoque

Acesse **Estoque** no menu. O catálogo de produtos é compartilhado com compras.

## Operação

1. Cadastre o material em **Itens / Produtos**, com sua unidade correta. O saldo começa em zero.
2. Conte o material e registre **Saldo inicial**. Produtos com saldo anterior à implantação mantêm esse saldo e recebem uma referência no histórico; confira-os usando **Ajustar contagem**.
3. Defina o **Estoque mínimo**. O alerta inclui o limite: saldo igual ao mínimo também exige atenção. Produtos zerados aparecem separadamente, mesmo sem mínimo definido.
4. Use **Entrada** somente quando o material chegar fisicamente e **Saída** quando for retirado. Quantidades aceitam até três casas decimais.
5. Informe opcionalmente uma referência (pedido, nota fiscal ou documento) e observação.
6. Para corrigir uma contagem ou lançamento errado, use **Ajustar contagem**, informe o saldo correto e justifique o ajuste. O histórico original permanece intacto.

Entradas e saídas exigem quantidade positiva. Ajustes e saldo inicial aceitam zero. Não é permitido retirar mais que o disponível. Depois da primeira movimentação, a unidade do produto não pode ser alterada: crie um produto distinto se necessário, sem misturar caixas e unidades.

## Compras e acesso

Compras e almoxarifado consultam o mesmo saldo. Criar uma compra ou alterar seu status não movimenta estoque. Nesta versão, a referência do documento é textual; recebimento automático vinculado a itens de pedidos, reservas, setores e obras não fazem parte do módulo.

ADMIN, COMPRAS e ALMOXARIFADO podem movimentar, ajustar e definir mínimos. CONSULTA e SOLICITANTE podem consultar. O seed inclui o perfil ALMOXARIFADO para instalações novas; não execute seeds de demonstração em uma base operacional.

Cada movimentação registra usuário, data, saldo anterior, saldo novo, observação e referência. As operações e o saldo são gravados juntos em transação. Bloqueio por produto e versão de saldo impedem sobrescritas concorrentes. Se o saldo mudar enquanto um formulário estiver aberto, feche-o e confira o saldo atualizado. Repetir a mesma operação com o mesmo identificador não duplica o lançamento.

A autenticação passa a verificar a sessão e o usuário ativo a cada chamada; logout revoga o acesso dessa sessão imediatamente.

## Implantação e verificação

Faça backup antes de atualizar. `docker compose up -d --build` aplica a migração aditiva pelo comando de inicialização da API. A migração não zera nem recalcula saldos antigos. O mínimo pode ser removido deixando o campo vazio.

- Testes unitários: `pnpm --filter @compras/api test`.
- Teste integrado com API e banco de testes iniciados: `docker compose exec -T api node apps/api/test/stock.integration.mjs`.
- O teste integrado cria organizações isoladas, verifica movimentações, permissões, isolamento e concorrência e remove somente seus próprios registros ao finalizar. Prefira executá-lo em homologação.

O painel atualiza a cada 30 segundos. O histórico permite filtrar produto, tipo e período (datas no fuso de São Paulo). Os avisos são internos, sem envio de mensagens ou e-mails.

Este módulo não substitui a preparação operacional de HTTPS, contas individuais, backup agendado no NAS e teste de restauração antes de colocar o sistema em produção.
