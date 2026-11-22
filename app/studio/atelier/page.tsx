import { renderStudio } from "../page";
export const dynamic = "force-dynamic";
export const metadata = { title: "Atelier · Estúdio", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function AtelierStudioPage() { return renderStudio(true); }
