# Agências independentes

Recolha do inventário das 199 imobiliárias da AML e de Setúbal que não pertencem às redes
já cobertas pelos alertas (RE/MAX, ERA, Century 21, KW).

## Como funciona

- **Fonte:** a página pública de cada agência no Imovirtual
  (`/pt/empresas/agencias-imobiliarias/{slug}?transaction=SELL|RENT&by=LATEST&direction=DESC&currentPage=N`).
  O inventário vem em `__NEXT_DATA__` → `props.pageProps.searchAds`, com 6 anúncios por página.
  Esta fonte cobre as 199 agências, com ou sem site próprio.
- **Incremental:** lê as páginas mais recentes e pára quando uma página inteira só tem
  anúncios já conhecidos. Normalmente são 1–2 pedidos por agência e por negócio.
- **Completa:** na primeira vez que vê uma agência, e depois uma vez por semana, lê o
  inventário todo (até 1000 páginas). Marca como removidos os anúncios que já não
  aparecem. A revisão semanal faz no máximo 15 agências por execução.
- **Base e novidades:** tudo o que é recolhido até a agência ter a primeira varredura
  completa fica marcado como inventário de base (`isBaseline`). Daí em diante, cada
  anúncio que aparece pela primeira vez é uma novidade, e fica "por ver" até ser
  marcado como visto.
- **Ritmo:** pedidos sequenciais com pausa de 1–2 s. Se houver três respostas 403/429
  seguidas, a varredura para e volta a tentar na janela seguinte.
- **Guarda:** tabela `agency_listings` (primeira e última vez visto, `removedAt`,
  histórico de preços) e tabela `agency_status` (estado por agência).

## Ligar

1. Recolher o inventário de base a partir do Mac (~2,5 h, pode ser interrompido e retomado):
   `npx tsx --env-file=.env packages/api/scripts/agency-sweep.ts`
2. Pôr `AGENCY_SWEEP=on` nas variáveis do Railway. Corre 10 min após o arranque e depois
   de 6 em 6 horas, e a partir daí só entram novidades.

## API (com login)

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/agencies` | Registo, estado e número de anúncios guardados por agência |
| GET | `/api/agencies/status` | Se está a correr, resumo da última execução, se está ligado |
| GET | `/api/agencies/listings` | Anúncios. Filtros: `agency`, `municipality`, `tx`, `typology`, `estate`, `minPrice`, `maxPrice`, `minArea`, `since`, `includeRemoved=1`, `onlyNew=1`, `unseen=1`, `limit`, `offset` |
| GET | `/api/agencies/new` | Só novidades por ver (aceita os mesmos filtros) |
| POST | `/api/agencies/new/seen` | Marca novidades como vistas. Body `{ "ids": [...] }`; sem ids marca todas |
| POST | `/api/agencies/sweep` | Lança uma varredura agora. Body opcional: `{ "agencyIds": ["267469"], "full": true }` |

Exemplo: T2 até 250 mil € em Odivelas que entraram desde ontem:
`/api/agencies/listings?municipality=Odivelas&typology=T2&tx=SELL&maxPrice=250000&since=2026-10-21`

## Testar sem base de dados

```
npx tsx packages/api/scripts/test-agency-sweep.ts            # 3 primeiras agências
npx tsx packages/api/scripts/test-agency-sweep.ts 267469     # por ID
```

## Sites próprios (mapeados a 22/10/2026)

72 das 199 agências têm site próprio; a coluna `platform` em `registry.ts` diz qual.

| Plataforma | Agências |
|---|---|
| eGO Real Estate | 47 |
| Site à medida (Next/Nuxt/Laravel…) | 8 |
| Proppy | 5 |
| Ximo, HCPro, CentralImo, Inmovilla | 2 cada |
| Casafari, MaisMLS, DS360, CRM360, WordPress | 1 cada |
| Sem site | 126 |

Nos sites eGO, a lista de imóveis é carregada pelo browser a partir de
`websiteapi.egorealestate.com/v1/Properties` com um token por site (`AuthorizationToken`).
Pedidos feitos fora do fluxo normal da página recebem HTTP 430, por isso não usamos essa via.
Como estas agências também publicam no Imovirtual, a recolha de lá já as cobre.
