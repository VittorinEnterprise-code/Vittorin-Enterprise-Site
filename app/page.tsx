import { Storefront } from "@/components/storefront";
import { loadSiteContent } from "@/lib/content-store";
import { DEFAULT_CONTENT } from "@/lib/site-content";

export const dynamic = "force-dynamic";

export default async function Home() {
  let content = DEFAULT_CONTENT;

  try {
    content = await loadSiteContent();
  } catch {
    // Keep the public storefront available while storage is temporarily unavailable.
  }

  return <Storefront content={content} />;
}
