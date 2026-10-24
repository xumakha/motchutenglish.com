# Dữ liệu

Schema viết bằng Drizzle trong `src/db/schema/*.ts`; migration SQL trong `drizzle/` (`0000_baseline.sql` và các bản sau), tạo bằng `pnpm db:generate`, áp dụng bằng `pnpm db:migrate` (Drizzle ghi lại migration đã chạy). DB dùng `utf8mb4_unicode_ci` trên mọi bảng. DDL của MariaDB tự commit, nên backup trước khi migrate (`pnpm worker backup`). Không có dữ liệu chuyển từ bản PHP: DB được dựng lại từ seed.

| Nhóm | Bảng và quan hệ |
|---|---|
| Danh tính | users, auth_sessions, auth_accounts (Better Auth, id số tự tăng), auth_verifications (token email/đặt lại mật khẩu, chỉ lưu hash), rate_limits (cả bộ đếm đăng nhập sai), learning_roles, mce_profiles (user 1:1), timezone_changes, consents, journeys, cohorts |
| Nội dung | mce_paths -> units -> lessons -> versions; lessons.current_version là bản đang phục vụ; entity_drafts và article_versions lưu đề xuất |
| Học | enrollments unique(user,path); attempts -> items unique(attempt,exercise); progress unique(user,lesson); active_time chống đếm trùng tab |
| Từ | vocabulary mỗi row là sense, vocabulary_sets + vocabulary_set_items many-to-many; user_vocabulary unique(user,sense), private notes |
| Ôn | review_cards unique(user,target), review_events request_key unique, previous/new schedule + algorithmVersion |
| Động lực | reward_ledger unique event_key/currency, balances projection; quests/quest_events snapshots, streak_state/calendar, inventory_events, badges |
| Shop | shop, inventory unique(user,item), purchases request_key unique; chi tiêu và sở hữu transaction dưới profile lock |
| CMS | articles, media, media_refs (media được bài published tham chiếu), search (FULLTEXT, ghi khi publish), reports(version+position), imports(document/errors/status) + import_progress, external_refs(namespace,externalID,kind), audit, settings, page_seo, redirects |
| Vận hành | jobs(event_key unique, attempts, available_at, error), reminders, deliveries, exports(owner/kind/status/private file/expiry) |
| Bài cũ | learning_lessons, learning_attempts, learning_events, learning_audit, learning_seed_keys (luồng `/courses`, `/hoc/bai`, `/admin` cũ) |

Foreign keys bảo vệ user/content. Archive không cascade lịch sử. Timestamps nghiệp vụ UTC; profile giữ timezone và quest_timezone đóng băng. JSON lưu schemaVersion; validator không tin dữ liệu browser.

Attempt lưu first_response riêng response để retry luyện tập không sửa điểm lần đầu; progression giữ first/best score. Revision là optimistic concurrency, retry cùng dữ liệu trả kết quả cũ; payload khác sau nộp trả409. Thứ tự trình bày/opaque match mapping private không đưa vào export người học.

Ledger là nguồn sự thật, balances là cache có thể rebuild. Activity/quest/reward keys dùng user+stable lesson/card+ngày tương ứng để chống lặp. Level=1+floor(XP/200). Không dùng cấp độ hoạt động để gọi CEFR.

Xóa tài khoản thu hồi session ngay, worker xóa thông tin riêng và pseudonymize user để giữ reference người biên tập. Export không chứa hash mật khẩu/token; tệp24h, owner check khi tải. Backup cũ theo retention riêng và phải được kiểm soát quyền truy cập.
