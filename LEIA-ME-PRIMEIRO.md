# Instalação do ERM no computador servidor

Este pacote contém a aplicação completa. O Docker Desktop precisa estar instalado e em execução no computador que ficará ligado na rede.

## 1. Copiar os arquivos

Extraia a pasta `ERM` para `C:\ERM`. Evite Área de Trabalho, Downloads, OneDrive ou pastas temporárias.

## 2. Descobrir o IP do servidor

Abra o PowerShell e execute `ipconfig`. Anote o endereço IPv4 da placa conectada à rede, por exemplo `192.168.1.50`, e peça ao responsável pela rede para reservar esse endereço no roteador.

## 3. Criar a configuração

Abra o PowerShell como Administrador:

```powershell
Set-Location C:\ERM
Copy-Item .env.example .env
notepad .env
```

No arquivo `.env`:

- troque todos os valores `CHANGE_ME` por senhas fortes;
- use a mesma senha em `POSTGRES_PASSWORD` e dentro de `DATABASE_URL`;
- configure `WEB_ORIGIN` com o IP do servidor, como `http://192.168.1.50:8080`;
- guarde uma cópia segura desse arquivo fora da pasta do sistema.

Evite `@`, `:`, `/`, `#` e `%` na senha do PostgreSQL, pois esses caracteres exigem codificação especial na URL.

## 4. Iniciar o sistema

Confirme que o Docker Desktop está usando Linux containers. Depois execute:

```powershell
Set-Location C:\ERM
docker compose up -d --build
docker compose ps
```

Na primeira execução o Docker baixa imagens e dependências; o computador precisa ter acesso à internet. Aguarde até `postgres`, `api` e `web` aparecerem como `healthy`.

## 5. Criar o acesso inicial

Execute uma única vez:

```powershell
docker compose exec api pnpm --filter @compras/api db:seed
```

Abra `http://localhost:8080` e entre com `ADMIN_LOGIN` e `ADMIN_PASSWORD` definidos no `.env`.

## 6. Liberar o acesso na rede

Confirme a faixa correta com o responsável pela rede. Exemplo para `192.168.1.0/24`:

```powershell
New-NetFirewallRule -DisplayName "ERM - Rede interna" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 -Profile Private -RemoteAddress 192.168.1.0/24
```

Nos outros computadores, abra `http://IP-DO-SERVIDOR:8080`. Não libere a porta 5432 e não exponha o sistema à internet.

## 7. Ativar o backup diário

```powershell
.\scripts\backup\backup.ps1 -RetentionDays 30
.\scripts\backup\install-daily-backup.ps1 -Time "02:00" -RetentionDays 30
```

Para salvar em outro disco, acrescente `-OutputDirectory "D:\Backups-ERM"` ao segundo comando. O usuário do servidor precisa permanecer conectado e o Docker Desktop deve estar em execução no horário.

## 8. Conferência final

```powershell
docker compose ps
Invoke-WebRequest -UseBasicParsing http://localhost:8080/health
```

O resultado esperado é HTTP 200 e os três serviços com estado `healthy`. O manual detalhado está em `docs\INSTALACAO_WINDOWS_10_REDE.md`.
