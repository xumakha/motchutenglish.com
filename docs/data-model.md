# Dữ liệu

Schema trong `database/schema.sql` (tương thích cũ) và `database/product.sql` (additive). `mce_migrations` ghi migrations áp dụng trong transaction khi phù hợp; DDL MariaDB có implicit commit. Backup trước migration. Không drop bảng cũ.

| Nhóm | Bảng và quan hệ |
|---|---|
| Danh tính | users, learning_roles, mce_profiles (user1:1), mce_auth_tokens hashed/expiry/used, auth_attempts, timezone_changes, consents, cohorts |
| Nội dung | mce_paths -> units -> lessons -> versions; lessons.current_version là bản đang phục vụ; entity_drafts và article_versions lưu đề xuất |
| Học | enrollments unique(user,path); attempts -> items unique(attempt,exercise); progress unique(user,lesson); active_time chống đếm trùng tab |
| Từ | vocabulary mỗi row là sense, vocabulary_sets + vocabulary_set_items many-to-many; user_vocabulary unique(user,sense), private notes |
| Ôn | review_cards unique(user,target), review_events request_key unique, previous/new schedule + algorithmVersion |
| Động lực | reward_ledger unique event_key/currency, balances projection; quests/quest_events snapshots, streak_state/calendar, inventory_events, badges |
| Shop | shop, inventory unique(user,item), purchases request_key unique; chi tiêu và sở hữu transaction dưới profile lock |
| CMS | articles, media, reports(version+position), imports(document/errors/status), external_refs(namespace,externalID,kind), audit, settings, redirects |
| Vận hành | jobs(event_key unique, attempts, available_at, error), reminders, deliveries, exports(owner/kind/status/private file/expiry) |

Foreign keys bảo vệ user/content; migration integrity từ chối orphan hiện hữu thay vì xóa. Archive không cascade lịch sử. Timestamps nghiệp vụ UTC; profile giữ timezone và quest_timezone đóng băng. JSON lưu schemaVersion; validator không tin dữ liệu browser.

Attempt lưu first_response riêng response để retry luyện tập không sửa điểm lần đầu; progression giữ first/best score. Revision là optimistic concurrency, retry cùng dữ liệu trả kết quả cũ; payload khác sau nộp trả409. Thứ tự trình bày/opaque match mapping private không đưa vào export người học.

Ledger là nguồn sự thật, balances là cache có thể rebuild. Activity/quest/reward keys dùng user+stable lesson/card+ngày tương ứng để chống lặp. Level=1+floor(XP/200). Không dùng cấp độ hoạt động để gọi CEFR.

Xóa tài khoản thu hồi session ngay, worker xóa thông tin riêng và pseudonymize user để giữ reference người biên tập. Export không chứa hash mật khẩu/token; tệp24h, owner check khi tải. Backup cũ theo retention riêng và phải được kiểm soát quyền truy cập.
