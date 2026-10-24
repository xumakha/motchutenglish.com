# Áp dụng giao diện Lovable — 21/10/2026

> Ghi chú 24/10/2026: tài liệu này mô tả bản PHP (tag `php-final`), không phải app Next.js hiện tại. Giao diện này được giữ nguyên khi chuyển sang Next.js: màn hình ở `app/` và `src/components`, CSS và font ở `public/assets`, kiểm tra trình duyệt ở `tests/e2e`.

Nguồn tham chiếu: `lovable-project-03b741b6.zip` do chủ dự án cung cấp. Đã tạm dừng các phần sửa logic tiếp theo (A03 trở đi) để ưu tiên giao diện. A01/A13 đã sửa trước đó được giữ lại.

## Phạm vi

Chuyển ngôn ngữ thiết kế từ prototype React/TanStack sang ứng dụng PHP hiện hữu: nền vàng/kem, navy, xanh dương/cam, border2.5px, shadow cứng, capsule buttons, card bo20px, dot pattern. Heading/button Baloo2, body BeVietnamPro. Font được tải về `assets/fonts`, không có request Google Fonts từ trình duyệt; giấy phép OFL đi cùng source.

- Header sticky, menu public/member khác nhau, menu mobile có auth/logout/CMS đúng quyền, skip link.
- Footer navy, logo, thông điệp hai dòng và các link legal thật.
- Home: hero/mascot/wordcard,3bước, path cards, bài thử, XP note.
- Catalog paths, path detail map/list, lesson intro với thông số và nút mở attempt thật.
- Word cards với example block, notes/save/review/audio hooks giữ nguyên.
- Knowledge list dạng article cards; detail vẫn đọc nội dung thật.
- Placement, about/contact theo bố cục prototype, không đưa claim đánh giá kỹ năng chưa có.
- Theme chung cho dashboard/ôn tập/notebook/progress/account/shop/CMS/player, giữ POST/CSRF/revision và các hooks tương tác.

ZIP chủ yếu chứa các trang public và mock content; không chép mock catalog vào database. Giữ stable URLs/slugs, nội dung, điểm, progress và ownership thật. CTA của prototype vốn chưa có hành động đã được nối tới routes/forms hiện có. Không thay framework/runtime hoặc chạy mã thu thập lỗi của project prototype.

## Khác biệt có chủ đích

- Header giữ đăng nhập/tài khoản và menu mobile logout; prototype không có đầy đủ luồng này.
- Legal links hoạt động, không là placeholder text.
- Bài/path/count/threshold lấy từ dữ liệu thật, không hardcode giá trị mock.
- Không hiển thị “nhận xét theo từng nhóm kỹ năng” vì backend chưa trả kết quả đó.
- ZIP chỉ có metadata trỏ asset logo trên Lovable, không có binary logo gốc; sử dụng mascot/logo hiện có cùng thương hiệu. Logo upload từ CMS vẫn được ưu tiên.
- Theme primary/accent trong CMS vẫn hoạt động thông qua brand variables; không sửa settings trong database.
- Khu vực private/admin chỉ được áp dụng cùng visual system vì ZIP không cung cấp layout chi tiết cho các màn này; không thêm các chức năng giả.

## File chính

`application/views/layouts/header.php`, `footer.php`, `partials/auth_nav.php`, `home/product.php`, `product/page.php`, `assets/css/redesign.css`, `assets/fonts/`. Home controller chỉ chọn bài preview thật; Product theme endpoint cập nhật defaults/aliases cho palette mới. Hai local routers được bổ sung allowlist CSS/font mới, không mở thư mục tùy ý.

## Kiểm tra

- Hồi quy PHP/HTTP: grading, auth, roles, CSRF/IDOR, retry/revision, versioning, import, shop, queue, timezone, mail sink và account privacy đã chạy.
- Browser flow: guest học/nộp bằng bàn phím, finish/result, signup, xác nhận chuyển bài thử, progress thật; mobile logout phải có thể truy cập.
- `node tests/redesign_browser.mjs`:44trường hợp11trang×4viewport360/390/768/1440px, không overflow, menu hoạt động, font local load, không request external hoặc JS exception. Đây là kiểm thử read-only các trang public trên server thật.
- Screenshots/report: `docs/artifacts/redesign/`; functional browser report ở `docs/artifacts/browser-report.json`.
- Không chạy performance/restore lần này vì phạm vi là UI; số benchmark cũ không được coi là số đo mới của giao diện.

Chạy xem: `python tests/dev_server.py 8080`, mở `http://127.0.0.1:8080`. Visual test có thể đổi server bằng biến `DESIGN_BASE`. Chrome headless dùng no-sandbox chỉ trong profile test riêng để phù hợp môi trường, không đổi browser/profile của người dùng.
