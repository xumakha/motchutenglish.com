<?php
declare(strict_types=1);
final class Product {
    public static function input(): array {
        if(str_contains($_SERVER['CONTENT_TYPE']??'','application/json')) {
            $raw=file_get_contents('php://input',false,null,0,1100000);if(strlen($raw)>1050000)throw new ProductError(413,'Yêu cầu quá lớn.');
            try{$data=mce_decode($raw);}catch(Throwable $e){throw new ProductError(422,'JSON không hợp lệ.');}if(!is_array($data)||($data&&array_is_list($data)))throw new ProductError(422,'Yêu cầu phải là JSON object.');
            foreach($data as $key=>$value)if(is_array($value)&&!in_array($key,['document','response','ids'],true))throw new ProductError(422,'Trường '.$key.' không được là mảng.',[$key=>'Cần giá trị đơn.']);return $data;
        }
        foreach($_POST as $key=>$value)if(is_array($value)&&!in_array($key,['document','response','ids'],true))throw new ProductError(422,'Trường '.$key.' cần giá trị đơn.',[$key=>'Giá trị không hợp lệ.']);return $_POST;
    }
    public static function csrf(array $data): void {
        $token=$_SERVER['HTTP_X_CSRF_TOKEN']??($data['csrf']??'');
        if(!is_string($token)||!hash_equals($_SESSION['csrf'],$token))throw new ProductError(403,'Phiên hết hạn. Vui lòng tải lại trang.');
    }
    public function api(string $route): never {
        $requestId=$_SERVER['MCE_REQUEST_ID']??bin2hex(random_bytes(8));header('X-Request-ID: '.$requestId);header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store, private');
        try {
            if(($_SERVER['REQUEST_METHOD']??'GET')==='GET') {
                if(preg_match('#^attempts/([a-f0-9]{32})$#D',$route,$m))$result=Study::publicAttempt(Study::read($m[1]));
                elseif($route==='review/queue'){$uid=mce_uid();$p=mce_profile($uid);$limit=isset($_GET['more'])?100:max(0,(int)$p['review_limit']-Review::usedToday($uid,$p));$result=mce_all('SELECT id,snapshot,revision,due_at FROM mce_review_cards WHERE user_id=? AND hidden=0 AND due_at<=? ORDER BY due_at,id LIMIT '.$limit,[$uid,mce_sqltime()]);}
                elseif($route==='catalog')$result=Content::paths();
                elseif($route==='progress'){$uid=mce_uid();$result=mce_all('SELECT * FROM mce_progress WHERE user_id=?',[$uid]);}
                elseif(in_array($route,['me/rewards','me/quests','me/streak'],true)){
                    $uid=mce_uid();$p=mce_profile($uid);$result=match($route){'me/rewards'=>mce_all('SELECT currency,SUM(amount) AS amount FROM reward_ledger WHERE user_id=? GROUP BY currency',[$uid]),'me/quests'=>mce_all('SELECT * FROM mce_quests WHERE user_id=? AND local_date=?',[$uid,Motivation::day($p)]),'me/streak'=>mce_one('SELECT * FROM mce_streak_state WHERE user_id=?',[$uid])};
                } else throw new ProductError(404,'Không tìm thấy chức năng.');
            } else {
                if(!in_array($_SERVER['REQUEST_METHOD'],['POST','PUT','PATCH','DELETE'],true))throw new ProductError(405,'Phương thức không hợp lệ.');
                $input=self::input();self::csrf($input);$result=$this->execute($route,$input);
            }
            echo mce_json(['data'=>$result,'requestId'=>$requestId]);
        } catch(Throwable $e) {
            $code=$e instanceof ProductError?$e->status:503;http_response_code($code);
            if(!($e instanceof ProductError))error_log('Product request '.$requestId.' '.get_class($e));
            $current=null;
            if($code===409&&preg_match('#^attempts/([a-f0-9]{32})/#',$route,$m))try{$current=Study::publicAttempt(Study::read($m[1]));}catch(Throwable $ignored){}
            echo mce_json(['error'=>['code'=>'HTTP_'.$code,'message'=>$e instanceof ProductError?$e->getMessage():'Dịch vụ tạm thời gián đoạn. Vui lòng thử lại.','fieldErrors'=>$e instanceof ProductError?$e->fields:[],'requestId'=>$requestId,'currentAttempt'=>$current]]);
        }exit;
    }
    public function execute(string $route,array $d): array {
        if($route==='attempts/start') { mce_limit('start',60);$id=Study::start((int)($d['lessonId']??0),$d['requestKey']??'',(string)($d['mode']??'practice'));return ['redirect'=>'/hoc/luot/'.$id,'id'=>$id]; }
        if(preg_match('#^attempts/([a-f0-9]{32})/(view|draft|submit|skip|heartbeat|finish|navigate|audio_error)$#D',$route,$m)) { mce_limit('study',500,60);$d['action']=$m[2];Study::mutate($m[1],$d);return Study::publicAttempt(Study::read($m[1])); }
        if(preg_match('#^attempts/([a-f0-9]{32})/retry$#D',$route,$m)) {
            $a=Study::read($m[1]);if($a['mode']==='test')throw new ProductError(403,'Chế độ kiểm tra không chấm thử lại từng câu.');
            $eid=(string)($d['exerciseId']??'');$item=mce_one('SELECT * FROM mce_items WHERE attempt_id=? AND exercise_id=?',[$m[1],$eid]);if(!$item||$item['state']!=='submitted')throw new ProductError(422,'Nộp lần đầu trước khi luyện lại.');
            $document=mce_decode($a['document']);$e=current(array_filter($document['exercises'],fn($e)=>$e['id']===$eid));
            return ['feedback'=>Assessment::grade($e,Study::response($e,$d['response']??null,mce_decode($item['presented_order']))),'firstScorePreserved'=>true];
        }
        if($route==='guest/claim') { Study::claimGuest(mce_uid(),mce_key($d['attemptId']??''));return ['redirect'=>'/hoc/luot/'.$d['attemptId']]; }
        if($route==='profile') {
            $uid=mce_uid();$p=mce_profile($uid);$goal=$d['goal']??'foundation';$level=$d['selfLevel']??'beginner';$minutes=(int)($d['minutes']??10);$tz=(string)($d['timezone']??'Asia/Ho_Chi_Minh');$limit=(int)($d['reviewLimit']??20);
            if(!in_array($goal,['foundation','communication','work','toeic'],true)||!in_array($level,['beginner','A1','A2','B1'],true)||!in_array($minutes,[5,10,15,20],true)||!in_array($tz,DateTimeZone::listIdentifiers(),true)||$limit<1||$limit>100)throw new ProductError(422,'Mục tiêu, thời gian hoặc múi giờ không hợp lệ.');
            mce_transaction(function()use($uid,$p,$goal,$level,$minutes,$tz,$limit,$d){
                $p=Motivation::lock($uid);
                // Freeze today's quest timezone. Changes become effective on the next uncreated day and obey a 7-day cooldown.
                $questTz=$p['quest_timezone'];$changed=$p['timezone_changed_at'];
                if($tz!==$questTz&&(!$changed||$changed<=mce_sqltime(mce_now()->modify('-7 days')))) {
                    $today=Motivation::day($p);$changed=mce_sqltime();
                    $boundary=(new DateTimeImmutable($today.' 00:00:00',new DateTimeZone($questTz)))->modify('+1 day');
                    mce_query('INSERT INTO mce_timezone_changes(user_id,timezone,effective_after) VALUES (?,?,?) ON DUPLICATE KEY UPDATE timezone=VALUES(timezone),effective_after=VALUES(effective_after)',[$uid,$tz,mce_sqltime($boundary)]);
                }
                mce_query('UPDATE mce_profiles SET goal=?,self_level=?,minutes=?,timezone=?,quest_timezone=?,timezone_changed_at=?,review_limit=?,gamification=?,animations=?,onboarding_at=COALESCE(onboarding_at,?) WHERE user_id=?',[$goal,$level,$minutes,$tz,$questTz,$changed,$limit,isset($d['gamification'])?(int)(bool)$d['gamification']:1,isset($d['animations'])?(int)(bool)$d['animations']:1,mce_sqltime(),$uid]);
                mce_event('onboard:'.$uid,'onboarding_completed','profile',$uid);
            });return ['saved'=>true];
        }
        if($route==='enrollments') {
            $uid=mce_uid();$id=(int)($d['pathId']??0);if(!Content::lessons($id))throw new ProductError(404,'Lộ trình chưa khả dụng.');
            mce_profile($uid);mce_transaction(function()use($uid,$id){mce_query('INSERT IGNORE INTO mce_enrollments(user_id,path_id) VALUES (?,?)',[$uid,$id]);mce_query('UPDATE mce_profiles SET path_id=? WHERE user_id=?',[$id,$uid]);});return ['saved'=>true];
        }
        if($route==='vocabulary/save') {
            $uid=mce_uid();$id=(int)($d['senseId']??0);$v=mce_one("SELECT * FROM mce_vocabulary WHERE id=? AND status='published'",[$id]);if(!$v)throw new ProductError(404,'Không tìm thấy nghĩa từ.');$notes=mce_text($d['notes']??'',2000,false);
            mce_transaction(function()use($uid,$id,$v,$notes,$d){
                Motivation::lock($uid);mce_query('INSERT INTO mce_user_vocabulary(user_id,sense_id,notes,hidden) VALUES (?,?,?,0) ON DUPLICATE KEY UPDATE notes=VALUES(notes),hidden=0',[$uid,$id,$notes]);
                if(!empty($d['review']))Review::add($uid,'sense:'.$id,['front'=>$v['lemma'].' - '.$v['example'],'back'=>$v['meaning'],'ipa'=>$v['ipa'],'example'=>$v['example'],'translation'=>$v['translation'],'audioId'=>$v['audio_id']]);mce_event('vocab:'.$uid.':'.$id,'vocabulary_saved',(string)$id,$uid);
            });return ['saved'=>true];
        }
        if($route==='vocabulary/remove') {
            $uid=mce_uid();$id=(int)($d['senseId']??0);mce_transaction(function()use($uid,$id){Motivation::lock($uid);mce_query('DELETE FROM mce_user_vocabulary WHERE user_id=? AND sense_id=?',[$uid,$id]);mce_query('UPDATE mce_review_cards SET hidden=1,revision=revision+1 WHERE user_id=? AND target_key=?',[$uid,'sense:'.$id]);});return ['saved'=>true];
        }
        if($route==='review/rate'){mce_limit('review',120,60);return Review::rate(mce_uid(),(int)($d['cardId']??0),(string)($d['rating']??''),$d['requestKey']??'',(int)($d['revision']??-1),!empty($d['extra']));}
        if($route==='review/manage') {
            $uid=mce_uid();$id=(int)($d['cardId']??0);$action=$d['action']??'';
            mce_transaction(function()use($uid,$id,$action,$d){Motivation::lock($uid);if(!mce_one('SELECT id FROM mce_review_cards WHERE id=? AND user_id=?',[$id,$uid]))throw new ProductError(404,'Không tìm thấy thẻ.');
                if($action==='reset') {if(($d['confirm']??'')!=='yes')throw new ProductError(422,'Hãy xác nhận đặt lại lịch ôn.');mce_query('UPDATE mce_review_cards SET interval_days=0,due_at=?,revision=revision+1 WHERE id=?',[mce_sqltime(),$id]);}
                elseif(in_array($action,['hide','show','remove'],true)) {if($action==='remove'&&($d['confirm']??'')!=='yes')throw new ProductError(422,'Hãy xác nhận bỏ thẻ khỏi hàng đợi.');mce_query('UPDATE mce_review_cards SET hidden=?,revision=revision+1 WHERE id=?',[$action==='remove'?2:($action==='hide'?1:0),$id]);}else throw new ProductError(422,'Thao tác không hợp lệ.');});return ['saved'=>true];
        }
        if($route==='review/concept') {
            $uid=mce_uid();$a=Study::read(mce_key($d['attemptId']??''));$eid=(string)($d['exerciseId']??'');$doc=mce_decode($a['document']);$e=current(array_filter($doc['exercises'],fn($e)=>$e['id']===$eid));
            if(!$e||$a['status']!=='finished')throw new ProductError(422,'Hoàn thành bài trước khi lưu câu cần ôn.');
            $item=mce_one('SELECT grading FROM mce_items WHERE attempt_id=? AND exercise_id=?',[$a['id'],$eid]);$g=$item['grading']?mce_decode($item['grading']):null;
            mce_transaction(function()use($uid,$a,$eid,$e,$g){Motivation::lock($uid);Review::add($uid,'concept:'.$a['lesson_id'].':'.$eid,['front'=>$e['payload']['prompt'],'back'=>$g['acceptedAnswerDisplay']??$e['explanation'],'example'=>$e['explanation']]);});return ['saved'=>true];
        }
        if($route==='shop/purchase'){Motivation::purchase(mce_uid(),(string)($d['itemId']??''),$d['requestKey']??'');return ['saved'=>true];}
        if($route==='avatar') {
            $uid=mce_uid();$id=(string)($d['itemId']??'');$i=mce_one('SELECT s.style FROM mce_inventory i JOIN mce_shop s ON s.id=i.item_id WHERE i.user_id=? AND i.item_id=?',[$uid,$id]);if(!$i)throw new ProductError(403,'Bạn chưa sở hữu vật phẩm này.');mce_query('UPDATE mce_profiles SET avatar_style=? WHERE user_id=?',[$i['style'],$uid]);return ['saved'=>true];
        }
        if($route==='reports') {
            $uid=mce_uid();mce_limit('reports',10);$vid=(int)($d['versionId']??0);if(!mce_one("SELECT id FROM mce_versions WHERE id=? AND status='published'",[$vid]))throw new ProductError(404,'Không tìm thấy nội dung.');$cat=$d['category']??'';if(!in_array($cat,['answer','typo','audio','other'],true))throw new ProductError(422,'Chọn loại báo lỗi.');
            mce_query('INSERT INTO mce_reports(user_id,version_id,position,category,description) VALUES (?,?,?,?,?)',[$uid,$vid,mce_text($d['position']??'lesson',80),$cat,mce_text($d['description']??'',2000)]);return ['saved'=>true];
        }
        if($route==='password/reset-request'){Identity::requestReset(mce_text($d['email']??'',254));return ['message'=>'Nếu email phù hợp, hướng dẫn sẽ được đưa vào hàng đợi.'];}
        if($route==='password/reset'){Identity::consume((string)($d['token']??''),'reset',(string)($d['password']??''));return ['message'=>'Mật khẩu đã thay đổi. Hãy đăng nhập lại.'];}
        if($route==='password/change'){Identity::updatePassword(mce_uid(),(string)($d['current']??''),(string)($d['password']??''));return ['redirect'=>'/login'];}
        if($route==='email/verify'){Identity::verify(mce_uid(),empty($d['email'])?null:(string)$d['email']);return ['message'=>'Hướng dẫn xác minh đã được đưa vào hàng đợi.'];}
        if($route==='email/consume') {mce_limit('consume-token',20);$purpose=$d['purpose']??'';if(!in_array($purpose,['verify','unsubscribe'],true))throw new ProductError(422,'Loại liên kết không hợp lệ.');Identity::consume((string)($d['token']??''),$purpose);return ['saved'=>true];}
        if($route==='account/delete'){Identity::deleteRequest(mce_uid(),(string)($d['password']??''));return ['redirect'=>'/login'];}
        if($route==='exports/request'){Exports::request(mce_uid(),(string)($d['kind']??'personal'),$d['requestKey']??'');return ['message'=>'Đã đưa yêu cầu xuất dữ liệu vào hàng đợi. Tệp xuất có thời hạn 24 giờ.'];}
        if($route==='reminders') {
            $uid=mce_uid();$hour=(int)($d['hour']??19);$enabled=!empty($d['enabled']);if($hour<0||$hour>23)throw new ProductError(422,'Giờ nhắc học không hợp lệ.');if($enabled&&!Identity::mailConfigured())throw new ProductError(503,'Email chưa được cấu hình. Chưa thể bật nhắc học.');
            mce_query('INSERT INTO mce_reminders(user_id,enabled,hour,unsubscribe_hash) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),hour=VALUES(hour)',[$uid,(int)$enabled,$hour,hash('sha256',random_bytes(32))]);return ['saved'=>true];
        }
        if($route==='consent') {
            $uid=mce_uid();$enabled=!empty($d['analytics']);
            mce_query('INSERT INTO mce_consents(user_id,analytics,client_id,updated_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE analytics=VALUES(analytics),updated_at=VALUES(updated_at)',[$uid,(int)$enabled,random_int(100000000,999999999).'.'.time(),mce_sqltime()]);
            return ['saved'=>true];
        }
        if($route==='streak/preferences'){mce_query('UPDATE mce_streak_state SET auto_protect=? WHERE user_id=?',[!empty($d['autoProtect'])?1:0,mce_uid()]);return ['saved'=>true];}
        if($route==='admin/version')return ['versionId'=>Content::saveVersion($d)];
        if($route==='admin/unit-state') {
            mce_staff(true);$id=(int)($d['unitId']??0);if(!mce_one('SELECT id FROM mce_units WHERE id=?',[$id]))throw new ProductError(404,'Không tìm thấy chương.');
            mce_transaction(function()use($id,$d){mce_query('UPDATE mce_units SET archived=? WHERE id=?',[!empty($d['archived'])?1:0,$id]);mce_audit('unit_state_changed','unit:'.$id);});return ['saved'=>true];
        }
        if($route==='admin/workflow'){Content::workflow((int)($d['versionId']??0),(string)($d['action']??''));return ['saved'=>true];}
        if($route==='admin/entity')return ['id'=>Content::saveEntity((string)($d['kind']??''),$d)];
        if($route==='admin/set-items') {
            mce_staff();$set=(int)($d['setId']??0);$record=mce_one('SELECT status FROM mce_vocabulary_sets WHERE id=?',[$set]);if(!$record)throw new ProductError(404,'Không tìm thấy bộ từ.');if($record['status']!=='draft')mce_staff(true);
            $ids=$d['ids']??[];if(is_string($ids))$ids=trim($ids)===''?[]:array_map('intval',explode(',',$ids));if(!is_array($ids)||count($ids)>1000||count(array_unique($ids))!==count($ids))throw new ProductError(422,'Danh sách nghĩa từ không hợp lệ.');
            mce_transaction(function()use($set,$ids,$record){$published=0;foreach($ids as $id){$v=mce_one('SELECT status FROM mce_vocabulary WHERE id=?',[(int)$id]);if(!$v)throw new ProductError(422,'Có ID nghĩa từ không tồn tại.');$published+=$v['status']==='published'?1:0;}if($record['status']==='published'&&!$published)throw new ProductError(422,'Lưu trữ bộ từ trước khi bỏ toàn bộ nội dung đã xuất bản.');mce_query('DELETE FROM mce_vocabulary_set_items WHERE set_id=?',[$set]);foreach($ids as $id)mce_query('INSERT INTO mce_vocabulary_set_items(set_id,sense_id) VALUES (?,?)',[$set,(int)$id]);mce_audit('set_membership_saved','set:'.$set);});return ['saved'=>true];
        }
        if($route==='admin/article-workflow'){Content::articleWorkflow((int)($d['versionId']??0),(string)($d['action']??''));return ['saved'=>true];}
        if($route==='admin/entity-workflow'){Content::entityWorkflow((int)($d['draftId']??0),(string)($d['action']??''));return ['saved'=>true];}
        if($route==='admin/upload')return ['id'=>Content::upload($_FILES['file']??[],$d)];
        if($route==='admin/import-preview')return Content::importPreview((string)($d['raw']??''));
        if($route==='admin/import-commit'){Content::importCommit((string)($d['importId']??''));return ['saved'=>true];}
        if($route==='admin/reorder') {
            mce_staff();$kind=$d['kind']??'';$ids=$d['ids']??[];
            if(is_string($ids))$ids=array_map('intval',explode(',',$ids));
            if(!in_array($kind,['paths','units','lessons'],true)||!is_array($ids)||count($ids)>300||count($ids)!==count(array_unique($ids)))throw new ProductError(422,'Danh sách sắp xếp không hợp lệ.');
            mce_transaction(function()use($kind,$ids){foreach($ids as $i=>$id){if(!mce_one('SELECT id FROM mce_'.$kind.' WHERE id=?',[(int)$id]))throw new ProductError(422,'Nội dung không tồn tại.');mce_query('UPDATE mce_'.$kind.' SET sort_order=? WHERE id=?',[$i,(int)$id]);}mce_audit('reorder',$kind);});return ['saved'=>true];
        }
        if($route==='admin/report') {
            mce_staff();$status=$d['status']??'';if(!in_array($status,['open','in_progress','resolved','rejected'],true))throw new ProductError(422,'Trạng thái không hợp lệ.');$reason=mce_text($d['resolution']??'',2000);
            mce_transaction(function()use($d,$status,$reason){mce_query('UPDATE mce_reports SET status=?,resolution=? WHERE id=?',[$status,$reason,(int)($d['id']??0)]);mce_audit('report_'.$status,'report:'.(int)$d['id']);});return ['saved'=>true];
        }
        if($route==='admin/role') {
            mce_staff(true);$role=$d['role']??'';if(!in_array($role,['learner','editor','admin'],true))throw new ProductError(422,'Vai trò không hợp lệ.');$uid=(int)($d['userId']??0);if($uid===mce_uid())throw new ProductError(422,'Không tự đổi vai trò của tài khoản đang dùng.');if(!mce_one('SELECT id FROM users WHERE id=?',[$uid]))throw new ProductError(404,'Không tìm thấy tài khoản.');
            mce_transaction(function()use($uid,$role){if($role==='learner')mce_query('DELETE FROM learning_roles WHERE user_id=?',[$uid]);else mce_query('INSERT INTO learning_roles(user_id,role) VALUES (?,?) ON DUPLICATE KEY UPDATE role=VALUES(role)',[$uid,$role]);mce_audit('role_changed','user:'.$uid,['role'=>$role]);});return ['saved'=>true];
        }
        if($route==='admin/settings') {
            mce_staff(true);$allowed=['site_name','primary','accent','logo_media_id','favicon_media_id','social_url','default_minutes','gamification','contact_email','privacy_text','terms_text'];$key=$d['name']??'';if(!in_array($key,$allowed,true))throw new ProductError(422,'Cấu hình không được phép.');$value=mce_text($d['value']??'',in_array($key,['privacy_text','terms_text'],true)?15000:200,false);
            if($key==='contact_email'&&$value!==''&&!filter_var($value,FILTER_VALIDATE_EMAIL))throw new ProductError(422,'Email liên hệ không hợp lệ.');
            if(in_array($key,['primary','accent'],true)&&!preg_match('/^#[a-fA-F0-9]{6}$/D',$value))throw new ProductError(422,'Màu phải ở dạng #RRGGBB.');
            if($key==='social_url'&&$value!==''&&(!filter_var($value,FILTER_VALIDATE_URL)||parse_url($value,PHP_URL_SCHEME)!=='https'))throw new ProductError(422,'Đường dẫn phải dùng HTTPS.');
            if(in_array($key,['logo_media_id','favicon_media_id'],true)&&$value!=='') { $m=mce_one('SELECT mime FROM mce_media WHERE id=?',[(int)$value]);if(!$m||!str_starts_with($m['mime'],'image/'))throw new ProductError(422,'Logo/favicon cần tệp ảnh đã tải lên.'); }
            if($key==='default_minutes'&&!in_array((int)$value,[5,10,15,20],true))throw new ProductError(422,'Mục tiêu mặc định cần là 5, 10, 15 hoặc 20 phút.');
            if($key==='gamification'&&!in_array($value,['0','1'],true))throw new ProductError(422,'Dùng 0 hoặc 1.');
            mce_transaction(function()use($key,$value){mce_query('INSERT INTO mce_settings(name,value) VALUES (?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)',[$key,$value]);mce_audit('setting_changed',$key);});return ['saved'=>true];
        }
        if($route==='admin/reward-adjust') {
            mce_staff(true);$uid=(int)($d['userId']??0);$amount=filter_var($d['amount']??null,FILTER_VALIDATE_INT);$currency=$d['currency']??'';$reason=mce_text($d['reason']??'',1000);$key=mce_key($d['requestKey']??'');
            if($amount===false||$amount===0||abs($amount)>10000||!in_array($currency,['xp','coin'],true)||!mce_one('SELECT id FROM users WHERE id=?',[$uid]))throw new ProductError(422,'Điều chỉnh không hợp lệ.');
            mce_transaction(function()use($uid,$amount,$currency,$reason,$key){Motivation::lock($uid);$prior=mce_one('SELECT user_id,currency,amount FROM reward_ledger WHERE event_key=?',['v2:correction:'.$key]);if($prior){if((int)$prior['user_id']!==$uid||$prior['currency']!==$currency||(int)$prior['amount']!==$amount)throw new ProductError(409,'Mã yêu cầu đã gắn với điều chỉnh khác.');return;}$balance=(int)mce_query('SELECT COALESCE(SUM(amount),0) FROM reward_ledger WHERE user_id=? AND currency=?',[$uid,$currency])->fetchColumn();if($balance+$amount<0)throw new ProductError(422,'Điều chỉnh không được làm số dư âm.');Motivation::award($uid,$currency,$amount,'correction:'.$key);mce_audit('reward_correction','user:'.$uid,['amount'=>$amount,'currency'=>$currency,'reason'=>$reason,'eventKey'=>$key]);});return ['saved'=>true];
        }
        if($route==='admin/job-retry') {
            mce_staff(true);$id=(int)($d['jobId']??0);$job=mce_one('SELECT status,last_error FROM mce_jobs WHERE id=?',[$id]);
            if(!$job||$job['status']!=='failed'||str_contains($job['last_error']??'','uncertain'))throw new ProductError(422,'Chỉ retry tác vụ thất bại xác định chưa gửi. Trường hợp chưa rõ cần đối soát trước.');
            mce_query("UPDATE mce_jobs SET status='pending',attempts=0,available_at=? WHERE id=?",[mce_sqltime(),$id]);mce_audit('job_retried','job:'.$id);return ['saved'=>true];
        }
        throw new ProductError(404,'Không tìm thấy chức năng.');
    }
    public function page(string $path): array {
        $result=['view'=>'product/page','title'=>'Một Chút English','screen'=>$path,'error'=>'','message'=>'','payload'=>[]];
        try {
            if(($_SERVER['REQUEST_METHOD']??'GET')==='POST') {
                try {
                $d=self::input();self::csrf($d);$command=(string)($d['command']??'');
                if(isset($d['document'])&&is_string($d['document'])) { try{$d['document']=mce_decode($d['document']);}catch(Throwable $e){throw new ProductError(422,'JSON bài học không hợp lệ.');} }
                if(isset($_FILES['batch'])&&($_FILES['batch']['error']??4)===0){if($_FILES['batch']['size']>1024*1024)throw new ProductError(422,'Batch tối đa 1 MB.');$d['raw']=file_get_contents($_FILES['batch']['tmp_name']);}
                $answer=$this->execute($command,$d);if(isset($answer['redirect']))auth_redirect($answer['redirect']);
                if($command==='admin/import-preview')$result['importPreview']=$answer;
                else {$_SESSION['product_flash']=$answer['message']??'Đã lưu thay đổi.';auth_redirect($path);}
                }catch(Throwable $e) {
                    http_response_code($e instanceof ProductError?$e->status:503);
                    $result['error']=$e instanceof ProductError?$e->getMessage():'Chưa thể lưu thay đổi. Vui lòng thử lại.';
                    $result['failedForm']=$d??[];
                }
            }
            $result['message']=$_SESSION['product_flash']??'';unset($_SESSION['product_flash']);
            $segments=explode('/',$path);$root=$segments[0];$slug=$segments[1]??'';
            if(in_array($root,['hoc','bat-dau','on-tap','so-tu-vung','tien-do','tai-khoan','reward-shop'],true)) {
                if($root==='hoc'&&$slug==='luot') { $a=Study::read($segments[2]??'');$result['player']=Study::publicAttempt($a);$result['title']=$a['title'];return $result; }
                $uid=mce_uid();$p=mce_profile($uid);$result['profile']=$p;
                if($root==='hoc') {
                    $p=mce_transaction(function()use($uid){$p=Motivation::lock($uid);Motivation::quests($uid,$p);Motivation::streak($uid,$p);return $p;});$result['profile']=$p;
                    $result['title']='Hôm nay học một chút';$result['paths']=Content::paths();$result['lessons']=Content::lessons($p['path_id']?(int)$p['path_id']:null);
                    $result['progress']=mce_all('SELECT * FROM mce_progress WHERE user_id=?',[$uid]);$result['active']=mce_all("SELECT a.id,v.title FROM mce_attempts a JOIN mce_versions v ON v.id=a.version_id WHERE a.user_id=? AND a.status='active' ORDER BY a.started_at DESC LIMIT 5",[$uid]);
                    $result['legacy']=mce_all("SELECT id,title FROM learning_lessons WHERE status='published' ORDER BY id");
                    $result['legacyHistory']=mce_all('SELECT a.id,a.score,a.submitted_at,l.title FROM learning_attempts a JOIN learning_lessons l ON l.id=a.lesson_id WHERE a.user_id=? ORDER BY a.submitted_at DESC LIMIT 20',[$uid]);
                    $result['quests']=mce_all('SELECT * FROM mce_quests WHERE user_id=? AND local_date=?',[$uid,Motivation::day($p)]);
                    $result['streak']=mce_one('SELECT * FROM mce_streak_state WHERE user_id=?',[$uid]);
                    $result['due']=(int)mce_query('SELECT COUNT(*) FROM mce_review_cards WHERE user_id=? AND hidden=0 AND due_at<=?',[$uid,mce_sqltime()])->fetchColumn();
                    $result['todaySeconds']=(int)mce_query('SELECT COALESCE(SUM(seconds),0) FROM mce_active_time WHERE user_id=? AND local_date=?',[$uid,Motivation::day($p)])->fetchColumn();
                    $result['balances']=mce_all('SELECT currency,SUM(amount) AS amount FROM reward_ledger WHERE user_id=? GROUP BY currency',[$uid]);
                    $result['guestImports']=mce_all('SELECT a.id,v.title FROM mce_attempts a JOIN mce_versions v ON v.id=a.version_id WHERE a.user_id IS NULL AND a.guest_key=? ORDER BY a.started_at DESC LIMIT 5',[Study::guestKey()]);
                } elseif($root==='on-tap') {
                    $p=mce_transaction(function()use($uid){$p=Motivation::lock($uid);Motivation::quests($uid,$p);return $p;});$result['profile']=$p;$result['title']='Ôn lại một chút';$used=Review::usedToday($uid,$p);$limit=isset($_GET['more'])?100:max(0,(int)$p['review_limit']-$used);$result['reviewUsed']=$used;
                    $result['cards']=isset($_GET['manage'])?mce_all('SELECT * FROM mce_review_cards WHERE user_id=? ORDER BY hidden,due_at,id LIMIT 100',[$uid]):mce_all('SELECT * FROM mce_review_cards WHERE user_id=? AND hidden=0 AND due_at<=? ORDER BY due_at,id LIMIT '.$limit,[$uid,mce_sqltime()]);
                } elseif($root==='so-tu-vung') {
                    $result['title']='Sổ từ vựng của bạn';$filter=$_GET['filter']??'all';$q=is_string($_GET['q']??null)?mb_substr($_GET['q'],0,100):'';
                    $result['words']=mce_all('SELECT v.*,uv.notes,uv.hidden,c.id AS card_id,c.due_at,c.hidden AS card_hidden,c.interval_days FROM mce_user_vocabulary uv JOIN mce_vocabulary v ON v.id=uv.sense_id LEFT JOIN mce_review_cards c ON c.user_id=uv.user_id AND c.target_key=CONCAT(\'sense:\',v.id) WHERE uv.user_id=? AND (v.lemma LIKE ? OR v.meaning LIKE ?)'.($filter==='review'?' AND c.id IS NOT NULL AND c.hidden=0':($filter==='hidden'?' AND c.hidden=1':'')).' ORDER BY uv.created_at DESC LIMIT 100',[$uid,'%'.$q.'%','%'.$q.'%']);
                } elseif($root==='tien-do') {
                    $result['title']='Tiến độ học của bạn';$result['progress']=mce_all('SELECT p.*,v.title,l.slug FROM mce_progress p JOIN mce_lessons l ON l.id=p.lesson_id JOIN mce_versions v ON v.id=l.current_version WHERE p.user_id=?',[$uid]);
                    $result['activities']=mce_all('SELECT * FROM mce_activities WHERE user_id=? ORDER BY local_date DESC LIMIT 28',[$uid]);$result['badges']=mce_all('SELECT * FROM mce_badges WHERE user_id=?',[$uid]);$result['calendar']=mce_all('SELECT * FROM mce_streak_calendar WHERE user_id=? ORDER BY local_date DESC LIMIT 35',[$uid]);
                    $result['accuracy']=mce_one("SELECT SUM(score) AS score,SUM(max_score) AS max_score FROM mce_attempts WHERE user_id=? AND status='finished' AND mode<>'preview'",[$uid]);
                    $result['accuracy']['seconds']=(int)mce_query('SELECT COALESCE(SUM(seconds),0) FROM mce_active_time WHERE user_id=?',[$uid])->fetchColumn();
                } elseif($root==='reward-shop'){$result['title']='Góc trang trí';$result['shop']=mce_all('SELECT s.*,i.item_id AS owned FROM mce_shop s LEFT JOIN mce_inventory i ON i.item_id=s.id AND i.user_id=? WHERE s.active=1 OR i.item_id IS NOT NULL',[$uid]);$result['coins']=(int)mce_query("SELECT COALESCE(SUM(amount),0) FROM reward_ledger WHERE user_id=? AND currency='coin'",[$uid])->fetchColumn();}
                elseif($root==='tai-khoan'){$result['title']='Tài khoản và quyền riêng tư';$result['reminder']=mce_one('SELECT enabled,hour FROM mce_reminders WHERE user_id=?',[$uid]);$result['exports']=mce_all('SELECT id,kind,status,created_at,expires_at FROM mce_exports WHERE user_id=? ORDER BY created_at DESC LIMIT 10',[$uid]);}
                else $result['title']='Chọn nhịp học của bạn';
            } elseif($root==='lo-trinh') {
                $result['paths']=Content::paths();$result['title']='Lộ trình học';
                if($slug){$p=mce_one("SELECT * FROM mce_paths WHERE slug=? AND status='published'",[$slug]);if(!$p||!Content::lessons((int)$p['id']))throw new ProductError(404,'Lộ trình chưa có nội dung khả dụng.');$result['path']=$p;$result['lessons']=Content::lessons((int)$p['id']);$result['title']=$p['title'];$result['metaDescription']=$p['description'];if(current_user()){$result['progress']=mce_all('SELECT * FROM mce_progress WHERE user_id=?',[mce_uid()]);$result['activeLessons']=array_column(mce_all("SELECT DISTINCT lesson_id FROM mce_attempts WHERE user_id=? AND status='active'",[mce_uid()]),'lesson_id');}}
            } elseif($root==='chien-dich') {
                $p=mce_one("SELECT * FROM mce_paths WHERE slug=? AND status='published'",[$slug]);if(!$p||!($lessons=Content::lessons((int)$p['id'])))throw new ProductError(404,'Chiến dịch chưa có bài học khả dụng.');$result['campaign']=$p;$result['campaignLesson']=$lessons[0];$result['title']=$p['title'];$result['metaDescription']=$p['description'];
            } elseif($root==='bai-hoc') {
                $lesson=null;foreach(Content::lessons() as $l)if($l['slug']===$slug)$lesson=$l;if(!$lesson)throw new ProductError(404,'Không tìm thấy bài học.');$result['lesson']=$lesson;$doc=mce_decode($lesson['document']);$result['title']=$doc['seo']['title']??$lesson['title'];$result['metaDescription']=$doc['seo']['description']??$doc['objectives'];
            } elseif($root==='tu-vung') {
                $page=max(1,min(10000,(int)($_GET['page']??1)));$offset=($page-1)*30;$result['pageNumber']=$page;$result['title']='Từ vựng theo chủ đề';$topic=$slug==='chu-de'?($segments[2]??''):null;
                $result['sets']=mce_all("SELECT s.*,COUNT(*) AS sense_count FROM mce_vocabulary_sets s JOIN mce_vocabulary_set_items i ON i.set_id=s.id JOIN mce_vocabulary v ON v.id=i.sense_id WHERE s.status='published' AND v.status='published' GROUP BY s.id ORDER BY s.sort_order,s.id");
                if($topic!==null){$set=mce_one("SELECT * FROM mce_vocabulary_sets WHERE slug=? AND status='published'",[$topic]);if(!$set)throw new ProductError(404,'Bộ từ chưa khả dụng.');$result['title']=$set['title'];$result['metaDescription']=$set['description'];$result['words']=mce_all("SELECT v.* FROM mce_vocabulary v JOIN mce_vocabulary_set_items i ON i.sense_id=v.id WHERE i.set_id=? AND v.status='published' ORDER BY v.lemma LIMIT 31 OFFSET ".$offset,[$set['id']]);}
                else $result['words']=mce_all("SELECT * FROM mce_vocabulary WHERE status='published'".($slug?' AND slug=?':'').' ORDER BY topic,lemma LIMIT 31 OFFSET '.$offset,$slug?[$slug]:[]);
                $result['hasNext']=count($result['words'])>30;$result['words']=array_slice($result['words'],0,30);
                if($slug&&!$result['words'])throw new ProductError(404,'Không tìm thấy bộ từ hoặc nghĩa từ.');
            } elseif($root==='kien-thuc') {
                $page=max(1,min(10000,(int)($_GET['page']??1)));$offset=($page-1)*30;$result['pageNumber']=$page;$result['title']='Một chút kiến thức';$result['articles']=mce_all("SELECT * FROM mce_articles WHERE status='published'".($slug?' AND slug=?':'').' ORDER BY updated_at DESC,id DESC LIMIT 31 OFFSET '.$offset,$slug?[$slug]:[]);if($slug&&!$result['articles'])throw new ProductError(404,'Không tìm thấy bài viết.');if($slug)$result['title']=$result['articles'][0]['title'];$result['hasNext']=count($result['articles'])>30;$result['articles']=array_slice($result['articles'],0,30);
            } elseif($root==='tim-kiem') {
                $result['title']='Tìm nội dung học';$q=is_string($_GET['q']??null)?mb_substr(trim($_GET['q']),0,100):'';$result['query']=$q;$result['matches']=[];
                if($q!=='') {
                    $needle=mb_strtolower($q);foreach(Content::lessons() as $l)if(str_contains(mb_strtolower($l['title'].' '.$l['document']),$needle))$result['matches'][]=['title'=>$l['title'],'url'=>'/bai-hoc/'.$l['slug'],'type'=>'Bài học'];
                    foreach(mce_all("SELECT lemma,slug FROM mce_vocabulary WHERE status='published' AND (lemma LIKE ? OR meaning LIKE ?) LIMIT 30",['%'.$q.'%','%'.$q.'%']) as $v)$result['matches'][]=['title'=>$v['lemma'],'url'=>'/tu-vung/'.$v['slug'],'type'=>'Từ vựng'];
                    foreach(mce_all("SELECT title,slug FROM mce_articles WHERE status='published' AND (title LIKE ? OR body LIKE ?) LIMIT 30",['%'.$q.'%','%'.$q.'%']) as $v)$result['matches'][]=['title'=>$v['title'],'url'=>'/kien-thuc/'.$v['slug'],'type'=>'Kiến thức'];
                    $result['matches']=array_slice($result['matches'],0,60);
                }
            } elseif($root==='admin'&&$slug) {
                mce_staff(in_array($slug,['users','settings','audit','operations'],true));$result['adminSection']=$slug;$result['title']='Quản trị - '.$slug;
                if($slug==='lesson-preview') {
                    $id=Study::preview((int)($segments[2]??0));$result['player']=Study::publicAttempt(Study::read($id));$result['title']='Xem trước - không lưu thành tích';
                } else $result['adminData']=$this->adminData($slug);
            } elseif($root==='kiem-tra-dau-vao') {
                $result['title']='Kiểm tra gợi ý học';$result['placement']=mce_one("SELECT l.slug,l.id,v.title FROM mce_lessons l JOIN mce_versions v ON v.id=l.current_version WHERE l.subtype='placement' AND l.archived=0 AND v.status='published' LIMIT 1");
            } elseif(in_array($root,['quen-mat-khau','dat-lai-mat-khau','xac-minh-email','huy-nhac-hoc'],true)) {
                $result['title']='Bảo mật tài khoản';
            } elseif(in_array($root,['gioi-thieu','lien-he','dieu-khoan','bao-mat'],true))$result['title']=match($root){'gioi-thieu'=>'Về Một Chút English','lien-he'=>'Liên hệ','dieu-khoan'=>'Điều khoản sử dụng','bao-mat'=>'Quyền riêng tư'};
            else throw new ProductError(404,'Không tìm thấy trang.');
        } catch(Throwable $e) {
            if($e instanceof ProductError&&$e->status===401&&($_SERVER['REQUEST_METHOD']??'GET')==='GET')auth_redirect('login');
            http_response_code($e instanceof ProductError?$e->status:503);$result['error']=$e instanceof ProductError?$e->getMessage():'Dữ liệu tạm thời chưa khả dụng. Vui lòng thử lại.';
            if(!($e instanceof ProductError))error_log('Product page ['.($_SERVER['MCE_REQUEST_ID']??'cli').'] '.get_class($e));
        }return $result;
    }
    private function adminData(string $section): array {
        $page=max(1,(int)($_GET['pageNo']??1));$offset=($page-1)*30;
        if(in_array($section,['paths','units','vocabulary','articles','vocabulary-sets'],true))return mce_all('SELECT * FROM mce_'.str_replace('-','_',$section).' ORDER BY id DESC LIMIT 30 OFFSET '.$offset);
        if(in_array($section,['lessons','questions'],true)) {
            $where=[];$params=[];$q=is_string($_GET['q']??null)?mb_substr($_GET['q'],0,100):'';
            if($q!==''){$where[]='(v.title LIKE ? OR v.document LIKE ? OR v.status LIKE ?)';$params=[...$params,'%'.$q.'%','%'.$q.'%','%'.$q.'%'];}
            foreach(['type'=>'$.exercises[*].type','level'=>'$.exercises[*].level','tag'=>'$.exercises[*].skillTags[*]'] as $filter=>$jsonPath)if(is_string($_GET[$filter]??null)&&$_GET[$filter]!==''){$where[]="JSON_SEARCH(v.document,'one',?,NULL,'".$jsonPath."') IS NOT NULL";$params[]=mb_substr($_GET[$filter],0,80);}
            if(is_string($_GET['status']??null)&&$_GET['status']!==''){$where[]='v.status=?';$params[]=$_GET['status'];}
            return mce_all('SELECT v.*,l.slug,l.unit_id,l.archived FROM mce_versions v JOIN mce_lessons l ON l.id=v.lesson_id'.($where?' WHERE '.implode(' AND ',$where):'').' ORDER BY v.id DESC LIMIT 30 OFFSET '.$offset,$params);
        }
        if($section==='media')return mce_all('SELECT * FROM mce_media ORDER BY id DESC LIMIT 30 OFFSET '.$offset);
        if($section==='reports')return mce_all('SELECT id,version_id,position,category,description,status,resolution FROM mce_reports ORDER BY id DESC LIMIT 30 OFFSET '.$offset);
        if($section==='users')return mce_all("SELECT u.id,u.name,u.email,COALESCE(r.role,'learner') AS role FROM users u LEFT JOIN learning_roles r ON r.user_id=u.id ORDER BY u.id DESC LIMIT 30 OFFSET ".$offset);
        if($section==='audit')return mce_all('SELECT * FROM mce_audit ORDER BY id DESC LIMIT 30 OFFSET '.$offset);
        if($section==='settings')return mce_all('SELECT * FROM mce_settings ORDER BY name');
        if($section==='imports')return mce_all('SELECT id,status,errors,created_at FROM mce_imports ORDER BY created_at DESC LIMIT 30 OFFSET '.$offset);
        if($section==='operations')return [
            'counts'=>mce_all('SELECT type,COUNT(*) AS count FROM mce_events GROUP BY type'),
            'jobs'=>mce_all('SELECT id,type,status,attempts,last_error,available_at FROM mce_jobs ORDER BY id DESC LIMIT 30'),
            'cohorts'=>mce_all("SELECT c.local_date AS registered,COUNT(DISTINCT c.user_id) AS users,COUNT(DISTINCT CASE WHEN a.local_date=DATE_ADD(c.local_date,INTERVAL 1 DAY) THEN c.user_id END) AS d1,COUNT(DISTINCT CASE WHEN a.local_date=DATE_ADD(c.local_date,INTERVAL 7 DAY) THEN c.user_id END) AS d7 FROM mce_cohorts c LEFT JOIN mce_activities a ON a.user_id=c.user_id GROUP BY c.local_date ORDER BY registered DESC LIMIT 30")
        ];
        throw new ProductError(404,'Không tìm thấy mục quản trị.');
    }
    public function download(string $what): never {
        try {
            if(str_starts_with($what,'template-')) {
                mce_staff();$file=match($what){'template-lesson'=>'lesson.json','template-import'=>'import.json','template-exercises'=>'all-exercises.json','template-csv'=>'vocabulary.csv','template-paths'=>'paths.json','template-units'=>'units.json','template-articles'=>'articles.json','template-vocabulary_sets'=>'vocabulary_sets.json',default=>throw new ProductError(404,'Không tìm thấy mẫu.')};
                header('Content-Type: '.($file==='vocabulary.csv'?'text/csv':'application/json').'; charset=utf-8');header('Content-Disposition: attachment; filename="'.$file.'"');readfile(ROOT_PATH.'/database/templates/'.$file);exit;
            }
            if($what==='export'){$uid=mce_uid();$data=Identity::export($uid);mce_audit('personal_export','user:'.$uid);$name='my-learning.json';}
            elseif($what==='content-export'){mce_staff();$data=['schemaVersion'=>1,'paths'=>mce_all('SELECT * FROM mce_paths'),'units'=>mce_all('SELECT * FROM mce_units'),'lessons'=>mce_all('SELECT * FROM mce_lessons'),'versions'=>mce_all('SELECT id,lesson_id,title,document,status FROM mce_versions'),'vocabulary'=>mce_all('SELECT * FROM mce_vocabulary'),'articles'=>mce_all('SELECT * FROM mce_articles')];$name='content.json';mce_audit('content_export','catalog');}
            else throw new ProductError(404,'Không tìm thấy tệp.');
            header('Content-Type: application/json; charset=utf-8');header('Content-Disposition: attachment; filename="'.$name.'"');echo mce_json($data);
        }catch(Throwable $e){http_response_code($e instanceof ProductError?$e->status:503);echo 'Không thể xuất dữ liệu.';}exit;
    }
    public function media(string $id): never {
        $m=mce_one('SELECT * FROM mce_media WHERE id=?',[(int)$id]);if(!$m){http_response_code(404);exit;}
        $public=(string)$id===mce_setting('logo_media_id')||(string)$id===mce_setting('favicon_media_id');
        if(mce_one("SELECT id FROM mce_vocabulary WHERE audio_id=? AND status='published' LIMIT 1",[(int)$id]))$public=true;
        if(current_user()&&mce_one('SELECT id FROM mce_review_cards WHERE user_id=? AND JSON_EXTRACT(snapshot,\'$.audioId\')=? LIMIT 1',[mce_uid(),(int)$id]))$public=true;
        if(mce_one("SELECT id FROM mce_paths WHERE image_id=? AND status='published' LIMIT 1",[(int)$id]))$public=true;
        $versions=Content::lessons();
        if(current_user())$versions=[...$versions,...mce_all('SELECT DISTINCT v.document FROM mce_attempts a JOIN mce_versions v ON v.id=a.version_id WHERE a.user_id=?',[mce_uid()])];
        foreach($versions as $v){$d=mce_decode($v['document']);foreach([...$d['blocks'],...array_map(fn($e)=>$e['payload'],$d['exercises'])] as $b)if((int)($b['audioId']??0)===(int)$id)$public=true;}
        if(!$public&&!in_array(mce_role(),['editor','admin'],true)){http_response_code(404);exit;}
        $file=mce_storage()->path($m['storage_key']);if(!is_file($file)){http_response_code(404);exit;}
        header('Content-Type: '.$m['mime']);header('X-Content-Type-Options: nosniff');header('Content-Length: '.filesize($file));header('Content-Disposition: inline');readfile($file);exit;
    }
    public function exportFile(string $id): never {
        try {
            $uid=mce_uid();$e=mce_one("SELECT * FROM mce_exports WHERE id=? AND user_id=? AND status='ready'",[mce_key($id),$uid]);
            if(!$e||$e['expires_at']<=mce_sqltime())throw new ProductError(404,'Tệp chưa sẵn sàng hoặc đã hết hạn.');if($e['kind']==='content')mce_staff();
            $file=Exports::file($e['file_key']);if(!is_file($file))throw new ProductError(404,'Tệp không còn khả dụng.');
            header('Content-Type: application/json; charset=utf-8');header('Content-Disposition: attachment; filename="motchutenglish-'.$e['kind'].'.json"');header('Cache-Control: no-store, private');readfile($file);
        }catch(Throwable $e){http_response_code($e instanceof ProductError?$e->status:503);header('Content-Type: text/plain; charset=utf-8');echo $e instanceof ProductError?$e->getMessage():'Chưa thể tải tệp.';}exit;
    }
    public function sitemap(string $type): never {
        if($type==='theme.css') {
            header('Content-Type: text/css; charset=utf-8');$p=mce_setting('primary','#146b50');$a=mce_setting('accent','#f7ce53');
            if(!preg_match('/^#[a-fA-F0-9]{6}$/D',$p))$p='#146b50';if(!preg_match('/^#[a-fA-F0-9]{6}$/D',$a))$a='#f7ce53';
            echo ':root{--primary:'.$p.';--accent:'.$a.';}';exit;
        }
        if($type==='health'){try{db()->query('SELECT 1');http_response_code(200);echo 'ok';}catch(Throwable $e){http_response_code(503);echo 'unavailable';}exit;}
        if($type==='robots.txt'){header('Content-Type: text/plain');echo "User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ".Identity::base()."/sitemap.xml\n";exit;}
        header('Content-Type: application/xml; charset=utf-8');$urls=['/','/lo-trinh','/tu-vung','/kien-thuc','/gioi-thieu'];foreach(Content::paths() as $p)$urls[]='/lo-trinh/'.$p['slug'];foreach(Content::lessons() as $l)$urls[]='/bai-hoc/'.$l['slug'];foreach(mce_all("SELECT slug FROM mce_articles WHERE status='published'") as $a)$urls[]='/kien-thuc/'.$a['slug'];
        foreach(mce_all("SELECT slug,topic FROM mce_vocabulary WHERE status='published'") as $word){$urls[]='/tu-vung/'.$word['slug'];}foreach(mce_all("SELECT DISTINCT s.slug FROM mce_vocabulary_sets s JOIN mce_vocabulary_set_items i ON i.set_id=s.id JOIN mce_vocabulary v ON v.id=i.sense_id WHERE s.status='published' AND v.status='published'") as $set)$urls[]='/tu-vung/chu-de/'.$set['slug'];$urls=array_values(array_unique($urls));
        echo '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';foreach($urls as $u)echo '<url><loc>'.h(Identity::base().$u).'</loc></url>';echo '</urlset>';exit;
    }
}
