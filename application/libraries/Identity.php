<?php
declare(strict_types=1);
final class Identity {
    public static function mailConfigured(): bool { return (getenv('MAIL_DRIVER')==='log'&&getenv('APP_ENV')!=='production')||(getenv('MAIL_DRIVER')==='smtp'&&getenv('SMTP_HOST')&&getenv('MAIL_FROM')); }
    public static function queueMail(int $uid,string $subject,string $body,string $key,?string $recipient=null): void {
        if(!self::mailConfigured()) throw new ProductError(503,'Email chưa được cấu hình. Chức năng này hiện chưa khả dụng.');
        $email=$recipient??mce_one('SELECT email FROM users WHERE id=?',[$uid])['email'];
        mce_query("INSERT IGNORE INTO mce_jobs(type,payload,event_key,available_at) VALUES ('mail',?,?,?)",[mce_json(['userId'=>$uid,'recipient'=>$email,'subject'=>$subject,'body'=>$body]),$key,mce_sqltime()]);
    }
    public static function token(int $uid,string $purpose,?string $payload=null,int $minutes=60): string {
        $token=bin2hex(random_bytes(32));mce_query('INSERT INTO mce_auth_tokens(token_hash,user_id,purpose,payload,expires_at) VALUES (?,?,?,?,?)',[hash('sha256',$token),$uid,$purpose,$payload,mce_sqltime(mce_now()->modify('+'.$minutes.' minutes'))]);return $token;
    }
    public static function base(): string {
        if(getenv('APP_ENV')==='production'&&(!getenv('APP_URL')||parse_url(getenv('APP_URL'),PHP_URL_SCHEME)!=='https'))throw new ProductError(503,'Cần cấu hình địa chỉ HTTPS chính thức trước khi phát hành.');
        $base=rtrim(getenv('APP_URL')?:'http://localhost:8080','/');
        if(!filter_var($base,FILTER_VALIDATE_URL)||!in_array(parse_url($base,PHP_URL_SCHEME),['http','https'],true)) throw new ProductError(503,'Địa chỉ website chưa được cấu hình.');return $base;
    }
    public static function requestReset(string $email): void {
        if(!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($email)>254)throw new ProductError(422,'Vui lòng nhập email hợp lệ.');
        mce_limit('reset',5);if(!self::mailConfigured()) throw new ProductError(503,'Email chưa được cấu hình. Hiện chưa thể đặt lại mật khẩu.');
        $u=User_model::findByEmail(strtolower(trim($email)));
        if($u)try{mce_transaction(function()use($u){$uid=(int)$u['id'];Motivation::lock($uid);$t=self::token($uid,'reset');self::queueMail($uid,'Đặt lại mật khẩu Một Chút English',self::base().'/dat-lai-mat-khau#token='.$t,'reset:'.hash('sha256',$t));});}catch(ProductError $e){if($e->status!==401)throw $e;}
    }
    public static function password(string $password): void {
        if(mb_strlen($password)<8||strlen($password)>72) throw new ProductError(422,'Mật khẩu cần ít nhất 8 ký tự và tối đa 72 byte.');
    }
    public static function consume(string $token,string $purpose,?string $password=null): void {
        if(!preg_match('/^[a-f0-9]{64}$/D',$token)) throw new ProductError(422,'Liên kết không hợp lệ hoặc đã hết hạn.');
        mce_transaction(function()use($token,$purpose,$password){
            $t=mce_one('SELECT * FROM mce_auth_tokens WHERE token_hash=? FOR UPDATE',[hash('sha256',$token)]);
            if(!$t||$t['purpose']!==$purpose||$t['used_at']||$t['expires_at']<mce_sqltime()) throw new ProductError(422,'Liên kết không hợp lệ hoặc đã hết hạn.');
            $uid=(int)$t['user_id'];Motivation::lock($uid,$purpose==='unsubscribe');
            if($purpose==='reset') {
                self::password($password??'');User_model::updatePassword($uid,password_hash($password,PASSWORD_DEFAULT));
                mce_query('UPDATE mce_profiles SET session_version=session_version+1 WHERE user_id=?',[$uid]);
                mce_query("UPDATE mce_auth_tokens SET used_at=? WHERE user_id=? AND purpose='reset'",[mce_sqltime(),$uid]);
            } elseif($purpose==='verify') {
                if($t['payload']) {
                    $exists=User_model::findByEmail($t['payload']);if($exists&&(int)$exists['id']!==$uid) throw new ProductError(422,'Địa chỉ email không còn khả dụng.');
                    mce_query('UPDATE users SET email=? WHERE id=?',[$t['payload'],$uid]);
                    mce_query('UPDATE mce_profiles SET session_version=session_version+1,verified_at=? WHERE user_id=?',[mce_sqltime(),$uid]);
                } else mce_query('UPDATE mce_profiles SET verified_at=? WHERE user_id=?',[mce_sqltime(),$uid]);
            } elseif($purpose==='unsubscribe') mce_query('UPDATE mce_reminders SET enabled=0 WHERE user_id=?',[$uid]);
            mce_query('UPDATE mce_auth_tokens SET used_at=? WHERE token_hash=?',[mce_sqltime(),hash('sha256',$token)]);
        });
    }
    public static function verify(int $uid,?string $email=null): void {
        mce_limit('verify',5);if($email!==null) { $email=strtolower(trim($email));if(!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($email)>254) throw new ProductError(422,'Email không hợp lệ.'); }
        mce_transaction(function()use($uid,$email){Motivation::lock($uid);$token=self::token($uid,'verify',$email,1440);self::queueMail($uid,'Xác minh email Một Chút English',self::base().'/xac-minh-email#token='.$token,'verify:'.hash('sha256',$token),$email);});
    }
    public static function updatePassword(int $uid,string $current,string $next): void {
        mce_limit('password',10);$u=mce_one('SELECT password_hash FROM users WHERE id=?',[$uid]);
        if(!password_verify($current,$u['password_hash'])) throw new ProductError(422,'Mật khẩu hiện tại chưa đúng.');self::password($next);
        mce_transaction(function()use($uid,$next){Motivation::lock($uid);User_model::updatePassword($uid,password_hash($next,PASSWORD_DEFAULT));mce_query('UPDATE mce_profiles SET session_version=session_version+1 WHERE user_id=?',[$uid]);mce_query("UPDATE mce_auth_tokens SET used_at=? WHERE user_id=? AND purpose='reset' AND used_at IS NULL",[mce_sqltime(),$uid]);});
        $_SESSION['user']=null;session_regenerate_id(true);
    }
    public static function export(int $uid): array {
        $out=['user'=>mce_one('SELECT id,name,email,created_at FROM users WHERE id=?',[$uid])];
        foreach(['profiles','enrollments','progress','attempts','user_vocabulary','review_cards','review_events','activities','quests','streak_state','streak_calendar','badges','inventory','purchases','reminders','reports','consents','cohorts','active_time'] as $t) $out[$t]=mce_all('SELECT * FROM mce_'.$t.' WHERE user_id=?',[$uid]);
        foreach($out['reminders'] as &$r) unset($r['unsubscribe_hash']);unset($r);
        $out['answers']=mce_all("SELECT i.attempt_id,i.exercise_id,i.response,i.first_response,i.state,CASE WHEN a.mode='test' AND a.status<>'finished' THEN NULL ELSE i.grading END AS grading FROM mce_items i JOIN mce_attempts a ON a.id=i.attempt_id WHERE a.user_id=?",[$uid]);
        $out['legacy_attempts']=mce_all('SELECT id,lesson_id,response,score,submitted_at FROM learning_attempts WHERE user_id=?',[$uid]);
        $out['rewards']=mce_all('SELECT currency,amount,event_key,created_at FROM reward_ledger WHERE user_id=?',[$uid]);return $out;
    }
    public static function deleteRequest(int $uid,string $password): void {
        $u=mce_one('SELECT password_hash FROM users WHERE id=?',[$uid]);if(!password_verify($password,$u['password_hash'])) throw new ProductError(422,'Mật khẩu xác nhận chưa đúng.');
        if(learning_role(db(),$uid)==='admin') {
            if((int)mce_query("SELECT COUNT(*) FROM learning_roles WHERE role='admin'")->fetchColumn()<=1) throw new ProductError(422,'Hãy cấp quyền cho một quản trị viên khác trước khi xóa tài khoản quản trị cuối cùng.');
        }
        mce_transaction(function()use($uid){
            $admins=mce_all("SELECT r.user_id,p.deleted_at FROM learning_roles r LEFT JOIN mce_profiles p ON p.user_id=r.user_id WHERE r.role='admin' ORDER BY r.user_id FOR UPDATE");
            $active=array_filter($admins,fn($a)=>!$a['deleted_at']);
            if(in_array($uid,array_map(fn($a)=>(int)$a['user_id'],$active),true)&&count($active)<=1)throw new ProductError(422,'Hãy cấp quyền cho một quản trị viên khác trước khi xóa quản trị viên cuối cùng.');
            Motivation::lock($uid);mce_query('UPDATE mce_profiles SET deleted_at=?,session_version=session_version+1 WHERE user_id=?',[mce_sqltime(),$uid]);mce_query("INSERT IGNORE INTO mce_jobs(type,payload,event_key,available_at) VALUES ('delete_account',?,?,?)",[mce_json(['userId'=>$uid]),'delete:'.$uid,mce_sqltime()]);mce_audit('delete_requested','user:'.$uid);
        });
        $_SESSION['user']=null;session_regenerate_id(true);
    }
    public static function erase(int $uid): void {
        mce_transaction(function()use($uid){
            Motivation::lock($uid,true);
            Exports::deleteFor($uid);
            mce_query('DELETE i FROM mce_items i JOIN mce_attempts a ON a.id=i.attempt_id WHERE a.user_id=?',[$uid]);
            foreach(['review_events','review_cards','user_vocabulary','attempts','enrollments','progress','activities','quest_events','quests','streak_calendar','streak_state','inventory_events','badges','inventory','purchases','balances','reminders','deliveries','reports','events','auth_tokens','timezone_changes','consents','cohorts','active_time'] as $t) mce_query('DELETE FROM mce_'.$t.' WHERE user_id=?',[$uid]);
            foreach(['learning_attempts','learning_roles','reward_ledger','learning_events'] as $t) mce_query('DELETE FROM '.$t.' WHERE user_id=?',[$uid]);
            mce_query('DELETE FROM mce_jobs WHERE type IN (\'mail\',\'reminder\',\'analytics\',\'export\') AND JSON_EXTRACT(payload,\'$.userId\')=?',[$uid]);
            mce_query('UPDATE mce_audit SET actor_id=NULL WHERE actor_id=?',[$uid]);
            mce_query('UPDATE learning_audit SET actor_id=0 WHERE actor_id=?',[$uid]);
            mce_query('UPDATE users SET name=?,email=?,password_hash=? WHERE id=?',['Tài khoản đã xóa','deleted-'.bin2hex(random_bytes(16)).'@invalid.local',password_hash(bin2hex(random_bytes(32)),PASSWORD_DEFAULT),$uid]);
            mce_query("UPDATE mce_profiles SET goal='foundation',path_id=NULL,avatar_style=NULL,verified_at=NULL WHERE user_id=?",[$uid]);
        });
    }
}
