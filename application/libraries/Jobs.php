<?php
declare(strict_types=1);
final class Jobs {
    private static function recoveryDelay(int $attempts): int {
        return min(3600,30*2**min(7,max(0,$attempts)));
    }
    // Called only after acquiring the exclusive worker lock. A live worker holds
    // that lock even during long jobs, so elapsed time alone never steals work.
    private static function recoverInterrupted(): array {
        $counts=['requeued'=>0,'completed'=>0,'failed'=>0];
        foreach(mce_all("SELECT id FROM mce_jobs WHERE status='running' ORDER BY id") as $candidate) {
            $outcome=mce_transaction(function()use($candidate){
                $job=mce_one("SELECT * FROM mce_jobs WHERE id=? AND status='running' FOR UPDATE",[$candidate['id']]);
                if(!$job)return null;
                try{$payload=mce_decode($job['payload']);}catch(Throwable $e){$payload=null;}
                $completed=false;
                if(is_array($payload)) {
                    if($job['type']==='import')$completed=(bool)mce_one("SELECT id FROM mce_imports WHERE id=? AND status='committed'",[$payload['importId']??'']);
                    elseif($job['type']==='export')$completed=(bool)mce_one("SELECT id FROM mce_exports WHERE id=? AND status='ready'",[$payload['exportId']??'']);
                    elseif($job['type']==='reminder')$completed=(bool)mce_one("SELECT user_id FROM mce_deliveries WHERE user_id=? AND local_date=? AND type='reminder' AND status IN ('sent','skipped')",[$payload['userId']??0,$payload['localDate']??'']);
                }
                if($completed) {
                    mce_query("UPDATE mce_jobs SET status='done',payload='{}',locked_at=NULL,last_error=NULL WHERE id=?",[$job['id']]);
                    return 'completed';
                }
                $retryable=is_array($payload)&&in_array($job['type'],['import','export','delete_account'],true);
                $retry=$retryable&&(int)$job['attempts']<5;
                $error=$retry?'Worker interrupted - safe retry scheduled':($retryable?'Worker interrupted - retry limit reached':(in_array($job['type'],['mail','reminder','analytics'],true)?'Delivery uncertain - worker interrupted; manual reconciliation required':'Worker interrupted - unsupported or invalid payload; manual inspection required'));
                mce_query('UPDATE mce_jobs SET status=?,available_at=?,locked_at=NULL,last_error=? WHERE id=?',[$retry?'pending':'failed',mce_sqltime(mce_now()->modify('+'.self::recoveryDelay((int)$job['attempts']).' seconds')),$error,$job['id']]);
                if(is_array($payload)&&$job['type']==='import'){mce_query("UPDATE mce_imports SET status=? WHERE id=? AND status<>'committed'",[$retry?'queued':'failed',$payload['importId']??'']);$total=mce_one('SELECT total FROM mce_import_progress WHERE import_id=?',[$payload['importId']??''])['total']??null;if($total===null){$total=0;$doc=mce_decode(mce_one('SELECT document FROM mce_imports WHERE id=?',[$payload['importId']??''])['document']??'{}');foreach(['paths','units','articles','vocabulary_sets','vocabulary','lessons'] as $kind)if(is_array($doc[$kind]??null)){$total=count($doc[$kind]);break;}}ImportStatus::write($payload['importId']??'',0,(int)$total,$retry?'queued':'failed');}
                if(is_array($payload)&&$job['type']==='export')mce_query("UPDATE mce_exports SET status=? WHERE id=? AND status<>'ready'",[$retry?'queued':'failed',$payload['exportId']??'']);
                return $retry?'requeued':'failed';
            });
            if($outcome!==null)$counts[$outcome]++;
        }
        return $counts;
    }
    public static function tick(?DateTimeImmutable $now=null): void {
        $now??=mce_now();
        mce_query('DELETE FROM mce_journeys WHERE landed_at<?',[mce_sqltime($now->modify('-90 days'))]);
        foreach(mce_all('SELECT user_id FROM mce_profiles WHERE deleted_at IS NULL') as $profile) {
            $uid=(int)$profile['user_id'];
            mce_transaction(function()use($uid,$now){
                $p=Motivation::lock($uid,true,$now);if($p['deleted_at'])return;
                Motivation::streak($uid,$p,false,$now);
                $reminder=mce_one('SELECT enabled,hour FROM mce_reminders WHERE user_id=?',[$uid]);
                if(!Identity::mailConfigured()||!$reminder||!$reminder['enabled']||!$p['verified_at'])return;
                $date=Motivation::day($p,$now);$hour=(int)$now->setTimezone(new DateTimeZone($p['quest_timezone']))->format('G');
                if($hour<(int)$reminder['hour']||mce_one('SELECT user_id FROM mce_activities WHERE user_id=? AND local_date=?',[$uid,$date]))return;
                if(!mce_query("INSERT IGNORE INTO mce_deliveries(user_id,local_date,type,status) VALUES (?,?,'reminder','queued')",[$uid,$date])->rowCount())return;
                mce_query("INSERT IGNORE INTO mce_jobs(type,payload,event_key,available_at) VALUES ('reminder',?,?,?)",[mce_json(['userId'=>$uid,'localDate'=>$date]),'reminder:'.$uid.':'.$date,mce_sqltime($now)]);
            });
        }
    }
    public static function run(int $limit=50): array {
        if(!(int)mce_query("SELECT GET_LOCK('mce_worker',0)")->fetchColumn())return ['processed'=>0,'busy'=>true];
        $done=0;$failed=0;
        try {
            $recovery=self::recoverInterrupted();
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
                    mce_query("UPDATE mce_jobs SET status='done',payload='{}',locked_at=NULL,last_error=NULL WHERE id=?",[$job['id']]);$done++;
                } catch(Throwable $e) {
                    $tries=(int)$job['attempts']+1;$uncertain=str_contains($e->getMessage(),'delivery uncertain');
                    mce_query('UPDATE mce_jobs SET status=?,available_at=?,locked_at=NULL,last_error=? WHERE id=?',[$tries>=5||$uncertain?'failed':'pending',mce_sqltime(mce_now()->modify('+'.self::recoveryDelay($tries).' seconds')),$uncertain?'Delivery uncertain - manual reconciliation required':get_class($e).' - transport or job failed',$job['id']]);$failed++;
                    if($job['type']==='import')mce_query("UPDATE mce_imports SET status='failed' WHERE id=? AND status<>'committed'",[$payload['importId']??'']);
                    if($job['type']==='export')mce_query("UPDATE mce_exports SET status='failed' WHERE id=? AND status<>'ready'",[$payload['exportId']??'']);
                }
            }
        } finally {mce_query("SELECT RELEASE_LOCK('mce_worker')");}
        return ['processed'=>$done,'failed'=>$failed,'recovery'=>$recovery];
    }
    private static function reminder(array $payload): void {
        $uid=(int)$payload['userId'];$date=$payload['localDate'];
        $now=mce_now();
        [$p,$r]=mce_transaction(function()use($uid,$now){return [Motivation::lock($uid,true,$now),mce_one('SELECT enabled FROM mce_reminders WHERE user_id=?',[$uid])];});
        if($p['deleted_at']||!$r||!$r['enabled']||Motivation::day($p,$now)!==$date||mce_one('SELECT user_id FROM mce_activities WHERE user_id=? AND local_date=?',[$uid,$date])) {
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
