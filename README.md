# Gestão de Suprimentos ERM

Sistema interno para controle de materiais, solicitações de compra, ordens, recebimentos e estoque do Estaleiro Rio Maguari.

## Fluxo de trabalho

1. O almoxarifado registra a solicitação e identifica o solicitante.
2. Compras consulta as solicitações pendentes e registra a ordem emitida no Protheus.
3. O almoxarifado confere a ordem, informa a nota fiscal e registra o recebimento total ou parcial.
4. As entradas e retiradas atualizam o estoque e ficam registradas no histórico.

O sistema também possui cadastro de produtos e fornecedores, solicitação de cadastro de material, reserva para retirada, relatórios e administração de usuários.

## Componentes

- `apps/web`: interface React servida pelo Nginx.
- `apps/api`: API NestJS e acesso ao PostgreSQL com Prisma.
- `packages/shared`: validações usadas pela API e pela interface.
- `templates`: planilha utilizada na geração dos relatórios.
- `scripts/backup`: backup, restauração e agendamento diário.

## Executar com Docker

Crie o arquivo de configuração e preencha as senhas:

```powershell
Copy-Item .env.example .env
notepad .env
```

Inicie os serviços:

```powershell
docker compose up -d --build
docker compose ps
```

Na primeira instalação, crie os dados iniciais:

```powershell
docker compose exec api pnpm --filter @compras/api db:seed
```

A aplicação fica disponível em `http://localhost:8080`. Em outro computador da rede, use o IP do servidor no lugar de `localhost`.

## Configuração

As variáveis ficam no arquivo `.env`. As principais são:

- `APP_PORT`: porta publicada pelo Nginx;
- `WEB_ORIGIN`: endereço usado pelos computadores da rede;
- `POSTGRES_DB`, `POSTGRES_USER` e `POSTGRES_PASSWORD`: acesso ao banco;
- `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET`: assinatura das sessões;
- `ADMIN_LOGIN` e `ADMIN_PASSWORD`: acesso inicial do administrador.

O PostgreSQL não publica a porta no computador. Somente a porta definida em `APP_PORT` deve ser liberada no firewall da rede interna.

## Backup

Criar um backup manual:

```powershell
.\scripts\backup\backup.ps1
```

Instalar a tarefa diária:

```powershell
.\scripts\backup\install-daily-backup.ps1 -Time "02:00" -RetentionDays 30
```

Restaurar um pacote:

```powershell
.\scripts\backup\restore.ps1 -BackupFile ".\backups\erm-backup-AAAAMMDD-HHMMSS.zip"
```

O pacote contém o banco, os anexos, os relatórios, um manifesto e a verificação SHA-256. A restauração substitui a base atual e deve ser feita em uma janela de manutenção.

## Verificações antes de publicar

```powershell
corepack pnpm --filter ./packages/shared test
corepack pnpm --filter ./apps/api test
corepack pnpm --filter ./apps/web test
corepack pnpm --filter ./apps/api lint
corepack pnpm --filter ./apps/web lint
corepack pnpm --filter ./apps/api typecheck
corepack pnpm --filter ./apps/web typecheck
docker compose config --quiet
```

## Documentação

- [Instalação na rede interna](docs/INSTALACAO_WINDOWS_10_REDE.md)
- [Operação do estoque](docs/ESTOQUE.md)
- [Notas de desempenho](docs/REVISAO_ESCALABILIDADE.md)
- [Levantamento da planilha original](docs/DIAGNOSTICO_PLANILHA.md)

Uso interno. Não inclua arquivos `.env`, backups ou dados operacionais no repositório.
