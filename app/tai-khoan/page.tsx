import type { Metadata } from "next";
import { Suspense } from "react";
import { requestDataExport, requestEmailVerificationAction } from "@/actions/routes";
import { userOrLogin } from "@/auth/session";
import {
  ConsentForm,
  DeleteAccountForm,
  NewEmailForm,
  PasswordForm,
  RemindersForm,
} from "@/components/learner/account-forms";
import { FlashProvider, LearnerForm } from "@/components/learner/flash";
import { LearnerHeading } from "@/components/learner/product-nav";
import { Profile } from "@/components/learner/profile-section";
import { SiteShell } from "@/components/site/site-shell";
import { ga4Configured } from "@/domain/analytics/marketing";
import { randomHex } from "@/domain/php";
import { mailConfigured } from "@/env";
import { currentActor } from "@/server/actor";
import { accountExtras, learnerProfile, sqlTime } from "@/site/queries/learner";
import { pageMetadata } from "@/site/seo";

// Port of the 'tai-khoan' branch of views/product/page.php.

const TITLE = "Tài khoản và quyền riêng tư";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/tai-khoan", TITLE);
}

async function Account() {
  const user = await userOrLogin();
  const actor = await currentActor();
  const [profile, extras] = await Promise.all([learnerProfile(actor), accountExtras(actor)]);
  const now = new Date();
  return (
    <FlashProvider reload="/tai-khoan">
      <Profile profile={profile} />
      <section className="panel narrow">
        <h2>Bảo mật</h2>
        <div
          className={`avatar-preview ${profile.avatarStyle ?? ""}`}
          aria-label="Trang trí hồ sơ của bạn"
        >
          {[...user.name][0] ?? ""}
        </div>
        <p>
          Email hiện tại: {user.email} - {user.emailVerified ? "Đã xác minh" : "Chưa xác minh"}
        </p>
        <LearnerForm action={requestEmailVerificationAction} label="Gửi liên kết xác minh" />
        <NewEmailForm />
        <p>Email hiện tại được giữ đến khi xác minh thành công.</p>
        <PasswordForm />
      </section>
      <section className="panel narrow">
        <h2>Nhắc học</h2>
        <p>
          {mailConfigured()
            ? "Email nhắc học tối đa một lần/ngày, chỉ gửi nếu bạn chưa học."
            : "Email chưa cấu hình. Chưa thể bật nhắc học."}
        </p>
        <RemindersForm
          enabled={extras.reminder?.enabled ?? false}
          hour={extras.reminder?.hour ?? 19}
        />
      </section>
      <section className="panel narrow">
        <h2>Phân tích tùy chọn</h2>
        <p>
          {ga4Configured()
            ? "Có thể gửi sự kiện đã giảm dữ liệu nhận dạng khi bạn đồng ý."
            : "Phân tích marketing bên ngoài chưa được cấu hình."}{" "}
          Ghi nhận hành trình chiến dịch khi bạn đồng ý; analytics ngoài chỉ gửi nếu được cấu hình.
          Rút lại sẽ xóa hành trình marketing gắn tài khoản và hủy sự kiện đang chờ gửi. Không gửi
          tên, email, ghi chú hoặc câu trả lời.
        </p>
        <ConsentForm analytics={extras.analytics} />
      </section>
      <section className="panel narrow">
        <h2>Dữ liệu của bạn</h2>
        <LearnerForm
          action={requestDataExport}
          fields={{ kind: "personal", requestKey: randomHex(16) }}
          label="Chuẩn bị bản xuất dữ liệu cá nhân"
          buttonClass="button secondary"
        />
        {extras.exports.map((ex) => (
          <p key={ex.id}>
            Bản xuất {sqlTime(ex.createdAt)} UTC - {ex.status}
            {ex.status === "ready" && ex.expiresAt > now ? (
              <>
                {" "}
                {/* A file download, not a page: a plain link. */}
                <a href={`/du-lieu/export-file/${ex.id}`}>Tải JSON</a>
              </>
            ) : null}
          </p>
        ))}
        <details>
          <summary>Yêu cầu xóa tài khoản</summary>
          <p>
            Thao tác đưa yêu cầu vào hàng đợi. Thông tin định danh và dữ liệu học sẽ được xóa; bản
            sao lưu tuân theo thời hạn lưu trữ đã công bố.
          </p>
          <DeleteAccountForm />
        </details>
      </section>
    </FlashProvider>
  );
}

export default function Page() {
  return (
    <SiteShell page="tai-khoan">
      <LearnerHeading title={TITLE} />
      <Suspense>
        <Account />
      </Suspense>
    </SiteShell>
  );
}
