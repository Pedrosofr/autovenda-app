import { APP_BRAND_NAME } from "@/lib/brand";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[hsl(230,20%,7%)] px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Politica de Privacidade - {APP_BRAND_NAME}</h1>
        <p className="text-sm text-white/70">
          Esta politica explica como coletamos, usamos e protegemos dados pessoais no contexto de gestao comercial e operacional de lojas.
        </p>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">1. Dados coletados</h2>
          <p className="text-sm text-white/75">
            Podemos tratar dados como nome, telefone, e-mail, CPF/CNPJ e historico de interacoes comerciais para viabilizar os servicos contratados.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">2. Finalidade do tratamento</h2>
          <p className="text-sm text-white/75">
            Os dados sao usados para autenticacao, seguranca, operacao da plataforma, emissao fiscal, relacionamento comercial e suporte.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">3. Compartilhamento</h2>
          <p className="text-sm text-white/75">
            Dados podem ser compartilhados com provedores estritamente necessarios para o funcionamento do produto, observando requisitos legais e contratuais.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">4. Direitos do titular</h2>
          <p className="text-sm text-white/75">
            O titular pode solicitar confirmacao de tratamento, acesso, correcao, portabilidade e exclusao de dados pessoais nos termos da LGPD.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">5. Retencao e seguranca</h2>
          <p className="text-sm text-white/75">
            Mantemos medidas tecnicas e administrativas para proteger os dados, com retencao apenas pelo periodo necessario para finalidades legitimas e obrigacoes legais.
          </p>
        </section>
      </div>
    </div>
  );
}
