from agno.agent import Agent
from agno.tools.arxiv import ArxivTools
from agno.models.google import Gemini # <-- Aqui mudamos para o Gemini!

# 1. O Pesquisador
pesquisador = Agent(
    name="Pesquisador de IA",
    role="Buscar e resumir artigos científicos do ArXiv de forma simples.",
    model=Gemini(), # Cérebro: Gemini
    tools=[ArxivTools()],
    instructions=[
        "Busque no ArXiv pesquisas relacionadas ao tema solicitado.",
        "Traduza o resumo e explique a tecnologia em português do Brasil.",
        "Evite jargões complexos. Foque em: O que essa IA faz de novo?"
    ],
    markdown=True
)

# 2. O Arquiteto de SaaS
arquiteto = Agent(
    name="Arquiteto de Soluções",
    role="Criar ideias de produtos B2B (SaaS, Chatbots) para o mercado brasileiro.",
    model=Gemini(), # Cérebro: Gemini
    instructions=[
        "Baseado na tecnologia encontrada pelo Pesquisador, crie 3 ideias de produtos práticos.",
        "Foque em nichos comuns no Brasil: Clínicas, Imobiliárias, E-commerce, Advogados, Restaurantes.",
        "Para cada ideia, explique como ela resolve uma dor real do dono do negócio."
    ],
    markdown=True
)

# 3. O Diretor de Tráfego
diretor_trafego = Agent(
    name="Diretor de Marketing",
    role="Criar a estratégia de vendas e anúncios para os produtos.",
    model=Gemini(), # Cérebro: Gemini
    instructions=[
        "Analise as 3 ideias criadas pelo Arquiteto.",
        "Para cada ideia, defina: 1) O Público-Alvo para tráfego pago. 2) Um 'Gancho' (Copy) chamativo para um anúncio de Instagram/Facebook."
    ],
    markdown=True
)

# O Time Completo
agencia_inovacao = Agent(
    name="Agência de Inovação AI Brasil",
    team=[pesquisador, arquiteto, diretor_trafego],
    model=Gemini(), # Cérebro: Gemini
    instructions=[
        "Trabalhem em equipe na seguinte ordem:",
        "1. O Pesquisador busca o artigo e resume.",
        "2. O Arquiteto cria as 3 ideias de negócios.",
        "3. O Diretor de Marketing cria os ganchos de anúncios.",
        "Apresente o resultado final em um relatório bem estruturado."
    ],
    show_tool_calls=True,
    markdown=True
)

print("🚀 Iniciando a Agência com a Inteligência do GEMINI...\n")
agencia_inovacao.print_response(
    "Pesquise no Arxiv sobre 'AI Customer Service' (Atendimento ao cliente com IA) e gere o relatório completo.", 
    stream=True
)