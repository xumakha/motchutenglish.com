<?php
declare(strict_types=1);
final class Learning {
    private function user(): int { if (!current_user()) auth_redirect('login'); return (int)current_user()['id']; }
    private function write(): void {
        if (($_SERVER['REQUEST_METHOD']??'GET') !== 'POST') { http_response_code(405); throw new InvalidArgumentException('Vui lòng dùng biểu mẫu để thực hiện thao tác.'); }
        if (!csrf_valid()) { http_response_code(403); throw new InvalidArgumentException('Phiên hết hạn. Vui lòng tải lại trang.'); }
    }
    public function index(string $section): array {
        $uid=$this->user(); $result=['view'=>'learning/index','title'=>$section==='admin'?'Quản trị bài học':'Học hôm nay','section'=>$section,'lessons'=>[],'history'=>[],'xp'=>0,'error'=>''];
        try {
            $pdo=db(); $role=learning_role($pdo,$uid); $result['role']=$role;
            if ($section==='admin' && !in_array($role,['admin','editor'],true)) { http_response_code(403); $result['error']='Bạn không có quyền quản trị nội dung.'; return $result; }
            if ($section==='admin' && ($_SERVER['REQUEST_METHOD']??'GET')==='POST') {
                $this->write();
                if (post_value('action')==='publish') {
                    if ($role!=='admin') { http_response_code(403); throw new InvalidArgumentException('Chỉ quản trị viên được xuất bản.'); }
                    $pdo->beginTransaction();
                    try {
                        $publish=$pdo->prepare("UPDATE learning_lessons SET status='published' WHERE id=? AND status='draft'");
                        $publish->execute([(int)post_value('lesson_id')]);
                        if ($publish->rowCount() > 0) $pdo->prepare("INSERT INTO learning_audit(actor_id,action,target_id) VALUES (?,'publish',?)")->execute([$uid,(int)post_value('lesson_id')]);
                        $pdo->commit();
                    } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
                } else {
                    $title=trim(post_value('title')); $body=trim(post_value('body')); $question=trim(post_value('question')); $explanation=trim(post_value('explanation'));
                    $choices=['one'=>trim(post_value('one')),'two'=>trim(post_value('two'))]; $answer=post_value('answer');
                    if ($title==='' || mb_strlen($title)>200 || $body==='' || strlen($body)>30000 || $question==='' || strlen($question)>5000 || $explanation==='' || strlen($explanation)>5000 || in_array('', $choices,true) || max(array_map('strlen',$choices))>2000 || !isset($choices[$answer])) throw new InvalidArgumentException('Điền đủ nội dung, hai lựa chọn và đáp án đúng; kiểm tra giới hạn độ dài.');
                    $values=[$title,$body,$question,json_encode($choices,JSON_UNESCAPED_UNICODE),$answer,$explanation];
                    if (post_value('action')==='edit') {
                        $id=(int)post_value('lesson_id');
                        $pdo->beginTransaction();
                        try {
                            $q=$pdo->prepare('SELECT status FROM learning_lessons WHERE id=? FOR UPDATE'); $q->execute([$id]);
                            if ($q->fetchColumn()!=='draft') throw new InvalidArgumentException('Chỉ được sửa bài nháp. Bài xuất bản được giữ nguyên.');
                            $pdo->prepare('UPDATE learning_lessons SET title=?,body=?,question=?,choices=?,answer_id=?,explanation=? WHERE id=?')->execute([...$values,$id]);
                            $pdo->commit();
                        } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
                    } else {
                        $pdo->prepare('INSERT INTO learning_lessons(title,body,question,choices,answer_id,explanation,created_by) VALUES (?,?,?,?,?,?,?)')->execute([...$values,$uid]);
                    }
                }
                auth_redirect('admin');
            }
            $result['lessons']=$pdo->query('SELECT id,title,status FROM learning_lessons'.($section==='admin'?'':" WHERE status='published'").' ORDER BY id')->fetchAll();
            if ($section==='admin' && isset($_GET['edit']) && is_string($_GET['edit'])) {
                $q=$pdo->prepare("SELECT * FROM learning_lessons WHERE id=? AND status='draft'"); $q->execute([(int)$_GET['edit']]);
                $draft=$q->fetch(); if ($draft) { $draft['choices']=json_decode($draft['choices'],true,512,JSON_THROW_ON_ERROR); $result['draft']=$draft; }
            }
            $q=$pdo->prepare('SELECT a.id,a.score,a.submitted_at,a.snapshot FROM learning_attempts a WHERE user_id=? ORDER BY submitted_at DESC LIMIT 20');$q->execute([$uid]);$result['history']=$q->fetchAll();
            $q=$pdo->prepare('SELECT COALESCE(SUM(amount),0) FROM reward_ledger WHERE user_id=? AND currency=\'xp\'');$q->execute([$uid]);$result['xp']=(int)$q->fetchColumn();
        } catch (InvalidArgumentException $e) { if (http_response_code()<400) http_response_code(422); $result['error']=$e->getMessage(); }
        catch (Throwable $e) { error_log('Learning: '.$e->getMessage()); http_response_code(503); $result['error']='Chưa kết nối được dữ liệu học. Vui lòng kiểm tra cấu hình và chạy migration.'; }
        return $result;
    }
    public function preview(string $id): array {
        $uid=$this->user();
        try {
            $pdo=db(); if (!in_array(learning_role($pdo,$uid),['editor','admin'],true)) { http_response_code(403); return ['view'=>'learning/error','title'=>'Không có quyền','error'=>'Bạn không có quyền xem bản nháp.']; }
            $q=$pdo->prepare('SELECT * FROM learning_lessons WHERE id=?');$q->execute([$id]);$lesson=$q->fetch();if (!$lesson) return not_found();
            $lesson['choices']=json_decode($lesson['choices'],true,512,JSON_THROW_ON_ERROR);
            $attempt=['submitted_at'=>null]; $error='';
            if (($_SERVER['REQUEST_METHOD']??'GET')==='POST') {
                $this->write();
                try { $score=learning_grade($lesson,post_value('response')); $attempt=['submitted_at'=>'preview','response'=>post_value('response'),'score'=>$score]; }
                catch (InvalidArgumentException $e) { http_response_code(422); $error=$e->getMessage(); }
            }
            return ['view'=>'learning/attempt','title'=>'Xem trước bài học','lesson'=>$lesson,'attempt'=>$attempt,'preview'=>true,'error'=>$error];
        } catch (Throwable $e) { http_response_code(503); return ['view'=>'learning/error','title'=>'Chưa thể xem trước','error'=>'Chưa thể kết nối dữ liệu.']; }
    }
    public function start(string $lessonId): array {
        $uid=$this->user();
        try {
            $this->write(); $pdo=db();
            $q=$pdo->prepare("SELECT * FROM learning_lessons WHERE id=? AND status='published'");$q->execute([$lessonId]);$lesson=$q->fetch();if (!$lesson) return not_found();
            // A stable form key makes refresh/retry resume the same immutable snapshot.
            $id=post_value('request_key'); if (!preg_match('/^[a-f0-9]{32}$/',$id)) throw new InvalidArgumentException('Yêu cầu không hợp lệ.');
            $pdo->prepare('INSERT INTO learning_attempts(id,user_id,lesson_id,snapshot) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE id=id')->execute([$id,$uid,$lessonId,json_encode($lesson,JSON_UNESCAPED_UNICODE)]);
            $existing=$pdo->prepare('SELECT user_id,lesson_id FROM learning_attempts WHERE id=?');
            $existing->execute([$id]); $owner=$existing->fetch();
            if ((int)$owner['user_id']!==$uid || (int)$owner['lesson_id']!==(int)$lessonId) {
                http_response_code(409);
                throw new InvalidArgumentException('Yêu cầu đã được dùng cho lượt học khác.');
            }
            auth_redirect('ket-qua/'.$id);
        } catch (Throwable $e) { error_log('Start lesson: '.$e->getMessage()); if (http_response_code()<400) http_response_code(503); return ['view'=>'learning/error','title'=>'Chưa thể mở bài','error'=>'Không thể bắt đầu bài học. Hãy quay lại và thử lại.']; }
    }
    public function attempt(string $id): array {
        $uid=$this->user();$error='';
        try {
            $pdo=db();
            if (($_SERVER['REQUEST_METHOD']??'GET')==='POST') {
                $this->write();
                try { learning_submit($pdo,$id,$uid,post_value('response')); auth_redirect('ket-qua/'.$id); }
                catch (LearningNotFound $e) { return not_found(); }
                catch (LearningConflict $e) { http_response_code(409); $error=$e->getMessage(); }
                catch (InvalidArgumentException $e) { http_response_code(422);$error=$e->getMessage(); }
            }
            $q=$pdo->prepare('SELECT * FROM learning_attempts WHERE id=? AND user_id=?');$q->execute([$id,$uid]);$a=$q->fetch();if (!$a) return not_found();
            $lesson=json_decode($a['snapshot'],true,512,JSON_THROW_ON_ERROR); $lesson['choices']=json_decode($lesson['choices'],true,512,JSON_THROW_ON_ERROR);
            return ['view'=>'learning/attempt','title'=>$lesson['title'],'attempt'=>$a,'lesson'=>$lesson,'error'=>$error];
        } catch (Throwable $e) { error_log('Attempt: '.$e->getMessage());if (http_response_code()<400) http_response_code(503);return ['view'=>'learning/error','title'=>'Chưa thể lưu bài','error'=>'Chưa thể đọc hoặc lưu kết quả. Vui lòng tải lại và thử lại.']; }
    }
}
