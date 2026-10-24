import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { staffOrLogin } from "@/auth/session";
import { SiteShell } from "@/components/site/site-shell";
import { previewAttempt } from "@/domain/study/attempts";
import { currentActor } from "@/server/actor";
import { AppError } from "@/server/errors";

// Port of /admin/lesson-preview/{versionId} (Product::page → Study::preview): create or reuse the
// editor's preview attempt for this version (never scored, no rewards) and open it in the player.

export const metadata: Metadata = {
  title: "Xem trước - không lưu thành tích",
  robots: { index: false, follow: false },
};

async function Preview({
  params,
}: {
  params: PageProps<"/admin/lesson-preview/[id]">["params"];
}): Promise<null> {
  await staffOrLogin();
  const { id } = await params;
  if (!/^[0-9]+$/.test(id)) notFound();
  let attemptId: string;
  try {
    attemptId = await previewAttempt(await currentActor(), Number(id));
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  redirect(`/hoc/luot/${attemptId}`);
}

export default function Page(props: PageProps<"/admin/lesson-preview/[id]">) {
  return (
    <SiteShell page="admin">
      <Suspense>
        <Preview params={props.params} />
      </Suspense>
    </SiteShell>
  );
}
