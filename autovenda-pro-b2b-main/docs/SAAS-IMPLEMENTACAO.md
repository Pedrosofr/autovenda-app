# Roadmap de Implementacao SaaS

> Objetivo: sair do estado atual, que depende de `localStorage` e de um unico fluxo de admin, para um SaaS simples com trial, lojas isoladas, papeis `owner` e `seller`, e controle central.

## Contexto atual

- O app hoje funciona como SPA com estado local e persistencia em `localStorage`.
- A autenticacao existe, mas e simples e centralizada.
- O dominio principal ja esta claro: veiculos, leads, vendedores, vendas, consultas, pos-venda, custos e configuracoes.
- O maior risco tecnico atual e a ausencia de isolamento real entre lojas e de persistencia server-side.

## Principio do menor caminho

- Nao criar microservicos.
- Nao criar multi-tenant complexo de inicio.
- Nao separar por banco por loja no primeiro momento.
- Nao construir billing sofisticado antes de validar trial e controle de acesso.
- Um backend, um banco, uma modelagem com `tenant_id` em todas as tabelas de negocio.

## Fase 1 - Base SaaS minima

**Prioridade:** P0

**Meta:** tirar os dados do browser e colocar uma base central com autenticacao, usuarios e lojas.

**Entregaveis**

- Banco de dados central com tabelas de:
  - `tenants` ou `stores`
  - `users`
  - relacao de usuario com loja e papel
  - entidades principais do dominio com `tenant_id`
- Login server-side de verdade.
- Sessao autenticada com token ou cookie.
- Primeira migracao do estado atual de `localStorage` para API.
- Painel continua igual na UI, mas lendo e gravando no backend.

**Decisoes praticas**

- Comecar com uma unica loja por conta, mesmo que o modelo ja permita mais de uma.
- Manter o front praticamente igual.
- Criar API CRUD basica para veiculos, leads, vendedores, vendas, custos e configuracoes.

**Risco principal**

- Quebrar a experiencia atual ao trocar persistencia local por remota.

**Mitigacao**

- Migrar tela por tela, mantendo o contrato de dados o mais parecido possivel.
- Fazer rollback facil via feature flag se necessario.

## Fase 2 - Isolamento por loja

**Prioridade:** P0

**Meta:** garantir que cada loja veja apenas seus dados.

**Entregaveis**

- `tenant_id` em todas as consultas e mutacoes.
- Middleware de autorizacao para filtrar dados por loja.
- Convite ou criacao inicial da loja no cadastro.
- Usuario autenticado sempre vinculado a uma loja ativa.
- Separacao de dados de demo, teste e producao.

**Regras minimas**

- Nenhum endpoint de negocio pode retornar dados sem contexto de loja.
- Nenhuma tela pode depender de filtro apenas no front.
- Admin central pode ver tudo; usuario comum so ve a propria loja.

**Risco principal**

- Vazamento de dados entre lojas por consulta esquecida ou filtro incompleto.

**Mitigacao**

- Centralizar o filtro de tenant no backend.
- Revisar endpoints e queries com checklist unico de isolamento.

## Fase 3 - Trial e ativacao

**Prioridade:** P0

**Meta:** permitir que uma loja entre, teste e depois seja bloqueada ou liberada por status.

**Entregaveis**

- Trial com data de inicio e fim.
- Status da assinatura/conta: `trial`, `active`, `past_due`, `blocked`.
- Bloqueio de acesso quando trial expirar.
- Tela ou banner simples avisando dias restantes.
- Admin central consegue estender trial manualmente.

**Menor caminho**

- Comecar com trial fixo de X dias configuravel.
- Nao integrar pagamento nesta fase.
- Nao implementar coupons, planos complexos ou ciclo de fatura completo.

**Risco principal**

- Bloquear cliente legitimo por erro de data ou timezone.

**Mitigacao**

- Guardar datas em UTC no backend.
- Sempre calcular expiracao no servidor.

## Fase 4 - Papeis Owner e Seller

**Prioridade:** P1

**Meta:** permitir operacao real com permissao simples e clara.

**Entregaveis**

- Papel `owner`:
  - administra loja
  - convida usuarios
  - ve configuracoes e status
  - acessa relatorios da propria loja
- Papel `seller`:
  - opera leads, vendas e pos-venda
  - nao altera configuracoes sensiveis
  - nao ve dados administrativos fora do escopo permitido
- Guardas de rota e de acao por permissao.

**Regras minimas**

- `owner` pode tudo dentro da propria loja.
- `seller` atua apenas nas telas operacionais.
- O admin central continua acima de todos.

**Risco principal**

- Excesso de permissao no front sem controle no backend.

**Mitigacao**

- Autorizacao sempre validada na API, nunca apenas na interface.

## Fase 5 - Controle central

**Prioridade:** P1

**Meta:** dar visao e comando ao time interno sobre todas as lojas.

**Entregaveis**

- Painel central com:
  - lista de lojas
  - status do trial
  - status de assinatura
  - quantidade de usuarios
  - ultima atividade
- Acoes administrativas:
  - ativar/bloquear loja
  - estender trial
  - resetar acesso
  - revisar uso basico
- Separacao clara entre area da loja e area central.

**Menor caminho**

- Um unico painel interno simples.
- Sem BI pesado.
- Sem metrica complexa no inicio.

**Risco principal**

- Misturar fluxo de admin central com fluxo do cliente final.

**Mitigacao**

- Rotas e layout separados desde cedo.

## Fase 6 - Preparacao para operacao real

**Prioridade:** P2

**Meta:** deixar o SaaS minimamente confiavel para uso pago.

**Entregaveis**

- Logs de auditoria das acoes importantes.
- Backup e migracoes versionadas.
- Monitoramento basico de erros.
- Seeds e ambiente de homologacao.
- Testes de permissao e isolamento multi-tenant.

**Risco principal**

- Crescer sem observabilidade e sem recuperar falhas.

**Mitigacao**

- Registrar eventos essenciais desde o inicio.
- Priorizar testes de autorizacao e isolamento.

## Sequencia recomendada

1. Subir backend e banco central.
2. Migrar autenticao e sessao para server-side.
3. Adicionar `tenant_id` e isolamento de loja.
4. Implementar trial e bloqueio simples.
5. Separar `owner` e `seller`.
6. Criar painel central.
7. Endurecer com logs, testes e backup.

## Roadmap resumido

- **P0:** base SaaS, multi-tenant, auth server-side e trial.
- **P1:** roles `owner` e `seller`, convite de usuarios e painel central.
- **P2:** auditoria, observabilidade, backup e testes de isolamento.

## O que nao fazer agora

- Nao refatorar toda a arquitetura antes de ter o SaaS rodando.
- Nao trocar o stack inteiro.
- Nao criar billing completo antes de validar trial e uso real.
- Nao fazer multi-tenant avancado sem necessidade.

## Definicao de sucesso

- Uma nova loja entra, cria conta, inicia trial e usa o sistema sem ver dados de outra loja.
- O `owner` gerencia a loja.
- O `seller` opera o dia a dia.
- O admin central enxerga e controla todas as lojas.
- O app deixa de depender de `localStorage` para os dados de negocio.
