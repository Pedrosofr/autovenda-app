# Checklist de Lancamento do Piloto

Este checklist assume a decisao atual do produto: sem foco em billing e com onboarding voluntario da loja.

## Objetivo

- Colocar o sistema em uso com lojas piloto reais
- Reduzir risco de quebra operacional
- Alinhar produto, suporte e operacao antes de ampliar distribuicao

## Produto

- Auto-cadastro da loja funcionando
- Owner entra no sistema sem ajuda manual
- Owner consegue convidar equipe
- Seller enxerga apenas operacao autorizada
- Dashboard focado em meta de carros e leads
- Pos-venda funcionando em mobile

## Operacao

- Login e logout validados
- Recuperacao de senha validada
- CRUD principal de estoque validado
- CRM validado
- Vendas validadas
- Pos-venda validado
- Permissoes owner/seller validadas
- Consulta por placa tratada como modulo opcional se o provedor falhar

## Dados e seguranca

- `.env` fora de versionamento
- Segredos reais rotacionados se ja tiverem sido expostos
- `SESSION_SECRET` forte configurado
- Banco principal definido
- Backup e restore testados
- Auditoria basica ativa

## Mobile

- Login confortavel em celular
- Sidebar e navegacao usaveis em largura pequena
- Estoque usavel em celular
- CRM usavel em celular
- Dashboard usavel em celular
- Pos-venda usavel em celular

## Conteudo de lancamento

- Mensagem principal do produto clara
- Onboarding coerente com auto-cadastro da loja
- Convite da equipe explicado sem ambiguidade
- Textos quebrados/encoding revisados
- README alinhado com o escopo real do piloto
- Handoff alinhado com a estrategia atual

## Suporte minimo

- Quem recebe erro de loja
- Como restaurar banco
- Como reativar owner
- Como orientar convite de equipe
- Como explicar falha temporaria de consulta por placa

## Criterio para abrir piloto

- Nenhum bloqueador de segredo exposto
- Nenhum bloqueador de backup/restore
- Fluxo principal funcionando em desktop e mobile
- Documentacao basica coerente com o produto atual
