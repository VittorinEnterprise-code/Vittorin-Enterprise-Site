import { env } from "cloudflare:workers";
import { getAuthorizedAdmin } from "@/lib/admin";

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

type AccessFailure = Exclude<
  Awaited<ReturnType<typeof getAuthorizedAdmin>>["reason"],
  null
>;

function accessResponse(reason: AccessFailure) {
  const response = {
    unauthenticated: { error: "Autenticação necessária.", status: 401 },
    forbidden: { error: "Acesso negado.", status: 403 },
    misconfigured: {
      error: "A proteção do Estúdio ainda não foi configurada.",
      status: 503,
    },
  }[reason];

  return Response.json({ error: response.error }, { status: response.status });
}

export async function POST(request: Request) {
  const access = await getAuthorizedAdmin();
  if (access.reason) return accessResponse(access.reason);
  if (!env.BUCKET) {
    return Response.json(
      { error: "O armazenamento de mídia está indisponível." },
      { status: 503 },
    );
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json(
        { error: "Selecione uma imagem ou vídeo." },
        { status: 400 },
      );
    }
    if (!MIME_EXTENSIONS[file.type]) {
      return Response.json(
        { error: "Formato não aceito. Use JPG, PNG, WebP, GIF, MP4 ou WebM." },
        { status: 415 },
      );
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      return Response.json(
        { error: "O arquivo deve ter no máximo 50 MB." },
        { status: 413 },
      );
    }

    const extension = MIME_EXTENSIONS[file.type];
    const key = `uploads/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    await env.BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
        cacheControl: "public, max-age=31536000, immutable",
      },
      customMetadata: { originalName: file.name.slice(0, 180) },
    });

    return Response.json(
      { url: `/media/${key}`, key, contentType: file.type, size: file.size },
      { status: 201 },
    );
  } catch (error) {
    console.error("studio_media_upload_failed", error);
    return Response.json(
      { error: "Não foi possível enviar essa mídia. Tente novamente." },
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  const access = await getAuthorizedAdmin();
  if (access.reason) return accessResponse(access.reason);
  if (!env.BUCKET) {
    return Response.json(
      { error: "O armazenamento de mídia está indisponível." },
      { status: 503 },
    );
  }

  const payload = (await request.json().catch(() => null)) as {
    url?: string;
  } | null;
  const prefix = "/media/";
  const key = payload?.url?.startsWith(prefix)
    ? payload.url.slice(prefix.length)
    : "";
  if (!key.startsWith("uploads/")) {
    return Response.json(
      { error: "Referência de mídia inválida." },
      { status: 400 },
    );
  }

  await env.BUCKET.delete(key);
  return Response.json({ deleted: true });
}
