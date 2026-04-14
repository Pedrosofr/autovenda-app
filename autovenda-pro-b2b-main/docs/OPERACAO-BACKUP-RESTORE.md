# Operacao de Backup e Restore

Este documento define o minimo operacional para nao perder dados da loja em piloto ou producao.

## Objetivo

- Garantir recuperacao de usuarios, sessoes, estoque, leads, vendas, pos-venda, custos e auditoria
- Reduzir risco de perda em deploy, erro humano ou falha de infraestrutura
- Padronizar a resposta antes de abrir o sistema para mais lojas

## Estado atual

- O backend suporta `SQLite` local e `Postgres/Supabase` quando `DATABASE_URL` estiver configurada
- Existe migracao de `SQLite -> Postgres` via `scripts/migrate-sqlite-to-postgres.ts`
- Nao existe ainda rotina automatica de backup/restauracao versionada dentro do projeto

## Regra recomendada para lancamento

- Piloto pequeno local: aceitar `SQLite` apenas com backup diario confirmado
- Producao ou piloto com lojas reais: usar `Postgres/Supabase` como banco principal
- Nao operar em Vercel com dependencia de `SQLite` efemero em `/tmp`

## Backup minimo por ambiente

### SQLite

Arquivo principal:

- `data/rozzcar.sqlite`

Arquivos auxiliares quando existirem:

- `data/rozzcar.sqlite-wal`
- `data/rozzcar.sqlite-shm`

Procedimento minimo:

1. Parar escrita no sistema ou executar copia em janela de baixo uso
2. Copiar os tres arquivos do banco quando existirem
3. Guardar backup com data e hora
4. Validar que o arquivo copiado abre sem erro em ambiente isolado

Frequencia recomendada:

- Diario no minimo
- Antes de deploy relevante
- Antes de migracao de banco

### Postgres / Supabase

Procedimento minimo:

1. Confirmar que `DATABASE_URL` e `DIRECT_URL` apontam para o banco correto
2. Habilitar backups nativos do provedor
3. Garantir ao menos um dump exportavel sob demanda
4. Testar restore em banco isolado antes de considerar o processo valido

Frequencia recomendada:

- Backup automatico diario no provedor
- Dump manual antes de mudanca estrutural

## Restore minimo

### SQLite

1. Parar a aplicacao
2. Substituir `rozzcar.sqlite` pelo backup valido
3. Restaurar `-wal` e `-shm` se fizerem parte da copia
4. Subir a aplicacao
5. Validar login, estoque, leads, vendas e pos-venda

### Postgres / Supabase

1. Restaurar em banco isolado primeiro
2. Validar integridade dos dados principais
3. Apontar aplicacao para o banco restaurado apenas depois da validacao
4. Executar smoke test funcional

## Smoke test apos restore

- Login do admin da plataforma
- Login de owner da loja
- Listagem de vendedores
- Estoque carregando
- CRM carregando
- Vendas carregando
- Pos-venda carregando
- Dashboard carregando sem erro
- NF-e apenas se o modulo estiver ativo na loja

## Responsabilidades

- Owner tecnico do projeto: garantir backup antes de deploy/migracao
- Operacao: validar restore periodicamente
- Produto: nao abrir piloto amplo sem processo de recuperacao validado

## Bloqueadores para considerar essa frente concluida

- Processo escrito e reproduzivel
- Um teste real de restore executado com sucesso
- Banco principal de producao definido
- Confirmacao de onde os backups ficam armazenados
