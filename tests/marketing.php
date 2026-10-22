<?php
declare(strict_types=1);
require dirname(__DIR__).'/application/core/bootstrap.php';
if(!preg_match('/^mce_auth_test_[a-f0-9]+$/D',app_config()['db_name']??''))throw new RuntimeException('Isolated DB required');
function marketingCheck(bool $ok,string $why): void {if(!$ok)throw new RuntimeException($why);}
$path=Content::paths()[0];$lesson=Content::lessons((int)$path['id'])[0];$_SESSION=[];
$before=(int)mce_query('SELECT COUNT(*) FROM mce_journeys')->fetchColumn();
MarketingAnalytics::landing($path['slug'],['utm_source'=>'private@example.com']);
marketingCheck((int)mce_query('SELECT COUNT(*) FROM mce_journeys')->fetchColumn()===$before,'Recorded without consent');
marketingCheck(MarketingAnalytics::labels(['utm_source'=>'private@example.com','utm_campaign'=>'secret','utm_medium'=>['bad']],$path['slug'])===['source'=>'direct','medium'=>'none','campaign'=>''],'Unsafe UTM persisted');
MarketingAnalytics::consent(null,true);MarketingAnalytics::landing($path['slug'],['utm_source'=>'newsletter','utm_medium'=>'email','utm_campaign'=>$path['slug']]);$id=$_SESSION['marketing_journey'];
MarketingAnalytics::landing($path['slug'],['utm_source'=>'google']);marketingCheck($_SESSION['marketing_journey']===$id,'Reload overwrote first touch');
$at=mce_sqltime();MarketingAnalytics::record(null,'lesson_started',(string)$lesson['id'],$at);
$uid=User_model::create('Marketing fixture','marketing-'.bin2hex(random_bytes(6)).'@example.com',password_hash(bin2hex(random_bytes(16)),PASSWORD_DEFAULT));
MarketingAnalytics::claimGuest($uid);$_SESSION['user']=['id'=>$uid];
MarketingAnalytics::record($uid,'signup_completed','account',$at);MarketingAnalytics::record($uid,'lesson_completed',(string)$lesson['id'],$at);
MarketingAnalytics::record($uid,'lesson_started',(string)$lesson['id'],mce_sqltime(mce_now()->modify('+23 hours')));
marketingCheck(mce_one('SELECT returned_at FROM mce_journeys WHERE id=?',[$id])['returned_at']===null,'Same-day learning counted as return');
MarketingAnalytics::record($uid,'lesson_started',(string)$lesson['id'],mce_sqltime(mce_now()->modify('+25 hours')));
$j=mce_one('SELECT * FROM mce_journeys WHERE id=?',[$id]);marketingCheck($j['guest_trial_at']&&$j['signup_at']&&$j['first_lesson_at']&&$j['returned_at']&&$j['source']==='newsletter','Incomplete funnel');
marketingCheck(count(Identity::export($uid)['journeys'])===1,'Personal export omitted journey');
$report=MarketingAnalytics::report();marketingCheck(array_sum(array_column($report,'returns'))>=1,'Report missing return');
putenv('GA4_MEASUREMENT_ID=G-TEST');putenv('GA4_API_SECRET=fixture-not-real');
$event=bin2hex(random_bytes(16));$original=mce_sqltime(mce_now()->modify('-1 hour'));
mce_query('INSERT INTO mce_events(id,event_key,user_id,type,resource_id,occurred_at) VALUES (?,?,?,?,?,?)',[$event,'marketing-test:'.$event,$uid,'lesson_completed',(string)$lesson['id'],$original]);
MarketingAnalytics::enqueue($event,$uid,'lesson_completed',(string)$lesson['id']);
$job=mce_one("SELECT payload FROM mce_jobs WHERE event_key=?",['analytics:'.$event]);$data=mce_decode($job['payload']);$payload=MarketingAnalytics::payload($data);
marketingCheck($payload['timestamp_micros']===(new DateTimeImmutable($original,new DateTimeZone('UTC')))->getTimestamp()*1000000,'Original time lost in queue');
marketingCheck(!isset($payload['user_id'])&&!str_contains(mce_json($payload),'@example.com'),'PII in external analytics');
$old=$data;$old['occurredAt']=mce_sqltime(mce_now()->modify('-73 hours'));
try{MarketingAnalytics::send($old);throw new RuntimeException('Expired event sent');}catch(RuntimeException $e){marketingCheck(str_contains($e->getMessage(),'too old'),'Unexpected expired-event error');}
MarketingAnalytics::consent($uid,false);
marketingCheck(!mce_one('SELECT id FROM mce_journeys WHERE user_id=?',[$uid])&&!mce_one('SELECT id FROM mce_jobs WHERE event_key=?',['analytics:'.$event]),'Withdrawal kept marketing data/jobs');
MarketingAnalytics::record($uid,'lesson_completed',(string)$lesson['id'],$at);marketingCheck(!mce_one('SELECT id FROM mce_journeys WHERE user_id=?',[$uid]),'Recorded after withdrawal');
putenv('GA4_MEASUREMENT_ID=');putenv('GA4_API_SECRET=');
$_SESSION=[];MarketingAnalytics::consent(null,true);MarketingAnalytics::landing($path['slug'],[]);$expired=$_SESSION['marketing_journey'];
mce_query('UPDATE mce_journeys SET landed_at=? WHERE id=?',[mce_sqltime(mce_now()->modify('-31 days')),$expired]);
MarketingAnalytics::claimGuest($uid);marketingCheck(mce_one('SELECT user_id FROM mce_journeys WHERE id=?',[$expired])['user_id']===null,'Expired guest attribution attached');
MarketingAnalytics::consent(null,false);marketingCheck(!mce_one('SELECT id FROM mce_journeys WHERE id=?',[$expired]),'Anonymous withdrawal retained journey');
$_SESSION=['user'=>['id'=>$uid]];MarketingAnalytics::consent($uid,true);MarketingAnalytics::landing($path['slug'],[]);
Identity::erase($uid);marketingCheck(!mce_one('SELECT id FROM mce_journeys WHERE user_id=?',[$uid]),'Account erasure retained journey');

echo "PASS: A08 opt-in funnel, safe first-touch labels, signup association, 24-hour return, withdrawal and original GA4 time (no external requests)\n";
