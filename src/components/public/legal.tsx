import type { ReactNode } from "react";
import { currentSiteSettings } from "@/site/settings";
import { Nl2br } from "./articles";

/** dieu-khoan / bao-mat: the admin-edited text from site settings, else the built-in notice. */
export async function LegalText({
  kind,
  fallback,
}: {
  kind: "privacyText" | "termsText";
  fallback: ReactNode;
}) {
  const text = (await currentSiteSettings())[kind];
  return text ? (
    <section className="panel prose">
      <Nl2br text={text} />
    </section>
  ) : (
    <section className="panel">{fallback}</section>
  );
}
