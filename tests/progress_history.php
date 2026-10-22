<?php
declare(strict_types=1);
require dirname(__DIR__).'/application/core/bootstrap.php';
if(!preg_match('/^mce_auth_test_[a-f0-9]+$/D',app_config()['db_name']??''))throw new RuntimeException('Isolated DB required');
function progressCheck(bool $ok,string $why): void {if(!$ok)throw new RuntimeException($why);}
$uid=User_model::create('History fixture','history-'.bin2hex(random_bytes(6)).'@example.com',password_hash(bin2hex(random_bytes(16)),PASSWORD_DEFAULT));mce_profile($uid);
mce_query("UPDATE mce_profiles SET timezone='America/New_York',quest_timezone='America/New_York' WHERE user_id=?",[$uid]);
$sample=mce_one('SELECT * FROM mce_versions ORDER BY id LIMIT 1');$unit=(int)mce_query('SELECT id FROM mce_units LIMIT 1')->fetchColumn();
mce_query("INSERT INTO mce_lessons(unit_id,slug,archived) VALUES (?, ?,1)",[$unit,'history-'.bin2hex(random_bytes(6))]);$lesson=(int)db()->lastInsertId();
$versions=[];foreach(['Old saved title','New current title'] as $title){mce_query("INSERT INTO mce_versions(lesson_id,title,document,status,author_id) VALUES (?,?,?,'published',?)",[$lesson,$title,$sample['document'],$uid]);$versions[]=(int)db()->lastInsertId();}
mce_query('UPDATE mce_lessons SET current_version=? WHERE id=?',[$versions[1],$lesson]);
$clock=new DateTimeImmutable('2026-03-11T12:00:00Z'); // DST week starts Monday 04:00 UTC, not 05:00.
$ids=[];for($i=0;$i<35;$i++){
    $id=bin2hex(random_bytes(16));$ids[]=$id;
    $at=$i===0?'2026-03-09 03:59:59':($i===1?'2026-03-16 04:00:00':'2026-03-09 04:00:00');
    mce_query("INSERT INTO mce_attempts(id,user_id,version_id,mode,viewed,status,score,max_score,finished_at) VALUES (?,?,?,'practice','[]','finished',?,?,?)",[$id,$uid,$versions[0],$i===2?null:1,$i===2?null:2,$at]);
}
mce_query("INSERT INTO mce_attempts(id,user_id,version_id,mode,viewed,status,score,max_score,finished_at) VALUES (?,?,?,'preview','[]','finished',100,100,'2026-03-10 12:00:00')",[bin2hex(random_bytes(16)),$uid,$versions[0]]);
mce_query("INSERT INTO mce_activities(user_id,local_date,timezone,lessons,reviews) VALUES (?,'2026-03-09','America/New_York',2,3),(?,'2026-03-10','America/New_York',0,4)",[$uid,$uid]);
mce_query("INSERT INTO mce_active_time(user_id,local_date,seconds,last_pulse) VALUES (?,'2026-03-09',120,'2026-03-09 12:00:00')",[$uid]);
$a=Study::progressHistory($uid,0,1,$clock);$b=Study::progressHistory($uid,0,2,$clock);
progressCheck($a['weekStart']==='2026-03-09'&&$a['weekEnd']==='2026-03-15','Wrong local week');
progressCheck($a['weekTotals']===['lessons'=>2,'reviews'=>7,'activeDays'=>2]&&$a['weekSeconds']===120,'Weekly activity totals');
progressCheck((int)$a['weekScore']['score']===32&&(int)$a['weekScore']['max_score']===64,'DST bounds, preview or null score counted incorrectly');
progressCheck(count($a['history'])===30&&count($b['history'])===5&&$a['historyPaging']['total']===35,'History pagination');
progressCheck(!array_intersect(array_column($a['history'],'id'),array_column($b['history'],'id')),'Duplicate history pages');
progressCheck($a['history'][0]['title']==='Old saved title'&&(int)$a['history'][0]['version_id']===$versions[0],'History followed current version');
$_SESSION=['user'=>mce_one('SELECT id,name,email FROM users WHERE id=?',[$uid])];
progressCheck(Study::read($ids[0])['title']==='Old saved title','Archived result inaccessible');
$other=User_model::create('Other history','other-history-'.bin2hex(random_bytes(6)).'@example.com',password_hash('fixture',PASSWORD_DEFAULT));$_SESSION=['user'=>['id'=>$other]];
try{Study::read($ids[0]);throw new RuntimeException('History owner check failed');}catch(ProductError $e){progressCheck($e->status===404,'Wrong owner error');}
$empty=Study::progressHistory($other,0,1,$clock);progressCheck($empty['history']===[]&&$empty['weekScore']['max_score']===null,'Empty score should be null');
echo "PASS: A07 DST week boundaries, null/preview scores, totals, 35-result pagination, archived old version and owner isolation\n";
