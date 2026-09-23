# Instalação do ERM em uma rede interna — Windows 10

Este guia instala o ERM em um computador central e disponibiliza o endereço `http://IP-DO-SERVIDOR:8080` para os demais computadores da mesma rede.

> **Aviso importante (setembro de 2026):** o suporte geral do Windows 10 terminou em 14/10/2025 e o Docker Desktop informa que só oferece suporte a versões do Windows ainda atendidas pela Microsoft. O procedimento abaixo pode funcionar no Windows 10 22H2, mas, para um servidor empresarial novo, use preferencialmente Windows 11 compatível ou um servidor Linux suportado. Referências: [ciclo de vida do Windows 10](https://learn.microsoft.com/en-us/lifecycle/products/windows-10-home-and-pro) e [requisitos do Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/).

## 1. Preparar o computador servidor

Use um computador dedicado, ligado por cabo e que permaneça ligado durante o expediente. Recomendação para uso simultâneo por vários setores:

- processador de 4 núcleos ou mais;
- 16 GB de RAM ou mais;
- SSD com pelo menos 100 GB livres;
- Windows 10 Pro/Enterprise/Education 22H2 de 64 bits (build 19045), caso a migração imediata não seja possível;
- virtualização habilitada no BIOS/UEFI;
- nobreak e um segundo disco, NAS ou servidor para uma cópia externa dos backups.

Em **Configurações > Rede e Internet > Propriedades**, defina a rede como **Privada**. Em **Configurações > Sistema > Energia**, impeça a suspensão automática do servidor.

No roteador, crie uma reserva DHCP para o endereço MAC do servidor. Isso mantém o mesmo IP sem configurar endereço fixo diretamente no Windows. Anote o endereço mostrado por:

```powershell
ipconfig
```

Nos exemplos, será usado `192.168.1.50`. Troque pelo endereço real.

## 2. Instalar WSL 2 e Docker Desktop

Abra o PowerShell como Administrador e execute:

```powershell
wsl --install
```

Reinicie o computador. Se o comando apenas exibir a ajuda, execute `wsl --list --online` e depois `wsl --install -d Ubuntu`. A Microsoft documenta esse procedimento em [Instalar o WSL](https://learn.microsoft.com/en-us/windows/wsl/install).

Instale o [Docker Desktop para Windows](https://docs.docker.com/desktop/setup/install/windows-install/) usando o mecanismo **WSL 2** e mantendo **Linux containers**. Abra o Docker Desktop e confirme:

```powershell
wsl --version
docker version
docker compose version
```

Nas configurações do Docker Desktop:

1. marque **Start Docker Desktop when you sign in**;
2. reserve, se disponível, pelo menos 4 CPUs e 8 GB de memória;
3. mantenha o computador conectado com o mesmo usuário operacional, pois o Docker Desktop e a tarefa de backup dependem da sessão desse usuário.

Verifique também os termos de licença do Docker Desktop aplicáveis à empresa; organizações maiores podem precisar de assinatura comercial.

## 3. Copiar e configurar o sistema

Copie o projeto para uma pasta estável, por exemplo `C:\ERM`. Não execute o servidor a partir de Downloads, Área de Trabalho, OneDrive ou pasta temporária.

Abra o PowerShell nessa pasta:

```powershell
Set-Location C:\ERM
Copy-Item .env.example .env
notepad .env
```

Altere pelo menos estas linhas:

```dotenv
NODE_ENV=production
COOKIE_SECURE=false
APP_PORT=8080
WEB_ORIGIN=http://192.168.1.50:8080
POSTGRES_DB=compras
POSTGRES_USER=compras
POSTGRES_PASSWORD=USE_UMA_SENHA_FORTE_E_EXCLUSIVA
DATABASE_URL=postgresql://compras:USE_A_MESMA_SENHA@postgres:5432/compras?schema=public
JWT_ACCESS_SECRET=SEGREDO_ALEATORIO_COM_MAIS_DE_32_CARACTERES
JWT_REFRESH_SECRET=OUTRO_SEGREDO_ALEATORIO_COM_MAIS_DE_32_CARACTERES
ADMIN_NAME=Administrador
ADMIN_LOGIN=admin
ADMIN_PASSWORD=UMA_SENHA_INICIAL_FORTE
```

Não use espaços, `@`, `:`, `/`, `#` ou `%` em `POSTGRES_PASSWORD`, pois esses caracteres exigem codificação dentro da URL. Use segredos diferentes para JWT e guarde uma cópia segura do `.env`; ele não entra no backup por conter credenciais.

## 4. Iniciar e criar os dados iniciais

Ainda em `C:\ERM`, execute:

```powershell
docker compose up -d --build
docker compose ps
```

Espere até `postgres`, `api` e `web` aparecerem como `healthy`. Na primeira instalação, e somente nela, crie a organização, perfis e conta administrativa:

```powershell
docker compose exec api pnpm --filter @compras/api db:seed
```

Teste no próprio servidor em `http://localhost:8080`. Entre com `ADMIN_LOGIN` e `ADMIN_PASSWORD` definidos no `.env` e troque a senha inicial quando solicitado.

## 5. Liberar somente a rede interna

Descubra a faixa da rede com o administrador. Para uma rede `192.168.1.0/24`, abra PowerShell como Administrador e execute:

```powershell
New-NetFirewallRule -DisplayName "ERM - Rede interna" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 -Profile Private -RemoteAddress 192.168.1.0/24
```

Não libere a porta `5432`: o PostgreSQL permanece apenas na rede interna dos contêineres. Não crie redirecionamento de porta no roteador e não exponha o ERM à internet.

Em outro computador da mesma rede, abra `http://192.168.1.50:8080`. Se não abrir, confira `docker compose ps`, o perfil privado da rede, o IP reservado e a regra do firewall.

## 6. Ativar o backup diário

O backup inclui banco PostgreSQL completo, anexos, relatórios, manifesto da versão e arquivo SHA-256 para detectar corrupção. O acesso web é pausado por poucos segundos durante a cópia para manter banco e arquivos consistentes e volta automaticamente ao final.

Primeiro faça um backup manual e confira se foram criados o `.zip` e o `.zip.sha256`:

```powershell
Set-Location C:\ERM
.\scripts\backup\backup.ps1 -RetentionDays 30
Get-ChildItem .\backups
```

Depois, no PowerShell como Administrador, instale a tarefa diária das 02:00:

```powershell
.\scripts\backup\install-daily-backup.ps1 -Time "02:00" -RetentionDays 30
```

Para gravar diretamente em um segundo disco:

```powershell
.\scripts\backup\install-daily-backup.ps1 -Time "02:00" -RetentionDays 30 -OutputDirectory "D:\Backups-ERM"
```

Em **Agendador de Tarefas > Biblioteca do Agendador**, localize `ERM-Backup-Diario`, clique em **Executar** e confirme o resultado `0x0`. O usuário configurado precisa estar conectado e o Docker Desktop em execução no horário.

Um backup no mesmo SSD não protege contra defeito, roubo ou ransomware. Mantenha pelo menos uma segunda cópia em NAS, disco externo removido após a cópia ou armazenamento corporativo protegido. Restrinja o acesso porque o backup contém todos os dados empresariais.

## 7. Testar a restauração

Teste trimestralmente em uma máquina separada. A restauração substitui os dados atuais; no servidor de produção, faça-a apenas em uma janela de manutenção.

```powershell
.\scripts\backup\restore.ps1 -BackupFile ".\backups\erm-backup-AAAAMMDD-HHMMSS.zip"
```

O script valida o SHA-256 quando o arquivo correspondente está presente, solicita a palavra `RESTAURAR`, interrompe temporariamente a aplicação, recupera banco e arquivos e inicia os serviços novamente.

## 8. Operação e atualização

Comandos de rotina, sempre dentro de `C:\ERM`:

```powershell
docker compose ps
docker compose logs --tail 200 api
docker compose logs --tail 200 postgres
docker stats
```

Para atualizar o sistema, faça primeiro um backup e então atualize o código e reconstrua:

```powershell
.\scripts\backup\backup.ps1
git pull
docker compose up -d --build
docker compose ps
```

As migrações do banco são aplicadas automaticamente quando a API inicia. Os contêineres usam reinicialização automática e os logs têm rotação para não ocupar o disco indefinidamente.

## 9. Checklist de entrega

- [ ] IP reservado no roteador e acesso por cabo.
- [ ] Windows protegido ou plano aprovado de migração para sistema suportado.
- [ ] Docker Desktop inicia com o usuário operacional.
- [ ] `.env` possui senhas exclusivas e está guardado com segurança.
- [ ] Três serviços aparecem como `healthy`.
- [ ] Acesso testado em dois computadores da rede.
- [ ] Firewall limitado à sub-rede interna.
- [ ] Backup manual validado.
- [ ] Tarefa `ERM-Backup-Diario` retorna `0x0`.
- [ ] Segunda cópia do backup fora do SSD do servidor.
- [ ] Restauração testada em outra máquina.
