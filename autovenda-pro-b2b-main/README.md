# ROZZ CAR B2B

Plataforma B2B para operacao de revendas automotivas com estoque, CRM, vendas, consulta veicular, custos, equipe e emissao de NF-e.

## Stack

- Frontend: Vite, React, TypeScript, Tailwind, shadcn/ui, Radix UI
- Backend: handlers em `server/backend.ts` e adaptadores em `api/**`
- Banco atual: SQLite em fallback e Postgres/Supabase quando `DATABASE_URL` estiver configurada
- Integracoes opcionais: Google Gemini, Resend, Focus NFe

## Requisitos

- Node.js `22.5+`
- npm `10+`

## Setup local

1. Instale dependencias:

```bash
npm install
```

2. Copie as variaveis:

```bash
cp .env.example .env
```

3. Preencha no minimo:

- `SESSION_SECRET`
- `PLATFORM_ADMIN_EMAIL`
- `PLATFORM_ADMIN_PASSWORD`
- `APP_BASE_URL`

4. Rode em desenvolvimento:

```bash
npm run dev
```

O app sobe por padrao em `http://localhost:8082`.

## Scripts

- `npm run dev`: frontend + rotas `/api/*` via plugin local
- `npm run build`: build de producao
- `npm run start`: servidor Node de producao local (`server/prod.ts`)
- `npm run lint`: ESLint
- `npm run typecheck`: validacao TypeScript do backend e configuracoes
- `npm run test`: Vitest
- `npm run test:e2e`: smoke E2E com Playwright em banco local isolado
- `npm run migrate:sqlite-to-postgres`: copia dados do SQLite para o Postgres configurado em `DIRECT_URL` ou `DATABASE_URL`

## Variaveis de ambiente

Consulte [`.env.example`](./.env.example). As principais sao:

- `DATABASE_PATH`: caminho do SQLite
- `DATABASE_URL`: conexao principal com Postgres/Supabase
- `DIRECT_URL`: conexao direta para administracao/migracoes
- `SESSION_SECRET`: assinatura de cookie de sessao
- `APP_BASE_URL`: URL publica da aplicacao
- `RESEND_API_KEY` e `EMAIL_FROM`: recuperacao de senha
- `GOOGLE_API_KEY` e opcionalmente `GOOGLE_API_KEY_2`: proxy Gemini
- `PLATFORM_ADMIN_*`: bootstrap do admin da plataforma

## Fluxo de producao atual

- Vercel: `vercel.json` para funcoes `/api`
- Node/Railway: `server/prod.ts`

## Limites conhecidos

- O projeto ainda suporta `SQLite` como fallback local e de testes.
- Em runtime com `DATABASE_URL`, o backend passa a priorizar Postgres/Supabase.
- Em Supabase, use `Session Pooler` em `DATABASE_URL` e mantenha `DIRECT_URL` para a conexao direta.
- Se voce vier de SQLite, rode `npm run migrate:sqlite-to-postgres` antes de desligar o banco antigo.
- O rate limit ja pode persistir em banco, mas ainda nao esta em Redis/edge para cenarios de alta escala.
- Billing recorrente ainda nao esta integrado.
- A API publica `/api/v1/*` ainda retorna `501`.

## Checklist minimo antes de piloto

- Configurar `SESSION_SECRET` forte e `APP_BASE_URL` com `https`
- Revisar e preencher credenciais de `Resend`, `Focus NFe` e `Gemini` apenas se forem usadas
- Executar `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` e `npm run test:e2e`
- Definir backup do SQLite ou operar com `Postgres/Supabase` como banco principal
- Publicar politica de privacidade e alinhar operacao LGPD
- Validar fluxo de login, recuperacao de senha, CRUD principal e bloqueio de loja
- Revisar textos e onboarding para o fluxo de auto-cadastro da loja

Guias operacionais:

- [docs/OPERACAO-BACKUP-RESTORE.md](./docs/OPERACAO-BACKUP-RESTORE.md)
- [docs/LANCAMENTO-PILOTO.md](./docs/LANCAMENTO-PILOTO.md)

## Estrutura principal

- [`src/`](./src): SPA React
- [`server/backend.ts`](./server/backend.ts): roteamento e regras do backend
- [`server/database.ts`](./server/database.ts): schema e acesso ao SQLite/Postgres
- [`api/`](./api): adaptadores para Vercel/functions
- [`docs/`](./docs): analises e documentacao de produto/arquitetura

## Estado de release

O repositorio esta pronto para evolucao controlada e piloto assistido. Para ampliar distribuicao, trate como obrigatorio fechar banco principal, backup/restore validado, observabilidade basica e pipeline de release mais robusta.
