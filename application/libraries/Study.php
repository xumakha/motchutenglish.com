<?php
declare(strict_types=1);
final class Study {
    public static function progressHistory(int $uid,mixed $week=0,mixed $page=1,?DateTimeImmutable $now=null): array {
        return mce_transaction(function()use($uid,$week,$page,$now){
            $now??=mce_now();$p=Motivation::lock($uid,false,$now);
            $offset=is_scalar($week)&&preg_match('/^[0-9]{1,3}$/D',(string)$week)?min(520,(int)$week):0;
            $local=$now->setTimezone(new DateTimeZone($p['timezone']));
            $start=$local->setTime(0,0)->modify('-'.((int)$local->format('N')-1).' days')->modify('-'.$offset.' weeks');$end=$start->modify('+1 week');
            $from=$start->format('Y-m-d');$to=$end->format('Y-m-d');
            $days=mce_all('SELECT local_date,lessons,reviews FROM mce_activities WHERE user_id=? AND local_date>=? AND local_date<? ORDER BY local_date',[$uid,$from,$to]);
            $totals=['lessons'=>0,'reviews'=>0,'activeDays'=>0];foreach($days as $d){$totals['lessons']+=(int)$d['lessons'];$totals['reviews']+=(int)$d['reviews'];if($d['lessons']+$d['reviews']>0)$totals['activeDays']++;}
            $score=mce_one("SELECT SUM(a.score) AS score,SUM(a.max_score) AS max_score FROM mce_attempts a JOIN mce_versions v ON v.id=a.version_id JOIN mce_lessons l ON l.id=v.lesson_id WHERE a.user_id=? AND a.status='finished' AND a.mode<>'preview' AND l.subtype<>'placement' AND a.finished_at>=? AND a.finished_at<?",[$uid,mce_sqltime($start),mce_sqltime($end)]);
            $seconds=(int)mce_query('SELECT COALESCE(SUM(seconds),0) FROM mce_active_time WHERE user_id=? AND local_date>=? AND local_date<?',[$uid,$from,$to])->fetchColumn();
            $paging=Review::pagination((int)mce_query("SELECT COUNT(*) FROM mce_attempts WHERE user_id=? AND status='finished' AND mode<>'preview'",[$uid])->fetchColumn(),$page);
            $history=mce_all("SELECT a.id,a.version_id,a.finished_at,a.score,a.max_score,a.mode,v.title,l.subtype,l.archived FROM mce_attempts a JOIN mce_versions v ON v.id=a.version_id JOIN mce_lessons l ON l.id=v.lesson_id WHERE a.user_id=? AND a.status='finished' AND a.mode<>'preview' ORDER BY a.finished_at DESC,a.id DESC LIMIT 30 OFFSET ".$paging['offset'],[$uid]);
            return ['profile'=>$p,'weekOffset'=>$offset,'weekStart'=>$from,'weekEnd'=>$end->modify('-1 day')->format('Y-m-d'),'weekDays'=>$days,'weekTotals'=>$totals,'weekScore'=>$score,'weekSeconds'=>$seconds,'history'=>$history,'historyPaging'=>$paging];
        });
    }
    public static function guestKey(): string { if(empty($_SESSION['product_guest'])) $_SESSION['product_guest']=bin2hex(random_bytes(32));return hash('sha256',$_SESSION['product_guest']); }
    public static function owner(array $a): void {
        if ($a['user_id']!==null) { if(!current_user()||(int)$a['user_id']!==mce_uid()) throw new ProductError(404,'Không tìm thấy lượt học.'); }
        elseif(!hash_equals((string)$a['guest_key'],self::guestKey())) throw new ProductError(404,'Không tìm thấy lượt học.');
        if (($a['mode']??'')==='preview') mce_staff();
    }
    public static function preview(int $version): string {
        mce_staff();$v=mce_one('SELECT * FROM mce_versions WHERE id=?',[$version]);if(!$v)throw new ProductError(404,'Không tìm thấy phiên bản.');
        $key=bin2hex(random_bytes(16));$d=mce_decode($v['document']);
        mce_transaction(function()use($key,$v,$d){
            mce_query("INSERT INTO mce_attempts(id,user_id,version_id,mode,viewed) VALUES (?,?,?,'preview','[]')",[$key,mce_uid(),$v['id']]);
            foreach($d['exercises'] as $e){$order=[];if(isset($e['payload']['pairs'])){$order['right']=[];foreach(array_keys($e['payload']['pairs']) as $pid)$order['right'][bin2hex(random_bytes(8))]=$pid;}mce_query('INSERT INTO mce_items(attempt_id,exercise_id,presented_order) VALUES (?,?,?)',[$key,$e['id'],mce_json($order)]);}
        });return $key;
    }
    public static function start(int $lessonId,string $key,string $mode='practice'): string {
        $key=mce_key($key);if(!in_array($mode,['practice','test'],true)) throw new ProductError(422,'Chế độ học không hợp lệ.');
        return mce_transaction(function()use($lessonId,$key,$mode){
            $uid=current_user()?mce_uid():null;
            $kind=mce_one('SELECT subtype FROM mce_lessons WHERE id=?',[$lessonId]);if(($kind['subtype']??'')==='placement')$mode='test';
            if ($uid) { $p=Motivation::lock($uid);Motivation::quests($uid,$p); }
            $old=mce_one('SELECT a.*,v.lesson_id FROM mce_attempts a JOIN mce_versions v ON v.id=a.version_id WHERE a.id=?',[$key]);
            if($old) { self::owner($old);if((int)$old['lesson_id']!==$lessonId||$old['mode']!==$mode) throw new ProductError(409,'Mã yêu cầu đã dùng cho bài khác.');return $key; }
            $v=mce_one("SELECT v.* FROM mce_lessons l JOIN mce_versions v ON v.id=l.current_version JOIN mce_units u ON u.id=l.unit_id JOIN mce_paths p ON p.id=u.path_id WHERE l.id=? AND u.archived=0 AND l.archived=0 AND v.status='published' AND p.status='published'",[$lessonId]);
            if(!$v) throw new ProductError(404,'Bài học chưa khả dụng.');
            $d=mce_decode($v['document']);if(!$uid&&empty($d['preview'])) throw new ProductError(401,'Bạn cần đăng nhập để lưu bài học này.');
            mce_query('INSERT INTO mce_attempts(id,user_id,guest_key,version_id,mode,viewed,last_heartbeat) VALUES (?,?,?,?,?,?,?)',[$key,$uid,$uid?null:self::guestKey(),$v['id'],$mode,'[]',mce_sqltime()]);
            foreach($d['exercises'] as $e) {
                $order=[];
                if(isset($e['payload']['choices'])) { $order['choices']=array_keys($e['payload']['choices']);shuffle($order['choices']); }
                if(isset($e['payload']['tokens'])) { $order['tokens']=array_keys($e['payload']['tokens']);shuffle($order['tokens']); }
                if(isset($e['payload']['pairs'])) { $mapping=[];foreach(array_keys($e['payload']['pairs']) as $id) $mapping[bin2hex(random_bytes(8))]=$id;$keys=array_keys($mapping);shuffle($keys);$order['right']=[];foreach($keys as $k)$order['right'][$k]=$mapping[$k]; }
                mce_query('INSERT INTO mce_items(attempt_id,exercise_id,presented_order) VALUES (?,?,?)',[$key,$e['id'],mce_json($order)]);
            }
            mce_event('start:'.$key,'lesson_started',(string)$lessonId,$uid);return $key;
        });
    }
    public static function read(string $id): array {
        $a=mce_one('SELECT a.*,v.document,v.title,v.lesson_id FROM mce_attempts a JOIN mce_versions v ON v.id=a.version_id WHERE a.id=?',[mce_key($id)]);
        if(!$a) throw new ProductError(404,'Không tìm thấy lượt học.');self::owner($a);return $a;
    }
    public static function response(array $e,mixed $response,array $order): mixed {
        if($e['type']==='match'&&is_array($response)) {
            $decoded=[];foreach($response as $id=>$opaque) { if(!is_string($opaque)||!isset($order['right'][$opaque])) throw new ProductError(422,'Đáp án ghép không hợp lệ.');$decoded[$id]=$order['right'][$opaque]; }return $decoded;
        }
        return $response;
    }
    public static function mutate(string $id,array $input): array {
        $a=self::read($id);$uid=$a['user_id']!==null?(int)$a['user_id']:null;
        return mce_transaction(function()use($id,$input,$uid){
            $p=$uid?Motivation::lock($uid):null;
            $a=mce_one('SELECT a.*,v.document,v.lesson_id,l.subtype FROM mce_attempts a JOIN mce_versions v ON v.id=a.version_id JOIN mce_lessons l ON l.id=v.lesson_id WHERE a.id=? FOR UPDATE',[$id]);self::owner($a);
            if($uid&&$a['mode']!=='preview')Motivation::quests($uid,$p);
            $d=mce_decode($a['document']);$action=$input['action']??'';
            if($action==='finish'&&$a['status']==='finished') return ['finished'=>true];
            if($a['status']==='finished') throw new ProductError(409,'Bài đã hoàn thành. Bạn có thể bắt đầu lượt mới.');
            if($action==='view'&&in_array((string)($input['block']??''),mce_decode($a['viewed']),true))return ['saved'=>true];
            if($action==='navigate'&&is_int($input['position']??null)&&$input['position']===(int)$a['position'])return ['saved'=>true];
            if($action==='draft') {
                $draft=mce_one('SELECT state,response FROM mce_items WHERE attempt_id=? AND exercise_id=?',[$id,(string)($input['exerciseId']??'')]);
                if($draft&&$draft['state']==='draft'&&$draft['response']!==null&&mce_equal_response($draft['response'],$input['response']??null))return ['saved'=>true];
            }
            if(in_array($action,['submit','skip','audio_error'],true)) {
                $prior=mce_one('SELECT * FROM mce_items WHERE attempt_id=? AND exercise_id=?',[$id,(string)($input['exerciseId']??'')]);
                if($prior&&(($action==='submit'&&$prior['state']==='submitted'&&$prior['first_response']!==null&&mce_equal_response($prior['first_response'],$input['response']??null))||($action==='skip'&&$prior['state']==='skipped')||($action==='audio_error'&&$prior['state']==='unavailable')))return ['saved'=>true];
            }
            if(!is_int($input['revision']??null)||$input['revision']!==(int)$a['revision']) throw new ProductError(409,'Bài đã thay đổi ở tab khác. Bản mới đã được giữ; hãy tải lại.');
            if($action==='navigate') {
                $position=$input['position']??null;if(!is_int($position)||$position<0||$position>=max(1,count($d['exercises'])))throw new ProductError(422,'Vị trí học không hợp lệ.');
                mce_query('UPDATE mce_attempts SET position=? WHERE id=?',[$position,$id]);
            } elseif($action==='view') {
                $viewed=mce_decode($a['viewed']);$block=(string)($input['block']??'');$valid=array_column($d['blocks'],'id');
                if(!in_array($block,$valid,true)) throw new ProductError(422,'Mục nội dung không hợp lệ.');
                $viewed=array_values(array_unique([...$viewed,$block]));mce_query('UPDATE mce_attempts SET viewed=?,position=? WHERE id=?',[mce_json($viewed),max(0,(int)($input['position']??0)),$id]);
            } elseif(in_array($action,['draft','submit','skip','audio_error'],true)) {
                $eid=(string)($input['exerciseId']??'');$exercise=null;foreach($d['exercises'] as $e) if($e['id']===$eid)$exercise=$e;
                if(!$exercise) throw new ProductError(404,'Không tìm thấy câu hỏi.');
                $item=mce_one('SELECT * FROM mce_items WHERE attempt_id=? AND exercise_id=?',[$id,$eid]);
                if($action==='audio_error'&&$item['state']==='unavailable')return ['saved'=>true];
                if(in_array($item['state'],['submitted','skipped','unavailable'],true)) throw new ProductError(409,'Câu này đã nộp. Kết quả lần đầu được giữ nguyên.');
                $r=$input['response']??null;if(strlen(mce_json($r))>12000) throw new ProductError(422,'Đáp án quá dài.');
                $grading=null;$state='draft';
                if($action==='submit') { $decoded=self::response($exercise,$r,mce_decode($item['presented_order']));$grading=Assessment::grade($exercise,$decoded);$state='submitted'; }
                if($action==='skip') { $state='skipped';$grading=Assessment::solution($exercise);if($grading['gradingMode']==='objective'){$grading['score']=0;$grading['isCorrect']=false;}$grading['feedback']='Bạn đã bỏ qua câu này. '.$grading['feedback']; }
                if($action==='audio_error') {
                    if(!str_starts_with($exercise['type'],'listening_'))throw new ProductError(422,'Câu này không phải bài nghe.');
                    $state='unavailable';$grading=Assessment::solution($exercise);$grading['score']=null;$grading['maxScore']=null;$grading['isCorrect']=null;$grading['gradingMode']='unavailable';$grading['feedback']='Audio chưa khả dụng. Câu này không được tính là sai và không có điểm khách quan.';
                }
                mce_query('UPDATE mce_items SET response=?,state=?,first_response=?,grading=? WHERE attempt_id=? AND exercise_id=?',[mce_json($r),$state,$state==='submitted'?mce_json($r):null,$grading?mce_json($grading):null,$id,$eid]);
                if($action!=='draft') {
                    if($a['mode']!=='preview')mce_event('exercise:'.$id.':'.$eid,'exercise_submitted',$eid,$uid);
                    if($a['mode']==='practice'&&$uid&&$p['gamification']&&($grading['isCorrect']??false)) Motivation::questEvent($uid,$p,'correct','question:'.$a['lesson_id'].':'.$eid);
                }
            } elseif($action==='heartbeat') {
                if(!empty($input['active'])&&$a['last_heartbeat']) {
                    $elapsed=time()-(new DateTimeImmutable($a['last_heartbeat'],new DateTimeZone('UTC')))->getTimestamp();
                    if($elapsed>0&&$elapsed<=45) {
                        mce_query('UPDATE mce_attempts SET active_seconds=active_seconds+? WHERE id=?',[min(30,$elapsed),$id]);
                        if($uid&&$a['mode']!=='preview') {
                            $day=Motivation::day($p);$time=mce_one('SELECT * FROM mce_active_time WHERE user_id=? AND local_date=? FOR UPDATE',[$uid,$day]);
                            $delta=$time?max(0,min(30,$elapsed,time()-(new DateTimeImmutable($time['last_pulse'],new DateTimeZone('UTC')))->getTimestamp())):min(30,$elapsed);
                            mce_query('INSERT INTO mce_active_time(user_id,local_date,seconds,last_pulse) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE seconds=seconds+VALUES(seconds),last_pulse=VALUES(last_pulse)',[$uid,$day,$delta,mce_sqltime()]);
                        }
                    }
                }
                mce_query('UPDATE mce_attempts SET last_heartbeat=? WHERE id=?',[mce_sqltime(),$id]);
            } elseif($action==='finish') {
                $items=mce_all('SELECT * FROM mce_items WHERE attempt_id=?',[$id]);
                $missing=array_diff(array_column(array_filter($d['blocks'],fn($b)=>($b['required']??true)), 'id'),mce_decode($a['viewed']));
                if($missing) throw new ProductError(422,'Hãy đọc các mục nội dung bắt buộc trước khi hoàn thành.');
                $score=0;$max=0;$unavailable=false;
                foreach($items as $item) {
                    if(!in_array($item['state'],['submitted','skipped','unavailable'],true)) throw new ProductError(422,'Hãy kết thúc các câu luyện tập trước khi hoàn thành.');
                    if($item['state']==='unavailable')$unavailable=true;
                    $e=current(array_filter($d['exercises'],fn($e)=>$e['id']===$item['exercise_id']));
                    if($item['grading']) { $g=mce_decode($item['grading']);$score+=(int)($g['score']??0);$max+=(int)($g['maxScore']??0); }
                    elseif(!in_array($e['type'],['self','flashcard'],true)) $max+=in_array($e['type'],['fill','listening_fill'],true)?count($e['payload']['blanks']):($e['type']==='match'&&!empty($e['payload']['partialCredit'])?count($e['payload']['pairs']):1);
                }
                mce_query("UPDATE mce_attempts SET status='finished',score=?,max_score=?,finished_at=? WHERE id=?",[$max?$score:null,$max?:null,mce_sqltime(),$id]);
                if($uid&&$p['gamification']&&$a['mode']==='test'&&$a['subtype']!=='placement')foreach($items as $item)if($item['grading']&&(mce_decode($item['grading'])['isCorrect']??false))Motivation::questEvent($uid,$p,'correct','question:'.$a['lesson_id'].':'.$item['exercise_id']);
                if($uid&&$a['mode']!=='preview'&&$a['subtype']!=='placement') {
                    $prior=mce_one('SELECT * FROM mce_progress WHERE user_id=? AND lesson_id=?',[$uid,$a['lesson_id']]);$passed=!$unavailable&&$max>0&&$score*100>=$max*$d['passThreshold'];$percent=$max?(int)floor($score*100/$max):null;
                    mce_query('INSERT INTO mce_progress(user_id,lesson_id,first_score,best_score,completed_at,passed_at) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE best_score=IF(VALUES(best_score) IS NULL,best_score,GREATEST(COALESCE(best_score,0),VALUES(best_score))),passed_at=COALESCE(passed_at,VALUES(passed_at))',[$uid,$a['lesson_id'],$percent,$percent,mce_sqltime(),$passed?mce_sqltime():null]);
                    Motivation::completion($uid,$p,(int)$a['lesson_id'],$a['subtype'],$passed,$max>0,!$prior);
                }
                if($a['mode']!=='preview')mce_event('finish:'.$id.':'.($uid??'guest'),$a['subtype']==='placement'?'placement_completed':'lesson_completed',(string)$a['lesson_id'],$uid);
            } else throw new ProductError(422,'Thao tác không hợp lệ.');
            mce_query('UPDATE mce_attempts SET revision=revision+1 WHERE id=?',[$id]);return ['saved'=>true];
        });
    }
    public static function publicAttempt(array $a): array {
        $d=mce_decode($a['document']);$items=[];
        $stored=array_column(mce_all('SELECT * FROM mce_items WHERE attempt_id=?',[$a['id']]),null,'exercise_id');
        foreach($d['exercises'] as $orderedExercise) {
            $i=$stored[$orderedExercise['id']];
            $e=$orderedExercise;$public=Assessment::publicExercise($e);$order=mce_decode($i['presented_order']);
            if(isset($order['choices'])) $public['payload']['choices']=array_replace(array_fill_keys($order['choices'],''),$public['payload']['choices']);
            if(isset($order['tokens'])) $public['payload']['tokens']=array_replace(array_fill_keys($order['tokens'],''),$public['payload']['tokens']);
            if(isset($order['right'])) { $public['payload']['right']=[];foreach($order['right'] as $opaque=>$pid)$public['payload']['right'][$opaque]=$e['payload']['pairs'][$pid]['right']; }
            $feedback=$i['grading']&&($a['mode']!=='test'||$a['status']==='finished')?mce_decode($i['grading']):null;
            if($feedback&&isset($e['payload']['transcript']))$feedback['transcript']=$e['payload']['transcript'];
            $items[]=['exercise'=>$public,'state'=>$i['state'],'response'=>$i['response']?mce_decode($i['response']):null,'feedback'=>$feedback];
        }
        $blocks=$d['blocks'];
        if($a['mode']==='test'&&$a['status']!=='finished') foreach($blocks as &$b) if($b['type']==='audio')unset($b['transcript']);unset($b);
        $suggestion=null;
        if($a['status']==='finished'&&isset($d['blueprint']['rules'])) {
            $percent=$a['max_score']?100*$a['score']/$a['max_score']:0;
            foreach($d['blueprint']['rules'] as $rule)if($percent>=$rule['minPercent'])$suggestion=$rule['pathSlug'];
        }
        return ['canSaveConcepts'=>$a['user_id']!==null&&$a['mode']!=='preview'&&$a['status']==='finished','id'=>$a['id'],'title'=>$a['title'],'revision'=>(int)$a['revision'],'mode'=>$a['mode'],'status'=>$a['status'],'position'=>(int)$a['position'],'blocks'=>$blocks,'viewed'=>mce_decode($a['viewed']),'items'=>$items,'score'=>$a['status']==='finished'?$a['score']:null,'maxScore'=>$a['status']==='finished'?$a['max_score']:null,'objectives'=>$d['objectives'],'versionId'=>$a['version_id'],'lessonId'=>$a['lesson_id'],'passThreshold'=>$d['passThreshold'],'suggestion'=>$suggestion,'skipped'=>count(array_filter($items,fn($i)=>$i['state']==='skipped')),'audioUnavailable'=>count(array_filter($items,fn($i)=>$i['state']==='unavailable'))>0];
    }
    public static function claimGuest(int $uid,string $id): void {
        mce_transaction(function()use($uid,$id){
            Motivation::lock($uid);$a=self::read($id);
            if($a['user_id']!==null) {if((int)$a['user_id']===$uid)return;throw new ProductError(409,'Lượt học đã có chủ sở hữu.');}
            // Guest is regraded server-side on completion. Import only the active viewed/draft state; no achievements are trusted.
            mce_query("UPDATE mce_attempts SET user_id=?,guest_key=NULL,status='active',score=NULL,max_score=NULL,finished_at=NULL,revision=revision+1 WHERE id=?",[$uid,$id]);
        });
    }
}
