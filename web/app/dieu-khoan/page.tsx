import type { Metadata } from "next";
import { Suspense } from "react";
import { LegalText } from "@/components/public/legal";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { pageMetadata } from "@/site/seo";

// Port of the dieu-khoan branch of views/product/page.php (terms_text site setting).

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/dieu-khoan", "Điều khoản sử dụng");
}

export default function Page() {
  return (
    <SiteShell page="dieu-khoan">
      <PageHeading title="Điều khoản sử dụng" description="Mỗi bước nhỏ đều được ghi nhận." />
      <Suspense>
        <LegalText
          kind="termsText"
          fallback={
            <p>
              Bản thông tin ban đầu cần chủ dự án duyệt: nội dung mẫu phục vụ luyện tập, không thay
              thế chứng chỉ CEFR, điểm TOEIC hoặc đánh giá chuyên môn. Chưa có thanh toán hoặc dịch
              vụ giáo viên. Không tải lên nội dung mà bạn không có quyền sử dụng.
            </p>
          }
        />
      </Suspense>
    </SiteShell>
  );
}
