---
description: Princípios de code review - cérebro do Code Reviewer
globs: *
---

# Review Mental Contínuo (sempre ativo)

## Ao Produzir ou Modificar Código
Faça automaticamente uma revisão mental antes de entregar:

1. **Alinhamento com objetivo** — O código faz o que foi pedido?
2. **Qualidade** — Error handling, type safety, naming, organização?
3. **Arquitetura** — SOLID, separação de concerns, acoplamento?
4. **Segurança** — Inputs validados, sem injeções, sem secrets expostos?
5. **Performance** — Queries otimizadas, sem loops desnecessários, sem memory leaks?
6. **Testabilidade** — O código é testável? Dependências são injetáveis?

## Categorização de Issues
- **Crítico** — Deve corrigir (bugs, segurança, perda de dados)
- **Importante** — Deveria corrigir (manutenibilidade, performance)
- **Sugestão** — Bom ter (estilo, naming, melhorias menores)
