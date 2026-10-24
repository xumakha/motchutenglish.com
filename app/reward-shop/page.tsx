import type { Metadata } from "next";
import { Suspense } from "react";
import { buyItem, chooseAvatar } from "@/actions/routes";
import { userOrLogin } from "@/auth/session";
import { FlashProvider, LearnerForm } from "@/components/learner/flash";
import { LearnerHeading } from "@/components/learner/product-nav";
import { SiteShell } from "@/components/site/site-shell";
import { randomHex } from "@/domain/php";
import { currentActor } from "@/server/actor";
import { rewardShop } from "@/site/queries/learner";
import { pageMetadata } from "@/site/seo";

// Port of the 'reward-shop' branch of views/product/page.php.

const TITLE = "Góc trang trí";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/reward-shop", TITLE);
}

async function Shop() {
  await userOrLogin();
  const { items, coins } = await rewardShop(await currentActor());
  return (
    <FlashProvider reload="/reward-shop">
      <p>Bạn có {coins} xu học tập. Vật phẩm chỉ thay đổi trang trí, không giới hạn quyền học.</p>
      <div className="courses-grid">
        {items.map((item) => (
          <article key={item.id} className="panel">
            <div className={`avatar-preview ${item.style}`} aria-label="Mẫu trang trí">
              M
            </div>
            <h2>{item.title}</h2>
            <p>{item.price} xu</p>
            {item.owned ? (
              <LearnerForm action={chooseAvatar} fields={{ itemId: item.id }} label="Sử dụng" />
            ) : (
              <LearnerForm
                action={buyItem}
                fields={{ itemId: item.id, requestKey: randomHex(16) }}
                label="Mua vật phẩm"
              />
            )}
          </article>
        ))}
      </div>
    </FlashProvider>
  );
}

export default function Page() {
  return (
    <SiteShell page="reward-shop">
      <LearnerHeading title={TITLE} />
      <Suspense>
        <Shop />
      </Suspense>
    </SiteShell>
  );
}
