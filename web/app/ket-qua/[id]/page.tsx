import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { userOrLogin } from "@/auth/session";
import { submitLegacyAction } from "@/components/legacy/actions";
import { LegacyAttempt } from "@/components/legacy/attempt";
import { legacySnapshot } from "@/components/legacy/snapshot";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { legacyAttempt } from "@/domain/legacy/lessons";
import { currentActor } from "@/server/actor";
import { AppError } from "@/server/errors";

// Port of Learning::attempt + views/learning/attempt.php: a legacy lesson attempt, answered once.

export async function generateMetadata(props: PageProps<"/ket-qua/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  let title = "Không tìm thấy trang";
  try {
    if (/^[a-f0-9]{32}$/.test(id))
      title = legacySnapshot((await legacyAttempt(await currentActor(), id)).lesson).title;
  } catch {}
  return { title, robots: { index: false, follow: false } };
}

async function load(id: string) {
  await userOrLogin();
  if (!/^[a-f0-9]{32}$/.test(id)) notFound();
  try {
    return await legacyAttempt(await currentActor(), id);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
}

async function Attempt({ params }: { params: PageProps<"/ket-qua/[id]">["params"] }) {
  const { id } = await params;
  const { attempt, lesson: raw } = await load(id);
  const lesson = legacySnapshot(raw);
  const submitted = attempt.submittedAt !== null && attempt.response !== null;
  return (
    <>
      <PageHeading
        title={lesson.title}
        description="Đọc nội dung, chọn đáp án rồi xem giải thích. Không giới hạn thời gian."
      />
      <LegacyAttempt
        action={submitLegacyAction}
        hidden={{ attempt_id: id }}
        lesson={{
          body: lesson.body,
          question: lesson.question,
          choices: lesson.choices,
          result: submitted
            ? {
                response: attempt.response!,
                score: attempt.score ? 1 : 0,
                answer: lesson.choices[lesson.answerId] ?? "",
                explanation: lesson.explanation,
              }
            : undefined,
        }}
      />
      <Link className="button" href="/hoc">
        Về trang học
      </Link>
    </>
  );
}

export default function Page(props: PageProps<"/ket-qua/[id]">) {
  return (
    <SiteShell page="ket-qua">
      <Suspense>
        <Attempt params={props.params} />
      </Suspense>
    </SiteShell>
  );
}
