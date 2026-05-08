# Deploy Mittens — Railway + Turso

Setup único, ~30 minutos. Depois é tudo `git push origin main`.

## 1. Criar a base de dados (Turso)

### Instalar CLI
```bash
brew install tursodatabase/tap/turso
turso auth signup        # cria conta (ou login se já tiveres)
```

### Criar a DB de produção
```bash
turso db create mittens-prod --location ams   # ams = Amsterdam (mais perto)
turso db show mittens-prod --url               # → guarda este URL
turso db tokens create mittens-prod            # → guarda este token
```

Vais ter:
```
TURSO_DATABASE_URL=libsql://mittens-prod-<xxx>.turso.io
TURSO_AUTH_TOKEN=eyJhbGciOiJF...
```

> **Nota**: o schema das tabelas é aplicado automaticamente no primeiro arranque
> via `drizzle-kit push --force`. Não é preciso correr migrações manualmente.

## 2. Criar projeto no Railway

1. Vai a [railway.com](https://railway.com) e faz login com GitHub
2. **New Project → Deploy from GitHub repo** → escolhe `Mittens`
3. Railway começa o build automaticamente. Vai falhar (falta env vars) — está OK.

## 3. Configurar env vars no Railway

No projeto criado: **Settings → Variables → New Variable**. Adiciona:

| Nome | Valor | Notas |
|------|-------|-------|
| `NODE_ENV` | `production` | |
| `TURSO_DATABASE_URL` | `libsql://...` | Do passo 1 |
| `TURSO_AUTH_TOKEN` | `eyJ...` | Do passo 1 |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | A tua key da Anthropic |
| `TELEGRAM_BOT_TOKEN` | `123:ABC...` | Do BotFather |
| `ADMIN_PASSWORD` | `<escolhe>` | Password do dashboard CRM |
| `JWT_SECRET` | `<random 32+ chars>` | `openssl rand -hex 32` |
| `WEBHOOK_URL` | `(deixa em branco por agora)` | Configurado no passo 5 |
| `WEB_URL` | `(deixa em branco)` | Não é preciso, frontend é same-origin |
| `ANTHROPIC_ENV_ID` | `env_...` | Se usares Managed Agents |

Depois de gravar, Railway faz redeploy automaticamente.

## 4. Gerar domínio Railway

1. **Settings → Networking → Generate Domain** → vais ter algo como
   `mittens-production.up.railway.app`
2. Abre esse URL no browser → deves ver o login do CRM

> **Domínio próprio (opcional)**: Settings → Networking → Custom Domain →
> adiciona `app.mittens.pt` (ou outro). Railway dá-te os DNS records para
> apontares no teu registar (Cloudflare/Namecheap).

## 5. Configurar webhook do Telegram

Agora que tens domínio, define a env var:
```
WEBHOOK_URL=https://mittens-production.up.railway.app
```
(ou o teu domínio próprio)

Railway redeploya. No próximo arranque, o bot regista o webhook automaticamente
em `https://<DOMAIN>/telegram`.

> **Importante**: NUNCA tenhas o mesmo `TELEGRAM_BOT_TOKEN` em desenvolvimento
> e produção a correr ao mesmo tempo — só um pode receber updates do Telegram.
> Em dev usa um bot separado (cria outro com `@BotFather`).

## 6. Verificar tudo

1. Abre o domínio Railway → faz login com `ADMIN_PASSWORD`
2. Envia uma mensagem ao bot Telegram → deve aparecer no Inbox do CRM
3. Cria um alerta de imóveis → deve correr no próximo cron (30 min)

## 7. PWA no iPhone (depois de pronto)

1. Abre `https://<teu-dominio>` no Safari iOS
2. Botão **Partilhar** (ícone com seta para cima)
3. **Adicionar ao Ecrã Principal**
4. Abre como app — vai parecer nativa

## A partir daqui

Tudo automatizado:
- `git push origin main` → Railway detecta → build → deploy → live em 2–3 min
- Schema changes (alterar `schema.ts`): push, e Drizzle aplica no próximo arranque
- Logs em tempo real: Railway dashboard → projeto → **Logs**
- Rollback num clique: Railway → **Deployments** → clica num deploy anterior → **Redeploy**

## Custos esperados

- Railway Hobby: **$5/mês** (500h de runtime, suficiente para 1 serviço 24/7)
- Turso Free: **$0** (até 500 DBs, 9 GB armazenamento, 1 bilião de row reads/mês)
- Anthropic API: **pay-per-use** (estimativa: $5–20/mês com uso normal)
- Telegram: **$0**

**Total: ~$5–25/mês**, dependendo do uso da API.

## Migrations destrutivas

`drizzle-kit push --force` é seguro para mudanças aditivas (novas colunas/tabelas)
mas pode perder dados em mudanças destrutivas (renomear coluna, drop tabela).

Para essas mudanças:
1. Localmente: `npx drizzle-kit generate` para gerar SQL de migration
2. Aplica manualmente: `turso db shell mittens-prod < drizzle/0001_xxx.sql`
3. Só depois faz push do schema

Para já, com schema estável, `push --force` é seguro.

## Troubleshooting

**"Faltam env vars" no log do Railway**
→ Falta uma das 4 críticas (`ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `ADMIN_PASSWORD`, `JWT_SECRET`).
Confirma em Settings → Variables.

**Bot Telegram não responde**
→ Confirma `WEBHOOK_URL` está definido E corresponde ao domínio Railway.
Testa manualmente: `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo`

**Frontend não carrega (404 no `/`)**
→ Provavelmente o build do web falhou. Vê os logs de build no Railway —
deve haver `vite build` no log e gerar `packages/web/dist/`.

**Cron de alertas não corre**
→ É a cada 30 min. Confirma no log do Railway: deve aparecer
`[PropertyAlerts] A verificar X alerta(s)...` periodicamente.
