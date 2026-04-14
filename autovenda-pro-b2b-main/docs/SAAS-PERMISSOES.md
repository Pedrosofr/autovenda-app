# Matriz de Permissoes SaaS

## Papeis

- `platform_admin`: usuario interno da sua empresa
- `owner`: dono ou gerente da loja cliente
- `seller`: vendedor da loja cliente

## Regras globais

- Todo usuario comum pertence a uma loja.
- Todo dado operacional pertence a uma loja.
- Toda acao sensivel e validada no backend.
- O frontend pode esconder botoes, mas a permissao real vem da API.
- O fluxo padrao de onboarding e a propria loja se cadastrar e entrar como `owner`.
- A montagem da equipe acontece depois, por convite ou criacao interna controlada pelo `owner`.

## Matriz resumida

| Acao | platform_admin | owner | seller |
| --- | --- | --- | --- |
| Ver todas as lojas | Sim | Nao | Nao |
| Bloquear ou reativar loja | Sim | Nao | Nao |
| Estender trial | Sim | Nao | Nao |
| Criar loja | Sim | Nao | Nao |
| Editar dados da propria loja | Nao | Sim | Nao |
| Convidar usuarios da propria loja | Nao | Sim | Nao |
| Desativar vendedor da propria loja | Nao | Sim | Nao |
| Ver dashboard da propria loja | Nao | Sim | Sim |
| Gerenciar estoque da propria loja | Nao | Sim | Sim |
| Gerenciar leads da propria loja | Nao | Sim | Sim |
| Registrar consultas da propria loja | Nao | Sim | Sim |
| Registrar vendas da propria loja | Nao | Sim | Sim |
| Gerenciar custos da propria loja | Nao | Sim | Sim |
| Alterar configuracoes sensiveis da loja | Nao | Sim | Nao |
| Ver faturamento, trial e plano da loja | Sim | Sim | Nao |
| Acessar painel central da plataforma | Sim | Nao | Nao |

## Login e fluxo de acesso

### Platform Admin

- faz login em uma area propria da plataforma
- nao pertence a uma loja operacional
- enxerga lista de lojas, trial, status e usuarios

### Owner

- cria a conta inicial da loja por auto-cadastro ou recebe acesso da plataforma
- cai no app da propria loja
- pode convidar vendedores por link
- pode montar a equipe da loja sem depender do admin da plataforma

### Seller

- entra por convite
- define senha
- acessa apenas a propria loja
- nao ve area administrativa da plataforma

## Trial e status

Os estados minimos recomendados para a loja sao:

- `trial`
- `active`
- `past_due`
- `blocked`
- `closed`

Regras:

- `trial`: loja pode usar normalmente ate a data final
- `active`: loja liberada
- `past_due`: acesso pode ser limitado
- `blocked`: acesso operacional bloqueado
- `closed`: loja encerrada

## Controle central da plataforma

O platform admin deve sempre conseguir:

- listar todas as lojas
- ver status do trial
- ver quantidade de usuarios por loja
- bloquear e desbloquear loja
- estender trial
- redefinir senha de owner
- ver ultima atividade relevante

Mas esse painel nao deve substituir o onboarding principal do produto:

- a entrada padrao e o auto-cadastro da loja
- o platform admin atua como suporte interno e operacao

## Escopo minimo de auditoria

Registre pelo menos:

- login
- logout
- convite enviado
- usuario ativado ou desativado
- trial estendido
- loja bloqueada ou reativada
- alteracoes administrativas relevantes

## Regra mais importante

Nenhuma rota de negocio deve responder dados sem contexto de loja.

Em pratica:

- owner e seller enviam sessao
- backend resolve a loja da sessao
- backend filtra por `loja_id`
- so o platform admin pode furar esse filtro
