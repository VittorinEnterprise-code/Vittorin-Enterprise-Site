import { LockKeyhole } from "lucide-react";
import { StudioClient } from "@/components/studio-client";
import { Button } from "@/components/ui/button";
import { getAuthorizedAdmin } from "@/lib/admin";
import { CLOUDFLARE_ACCESS_LOGOUT_PATH } from "@/lib/cloudflare-access";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const access = await getAuthorizedAdmin();

  if (access.reason) {
    const misconfigured = access.reason === "misconfigured";
    const unauthenticated = access.reason === "unauthenticated";
    return (
      <main className="access-denied">
        <div className="access-denied-card">
          <div className="access-denied-icon"><LockKeyhole aria-hidden="true" /></div>
          <p className="eyebrow">ÁREA RESTRITA</p>
          <h1>
            {misconfigured
              ? "A proteção do Estúdio precisa ser concluída."
              : unauthenticated
                ? "Sua sessão segura não foi reconhecida."
                : "Esta conta não administra a Vittorin Enterprise."}
          </h1>
          <p>
            {misconfigured
              ? "Configure o Cloudflare Access para liberar esta área administrativa."
              : unauthenticated
                ? "Entre novamente pelo Cloudflare Access para continuar."
                : "O Estúdio é reservado ao administrador vinculado. Você entrou como "}
            {access.reason === "forbidden" && access.user ? (
              <strong>{access.user.email}.</strong>
            ) : null}
          </p>
          <Button asChild variant="outline">
            <a
              href={access.reason === "forbidden" ? CLOUDFLARE_ACCESS_LOGOUT_PATH : "/"}
              target="_top"
            >
              {access.reason === "forbidden" ? "Sair e trocar de conta" : "Voltar à vitrine"}
            </a>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <StudioClient
      adminName={access.user.fullName ?? "Miguel Vittorino"}
      adminEmail={access.user.email}
      signOutPath={CLOUDFLARE_ACCESS_LOGOUT_PATH}
    />
  );
}
