<?php
declare(strict_types=1);
require dirname(__DIR__).'/application/core/bootstrap.php';
if(!preg_match('/^mce_auth_test_[a-f0-9]+$/D',app_config()['db_name']??''))throw new RuntimeException('Isolated test DB required');
$op=$argv[1]??'';
if($op==='review-card-count') {echo (int)mce_query('SELECT COUNT(*) FROM mce_review_cards WHERE user_id=?',[(int)$argv[2]])->fetchColumn();exit;}
if($op==='browser-flashcard') {
    $source=mce_one("SELECT v.*,l.unit_id FROM mce_versions v JOIN mce_lessons l ON l.current_version=v.id WHERE v.status='published' ORDER BY v.id LIMIT 1");
    $doc=mce_decode($source['document']);$doc['blocks']=[];$doc['preview']=true;
    $doc['exercises']=[['id'=>'memory','type'=>'flashcard','schemaVersion'=>1,'contentVersion'=>1,'level'=>'A1','skillTags'=>['memory'],'payload'=>['prompt'=>'Remember family','modelAnswer'=>'PRIVATE-FLASHCARD-BACK — family means gia đình.','criteria'=>['Nhớ nghĩa gia đình','Đặt câu phù hợp']],'explanation'=>'Đối chiếu với mẫu, không tự động chấm điểm.']];
    Assessment::document($doc,true);
    mce_query('INSERT INTO mce_lessons(unit_id,slug,required) VALUES (?,?,0)',[$source['unit_id'],'browser-card-'.bin2hex(random_bytes(5))]);$lesson=(int)db()->lastInsertId();
    mce_query("INSERT INTO mce_versions(lesson_id,title,document,status,author_id,published_at) VALUES (?,?,?,'published',?,?)",[$lesson,'Browser flashcard',mce_json($doc),$source['author_id'],mce_sqltime()]);
    mce_query('UPDATE mce_lessons SET current_version=? WHERE id=?',[(int)db()->lastInsertId(),$lesson]);echo $lesson;exit;
}
if($op==='review-audio') {
    $uid=(int)$argv[2];$audio=(int)$argv[3];
    mce_query("INSERT INTO mce_vocabulary(slug,lemma,ipa,part_of_speech,topic,meaning,example,translation,level,audio_id,status) VALUES (?,'Audio review','IPA-TEST','noun','audio-review','Audio meaning','Audio example','Audio translation','A1',?,'published')",['audio-review-'.$uid,$audio]);
    echo db()->lastInsertId();exit;
}
if($op==='review-audio-state') {
    $uid=(int)$argv[2];$sense=(int)$argv[3];
    if(!empty($argv[4]))mce_query("UPDATE mce_vocabulary SET status='archived',part_of_speech='changed' WHERE id=?",[$sense]);
    echo mce_json(mce_one('SELECT snapshot FROM mce_review_cards WHERE user_id=? AND target_key=?',[$uid,'sense:'.$sense]));exit;
}
if($op==='browser-review') {
    $u=mce_one('SELECT id FROM users WHERE email=?',[$argv[2]]);if(!$u)throw new RuntimeException('Missing browser test user');
    $audio=mce_one("SELECT id FROM mce_media WHERE mime LIKE 'audio/%' ORDER BY id DESC LIMIT 1");
    Review::add((int)$u['id'],'browser-audio',['front'=>'Browser review','back'=>'Meaning','partOfSpeech'=>'noun','audioId'=>(int)$audio['id']]);
    Review::add((int)$u['id'],'browser-legacy',['front'=>'Legacy review','back'=>'Legacy meaning']);exit;
}
if($op==='cms-state') {
    $kind=$argv[2];if(!in_array($kind,['paths','articles','vocabulary','vocabulary_sets'],true))throw new RuntimeException('Invalid fixture kind');$id=(int)$argv[3];
    echo mce_json(['row'=>mce_one('SELECT * FROM mce_'.$kind.' WHERE id=?',[$id]),'draft'=>mce_one('SELECT * FROM mce_entity_drafts WHERE kind=? AND entity_id=? ORDER BY id DESC LIMIT 1',[$kind,$id]),'article'=>mce_one('SELECT * FROM mce_article_versions WHERE article_id=? ORDER BY id DESC LIMIT 1',[$id]),'items'=>mce_all('SELECT sense_id FROM mce_vocabulary_set_items WHERE set_id=? ORDER BY sense_id',[$id])]);exit;
}
if($op==='pagination') {
    $uid=(int)$argv[2];
    mce_transaction(function()use($uid){for($i=0;$i<121;$i++){
        $slug='paging-'.$uid.'-'.$i;
        mce_query("INSERT INTO mce_vocabulary(slug,lemma,ipa,part_of_speech,topic,meaning,example,translation,level,status) VALUES (?,?,?,'noun','paging','Pagination meaning','Example','Translation','A1','published')",[$slug,'Paging '.$i,'']);
        $id=(int)db()->lastInsertId();mce_query('INSERT INTO mce_user_vocabulary(user_id,sense_id,notes) VALUES (?,?,?)',[$uid,$id,'PRIVATE-PAGING-'.$uid]);
        Review::add($uid,'sense:'.$id,['front'=>'Paging '.$i,'back'=>'Meaning']);
        if($i%2===0)mce_query('UPDATE mce_review_cards SET hidden=1 WHERE user_id=? AND target_key=?',[$uid,'sense:'.$id]);
    }});exit;
}
if($op==='marketing-state') {
    $u=mce_one('SELECT id FROM users WHERE email=?',[$argv[2]]);echo mce_json($u?mce_all('SELECT * FROM mce_journeys WHERE user_id=?',[$u['id']]):[]);exit;
}
if($op==='seo-source') {
    $kind=$argv[2];if(!in_array($kind,['paths','vocabulary','articles','vocabulary_sets'],true))throw new RuntimeException('Invalid kind');
    echo mce_json(mce_one("SELECT * FROM mce_".$kind." WHERE status='published' ORDER BY id LIMIT 1"));exit;
}
if($op==='browser-role') {
    $u=mce_one('SELECT id FROM users WHERE email=?',[$argv[2]]);if(!$u)throw new RuntimeException('Missing browser user');
    mce_query("INSERT INTO learning_roles(user_id,role) VALUES (?,'admin') ON DUPLICATE KEY UPDATE role='admin'",[$u['id']]);exit;
}
if($op==='browser-import') {
    $u=mce_one('SELECT id,name,email FROM users WHERE email=?',[$argv[2]]);if(!$u)throw new RuntimeException('Missing browser user');$_SESSION=['user'=>$u];
    $prefix='browser-import-'.bin2hex(random_bytes(4));$rows=[];for($i=0;$i<101;$i++)$rows[]=['externalId'=>'a'.$i,'slug'=>$prefix.'-'.$i,'title'=>'Browser import '.$i,'body'=>'Owned test content'];
    $preview=Content::importPreview(mce_json(['schemaVersion'=>1,'namespace'=>$prefix,'articles'=>$rows]));if($preview['errors'])throw new RuntimeException('Invalid browser import fixture');Content::importCommit($preview['id']);
    mce_query('UPDATE mce_jobs SET available_at=? WHERE event_key=?',['2000-01-01 00:00:00','import:'.$preview['id']]);echo $preview['id'];exit;
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
