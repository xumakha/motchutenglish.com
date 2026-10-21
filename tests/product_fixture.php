<?php
declare(strict_types=1);
require dirname(__DIR__).'/application/core/bootstrap.php';
if(!preg_match('/^mce_auth_test_[a-f0-9]+$/D',app_config()['db_name']??''))throw new RuntimeException('Isolated test DB required');
$op=$argv[1]??'';
if($op==='cms-state') {
    $kind=$argv[2];if(!in_array($kind,['paths','articles','vocabulary','vocabulary_sets'],true))throw new RuntimeException('Invalid fixture kind');$id=(int)$argv[3];
    echo mce_json(['row'=>mce_one('SELECT * FROM mce_'.$kind.' WHERE id=?',[$id]),'draft'=>mce_one('SELECT * FROM mce_entity_drafts WHERE kind=? AND entity_id=? ORDER BY id DESC LIMIT 1',[$kind,$id]),'article'=>mce_one('SELECT * FROM mce_article_versions WHERE article_id=? ORDER BY id DESC LIMIT 1',[$id]),'items'=>mce_all('SELECT sense_id FROM mce_vocabulary_set_items WHERE set_id=? ORDER BY sense_id',[$id])]);exit;
}
if($op==='authclear'){mce_query('DELETE FROM auth_attempts');exit;}
if($op==='streak') {
    $uid=(int)$argv[2];mce_transaction(function()use($uid,$argv){$p=Motivation::lock($uid);Motivation::streak($uid,$p,false,new DateTimeImmutable($argv[3],new DateTimeZone('UTC')));});echo "ok\n";exit;
}
if($op==='performance') {
    $lesson=mce_one("SELECT l.id FROM mce_lessons l WHERE slug='chao-hoi-tung-buoc'");$sessions=[];$hash=password_hash(bin2hex(random_bytes(20)),PASSWORD_DEFAULT);
    session_save_path(ROOT_PATH.'/writable/sessions');session_name('mce_session');
    for($i=0;$i<55;$i++) {
        $email='load-'.bin2hex(random_bytes(8)).'@example.com';$uid=User_model::create('Load test',$email,$hash);
        session_id(bin2hex(random_bytes(16)));session_start();sign_in(['id'=>$uid,'name'=>'Load test','email'=>$email]);
        $id=Study::start((int)$lesson['id'],bin2hex(random_bytes(16)));$sessions[]=['cookie'=>session_name().'='.session_id(),'csrf'=>$_SESSION['csrf'],'attempt'=>$id];session_write_close();$_SESSION=[];
    }
    echo mce_json($sessions);exit;
}
if($op==='mail-token') {
    $files=glob(ROOT_PATH.'/writable/mail/*.json');usort($files,fn($a,$b)=>filemtime($b)<=>filemtime($a));
    $found=[];foreach($files as $file){$m=mce_decode(file_get_contents($file));if(($m['recipient']??'')===$argv[2]&&str_contains($m['subject'],$argv[3]??''))$found[]=$m;}
    if(!$found)throw new RuntimeException('Mail was not delivered to development sink');
    $m=$found[0];preg_match('/#token=([a-f0-9]{64})/',$m['body'],$match);echo $match[1]??'';exit;
}
if($op==='user') {echo mce_json(mce_one('SELECT id,name,email FROM users WHERE id=?',[(int)$argv[2]]));exit;}
if($op==='privacy-check') {
    $uid=(int)$argv[2];$u=mce_one('SELECT name,email FROM users WHERE id=?',[$uid]);if($u['name']!=='Tài khoản đã xóa'||!str_ends_with($u['email'],'@invalid.local'))throw new RuntimeException('PII not erased');
    foreach(['user_vocabulary','review_cards','attempts','auth_tokens','reminders'] as $t)if((int)mce_query('SELECT COUNT(*) FROM mce_'.$t.' WHERE user_id=?',[$uid])->fetchColumn())throw new RuntimeException('Private data retained: '.$t);
    echo "PASS: queued account erasure removes PII, notes, attempts, review, tokens and reminders\n";exit;
}
if($op==='setup') {
    $result=[];
    foreach(['admin','editor','learner','other'] as $role){$email='product-'.$role.'-'.bin2hex(random_bytes(5)).'@example.com';$id=User_model::create($role,$email,password_hash('Product-test-123!',PASSWORD_DEFAULT));if(in_array($role,['admin','editor'],true))mce_query('INSERT INTO learning_roles(user_id,role) VALUES (?,?)',[$id,$role]);$result[$role]=['id'=>$id,'email'=>$email];}
    echo mce_json($result);exit;
}
if($op==='catalog') {
    $placement=mce_all("SELECT l.*,v.document,v.title,v.id AS version_id FROM mce_lessons l JOIN mce_versions v ON v.id=l.current_version WHERE l.subtype='placement' AND v.status='published'");
    echo mce_json(['paths'=>Content::paths(),'lessons'=>[...Content::lessons(),...$placement],'vocabulary'=>mce_all("SELECT * FROM mce_vocabulary WHERE status='published'")]);exit;
}
if($op==='coins') {
    $uid=(int)$argv[2];mce_transaction(function()use($uid){Motivation::lock($uid);Motivation::award($uid,'coin',100,'test-credit:'.$uid);});exit;
}
if($op==='verify') {
    $uid=(int)$argv[2];$attempt=$argv[3];$a=mce_one('SELECT * FROM mce_attempts WHERE id=?',[$attempt]);
    if($a['status']!=='finished'||(int)$a['score']!==6||(int)$a['max_score']!==6)throw new RuntimeException('Wrong persisted score');
    if((int)mce_query('SELECT COUNT(*) FROM mce_progress WHERE user_id=?',[$uid])->fetchColumn()!==1)throw new RuntimeException('Progress duplicated');
    $keys=mce_all("SELECT event_key FROM reward_ledger WHERE user_id=? AND currency='xp'",[$uid]);
    if(count($keys)!==3)throw new RuntimeException('Expected completion/pass/review rewards');
    $balance=(int)mce_query("SELECT SUM(amount) FROM reward_ledger WHERE user_id=? AND currency='coin'",[$uid])->fetchColumn();if($balance<0)throw new RuntimeException('Negative balance');
    if((int)mce_query('SELECT COUNT(*) FROM mce_review_events WHERE user_id=?',[$uid])->fetchColumn()!==1)throw new RuntimeException('Duplicate review event');
    echo "PASS: database score/progress, reward and review uniqueness, nonnegative coin balance\n";exit;
}
if($op==='purchase') {
    Motivation::purchase((int)$argv[2],$argv[3],$argv[4]);echo "ok\n";exit;
}
if($op==='submit') {
    $uid=(int)$argv[2];$u=mce_one('SELECT id,name,email FROM users WHERE id=?',[$uid]);$_SESSION=['user'=>$u,'csrf'=>'test'];Study::mutate($argv[3],mce_decode($argv[4]));echo "ok\n";exit;
}
if($op==='read-session-version'){echo mce_query('SELECT session_version FROM mce_profiles WHERE user_id=?',[(int)$argv[2]])->fetchColumn();exit;}
if($op==='environment'){echo mce_json(['php'=>PHP_VERSION,'database'=>mce_query('SELECT VERSION()')->fetchColumn(),'lessons'=>(int)mce_query('SELECT COUNT(*) FROM mce_lessons')->fetchColumn(),'attempts'=>(int)mce_query('SELECT COUNT(*) FROM mce_attempts')->fetchColumn()]);exit;}
throw new RuntimeException('Unknown test operation');
