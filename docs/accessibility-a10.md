# A10 — rà accessibility bổ sung, 22/10/2026

Phạm vi: điều hướng bàn phím, skip link, vùng focus của player/flashcard và một phần accessibility tree trong Chrome. Chưa nghiệm thu WCAG toàn website hoặc trải nghiệm phát âm thực bằng screen reader.

## Lỗi và thay đổi

- Thanh thông báo lưu từng sticky dưới header, có thể đè lên nội dung/focus lúc cuộn. Chuyển thanh này về luồng trang; giữ `role="status"` để công cụ hỗ trợ có thể nhận thay đổi. Header sticky được đo chiều cao bằng ResizeObserver và dùng scroll-padding cho vùng cuộn, thay vì giả định luôn cao 80 px.
- Menu mobile trước đây chỉ đổi trạng thái khi click. Nay mở bằng Enter sẽ đưa focus vào link đầu; Escape đóng và trả focus về nút menu; focus ra ngoài đóng menu. Không trap Tab như modal vì đây là navigation disclosure. Đổi sang desktop xóa trạng thái menu mở; nếu focus đang ở nút bị ẩn thì chuyển vào navigation. Menu dài có thể cuộn trong chiều cao viewport.
- Main có tabindex=-1; skip link chuyển focus vào main và cuộn xuống dưới header. Không thêm main vào thứ tự Tab thông thường.
- Không thay quyền truy cập, dữ liệu học, tính điểm, nội dung hoặc auth flow.

Việc tránh che focus bởi header/thông báo sticky được đối chiếu với [W3C — Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum). Đây là sửa một nhóm tình huống cụ thể, không phải tuyên bố đạt tiêu chí ở mọi trang/viewport.

## Kiểm chứng tự động

`tests/browser.mjs` bổ sung các assertions thực qua Chrome/CDP:

| Case | Điều kiện kiểm |
|---|---|
| Menu mobile | Enter mở, focus nằm trong nav; Escape đóng, aria-expanded=false, focus về menu |
| Skip link | Enter đưa document.activeElement tới main; main landmark có trong accessibility tree |
| Flashcard front | Textbox ghi nhớ có accessible name; mặt sau đang hidden không còn nội dung đáp án trong accessibility tree |
| Flashcard focus | Khi cuộn tới thẻ, heading nằm dưới mép header; status không còn sticky |
| Hồi quy cũ | Form lỗi/hint/focus, order/match bàn phím, flashcard offline/test redaction/null score, responsive các case đã có |

Kết quả thực xem [browser-report.json](artifacts/browser-report.json) và [test-report.json](artifacts/test-report.json); các flags mới là `accessibleMenuEscapeSkipLink`, `flashcardAccessibilityTree`, `focusBelowStickyHeader`. Chỉ ghi nhận pass khi report có các flags này và không có exception. Accessibility tree qua CDP không xác nhận screen reader đã đọc đúng hoặc live region được phát thành tiếng.

## Checklist thủ công còn mở

Chưa chạy NVDA/VoiceOver ở lượt này. Cần ghi phiên bản OS/browser/screen reader, role, route, viewport/zoom, thao tác, kết quả và lỗi còn lại; dùng tài khoản test, không đưa credentials vào biên bản.

| Luồng | Kết quả mong đợi cần nghe/quan sát | Trạng thái |
|---|---|---|
| Home và skip link | Tên trang/landmarks rõ; bỏ qua header và tiếp tục đọc từ main | Chờ người kiểm thử |
| Mobile navigation | Tên mở/đóng và expanded đúng; Escape trả focus; Tab không vào nav bị ẩn | Chờ người kiểm thử |
| Auth/account/CMS validation | Label, hint, lỗi được đọc cùng field; summary dẫn đúng ô; không mất dữ liệu cho phép giữ | Chờ người kiểm thử |
| Player practice/test | Câu, lựa chọn, trạng thái và feedback được đọc theo đúng mode, không lộ đáp án test | Chờ người kiểm thử |
| Order/match | Hoàn thành được chỉ bằng phím, thứ tự và thay đổi được hiểu rõ, không mất focus | Chờ người kiểm thử |
| Lesson flashcard | Mỗi lần chỉ đọc mặt đang mở; note/criteria rõ; điểm tự đánh giá không bị hiểu là 0% | Chờ người kiểm thử |
| Review/audio | Reveal/rating/save/error được đọc; lỗi audio không khóa thẻ; controls có tên và không autoplay | Chờ người kiểm thử |
| Mạng lỗi/conflict | Phân biệt local draft và server-confirmed; live message đủ rõ, không lặp gây nhiễu | Chờ người kiểm thử |
| Zoom và reflow | Kiểm browser zoom 200%/400%, chữ lớn, viewport hẹp và menu dài; không mất CTA/focus vì overlay | Chờ người kiểm thử |
| Visual modes | Windows high contrast/forced colors, contrast text/focus, reduced motion và keyboard toàn trang | Chờ người kiểm thử |

Kiểm responsive tự động hiện có không thay browser zoom thật. Chưa kiểm đầy đủ thứ tự heading/table semantics, contrast toàn bộ component, mọi tổ hợp thiết bị/công cụ hỗ trợ hoặc WCAG 2.2 AA toàn diện.


## Kết quả lượt này

Hồi quy CGI local hoàn tất `2026-10-22T04:50:35.328333+00:00`, all_passed=true, DB test riêng `mce_auth_test_d204fac342dd`. Chrome `2026-10-22T04:50:01.235Z` có đủ ba flags mới, không exception hoặc overflow trong các case chạy; đã xem ảnh flashcard 360 px để kiểm vùng focus sau header. Không chạy benchmark/restore mới và không sửa dữ liệu website chính. Chưa chạy screen reader thật; các dòng thủ công bên trên vẫn chờ.
