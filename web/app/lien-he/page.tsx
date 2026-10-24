import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { pageMetadata } from "@/site/seo";
import { currentSiteSettings } from "@/site/settings";

// Port of the lien-he branch of views/product/page.php.

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/lien-he", "Liên hệ");
}

async function Contact() {
  const { contactEmail } = await currentSiteSettings();
  return contactEmail ? (
    <section className="panel">
      <h2>Liên hệ trực tiếp</h2>
      <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
    </section>
  ) : (
    <p className="small">
      Địa chỉ liên hệ của đơn vị vận hành sẽ được bổ sung trước khi phát hành công khai.
    </p>
  );
}

export default function Page() {
  return (
    <SiteShell page="lien-he">
      <PageHeading
        eyebrow="LIÊN HỆ"
        title="Gặp lỗi hay cần hỗ trợ?"
        description="Một chút hỗ trợ để bạn tiếp tục học nhẹ nhàng hơn."
      />
      <div className="courses-grid">
        <section className="panel">
          <h2>Báo lỗi nội dung</h2>
          <p>
            Trong mỗi bài học có mục Báo lỗi — hãy dùng mục đó để biên tập viên biết chính xác câu
            và phiên bản cần sửa.
          </p>
          <Link className="text-link" href="/lo-trinh">
            Đến lộ trình →
          </Link>
        </section>
        <section className="panel">
          <h2>Tài khoản</h2>
          <p>
            Đổi mật khẩu, email, xuất hoặc yêu cầu xóa dữ liệu ngay trong trang Tài khoản sau khi
            đăng nhập.
          </p>
          <Link className="text-link" href="/tai-khoan">
            Tài khoản và quyền riêng tư →
          </Link>
        </section>
      </div>
      <Suspense>
        <Contact />
      </Suspense>
    </SiteShell>
  );
}
