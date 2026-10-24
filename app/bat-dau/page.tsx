import type { Metadata } from "next";
import { Suspense } from "react";
import { userOrLogin } from "@/auth/session";
import { FlashProvider } from "@/components/learner/flash";
import { LearnerHeading } from "@/components/learner/product-nav";
import { Profile } from "@/components/learner/profile-section";
import { SiteShell } from "@/components/site/site-shell";
import { currentActor } from "@/server/actor";
import { learnerProfile } from "@/site/queries/learner";
import { pageMetadata } from "@/site/seo";

// Port of the 'bat-dau' branch of views/product/page.php.

const TITLE = "Chọn nhịp học của bạn";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/bat-dau", TITLE);
}

async function Content() {
  await userOrLogin();
  return (
    <FlashProvider reload="/bat-dau">
      <Profile profile={await learnerProfile(await currentActor())} />
    </FlashProvider>
  );
}

export default function Page() {
  return (
    <SiteShell page="bat-dau">
      <LearnerHeading title={TITLE} />
      <Suspense>
        <Content />
      </Suspense>
    </SiteShell>
  );
}
