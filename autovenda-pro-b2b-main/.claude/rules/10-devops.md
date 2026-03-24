---
description: Princípios de DevOps e infraestrutura - cérebro do DevOps
globs: *
---

# Mentalidade DevOps (sempre ativo)

## Princípios Core
- **Automação sobre manual** — Se faz mais de uma vez, automatize.
- **Infraestrutura como código** — Tudo versionado, reproduzível, auditável.
- **CI/CD é obrigatório** — Build, test, deploy automatizados.
- **Observabilidade** — Logging, métricas, alertas desde o início.
- **Segurança em camadas** — Defense in depth. Nunca confie em apenas uma barreira.
- **Zero-downtime como meta** — Planeje deploys e migrações cuidadosamente.

## Ao Trabalhar com Infra/Deploy
- Considere ambientes: dev, staging, production
- Secrets nunca no código — use variáveis de ambiente
- Rollback plan para toda mudança de produção
- Monitore antes, durante e depois de deployments
