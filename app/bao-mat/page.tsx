import type { Metadata } from "next";
import { Suspense } from "react";
import { LegalText } from "@/components/public/legal";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { pageMetadata } from "@/site/seo";

// Port of the bao-mat branch of views/product/page.php (privacy_text site setting).

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/bao-mat", "Quyền riêng tư");
}

export default function Page() {
  return (
    <SiteShell page="bao-mat">
      <PageHeading title="Quyền riêng tư" description="Mỗi bước nhỏ đều được ghi nhận." />
      <Suspense>
        <LegalText
          kind="privacyText"
          fallback={
            <>
              <p>Bản thông tin vận hành ban đầu, cần chủ dự án rà soát trước khi ra mắt.</p>
              <p>
                Hệ thống lưu tài khoản, tiến độ, câu trả lời và ghi chú để phục vụ học tập. Ghi chú
                chỉ chủ tài khoản được xem. Không mặc định chia sẻ dữ liệu cho bên ngoài hoặc dùng
                để huấn luyện AI.
              </p>
              <p>
                Bạn có thể xuất dữ liệu và yêu cầu xóa tài khoản. Dữ liệu định danh được ẩn danh qua
                tác vụ xóa; bản sao lưu giữ theo lịch công bố của đơn vị vận hành. Chưa bật phân
                tích marketing bên ngoài.
              </p>
            </>
          }
        />
      </Suspense>
    </SiteShell>
  );
}
