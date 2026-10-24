import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { staffOrLogin } from "@/auth/session";
import { previewLegacyAction } from "@/components/legacy/actions";
import { LegacyAttempt } from "@/components/legacy/attempt";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { previewLegacy } from "@/domain/legacy/lessons";
import { currentActor } from "@/server/actor";
import { AppError } from "@/server/errors";

// Port of Learning::preview: staff try a legacy lesson (draft or published); grading only.

export const metadata: Metadata = {
  title: "Xem trước bài học",
  robots: { index: false, follow: false },
};

async function Preview({ params }: { params: PageProps<"/admin/preview/[id]">["params"] }) {
  await staffOrLogin();
  const { id } = await params;
  if (!/^[0-9]+$/.test(id)) notFound();
  let lesson;
  try {
    ({ lesson } = await previewLegacy(await currentActor(), Number(id)));
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  return (
    <>
      <PageHeading
        title={lesson.title}
        description="Đọc nội dung, chọn đáp án rồi xem giải thích. Không giới hạn thời gian."
      />
      <LegacyAttempt
        preview
        action={previewLegacyAction}
        hidden={{ lesson_id: String(lesson.id) }}
        lesson={{ body: lesson.body, question: lesson.question, choices: lesson.choices }}
      />
      <Link className="button" href="/hoc">
        Về trang học
      </Link>
    </>
  );
}

export default function Page(props: PageProps<"/admin/preview/[id]">) {
  return (
    <SiteShell page="admin">
      <Suspense>
        <Preview params={props.params} />
      </Suspense>
    </SiteShell>
  );
}
