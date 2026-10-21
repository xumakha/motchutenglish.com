<?php
declare(strict_types=1);
require dirname(__DIR__).'/application/core/bootstrap.php';
if(!preg_match('/^mce_auth_test_[a-f0-9]+$/D',app_config()['db_name']??''))throw new RuntimeException('Isolated test database required');
function timezoneCheck(bool $ok,string $message): void {if(!$ok)throw new RuntimeException($message);}
function timezoneUser(): int {
    $uid=User_model::create('Timezone fixture','timezone-'.bin2hex(random_bytes(8)).'@example.com',password_hash(bin2hex(random_bytes(16)),PASSWORD_DEFAULT));mce_profile($uid);return $uid;
}
function timezoneEvent(int $uid,int $card,string $at): void {
    mce_query("INSERT INTO mce_review_events(user_id,card_id,request_key,rating,previous_schedule,new_schedule,occurred_at) VALUES (?,?,?,'good','{}','{}',?)",[$uid,$card,bin2hex(random_bytes(16)),$at]);
}
$clock=new DateTimeImmutable('2026-01-02T00:00:00Z');$uid=timezoneUser();
mce_query("UPDATE mce_profiles SET timezone='America/Los_Angeles',quest_timezone='UTC',review_limit=1 WHERE user_id=?",[$uid]);
Review::add($uid,'timezone-rated',['front'=>'one','back'=>'một']);$card=(int)db()->lastInsertId();
mce_query('UPDATE mce_review_cards SET due_at=? WHERE id=?',['2026-01-03 00:00:00',$card]);
timezoneEvent($uid,$card,'2026-01-01 12:00:00');
Review::add($uid,'timezone-due',['front'=>'two','back'=>'hai']);$due=(int)db()->lastInsertId();
mce_query('UPDATE mce_review_cards SET due_at=? WHERE id=?',['2026-01-01 00:00:00',$due]);
mce_query("INSERT INTO mce_timezone_changes(user_id,timezone,effective_after) VALUES (?,'America/Los_Angeles',?)",[$uid,mce_sqltime($clock)]);
mce_query("INSERT INTO mce_streak_calendar(user_id,local_date,status,timezone,evaluated_at) VALUES (?,'2026-01-01','learned','UTC','2026-01-01 12:00:00')",[$uid]);
$before=Review::queue($uid,false,false,$clock->modify('-1 second'));
timezoneCheck($before['profile']['quest_timezone']==='UTC','Future timezone applied before its boundary');
$at=Review::queue($uid,false,false,$clock);
timezoneCheck($at['profile']['quest_timezone']==='America/Los_Angeles'&&$at['used']===1&&$at['cards']===[],'Queue did not apply timezone before daily cap');
timezoneCheck(count(Review::queue($uid,true,false,$clock)['cards'])===1,'Voluntary extra queue changed at boundary');
timezoneCheck(!mce_one('SELECT user_id FROM mce_timezone_changes WHERE user_id=?',[$uid]),'Applied timezone change not consumed');
timezoneCheck(mce_one('SELECT timezone FROM mce_streak_calendar WHERE user_id=?',[$uid])['timezone']==='UTC','Closed history timezone was rewritten');
timezoneCheck(mce_one('SELECT timezone FROM mce_quests WHERE user_id=? LIMIT 1',[$uid])['timezone']==='UTC','Existing quest snapshot was rewritten');
$count=(int)mce_query('SELECT COUNT(*) FROM mce_quests WHERE user_id=?',[$uid])->fetchColumn();Review::queue($uid,false,false,$clock);
timezoneCheck((int)mce_query('SELECT COUNT(*) FROM mce_quests WHERE user_id=?',[$uid])->fetchColumn()===$count,'Repeated boundary read duplicated quests');

// A frozen local calendar day is 23/25 hours on DST transitions, not always 24h.
$dst=timezoneUser();Review::add($dst,'dst',['front'=>'DST','back'=>'day']);$dstCard=(int)db()->lastInsertId();
$profile=mce_profile($dst);$profile['quest_timezone']='America/New_York';
foreach(['2026-03-08 04:59:59','2026-03-08 05:00:00','2026-03-09 03:59:59','2026-03-09 04:00:00','2026-11-01 03:59:59','2026-11-01 04:00:00','2026-11-02 04:59:59','2026-11-02 05:00:00'] as $time)timezoneEvent($dst,$dstCard,$time);
timezoneCheck(Review::usedToday($dst,$profile,new DateTimeImmutable('2026-03-08T18:00:00Z'))===2,'Spring DST local-day bounds incorrect');
timezoneCheck(Review::usedToday($dst,$profile,new DateTimeImmutable('2026-11-01T18:00:00Z'))===2,'Fall DST local-day bounds incorrect');

$oldDriver=getenv('MAIL_DRIVER');putenv('MAIL_DRIVER=log');
try {
    // At UTC midnight, the newly effective Los Angeles day is still Jan 1 at 16:00.
    $reminder=timezoneUser();
    mce_query("UPDATE mce_profiles SET timezone='America/Los_Angeles',quest_timezone='UTC',verified_at=? WHERE user_id=?",[mce_sqltime($clock),$reminder]);
    mce_query("INSERT INTO mce_reminders(user_id,enabled,hour,unsubscribe_hash) VALUES (?,1,12,?)",[$reminder,hash('sha256',random_bytes(32))]);
    mce_query("INSERT INTO mce_timezone_changes(user_id,timezone,effective_after) VALUES (?,'America/Los_Angeles',?)",[$reminder,mce_sqltime($clock)]);
    Jobs::tick($clock->modify('-1 second'));
    timezoneCheck((int)mce_query('SELECT COUNT(*) FROM mce_deliveries WHERE user_id=?',[$reminder])->fetchColumn()===1,'Expected pre-boundary Jan 1 reminder');
    // Remove that delivery to isolate scheduling on the exact boundary.
    mce_query("DELETE FROM mce_jobs WHERE event_key=?",['reminder:'.$reminder.':2026-01-01']);mce_query('DELETE FROM mce_deliveries WHERE user_id=?',[$reminder]);
    Jobs::tick($clock);Jobs::tick($clock);
    $deliveries=mce_all('SELECT local_date FROM mce_deliveries WHERE user_id=?',[$reminder]);
    timezoneCheck(count($deliveries)===1&&$deliveries[0]['local_date']==='2026-01-01','Tick used stale day/hour or duplicated reminder');
    mce_query("DELETE FROM mce_jobs WHERE event_key=?",['reminder:'.$reminder.':2026-01-01']);mce_query('DELETE FROM mce_deliveries WHERE user_id=?',[$reminder]);
    mce_query("INSERT INTO mce_activities(user_id,local_date,timezone,lessons) VALUES (?,'2026-01-01','America/Los_Angeles',1)",[$reminder]);
    Jobs::tick($clock);
    timezoneCheck(!mce_one('SELECT user_id FROM mce_deliveries WHERE user_id=?',[$reminder]),'Tick ignored activity on the effective local date');
    mce_query('UPDATE mce_reminders SET enabled=0 WHERE user_id=?',[$reminder]);

    // A queued reminder must re-apply timezone even without a preceding cron tick.
    $now=mce_now();$send=timezoneUser();$oldDate=$now->setTimezone(new DateTimeZone('Etc/GMT+12'))->format('Y-m-d');
    mce_query("UPDATE mce_profiles SET timezone='Pacific/Kiritimati',quest_timezone='Etc/GMT+12',verified_at=? WHERE user_id=?",[mce_sqltime($now),$send]);
    mce_query("INSERT INTO mce_timezone_changes(user_id,timezone,effective_after) VALUES (?,'Pacific/Kiritimati',?)",[$send,mce_sqltime($now->modify('-1 minute'))]);
    mce_query('INSERT INTO mce_reminders(user_id,enabled,hour,unsubscribe_hash) VALUES (?,1,0,?)',[$send,hash('sha256',random_bytes(32))]);
    mce_query("INSERT INTO mce_deliveries(user_id,local_date,type,status) VALUES (?,?,'reminder','queued')",[$send,$oldDate]);
    mce_query("INSERT INTO mce_jobs(type,payload,event_key,available_at) VALUES ('reminder',?,?,?)",[mce_json(['userId'=>$send,'localDate'=>$oldDate]),'reminder:'.$send.':'.$oldDate,mce_sqltime($now)]);
    $files=count(glob(ROOT_PATH.'/writable/mail/*.json')?:[]);Jobs::run(20);
    timezoneCheck(mce_one('SELECT status FROM mce_deliveries WHERE user_id=?',[$send])['status']==='skipped','Send-time check used old timezone');
    timezoneCheck(count(glob(ROOT_PATH.'/writable/mail/*.json')?:[])===$files,'Stale-day reminder was sent');
    mce_query('UPDATE mce_reminders SET enabled=0 WHERE user_id=?',[$send]);
} finally {putenv($oldDriver===false?'MAIL_DRIVER':'MAIL_DRIVER='.$oldDriver);}
echo "PASS: frozen-clock timezone activation, shared review cap, no snapshot rewrite, DST day bounds, tick local day/hour/dedupe and send-time stale reminder suppression\n";
