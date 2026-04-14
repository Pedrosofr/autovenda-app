# ANTIGRAVITY OS v4.0

## LIMITES DE TOKENS (LEI DOS 3.300)
- AGENT_BOOTSTRAP: ~500t | STATE.md: ~300t | Spec: ~200t | Skill JIT: ~800t | LSFS: ~1.500t
- Tarefa > 3.300 tokens -> QUEBRAR EM FASES obrigatoriamente.

## LSFS (OBRIGATORIO)
- NUNCA: ler arquivos inteiros que excedam o budget.
- SEMPRE: usar grep_search / codebase-search antes de view_file.

## ERROR RECOVERY
1. Auto-correcao silenciosa (ate 3 tentativas).
2. Estrategia alternativa se primeira falhou.
3. Notificar humano apenas se tudo falhar.

## MCP POLICY
- filesystem: sempre ativo.
- Todos os outros: opt-in por tarefa.

## HARDWARE LIMITS
- Max 2 sub-agentes paralelos.
- Serializar se CPU > 80% ou RAM > 6GB.
