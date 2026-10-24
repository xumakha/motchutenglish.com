import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeading } from "@/components/site/page-heading";
import { Player } from "@/components/player/player";
import { SiteShell } from "@/components/site/site-shell";
import { publicAttempt, readAttempt } from "@/domain/study/attempts";
import { currentActor } from "@/server/actor";
import { AppError } from "@/server/errors";

// The lesson player page (PHP /hoc/luot/{id}): the attempt's owner or the guest who started it.

export const metadata: Metadata = { title: "Bài học", robots: { index: false, follow: false } };

async function load(id: string) {
  const actor = await currentActor();
  try {
    return {
      attempt: await publicAttempt(await readAttempt(actor, id)),
      account: actor.userId ? String(actor.userId) : "guest",
    };
  } catch (error) {
    if (
      error instanceof AppError &&
      (error.status === 404 || error.status === 422 || error.status === 403)
    )
      notFound();
    throw error;
  }
}

async function PlayerScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { attempt, account } = await load(id);
  return (
    <>
      <PageHeading title={attempt.title} description="Mỗi bước nhỏ đều được ghi nhận." />
      <nav className="product-nav" aria-label="Học tiếng Anh">
        <Link href="/hoc">Hôm nay</Link>
        <Link href="/lo-trinh">Lộ trình</Link>
        <Link href="/on-tap">Ôn tập</Link>
        <Link href="/so-tu-vung">Sổ từ</Link>
        <Link href="/tien-do">Tiến độ</Link>
        <Link href="/tim-kiem">Tìm kiếm</Link>
        <Link href="/tai-khoan">Tài khoản</Link>
      </nav>
      <Player initial={attempt} account={account} />
      <noscript>
        Bài học tương tác cần JavaScript. Nội dung giới thiệu vẫn xem được ở mục Lộ trình.
      </noscript>
    </>
  );
}

export default function Page(props: PageProps<"/hoc/luot/[id]">) {
  return (
    <SiteShell page="hoc" lessonMode>
      <Suspense>
        <PlayerScreen params={props.params} />
      </Suspense>
    </SiteShell>
  );
}
