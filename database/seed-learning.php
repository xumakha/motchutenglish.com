<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
require dirname(__DIR__).'/application/core/bootstrap.php';
$pdo=db();
$owner=$pdo->query("SELECT user_id FROM learning_roles WHERE role='admin' ORDER BY user_id LIMIT 1")->fetchColumn();
if (!$owner) { fwrite(STDERR,"Register an account and run php database/set-role.php EMAIL admin first.\n"); exit(1); }
$pdo->beginTransaction();
try {
    // Lock one existing row so concurrent seed commands also remain idempotent.
    $q=$pdo->prepare('SELECT user_id FROM learning_roles WHERE user_id=? FOR UPDATE'); $q->execute([$owner]);
    $q=$pdo->prepare('SELECT lesson_id FROM learning_seed_keys WHERE seed_key=?'); $q->execute(['sample-greetings-v1']);
    if (!$q->fetchColumn()) {
        $pdo->prepare('INSERT INTO learning_lessons(title,body,question,choices,answer_id,explanation,status,created_by) VALUES (?,?,?,?,?,?,?,?)')->execute([
            'Bài mẫu: Chào hỏi cơ bản',
            "Hello! - Xin chào!\nMy name is Linh. - Tôi tên là Linh.\nNice to meet you. - Rất vui được gặp bạn.\n\nĐây là nội dung mẫu để trải nghiệm luồng học, chưa phải khóa học đầy đủ.",
            'Bạn nói gì khi gặp một người lần đầu?',
            json_encode(['one'=>'Nice to meet you.','two'=>'Good night.'],JSON_UNESCAPED_UNICODE),
            'one','Nice to meet you dùng để chào khi gặp một người lần đầu. Good night thường dùng để chúc ngủ ngon.',
            'draft',(int)$owner
        ]);
        $id=(int)$pdo->lastInsertId();
        $pdo->prepare('INSERT INTO learning_seed_keys(seed_key,lesson_id) VALUES (?,?)')->execute(['sample-greetings-v1',$id]);
    }
    $pdo->commit(); echo "Sample draft ready. Review and publish in /admin. Re-running does not overwrite content.\n";
} catch (Throwable $e) { $pdo->rollBack(); throw $e; }
