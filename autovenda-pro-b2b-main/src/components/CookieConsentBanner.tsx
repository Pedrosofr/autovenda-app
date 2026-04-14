import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const CONSENT_KEY = "lgpd_cookie_consent_v1";

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const alreadyAccepted = localStorage.getItem(CONSENT_KEY) === "accepted";
      setVisible(!alreadyAccepted);
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[80] rounded-2xl border border-white/10 bg-[hsl(230,20%,10%)] p-4 shadow-2xl md:left-auto md:max-w-xl">
      <p className="text-sm text-white/80">
        Utilizamos cookies essenciais para autenticacao e seguranca da sua conta. Ao continuar, voce concorda com nossa politica de privacidade.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            try {
              localStorage.setItem(CONSENT_KEY, "accepted");
            } catch {
              // best-effort persistence
            }
            setVisible(false);
          }}
        >
          Entendi
        </Button>
        <a href="/privacidade" className="text-xs text-blue-300 hover:text-blue-200 underline underline-offset-2">
          Ver politica de privacidade
        </a>
      </div>
    </div>
  );
}
