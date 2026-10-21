<?php
declare(strict_types=1);
require dirname(__DIR__).'/application/core/bootstrap.php';
if(!preg_match('/^mce_auth_test_[a-f0-9]+$/D',app_config()['db_name']??''))throw new RuntimeException('Isolated test database required');
if(($argv[1]??'')==='state') {
    $uid=(int)$argv[2];echo mce_json(['timezone'=>mce_profile($uid)['quest_timezone'],'pending'=>(int)mce_query('SELECT COUNT(*) FROM mce_timezone_changes WHERE user_id=?',[$uid])->fetchColumn()]);exit;
}
if(($argv[1]??'')!=='setup')throw new RuntimeException('Unknown fixture operation');
$email='timezone-http-'.bin2hex(random_bytes(8)).'@example.com';$uid=User_model::create('Timezone HTTP',$email,password_hash('Timezone-http-test-123!',PASSWORD_DEFAULT));mce_profile($uid);
$now=mce_now();$oldTz=new DateTimeZone('Etc/GMT+12');$newTz=new DateTimeZone('Pacific/Kiritimati');
$oldStart=$now->setTimezone($oldTz)->setTime(0,0);$newStart=$now->setTimezone($newTz)->setTime(0,0);
$eventAt=$newStart<$oldStart?$newStart:$oldStart;$expectedUsed=$newStart<$oldStart?1:0;
mce_query("UPDATE mce_profiles SET timezone='Pacific/Kiritimati',quest_timezone='Etc/GMT+12',review_limit=1 WHERE user_id=?",[$uid]);
mce_query("INSERT INTO mce_timezone_changes(user_id,timezone,effective_after) VALUES (?,'Pacific/Kiritimati',?)",[$uid,mce_sqltime($now->modify('-1 minute'))]);
Review::add($uid,'timezone-http-rated',['front'=>'Rated','back'=>'Done']);$rated=(int)db()->lastInsertId();
mce_query('UPDATE mce_review_cards SET due_at=? WHERE id=?',[mce_sqltime($now->modify('+2 days')),$rated]);
mce_query("INSERT INTO mce_review_events(user_id,card_id,request_key,rating,previous_schedule,new_schedule,occurred_at) VALUES (?,?,?,'good','{}','{}',?)",[$uid,$rated,bin2hex(random_bytes(16)),mce_sqltime($eventAt)]);
Review::add($uid,'timezone-http-due',['front'=>'Timezone HTTP due','back'=>'Due']);$due=(int)db()->lastInsertId();
mce_query('UPDATE mce_review_cards SET due_at=? WHERE id=?',[mce_sqltime($now->modify('-1 day')),$due]);
echo mce_json(['id'=>$uid,'email'=>$email,'used'=>$expectedUsed,'queueCount'=>1-$expectedUsed,'dueId'=>$due]);
