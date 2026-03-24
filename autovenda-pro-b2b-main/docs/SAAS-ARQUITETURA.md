# Arquitetura SaaS Enxuta

## Objetivo

Transformar o app atual em um SaaS pequeno, com:

- lojas separadas
- login por perfil
- trial controlado no servidor
- controle central da plataforma
- backend unico, sem arquitetura gigante

## O que este projeto precisa

Voce quer vender para varias lojas e garantir que:

- cada loja veja so os proprios dados
- o dono da loja tenha mais poder que os vendedores
- trial e bloqueio nao possam ser burlados no frontend
- o sistema continue simples de operar e evoluir

Isso significa um SaaS enxuto, nao um painel local preso ao navegador.

## Papeis do sistema

### Platform Admin

E o seu usuario interno. Ele pode:

- ver todas as lojas
- liberar ou bloquear loja
- estender trial
- redefinir acesso
- acompanhar uso basico

### Owner

E o dono ou gerente da loja. Ele pode:

- administrar a propria loja
- convidar vendedores
- ver relatorios da propria loja
- alterar configuracoes da loja
- operar estoque, CRM, custos, vendas e pos-venda

### Seller

E o usuario operacional da loja. Ele pode:

- usar CRM
- operar estoque e consultas permitidas
- registrar vendas e tarefas
- atuar no dia a dia sem acessar controles administrativos

## Componentes recomendados

### Frontend

O frontend continua simples:

- login
- navegacao
- telas operacionais
- dashboard
- mensagens de trial e bloqueio

O frontend melhora a experiencia, mas nao decide permissao final.

### Backend unico

O backend concentra:

- autenticacao
- autorizacao
- resolucao da loja ativa
- validacao do trial
- regras de acesso por papel
- integracoes externas
- auditoria minima

### Banco central

Uma base so, com separacao por loja usando `tenant_id` ou `loja_id`.

Voce nao precisa de um banco por loja agora. Para 10 lojas, um banco unico com isolamento correto basta.

## Regra principal: isolamento por loja

Toda tabela de negocio precisa carregar `loja_id`.

Regras obrigatorias:

- todo dado operacional pertence a uma loja
- toda consulta no backend filtra por `loja_id`
- owner e seller nunca acessam dados de outra loja
- somente o platform admin pode enxergar todas as lojas

## Trial e licenca

O controle deve ficar no servidor.

Fluxo minimo:

1. loja criada
2. trial inicia com data de inicio e fim
3. login verifica se a loja esta `trial`, `active`, `past_due`, `blocked` ou `closed`
4. se expirar, o backend limita ou bloqueia o acesso
5. voce consegue reativar manualmente pelo painel central

## Seguranca minima

O minimo saudavel para vender:

- senha salva apenas no backend
- sessao validada no backend
- cookie seguro ou token assinado
- rate limit no login
- verificacao de papel e loja em todas as rotas sensiveis
- log minimo das acoes importantes

## O que nunca pode ficar so no frontend

Estas regras precisam ser servidoras:

- login
- permissao por papel
- isolamento por loja
- trial e bloqueio
- criacao de usuarios
- convites de vendedores
- acesso ao painel central

## O que pode continuar simples

Voce nao precisa agora de:

- microservicos
- filas complexas
- billing sofisticado
- painel de BI pesado
- banco separado por loja

## Estrutura enxuta recomendada

- `frontend`: React/Vite
- `backend`: Node/TypeScript unico
- `db`: PostgreSQL com `loja_id`
- `storage`: opcional para fotos e arquivos

## Verdade importante sobre "copiar"

Ninguem consegue impedir 100% que o visual de um app web seja copiado.

O que voce consegue impedir e o uso real do sistema:

- sem backend, nao entra
- sem trial/licenca valida, nao usa
- sem pertencer a loja, nao enxerga os dados
- sem permissao correta, nao acessa funcoes administrativas

## Resumo pratico

Para vender esse app com seguranca e simplicidade:

- manter um backend unico
- criar conceito de loja
- ter papeis `platform_admin`, `owner` e `seller`
- validar tudo no servidor
- controlar trial e bloqueio no backend
- deixar o frontend mais leve e declarativo

Esse e o menor caminho para um SaaS pequeno, seguro o suficiente para comecar e sem transformar o projeto em algo gigantesco.
