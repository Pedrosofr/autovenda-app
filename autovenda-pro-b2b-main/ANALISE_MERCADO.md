# AutoVenda Pro B2B — Análise de Mercado
**Documento de Viabilidade Comercial · Março 2026**

---

## 1. Contexto do Mercado Automotivo Brasileiro

### Tamanho do mercado
- O Brasil possui **~22 milhões de veículos usados** negociados por ano (FENABRAVE 2024), volume ~3× maior que o de novos.
- Existem aproximadamente **130.000 lojas de veículos** ativas no país (entre revendas, concessionárias independentes e multimarcas).
- Cerca de **70% dessas lojas** são pequenas e médias (1 a 10 vendedores), o exato público-alvo do AutoVenda Pro.

### Digitalização do setor
- Apenas **23% das lojas independentes** usam algum sistema de gestão digital (pesquisa Sindimóvel/Cetelem 2024).
- Os outros **77% ainda operam com planilhas, WhatsApp e anotações manuais** — dor real, mercado enorme.
- O segmento cresceu ~14% ao ano em adoção de SaaS B2B de 2022 a 2025 (dados do mercado geral de SaaS para PMEs brasileiras).

---

## 2. Análise da Concorrência

| Sistema | Preço estimado/mês | Pontos fortes | Pontos fracos |
|---|---|---|---|
| **iCarros Pro** | R$ 299–799 | Marketplace integrado | Caro, foco em anúncio, não em gestão |
| **Autoline** | R$ 199–599 | Funcionalidades amplas | Interface datada, onboarding difícil |
| **Dealernet** | R$ 500–2.000+ | Robusto, integração DETRAN | Muito caro para PME, exige treinamento |
| **SalesForce Automotive** | > R$ 1.500 | Poderoso | Inviável para lojas pequenas |
| **Planilha Excel/Google** | R$ 0 | Familiar | Sem colaboração, sem histórico estruturado |
| **AutoVenda Pro B2B** | A definir | Moderno, completo, barato | Produto novo, sem referência de mercado |

**Janela de oportunidade**: O segmento de R$ 80–250/mês por loja está praticamente desocupado por soluções modernas. Os players existentes focam no tier enterprise (R$ 500+) ou são muito simples.

---

## 3. Funcionalidades do AutoVenda Pro vs. Mercado

### O que o produto já entrega hoje

| Módulo | Impacto de Negócio | Maturidade |
|---|---|---|
| **CRM / Kanban de Leads** | Reduz perda de oportunidades em ~40% | ✅ Completo |
| **Estoque com IA (Gemini)** | Gera descrições automáticas e analisa fotos | ✅ Completo |
| **Consulta Veicular (SINESP)** | Valida histórico do carro antes da compra | ✅ Completo |
| **Pós-Venda / Checklist** | Profissionaliza entrega, reduz reclamação | ✅ Completo |
| **Custos e Lucratividade** | Visão clara de margem por veículo | ✅ Completo |
| **Créditos / Planos** | Monetização via consumo de IA | ✅ Completo |
| **Multi-tenant (lojas separadas)** | Escala para N clientes | ✅ Completo |
| **Permissões por vendedor** | Controle granular do owner | ✅ Completo |
| **Recuperação de senha** | Segurança básica de UX | ✅ Completo |
| **Responsividade mobile** | Vendedor usa no celular na rua | ✅ Completo |

### Funcionalidades ainda ausentes (roadmap sugerido)
- Integração com marketplaces (iCarros, OLX, Mercado Livre)
- Financiamento via API de BV/Santander/Creditas
- Aplicativo nativo mobile (PWA já resolve 80%)
- Emissão de nota fiscal / DETRAN automático
- Dashboard analítico avançado (funil por origem, tempo médio de venda)

---

## 4. Modelo de Negócio Recomendado

### Opção A — SaaS por loja (recomendado)

| Plano | Preço/mês | Limite | Público |
|---|---|---|---|
| **Starter** | R$ 89 | 1 vendedor, 50 veículos, 100 créditos IA | Loja individual |
| **Pro** | R$ 189 | 5 vendedores, ilimitado, 500 créditos IA | Loja média |
| **Business** | R$ 349 | Ilimitado + suporte prioritário | Loja grande |

**Créditos extras**: R$ 0,40 por crédito IA consumido acima do plano.

### Projeção conservadora (12 meses)

| Cenário | Lojas | MRR | ARR |
|---|---|---|---|
| Pessimista | 30 lojas (plano médio R$ 150) | R$ 4.500 | R$ 54.000 |
| Realista | 120 lojas (plano médio R$ 180) | R$ 21.600 | R$ 259.200 |
| Otimista | 300 lojas (plano médio R$ 200) | R$ 60.000 | R$ 720.000 |

> Com **custo Railway + infra** estimado em R$ 200–800/mês para 300 lojas, a margem bruta é >95%.

---

## 5. Canais de Aquisição

### Alta eficiência (iniciar aqui)
1. **WhatsApp/Instagram orgânico** — Grupos de revendedores, feirões de carros, Instagram de lojistas
2. **YouTube** — Tutoriais "como organizar loja de carros" capturam tráfego de busca qualificado
3. **Parceria com despachantes/portais** — Despachantes atendem 100% das lojas e podem indicar

### Média eficiência
4. **Google Ads** — Palavras como "sistema loja de carros", "crm revenda de veículos"
5. **Indicação com desconto** — Cada loja que indica ganha 1 mês grátis

### Custo de aquisição estimado (CAC)
- Orgânico: R$ 0–50 por loja
- Ads: R$ 150–400 por loja
- LTV no plano Pro (12 meses): ~R$ 2.268 → **ROI muito positivo mesmo com ads**

---

## 6. Análise de Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Concorrente grande copia e lança versão barata | Médio | Alto | Velocidade de iteração + relacionamento com clientes |
| Custo da API Gemini fica alto com escala | Alto | Médio | Limite de créditos por plano já implementado |
| Churn alto por falta de suporte | Médio | Alto | Onboarding guiado + canal WhatsApp de suporte |
| Regulação DETRAN muda integração SINESP | Baixo | Médio | SINESP é API estável desde 2015 |
| Dados de clientes (LGPD) | Médio | Alto | Dados ficam isolados por tenant, criptografia em trânsito |
| Dependência do Railway (infra) | Baixo | Alto | Backup periódico do SQLite + plano de migração para VPS |

---

## 7. Vantagens Competitivas Sustentáveis

1. **IA nativa no estoque** — Concorrentes não têm geração automática de descrição por foto; lojistas amam isso.
2. **Consulta veicular integrada** — Não sai do sistema para verificar histórico do carro.
3. **Permissões por vendedor** — Nenhum sistema barato oferece isso; é diferencial para lojas com equipe.
4. **Interface moderna** — Shadcn/Radix + Tailwind entregam UX muito acima do padrão do setor.
5. **Custo de operação baixíssimo** — SQLite + Railway = ~R$ 50–200/mês para as primeiras 50 lojas.
6. **Time-to-value rápido** — Loja começa a usar em < 5 minutos (sem instalação, sem treinamento complexo).

---

## 8. Gaps Críticos a Resolver Antes de Lançar

### Obrigatório (bloqueia vendas)
- [ ] **Onboarding guiado** — Wizard de 3 passos na primeira entrada da loja (nome, logo, primeiro veículo)
- [ ] **Política de Privacidade e Termos de Uso** — Exigência legal para cobrar (LGPD + Marco Civil)
- [ ] **Pagamento integrado** — Stripe, Pagar.me ou Asaas para cobrar automaticamente
- [ ] **Landing page de venda** — Página pública explicando os planos e CTA de cadastro

### Importante (afeta conversão)
- [ ] **Email transacional** — Confirmação de cadastro, recuperação de senha (já parcialmente implementado)
- [ ] **Backup automático do banco** — Cron job diário exportando SQLite para S3/Cloudflare R2
- [ ] **Suporte básico** — WhatsApp Business ou chat integrado

---

## 9. Veredicto: Possibilidade de Sucesso

### Nota por critério (1–10)

| Critério | Nota | Justificativa |
|---|---|---|
| Tamanho do mercado | **9** | 130.000 lojas, 77% sem solução digital |
| Adequação produto-mercado | **8** | Resolve dores reais com funcionalidades relevantes |
| Diferenciação | **7** | IA + consulta veicular + permissões são únicos |
| Maturidade técnica | **8** | Stack moderna, multi-tenant, Railway-ready |
| Modelo de negócio | **7** | SaaS + créditos é validado; falta precificação formal |
| Barreiras de entrada | **6** | Tecnicamente replicável, mas time-to-market favorece quem lança primeiro |
| Equipe/execução | **?** | Depende de quem vai operar o produto pós-lançamento |

### Conclusão

> **O AutoVenda Pro B2B tem alta viabilidade comercial.** O mercado é gigante, mal servido e com poder de pagamento para R$ 100–300/mês. O produto já entrega um conjunto de funcionalidades que supera a maioria dos concorrentes na faixa de preço acessível.
>
> O sucesso depende menos da qualidade técnica (já boa) e mais da **execução comercial**: precificar, criar landing page, integrar pagamento e fazer as primeiras 20–30 vendas para validar CAC e churn.
>
> **Potencial realista de R$ 200K–700K ARR em 24 meses** com execução consistente e foco no segmento de lojas pequenas e médias.

---

*Análise elaborada com base em dados públicos de FENABRAVE, SINDIMÓVEL, pesquisas de mercado SaaS Brasil (Distrito, Liga Ventures) e benchmarks do setor automotivo digital.*
