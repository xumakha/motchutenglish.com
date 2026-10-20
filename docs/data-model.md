# Dữ liệu

users và auth_attempts giữ nguyên. learning_roles: user_id -> editor/admin; không có role là learner. learning_lessons: title/body/question/choices/answer_id/explanation/status/created_by. learning_attempts: id 32 hex, user_id, lesson_id, snapshot JSON, response đầu, score 0 hoặc 1, submitted_at UTC.

reward_ledger: currency xp, amount, unique event_key completion:user:lesson hoặc pass:user:lesson, rule_version. learning_events lưu lesson_completed với event_key completed:attempt và payload score/maxScore/ruleVersion; ghi cùng transaction với attempt và rewards. learning_audit lưu publish và cấp role CLI. learning_seed_keys bảo đảm seed không nhân đôi.

Schema là additive CREATE TABLE IF NOT EXISTS trong database/schema.sql. Không tự thay cột bảng cũ. Chạy database/check.php để kiểm tra các cột cần thiết. Chưa có migration version registry; trước thay cấu trúc bảng phải bổ sung migration có version, không chỉ sửa CREATE TABLE.
