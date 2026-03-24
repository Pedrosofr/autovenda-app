# CLAUDE.md

## Contexto do Projeto
Aplicativo web de **loja de carros** (Autovenda B2B) com foco em captacao, consulta e operacao comercial.

Raiz deste projeto:
- `C:/Users/PEDROSO/Downloads/autovenda-pro-b2b-main/autovenda-pro-b2b-main`

## Stack
- React + TypeScript + Vite
- Tailwind CSS + shadcn/radix
- React Query
- Vitest + Testing Library
- ESLint

## Objetivo de Produto
Entregar experiencia de venda automotiva com:
- velocidade de navegacao
- confianca de dados
- clareza comercial (preco, condicao, origem do veiculo)
- boa conversao em leads/contato

## Diretrizes de UX/UI
- Visual profissional automotivo (sem layout generico)
- Hierarquia clara: oferta, preco, status, CTA
- Mobile-first
- Tabelas/listas legiveis
- Estados vazios e erro bem explicados
- Formulario com validacao e mensagens objetivas

## Regras de Implementacao
- Priorizar componentes reutilizaveis em `src/components`
- Evitar logica de negocio espalhada em componentes de tela
- Tipar contratos e respostas de API
- Tratar loading, erro e sucesso explicitamente
- Nao hardcodar endpoints e segredos no front

## Qualidade
Antes de concluir qualquer alteracao, rodar:
- `npm run lint`
- `npm run test`
- `npm run build`

Se algum comando falhar, reportar causa e correcao aplicada.

## Checklist de Entrega
- Fluxo principal funcionando no desktop e mobile
- Sem regressao visual evidente
- Sem erro de lint ou build
- CTAs principais validos
- Mensagens em portugues claras para usuario final

## Nao Fazer
- Nao quebrar contrato de API sem alinhar
- Nao remover validacoes existentes sem justificativa
- Nao introduzir dependencias pesadas sem necessidade
