<?php
declare(strict_types=1);
final class LearningConflict extends RuntimeException {}
final class LearningNotFound extends RuntimeException {}
function learning_role(PDO $pdo, int $userId): string {
    $q=$pdo->prepare('SELECT role FROM learning_roles WHERE user_id=?'); $q->execute([$userId]);
    return $q->fetchColumn() ?: 'learner';
}
function learning_grade(array $snapshot, string $response): int {
    if (is_string($snapshot['choices'])) $snapshot['choices']=json_decode($snapshot['choices'],true,512,JSON_THROW_ON_ERROR);
    if (!array_key_exists($response, $snapshot['choices'])) throw new InvalidArgumentException('Vui lòng chọn một đáp án hợp lệ.');
    return hash_equals($snapshot['answer_id'], $response) ? 1 : 0;
}
function learning_submit(PDO $pdo, string $id, int $userId, string $response): void {
    $pdo->beginTransaction();
    try {
        $q=$pdo->prepare('SELECT * FROM learning_attempts WHERE id=? AND user_id=? FOR UPDATE');
        $q->execute([$id,$userId]); $a=$q->fetch();
        if (!$a) throw new LearningNotFound('Không tìm thấy lượt học.');
        if ($a['submitted_at'] !== null && $a['response'] !== $response) {
            throw new LearningConflict('Bài đã được nộp với đáp án khác. Kết quả lần đầu được giữ nguyên.');
        }
        if ($a['submitted_at'] === null) {
            $score=learning_grade(json_decode($a['snapshot'],true,512,JSON_THROW_ON_ERROR),$response);
            $pdo->prepare('UPDATE learning_attempts SET response=?,score=?,submitted_at=UTC_TIMESTAMP() WHERE id=?')->execute([$response,$score,$id]);
            $pdo->prepare('INSERT INTO learning_events(event_key,user_id,lesson_id,attempt_id,event_type,payload) VALUES (?,?,?,?,?,?)')->execute([
                'completed:'.$id,$userId,$a['lesson_id'],$id,'lesson_completed',json_encode(['score'=>$score,'maxScore'=>1,'ruleVersion'=>1],JSON_THROW_ON_ERROR)
            ]);
            $reward=$pdo->prepare('INSERT INTO reward_ledger (user_id,amount,event_key) VALUES (?,?,?) ON DUPLICATE KEY UPDATE event_key=event_key');
            $reward->execute([$userId,20,'completion:'.$userId.':'.$a['lesson_id']]);
            if ($score===1) $reward->execute([$userId,5,'pass:'.$userId.':'.$a['lesson_id']]);
        }
        $pdo->commit();
    } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
}
