<?php
declare(strict_types=1);
final class Jobs {
    public static function tick(): void {
        $now=mce_now();
        foreach(mce_all('SELECT p.*,r.hour,r.enabled FROM mce_profiles p LEFT JOIN mce_reminders r ON r.user_id=p.user_id WHERE p.deleted_at IS NULL') as $profile) {
            $uid=(int)$profile['user_id'];
            mce_transaction(function()use($uid){$p=Motivation::lock($uid);Motivation::streak($uid,$p);});
            if(!Identity::mailConfigured()||!$profile['enabled']||!$profile['verified_at'])continue;
            $date=Motivation::day($profile,$now);$hour=(int)$now->setTimezone(new DateTimeZone($profile['quest_timezone']))->format('G');
            if($hour<(int)$profile['hour']||mce_one('SELECT user_id FROM mce_activities WHERE user_id=? AND local_date=?',[$uid,$date]))continue;
            mce_transaction(function()use($uid,$date){
                if(!mce_query("INSERT IGNORE INTO mce_deliveries(user_id,local_date,type,status) VALUES (?,?,'reminder','queued')",[$uid,$date])->rowCount())return;
                mce_query("INSERT IGNORE INTO mce_jobs(type,payload,event_key,available_at) VALUES ('reminder',?,?,?)",[mce_json(['userId'=>$uid,'localDate'=>$date]),'reminder:'.$uid.':'.$date,mce_sqltime()]);
            });
        }
    }
    public static function run(int $limit=50): array {
        if(!(int)mce_query("SELECT GET_LOCK('mce_worker',0)")->fetchColumn())return ['processed'=>0,'busy'=>true];
        $done=0;$failed=0;
        try {
            for($i=0;$i<$limit;$i++) {
                $job=mce_one("SELECT * FROM mce_jobs WHERE status='pending' AND available_at<=? ORDER BY id LIMIT 1",[mce_sqltime()]);if(!$job)break;
                mce_query("UPDATE mce_jobs SET status='running',locked_at=?,attempts=attempts+1 WHERE id=?",[mce_sqltime(),$job['id']]);
                try {
                    $payload=mce_decode($job['payload']);
                    if($job['type']==='mail') {
                        $p=mce_profile((int)$payload['userId']);
                        $eligible=!$p['deleted_at'];
                        if(preg_match('/#token=([a-f0-9]{64})/',$payload['body']??'',$match)) {
                            $token=mce_one('SELECT used_at,expires_at FROM mce_auth_tokens WHERE token_hash=?',[hash('sha256',$match[1])]);
                            $eligible=$eligible&&$token&&!$token['used_at']&&$token['expires_at']>=mce_sqltime();
                        }
                        if($eligible)MailTransport::send($payload);
                    } elseif($job['type']==='reminder')self::reminder($payload);
                    elseif($job['type']==='analytics')MarketingAnalytics::send($payload);
                    elseif($job['type']==='export')Exports::build($payload['exportId'],(int)$payload['userId']);
                    elseif($job['type']==='import') {
                        $actor=mce_one('SELECT id,name,email FROM users WHERE id=?',[(int)$payload['actorId']]);if(!$actor)throw new RuntimeException('Import actor unavailable');
                        $actor['session_version']=(int)mce_profile((int)$actor['id'])['session_version'];
                        mce_query("UPDATE mce_imports SET status='running' WHERE id=? AND status<>'committed'",[$payload['importId']]);
                        $_SESSION=['user'=>$actor];try{Content::importCommit($payload['importId'],true);}finally{$_SESSION=[];}
                    }
                    elseif($job['type']==='delete_account')Identity::erase((int)$payload['userId']);
                    else throw new RuntimeException('Unsupported job');
                    mce_query("UPDATE mce_jobs SET status='done',payload='{}',last_error=NULL WHERE id=?",[$job['id']]);$done++;
                } catch(Throwable $e) {
                    $tries=(int)$job['attempts']+1;$uncertain=str_contains($e->getMessage(),'delivery uncertain');
                    mce_query('UPDATE mce_jobs SET status=?,available_at=?,last_error=? WHERE id=?',[$tries>=5||$uncertain?'failed':'pending',mce_sqltime(mce_now()->modify('+'.min(3600,30*2**$tries).' seconds')),$uncertain?'Delivery uncertain - manual reconciliation required':get_class($e).' - transport or job failed',$job['id']]);$failed++;
                    if($job['type']==='import')mce_query("UPDATE mce_imports SET status='failed' WHERE id=? AND status<>'committed'",[$payload['importId']??'']);
                    if($job['type']==='export')mce_query("UPDATE mce_exports SET status='failed' WHERE id=? AND status<>'ready'",[$payload['exportId']??'']);
                }
            }
        } finally {mce_query("SELECT RELEASE_LOCK('mce_worker')");}
        return ['processed'=>$done,'failed'=>$failed];
    }
    private static function reminder(array $payload): void {
        $uid=(int)$payload['userId'];$date=$payload['localDate'];
        $p=mce_profile($uid);$r=mce_one('SELECT enabled FROM mce_reminders WHERE user_id=?',[$uid]);
        if($p['deleted_at']||!$r||!$r['enabled']||Motivation::day($p)!==$date||mce_one('SELECT user_id FROM mce_activities WHERE user_id=? AND local_date=?',[$uid,$date])) {
            mce_query("UPDATE mce_deliveries SET status='skipped' WHERE user_id=? AND local_date=? AND type='reminder'",[$uid,$date]);return;
        }
        $delivery=mce_one("SELECT status FROM mce_deliveries WHERE user_id=? AND local_date=? AND type='reminder'",[$uid,$date]);
        if(!$delivery||$delivery['status']==='sent')return;
        $token=Identity::token($uid,'unsubscribe',null,60*24*30);
        $email=mce_one('SELECT email FROM users WHERE id=?',[$uid])['email'];
        MailTransport::send(['recipient'=>$email,'subject'=>'Một chút English hôm nay','body'=>"Hôm nay bạn có thể học một bài ngắn hoặc ôn lại từ đã lưu.\n".Identity::base()."/hoc\nTắt nhắc học: ".Identity::base().'/huy-nhac-hoc#token='.$token]);
        mce_query("UPDATE mce_deliveries SET status='sent' WHERE user_id=? AND local_date=? AND type='reminder'",[$uid,$date]);
    }
    public static function cleanup(): void {
        Exports::cleanup();
        mce_transaction(function(){
            mce_query('DELETE i FROM mce_items i JOIN mce_attempts a ON a.id=i.attempt_id WHERE a.user_id IS NULL AND a.started_at<?',[mce_sqltime(mce_now()->modify('-30 days'))]);
            mce_query('DELETE FROM mce_attempts WHERE user_id IS NULL AND started_at<?',[mce_sqltime(mce_now()->modify('-30 days'))]);
            mce_query('DELETE FROM mce_auth_tokens WHERE expires_at<?',[mce_sqltime(mce_now()->modify('-7 days'))]);
            mce_query("DELETE FROM mce_jobs WHERE status='done' AND created_at<?",[mce_sqltime(mce_now()->modify('-30 days'))]);
            mce_query("UPDATE mce_jobs SET status='expired',payload='{}',last_error='Payload expired under retention policy' WHERE status IN ('failed','pending') AND created_at<?",[mce_sqltime(mce_now()->modify('-7 days'))]);
            mce_query('DELETE FROM auth_attempts WHERE window_started_at<?',[time()-86400*7]);
        });
        foreach(['mail'=>7,'cache'=>1] as $folder=>$days)foreach(glob(ROOT_PATH.'/writable/'.$folder.'/*')?:[] as $file) {
            if(is_file($file)&&filemtime($file)<time()-$days*86400&&realpath(dirname($file))===realpath(ROOT_PATH.'/writable/'.$folder))unlink($file);
        }
        $backupRoot=realpath(ROOT_PATH.'/writable/backups');
        if($backupRoot)foreach([...(glob($backupRoot.'/backup-*.sql')?:[]),...(glob($backupRoot.'/media-*.tar.gz')?:[])] as $file) {
            if(is_file($file)&&!is_link($file)&&realpath(dirname($file))===$backupRoot&&filemtime($file)<time()-30*86400)unlink($file);
        }
    }
    public static function reconcile(): void {
        foreach(mce_all('SELECT u.id FROM users u LEFT JOIN mce_profiles p ON p.user_id=u.id WHERE p.deleted_at IS NULL') as $u) mce_transaction(function()use($u){
            $uid=(int)$u['id'];Motivation::lock($uid);
            foreach(['xp','coin'] as $currency)mce_query('INSERT INTO mce_balances(user_id,currency,amount) SELECT ?,?,COALESCE(SUM(amount),0) FROM reward_ledger WHERE user_id=? AND currency=? ON DUPLICATE KEY UPDATE amount=VALUES(amount)',[$uid,$currency,$uid,$currency]);
        });
    }
}
