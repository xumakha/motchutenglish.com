# Tiến độ — 22/10/2026

> Ghi chú 24/10/2026: tài liệu này mô tả bản PHP (tag `php-final`), không phải app Next.js hiện tại. Tiến độ hiện nay: [progress log trong kế hoạch chuyển đổi](migration/nextjs-typescript-plan.md#12-progress-log).

Đã cập nhật đến A14, A02 local và renderer flashcard trong lesson. Chưa hoàn tất toàn bộ spec hoặc nghiệm thu ra mắt. Đối chiếu chi tiết tại [traceability](spec-traceability.md) và [audit cùng các phần cập nhật](spec-audit-2026-10-21.md).

## Checklist hiện tại

> Đã hoàn tác hai đợt chỉnh nút/CSS và bố cục UI gần nhất theo yêu cầu. Giữ các sửa logic, flashcard và accessibility trước đợt UI.



- [x] Cách ly review/concept: preview và guest chưa claim không tạo thẻ ôn tài khoản; API kiểm server, player dùng canSaveConcepts. Hồi quy/Chrome kiểm claim hợp lệ, retry chống trùng và account khác bị chặn.

- [x] A01/A13: phục hồi worker, retry có giới hạn, xử lý delivery chưa rõ; đồng nhất timezone API/HTML/job và kiểm thử DST.
- [x] A03/A04: workflow xuất bản và membership bộ từ; sửa đúng draft, phát hiện bản sửa cũ, trả duyệt có lý do.
- [x] A05: phân trang sổ từ và quản lý thẻ, giữ tìm kiếm/bộ lọc và quyền owner.
- [x] A06: POS/audio trong snapshot thẻ mới; phát audio, tốc độ, lỗi/thử lại và tương thích snapshot cũ.
- [x] A07: thống kê tuần và lịch sử lượt học có phân trang, mở lại đúng phiên bản cũ. Chưa có biểu đồ tương tác.
- [x] A08/A09: funnel theo consent, retention và thời điểm event; SEO override qua workflow, mặc định và kiểm quyền. Chưa xác nhận GA4 ingestion thật.
- [x] A10: field errors, giữ dữ liệu không nhạy cảm, order/match; bổ sung menu Enter/Escape, skip link focus main, scroll-padding theo chiều cao header và status không che focus. Chrome kiểm main landmark/tên textbox/mặt thẻ ẩn. [Phạm vi và checklist](accessibility-a10.md).
- [x] A11: lỗi import theo field path, processed/total thực, polling đúng quyền, rollback nguyên tử và retry.
- [x] A12: sửa hướng dẫn và kiểm fresh install/SQL-media restore local; mở rộng CI từ backup rỗng sang packaged runtime/schema/admin/HTTP/worker/backup/media hash, lưu reports và loại evidence cũ. [Phạm vi](container-a12.md).
- [x] A14: đồng bộ số đo, trạng thái và phạm vi bằng chứng trong tài liệu.
- [ ] A02: đã giảm truy vấn profile và vòng lặp dựng attempt, thêm runner benchmark độc lập; CGI p95 1151.40 ms chưa đạt; Apache/PHP 8.5 FastCGI ba lượt 607.98/613.66/642.30 ms, đều 0/50 lỗi và đạt ngưỡng local. Còn nghiệm thu staging. Xem [báo cáo A02](performance-a02.md).
- [ ] A10: audit screen reader thủ công và WCAG; kết quả Chrome không thay nghiệm thu này.
- [ ] A12: runner container đã viết và kiểm cú pháp; chưa có Docker CLI để build/chạy thật, CI từ xa chưa chạy. Còn xác nhận runtime triển khai mục tiêu.
- [x] Lesson flashcard: có mặt trước/mặt sau, ghi nhớ tùy chọn, lật bằng bàn phím sau server xác nhận; test chỉ hiện đáp án sau finish. Kiểm offline/reconnect/resume và điểm null qua Chrome. Luồng này không dùng ratings/lịch ôn của `/on-tap`.
- [ ] Nghiệm thu staging theo mục 26–29; xác nhận SMTP, nội dung audio có quyền, pháp lý, HTTPS, cron, cảnh báo và backup ngoài máy.

## Bằng chứng và giới hạn

| Artifact | Kết quả ghi nhận | Phạm vi |
|---|---|---|
| [Hồi quy](artifacts/test-report.json) | 2026-10-22T05:06:02.759591+00:00, `all_passed=true` | DB local riêng; gồm kiểm review/concept preview/guest/claim và Chrome, mail sink. Không chạy lại performance/restore. |
| [Chrome](artifacts/browser-report.json) | 2026-10-22T06:40:36.704Z; 360/390/768/1440 px, không overflow/exception trong các case đã chạy | Chạy lại sau hoàn tác hai đợt UI/CSS. Giữ kiểm logic học, flashcard, accessibility và preview isolation trước đó; public route smoke qua. Không chạy lại performance/restore. |
| [Cài đặt A12](artifacts/a12-install-report.json) | 22/10/2026 04:05 UTC, 15 checks qua | Fresh install, migration lặp, tạo admin, seed/worker, SQL/media backup/restore. Docker chưa chạy do máy chưa có Docker. |
| [Hiệu năng](artifacts/performance.json) | 22/10/2026 04:33 UTC; 50 phiên, 0 lỗi, p95 **642.30 ms**, `target_met=true` | Apache riêng + một PHP 8.5 FastCGI worker, đạt ngưỡng local ở 3 lượt (607.98/613.66/642.30 ms). Chưa staging. CGI trước đó 1151.40 ms vẫn được giữ riêng. [Chi tiết](performance-a02.md). |
| [Phục hồi chức năng](artifacts/restore-report.json) | **1.219 giây**, login/catalog/progress/history/restart và media hashes đạt | Dataset test nhỏ, báo cáo lịch sử không có timestamp nội tại; không suy ra RPO/RTO production hoặc backup ngoài máy. Khác smoke test fresh install A12. |

Môi trường đã kiểm local: Windows, PHP 8.5.11, XAMPP MariaDB 10.4.32. Apache 2.4.58 riêng + PHP 8.5.11 FastCGI đã đo local; PHP module 8.2 của XAMPP không dùng cho benchmark. Docker/CI được chuẩn bị cho runtime mới; chưa có kết quả build hoặc chạy từ xa. Báo cáo targeted A04/A08/A11 bổ sung bằng chứng từng phần, không phải nghiệm thu toàn spec.

## Nội dung và giới hạn sản phẩm

Snapshot nội dung từ audit 21/10: 2 lộ trình, 15 bài/checkpoint công khai (4 checkpoint), bài gợi ý 20 câu riêng, 40 nghĩa từ/4 bộ và 3 bài kiến thức; 2 bản nháp nghe cần audio hợp lệ. Không kiểm đếm lại database chính trong A14. Seed không tạo học viên/thành tích giả; WAV trong test không chứng minh nội dung nghe production sẵn sàng.

CMS dùng document JSON, câu hỏi là màn tra cứu; chưa có visual block builder hoặc question bank CRUD độc lập. Quản lý thẻ không phải màn lịch sử mọi lần rating. Số đo kiểm thử không thay kiểm duyệt nội dung, quyền media hoặc thông tin pháp lý.

## Chạy và bàn giao

Theo [README](../README.md), [vận hành](operations.md) và [kiểm thử](testing.md). CLI tạo admin dùng email, tên và `--local`; không ghi mật khẩu hoặc đường dẫn file credentials cá nhân vào handoff. Không sửa tài khoản admin đang có trong A14.

Chủ dự án cần cung cấp domain/hosting/HTTPS, SMTP, media có quyền, thông tin vận hành/pháp lý và cấu hình analytics nếu muốn bật. Việc enqueue không có nghĩa email đã gửi hoặc GA4 đã nhận.
