<?php
declare(strict_types=1);
require dirname(__DIR__).'/application/core/bootstrap.php';
if(!preg_match('/^mce_auth_test_[a-f0-9]+$/D',app_config()['db_name']??''))throw new RuntimeException('Isolated test database required');
function jobCheck(bool $ok,string $message): void {if(!$ok)throw new RuntimeException($message);}
function recoveryJob(string $type,array $payload,string $status='running',int $attempts=1): int {
    mce_query('INSERT INTO mce_jobs(type,payload,event_key,available_at,status,attempts,locked_at) VALUES (?,?,?,?,?,?,?)',[$type,mce_json($payload),'recovery-test:'.bin2hex(random_bytes(16)),mce_sqltime(),$status,$attempts,$status==='running'?mce_sqltime():null]);
    return (int)db()->lastInsertId();
}
function recoveryUser(): int {
    $uid=User_model::create('Recovery fixture','recovery-'.bin2hex(random_bytes(8)).'@example.com',password_hash(bin2hex(random_bytes(16)),PASSWORD_DEFAULT));
    mce_profile($uid);return $uid;
}

// Kill the actual CLI worker while it is blocked inside an actual deletion job.
$uid=recoveryUser();$jobId=recoveryJob('delete_account',['userId'=>$uid],'pending',0);
$worker=null;$pipes=[];
try {
    db()->beginTransaction();mce_one('SELECT user_id FROM mce_profiles WHERE user_id=? FOR UPDATE',[$uid]);
    $worker=proc_open([PHP_BINARY,ROOT_PATH.'/database/worker.php','run','1'],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes,ROOT_PATH,null,['bypass_shell'=>true]);
    jobCheck(is_resource($worker),'Could not launch worker');fclose($pipes[0]);
    $deadline=microtime(true)+10;
    do {
        $running=mce_one('SELECT status,attempts FROM mce_jobs WHERE id=?',[$jobId]);
        if($running['status']==='running')break;
        usleep(20000);
    }while(microtime(true)<$deadline);
    jobCheck($running['status']==='running'&&(int)$running['attempts']===1,'Worker did not claim real job');
    $busy=Jobs::run(1);jobCheck(!empty($busy['busy']),'Concurrent worker must not steal a live job');
    jobCheck(mce_one('SELECT status FROM mce_jobs WHERE id=?',[$jobId])['status']==='running','Live job was recovered prematurely');
    proc_terminate($worker,9);
    foreach($pipes as $pipe)if(is_resource($pipe))fclose($pipe);
    proc_close($worker);$worker=null;db()->rollBack();
}finally {
    if(is_resource($worker)){proc_terminate($worker,9);foreach($pipes as $pipe)if(is_resource($pipe))fclose($pipe);proc_close($worker);}
    if(db()->inTransaction())db()->rollBack();
}
$deadline=microtime(true)+10;
while(mce_query("SELECT IS_USED_LOCK('mce_worker')")->fetchColumn()!==null&&microtime(true)<$deadline)usleep(20000);
jobCheck(mce_query("SELECT IS_USED_LOCK('mce_worker')")->fetchColumn()===null,'Database has not released the terminated worker connection');
$result=Jobs::run(1);$job=mce_one('SELECT * FROM mce_jobs WHERE id=?',[$jobId]);
jobCheck($result['recovery']['requeued']===1&&$job['status']==='pending','Interrupted deletion was not recovered');
jobCheck($job['locked_at']===null&&(int)$job['attempts']===1&&$job['available_at']>mce_sqltime(),'Recovery must clear lock, preserve retry count and back off');
jobCheck(Jobs::run(1)['recovery']['requeued']===0,'Recovery must be idempotent');
mce_query('UPDATE mce_jobs SET available_at=? WHERE id=?',[mce_sqltime(),$jobId]);
jobCheck(Jobs::run(1)['processed']===1,'Recovered deletion did not execute');
jobCheck(mce_one('SELECT status FROM mce_jobs WHERE id=?',[$jobId])['status']==='done','Recovered job not done');
jobCheck(mce_one('SELECT name FROM users WHERE id=?',[$uid])['name']==='Tài khoản đã xóa','Real deletion effect did not persist');

// Mail/reminder/analytics cannot promise exactly-once external delivery after a crash.
$external=[];
foreach(['mail','reminder','analytics'] as $type)$external[]=recoveryJob($type,['userId'=>$uid,'localDate'=>'2026-01-01']);
$exhausted=recoveryJob('delete_account',['userId'=>$uid],'running',5);
$unknown=recoveryJob('unknown',[]);
$result=Jobs::run(1);jobCheck($result['recovery']['failed']===5,'Unsafe and exhausted jobs must fail for manual handling');
foreach($external as $id){$job=mce_one('SELECT * FROM mce_jobs WHERE id=?',[$id]);jobCheck($job['status']==='failed'&&str_contains($job['last_error'],'uncertain')&&$job['locked_at']===null,'External delivery must never replay automatically');}
jobCheck((int)mce_one('SELECT attempts FROM mce_jobs WHERE id=?',[$exhausted])['attempts']===5,'Recovery exceeded retry budget');
jobCheck(Jobs::run(1)['processed']===0,'Failed external jobs were replayed');

// Jobs interrupted after committing their result must be acknowledged, not replayed.
$owner=recoveryUser();$import=bin2hex(random_bytes(16));$export=bin2hex(random_bytes(16));
mce_query("INSERT INTO mce_imports(id,actor_id,document,errors,status) VALUES (?,?,'{}','[]','committed')",[$import,$owner]);
mce_query("INSERT INTO mce_exports(id,user_id,kind,status,expires_at) VALUES (?,?,'personal','ready',?)",[$export,$owner,mce_sqltime(mce_now()->modify('+1 day'))]);
mce_query("INSERT INTO mce_deliveries(user_id,local_date,type,status) VALUES (?,'2026-01-01','reminder','sent')",[$owner]);
$finished=[recoveryJob('import',['actorId'=>$owner,'importId'=>$import]),recoveryJob('export',['userId'=>$owner,'exportId'=>$export]),recoveryJob('reminder',['userId'=>$owner,'localDate'=>'2026-01-01'])];
$result=Jobs::run(1);jobCheck($result['recovery']['completed']===3&&$result['processed']===0,'Committed results must be acknowledged without replay');
foreach($finished as $id){$job=mce_one('SELECT * FROM mce_jobs WHERE id=?',[$id]);jobCheck($job['status']==='done'&&$job['payload']==='{}','Completed payload not cleared');}

// Interrupted import/export projections return to queued; partial export is rebuilt privately.
$import=bin2hex(random_bytes(16));$export=bin2hex(random_bytes(16));$file=bin2hex(random_bytes(16)).'.json';
$dir=ROOT_PATH.'/writable/exports';if(!is_dir($dir))mkdir($dir,0700,true);file_put_contents(Exports::file($file),'partial');
mce_query("INSERT INTO mce_imports(id,actor_id,document,errors,status) VALUES (?,?,'{}','[]','running')",[$import,$owner]);
mce_query("INSERT INTO mce_exports(id,user_id,kind,status,file_key,expires_at) VALUES (?,?,'personal','running',?,?)",[$export,$owner,$file,mce_sqltime(mce_now()->modify('+1 day'))]);
ImportStatus::write($import,40,100,'running');
$importJob=recoveryJob('import',['actorId'=>$owner,'importId'=>$import]);$exportJob=recoveryJob('export',['userId'=>$owner,'exportId'=>$export]);
jobCheck(Jobs::run(1)['recovery']['requeued']===2,'Interrupted import/export not requeued');
jobCheck(mce_one('SELECT status FROM mce_imports WHERE id=?',[$import])['status']==='queued','Import projection still running');
jobCheck((int)mce_one('SELECT processed FROM mce_import_progress WHERE import_id=?',[$import])['processed']===0,'Recovered import progress not reset');
jobCheck(mce_one('SELECT status FROM mce_exports WHERE id=?',[$export])['status']==='queued','Export projection still running');
mce_query('UPDATE mce_jobs SET available_at=? WHERE id=?',[mce_sqltime(),$exportJob]);
jobCheck(Jobs::run(1)['processed']===1,'Recovered export failed');
$ready=mce_one('SELECT * FROM mce_exports WHERE id=?',[$export]);
jobCheck($ready['status']==='ready'&&!is_file(Exports::file($file)),'Partial export was not replaced');
jobCheck(mce_decode(file_get_contents(Exports::file($ready['file_key'])))['kind']==='personal','Recovered export is not valid JSON');
Exports::deleteFor($owner);
// Keep the deliberately incomplete import fixture from being executed by later suites.
mce_query("UPDATE mce_jobs SET status='failed' WHERE id=?",[$importJob]);
echo "PASS: actual worker kill/restart, live-worker exclusion, backoff, retry budget, no uncertain delivery replay, committed result dedupe and partial export recovery\n";
