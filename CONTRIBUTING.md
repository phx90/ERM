# Manutenção do projeto

## Antes de alterar

- Confirme o perfil autorizado para cada operação.
- Preserve o histórico de estoque, compras, recebimentos e auditoria.
- Não altere uma migração que já tenha sido aplicada; crie outra migração.
- Nunca inclua `.env`, senhas, backups ou dados pessoais no Git.

## Padrão de alteração

Use nomes claros em português para textos de tela e inglês para identificadores técnicos já existentes. Evite comentários que apenas repetem o código. Registre comentários somente quando houver uma regra de negócio ou uma decisão que não seja evidente.

Mantenha cada commit restrito a um assunto. Exemplos:

```text
feat: adicionar conferência de recebimento
fix: corrigir saldo reservado na retirada
docs: atualizar instalação na rede
```

## Conferência

Antes de enviar uma alteração:

1. Execute typecheck, lint e testes.
2. Gere o build de produção.
3. Teste os perfis envolvidos na mudança.
4. Confirme que nenhuma credencial ou informação real entrou no diff.
5. Em mudanças de banco, valide a migração sobre uma cópia de teste.

Alterações em estoque, permissões, recebimentos e restauração exigem teste de regressão do fluxo completo.
