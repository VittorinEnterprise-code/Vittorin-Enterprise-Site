import { revalidatePath } from "next/cache";
import { getAuthorizedAdmin } from "@/lib/admin";
import { loadSiteContent, saveSiteContent } from "@/lib/content-store";
import { siteContentSchema } from "@/lib/site-validation";

type AccessFailure = Exclude<
  Awaited<ReturnType<typeof getAuthorizedAdmin>>["reason"],
  null
>;

function accessResponse(reason: AccessFailure) {
  const response = {
    unauthenticated: {
      error: "Entre com a conta administradora para continuar.",
      status: 401,
    },
    forbidden: {
      error: "Esta conta não possui acesso ao Estúdio.",
      status: 403,
    },
    misconfigured: {
      error: "A proteção do Estúdio ainda não foi configurada.",
      status: 503,
    },
  }[reason];

  return Response.json({ error: response.error }, { status: response.status });
}

export async function GET() {
  const access = await getAuthorizedAdmin();
  if (access.reason) return accessResponse(access.reason);

  try {
    return Response.json({ content: await loadSiteContent() });
  } catch (error) {
    console.error("studio_content_load_failed", error);
    return Response.json(
      { error: "Não foi possível carregar o conteúdo agora. Tente novamente." },
      { status: 503 },
    );
  }
}

export async function PUT(request: Request) {
  const access = await getAuthorizedAdmin();
  if (access.reason) return accessResponse(access.reason);

  try {
    const payload = await request.json();
    const parsed = siteContentSchema.safeParse(payload);
    if (!parsed.success) {
      return Response.json(
        {
          error: "Revise os campos destacados antes de salvar.",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    await saveSiteContent(parsed.data);
    revalidatePath("/");
    return Response.json({ content: parsed.data, saved: true });
  } catch (error) {
    console.error("studio_content_save_failed", error);
    return Response.json(
      {
        error:
          "As alterações continuam nesta tela, mas não puderam ser salvas. Tente novamente.",
      },
      { status: 503 },
    );
  }
}
