<?php
declare(strict_types=1);
require dirname(__DIR__).'/application/core/bootstrap.php';
if(!preg_match('/^mce_auth_test_[a-f0-9]+$/D',app_config()['db_name']??''))throw new RuntimeException('Isolated DB required');
function importCheck(bool $ok,string $why): void {if(!$ok)throw new RuntimeException($why);}
$uid=User_model::create('Import fixture','imports-'.bin2hex(random_bytes(6)).'@example.com',password_hash(bin2hex(random_bytes(16)),PASSWORD_DEFAULT));mce_profile($uid);mce_query("INSERT INTO learning_roles(user_id,role) VALUES (?,'editor')",[$uid]);$_SESSION=['user'=>['id'=>$uid]];
$prefix='import-'.bin2hex(random_bytes(5));$unit=(int)mce_query('SELECT id FROM mce_units LIMIT 1')->fetchColumn();$template=mce_decode(file_get_contents(ROOT_PATH.'/database/templates/all-exercises.json'));$lessons=[];$expected=[];
foreach($template['exercises'] as $i=>$exercise){
    $p=&$exercise['payload'];$field=match($exercise['type']){'choice','listening_choice'=>'answerId','true_false'=>'answer','fill','listening_fill'=>'blanks','closed','correction'=>'acceptedAnswers','order'=>'acceptedOrders','match'=>'pairs','self','flashcard'=>'criteria'};
    if($field==='answerId')unset($p[$field]);
    elseif($field==='blanks'){$id=array_key_first($p['blanks']);$p['blanks'][$id]=[];$field.='.'.$id;}
    elseif($field==='pairs'){$id=array_key_first($p['pairs']);$p['pairs'][$id]['left']='';$field.='.'.$id.'.left';}
    elseif($field==='answer')$p[$field]='bad';
    elseif($field==='acceptedOrders'){$p[$field]=[[]];$field.='.0';}
    else $p[$field]=[];
    $d=$template;$d['exercises']=[$exercise];$lessons[]=['externalId'=>'e'.$i,'slug'=>$prefix.'-lesson-'.$i,'title'=>'Fixture','unitId'=>$unit,'document'=>$d];$expected[]='lessons.'.$i.'.document.exercises.0.payload.'.$field;unset($p);
}
$preview=Content::importPreview(mce_json(['schemaVersion'=>1,'namespace'=>$prefix,'lessons'=>$lessons]));
importCheck(array_column($preview['errors'],'field')===$expected,'Deep exercise paths: '.mce_json($preview['errors']));
$badPath=mce_decode(file_get_contents(ROOT_PATH.'/database/templates/paths.json'));$badPath['namespace']=$prefix.'-path';$badPath['paths'][0]['title']='';
importCheck(Content::importPreview(mce_json($badPath))['errors'][0]['field']==='paths.0.title','Metadata field path');
$csv="externalId,slug,lemma,part_of_speech,topic,meaning,example,translation,level\n".$prefix."-csv,".$prefix."-csv,,noun,tests,Meaning,Example,Translation,A1\n";
importCheck(Content::importPreview($csv)['errors'][0]['field']==='vocabulary.0.lemma','CSV field path');
$badDoc=$template;$badDoc['blocks'][0]['text']=[];$badDoc['exercises']=[];
$bad=Content::importPreview(mce_json(['schemaVersion'=>1,'namespace'=>$prefix.'-block','lessons'=>[['externalId'=>'block','slug'=>$prefix.'-block','title'=>'Block fixture','unitId'=>$unit,'document'=>$badDoc]]]));
importCheck($bad['errors'][0]['field']==='lessons.0.document.blocks.0.text','Block field path');
$word=fn($n)=>['externalId'=>'w'.$n,'slug'=>$prefix.'-word-'.$n,'lemma'=>'Word '.$n,'ipa'=>'','part_of_speech'=>'noun','topic'=>$prefix,'meaning'=>'Meaning','example'=>'Example','translation'=>'Translation','level'=>'A1'];
$batch=['schemaVersion'=>1,'namespace'=>$prefix,'vocabulary'=>[$word(1),$word(2),$word(3)]];$ready=Content::importPreview(mce_json($batch));importCheck(!$ready['errors'],'Valid batch rejected');
// A conflict introduced after dry-run must roll back earlier records and produce a useful path.
$r=$word(2);mce_query("INSERT INTO mce_vocabulary(slug,lemma,part_of_speech,topic,meaning,example,translation,level,status) VALUES (?,?,'noun',?,'M','E','T','A1','draft')",[$r['slug'],$r['lemma'],$prefix]);$conflict=(int)db()->lastInsertId();
try{Content::importCommit($ready['id']);throw new RuntimeException('Conflict did not fail');}catch(ProductError $e){importCheck($e->status===409,'Wrong conflict status');}
$failed=ImportStatus::read($ready['id']);importCheck($failed['status']==='failed'&&$failed['processed']===1&&$failed['committed']===0&&$failed['errors'][0]['field']==='vocabulary.1.slug','Rollback diagnostics');
importCheck(!mce_one('SELECT id FROM mce_vocabulary WHERE slug=?',[$word(1)['slug']]),'Partial content leaked');
mce_query('DELETE FROM mce_vocabulary WHERE id=?',[$conflict]);Content::importCommit($ready['id']);Content::importCommit($ready['id']);importCheck(ImportStatus::read($ready['id'])['committed']===3,'Retry did not commit once');
// Pause the real worker on record 51. Independent readers must see telemetry but zero content.
$rows=[];for($i=0;$i<101;$i++)$rows[]=$word(100+$i);$large=Content::importPreview(mce_json(['schemaVersion'=>1,'namespace'=>$prefix.'-large','vocabulary'=>$rows]));Content::importCommit($large['id']);
mce_query('UPDATE mce_jobs SET available_at=? WHERE event_key=?',['2000-01-01 00:00:00','import:'.$large['id']]);
$c=app_config();$blocker=new PDO('mysql:host='.$c['db_host'].';port='.($c['db_port']??3306).';dbname='.$c['db_name'].';charset=utf8mb4',$c['db_user'],$c['db_password']??'',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$blocker->beginTransaction();
$q=$blocker->prepare("INSERT INTO mce_vocabulary(slug,lemma,part_of_speech,topic,meaning,example,translation,level,status) VALUES (?,'Gate','noun',?,'M','E','T','A1','draft')");$q->execute([$rows[50]['slug'],$prefix]);
$worker=null;$pipes=[];
try{
    $worker=proc_open([PHP_BINARY,ROOT_PATH.'/database/worker.php','run','1'],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes,ROOT_PATH);fclose($pipes[0]);
    $deadline=microtime(true)+15;do{$state=ImportStatus::read($large['id']);if($state['processed']>=50)break;usleep(20000);}while(microtime(true)<$deadline);
    importCheck($state['processed']===50&&$state['committed']===0&&$state['total']===101,'Live telemetry not visible');
    importCheck((int)mce_query('SELECT COUNT(*) FROM mce_vocabulary WHERE slug LIKE ?',[$prefix.'-word-1%'])->fetchColumn()===1,'Uncommitted content visible'); // only word 1 from prior committed batch
    $blocker->rollBack();$stdout=stream_get_contents($pipes[1]);$stderr=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);$exit=proc_close($worker);$worker=null;
    importCheck($exit===0,'Worker failed: '.$stdout.$stderr);$state=ImportStatus::read($large['id']);importCheck($state['status']==='committed'&&$state['processed']===101&&$state['committed']===101,'Final commit count');
}finally{if($blocker->inTransaction())$blocker->rollBack();if(is_resource($worker)){proc_terminate($worker,9);foreach($pipes as $pipe)if(is_resource($pipe))fclose($pipe);proc_close($worker);}}
// A queued runtime conflict stays atomic and succeeds on the worker's scheduled retry.
$retryRows=[];for($i=0;$i<101;$i++)$retryRows[]=$word(300+$i);$retry=Content::importPreview(mce_json(['schemaVersion'=>1,'namespace'=>$prefix.'-retry','vocabulary'=>$retryRows]));Content::importCommit($retry['id']);
mce_query('UPDATE mce_jobs SET available_at=? WHERE event_key=?',['2000-01-01 00:00:00','import:'.$retry['id']]);
mce_query("INSERT INTO mce_vocabulary(slug,lemma,part_of_speech,topic,meaning,example,translation,level,status) VALUES (?,'Conflict','noun',?,'M','E','T','A1','draft')",[$retryRows[50]['slug'],$prefix]);$conflict=(int)db()->lastInsertId();
Jobs::run(1);$_SESSION=['user'=>['id'=>$uid]];$state=ImportStatus::read($retry['id']);importCheck($state['status']==='failed'&&$state['committed']===0&&$state['job']['status']==='pending'&&$state['errors'][0]['field']==='vocabulary.50.slug','Worker failure diagnostics/retry');
importCheck(!mce_one('SELECT id FROM mce_vocabulary WHERE slug=?',[$retryRows[0]['slug']]),'Queued failure partially committed');
mce_query('DELETE FROM mce_vocabulary WHERE id=?',[$conflict]);mce_query('UPDATE mce_jobs SET available_at=? WHERE event_key=?',['2000-01-01 00:00:00','import:'.$retry['id']]);Jobs::run(1);$_SESSION=['user'=>['id'=>$uid]];
importCheck(ImportStatus::read($retry['id'])['committed']===101,'Worker retry did not recover');
$other=User_model::create('Other importer','other-import-'.bin2hex(random_bytes(5)).'@example.com',password_hash('fixture',PASSWORD_DEFAULT));mce_query("INSERT INTO learning_roles(user_id,role) VALUES (?,'editor')",[$other]);$_SESSION=['user'=>['id'=>$other]];
try{ImportStatus::read($large['id']);throw new RuntimeException('Other editor read status');}catch(ProductError $e){importCheck($e->status===404,'Owner error status');}
echo "PASS: A11 all exercise field paths, rollback/retry diagnostics, live 50/101 telemetry with zero partial content, final counts and owner isolation\n";
