# Handoff do Projeto

Use este arquivo no inicio de chats novos.

Prompt recomendado:

`Leia o handoff em docs/HANDOFF.md e continue em modo economico. Use agentes so quando necessario.`

## Resumo rapido

- Projeto: `AutoCRM` para lojas de carros, com foco em operacao simples para dono da loja e vendedores.
- Stack principal: React 18 + TypeScript + Vite + Tailwind + shadcn/ui.
- Estrutura atual: SPA com backend local simples, autenticacao, isolamento por loja e base SaaS enxuta.
- Regra atual de UX: sempre revisar interface pensando primeiro em mobile.

## Estado atual confirmado

### Rotas principais

- `/` -> login
- `/platform` -> console da plataforma
- `/dashboard`
- `/crm`
- `/estoque`
- `/consulta`
- `/pos-venda`
- `/custos`
- `/creditos`

### Perfis e acessos

- `platform_admin` -> controla lojas, status, trial e usuarios
- `owner` -> usa o painel completo da loja
- `seller` -> usa operacao da loja com permissao reduzida

### Logins locais atuais

- Admin da plataforma:
  - email: `admin@autocrm.local`
  - senha: `Avaife1605@`
- Owner da loja de teste:
  - email: `elevalocalagencia@gmail.com`
  - senha: `Avaife1605@`

### Loja de teste atual

- Nome: `CAPA REPASSES`
- Papel do usuario principal: `owner`

## O que ja foi estruturado

- Separacao entre painel da plataforma e painel da loja
- Trial/status por loja
- Controle de usuarios por loja
- Login/logout e troca de sessao mais claros
- Estoque sem carros demo automaticos
- Consulta FIPE manual funcionando
- Consulta por placa ainda depende de provedor externo instavel
- CRM com opcoes de interesse e veiculos do estoque no cadastro de lead
- Ajustes grandes de responsividade mobile em dashboard, consulta, creditos e custos

## Ajustes recentes importantes

- `Equipe` foi removida da navegacao lateral
- `Creditos` foi removida da navegacao lateral
- `Creditos` continua acessivel pelo botao verde do dashboard
- Na tela de creditos, clicar em `PIX` ou `cartao` nao adiciona mais saldo direto
- Agora existe estado de `pagamento pendente` e o saldo entra so ao confirmar manualmente
- Esse fluxo de credito ainda e simulado, sem gateway real

## O que NAO esta pronto

- Pagamento real por PIX/cartao
- Webhook de aprovacao de pagamento
- Consulta de placa confiavel em producao
- Persistencia totalmente desacoplada do estado agregado atual

## Regras de trabalho para chats novos

- Trabalhar em modo economico por padrao
- Evitar agentes, usar apenas quando houver ganho claro
- Preferir mudancas pequenas e validacoes objetivas
- Sempre considerar mobile antes de desktop em ajustes visuais
- Nao assumir memoria completa da thread anterior; usar este handoff como base

## Arquivos-chave

- App principal: `src/App.tsx`
- Layout: `src/components/AppLayout.tsx`
- Auth: `src/lib/auth.tsx`
- Estado: `src/store/appStore.tsx`
- Dashboard: `src/pages/Dashboard.tsx`
- CRM: `src/pages/CRMKanban.tsx`
- Estoque: `src/pages/Estoque.tsx`
- Consulta: `src/pages/ConsultaVeicular.tsx`
- Custos: `src/pages/Custos.tsx`
- Creditos: `src/pages/Creditos.tsx`
- Plataforma: `src/pages/PlatformConsole.tsx`
- Equipe: `src/pages/TeamManagement.tsx`
- Backend local: `server/backend.ts`, `server/database.ts`

## Como retomar

Cole algo assim:

```txt
Leia docs/HANDOFF.md e continue em modo economico.
Objetivo atual: ...
Ja foi feito: ...
Falta fazer: ...
Arquivos mais importantes: ...
```

## Bloco de atualizacao rapida

```txt
Objetivo atual:
Ja foi feito:
Em andamento:
Proximo passo:
Arquivos alterados recentemente:
Pendencias/riscos:
```

## Pendencias e riscos atuais

- Fluxo de credito e apenas simulado; sem gateway, `Confirmar pagamento` funciona como aprovacao manual
- Consulta por placa continua dependente de provedor externo instavel
- Ainda ha pontos de texto/encoding para limpar em telas menos revisitadas
- A arquitetura SaaS base existe, mas ainda pode evoluir para persistencia mais granular por dominio
