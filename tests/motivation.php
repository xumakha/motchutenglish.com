<?php
declare(strict_types=1);
require dirname(__DIR__).'/application/core/bootstrap.php';
if(!preg_match('/^mce_auth_test_[a-f0-9]+$/D',app_config()['db_name']??''))throw new RuntimeException('Isolated test database required');
function invariant(bool $ok,string $message): void {if(!$ok)throw new RuntimeException($message);}
$uid=User_model::create('Streak test','streak-'.bin2hex(random_bytes(5)).'@example.com',password_hash(bin2hex(random_bytes(20)),PASSWORD_DEFAULT));
$p=mce_profile($uid);
foreach(range(1,7) as $day)mce_transaction(function()use($uid,$p,$day){Motivation::lock($uid);Motivation::streak($uid,$p,true,new DateTimeImmutable(sprintf('2026-01-%02d 05:00:00',$day),new DateTimeZone('UTC')));});
$s=mce_one('SELECT * FROM mce_streak_state WHERE user_id=?',[$uid]);invariant((int)$s['tickets']===1&&(int)$s['learned_days']===7,'Seven learned days grant one ticket');
$children=[];
for($i=0;$i<2;$i++){$pipes=[];$process=proc_open([PHP_BINARY,__DIR__.'/product_fixture.php','streak',(string)$uid,'2026-01-09T05:00:00Z'],[1=>['pipe','w'],2=>['pipe','w']],$pipes,ROOT_PATH);$children[]=[$process,$pipes];}
foreach($children as [$process,$pipes]){foreach($pipes as $pipe){$output=stream_get_contents($pipe);fclose($pipe);}invariant(proc_close($process)===0,'Concurrent streak evaluation failed');}
$s=mce_one('SELECT * FROM mce_streak_state WHERE user_id=?',[$uid]);invariant((int)$s['tickets']===0&&(int)$s['current_streak']===7&&(int)$s['learned_days']===7,'Protected day preserves streak without a learned day');
invariant((int)mce_query("SELECT COUNT(*) FROM mce_inventory_events WHERE user_id=? AND amount=-1",[$uid])->fetchColumn()===1,'Protection is idempotent');
mce_transaction(function()use($uid,$p){Motivation::lock($uid);Motivation::streak($uid,$p,true,new DateTimeImmutable('2026-01-09 05:00:00',new DateTimeZone('UTC')));});
mce_transaction(function()use($uid,$p){Motivation::lock($uid);Motivation::streak($uid,$p,true,new DateTimeImmutable('2026-01-11 05:00:00',new DateTimeZone('UTC')));});
$s=mce_one('SELECT * FROM mce_streak_state WHERE user_id=?',[$uid]);invariant((int)$s['current_streak']===1&&(int)$s['longest_streak']===8,'Missed day resets current and preserves longest');
mce_transaction(function()use($uid,$p){Motivation::lock($uid);Motivation::streak($uid,$p,true,new DateTimeImmutable('2026-01-10 05:00:00',new DateTimeZone('UTC')));});
$s=mce_one('SELECT * FROM mce_streak_state WHERE user_id=?',[$uid]);invariant($s['last_date']==='2026-01-11'&&(int)$s['learned_days']===9,'Backward local date cannot rewrite closed streak history');
invariant((int)mce_query('SELECT COUNT(*) FROM reward_ledger WHERE user_id=?',[$uid])->fetchColumn()===0,'Protection and login do not award XP');
mce_transaction(function()use($uid){$p=Motivation::lock($uid);Motivation::quests($uid,$p);});
$quests=mce_all('SELECT template,target FROM mce_quests WHERE user_id=?',[$uid]);
Review::add($uid,'test-added-later',['front'=>'one','back'=>'một']);
mce_transaction(function()use($uid){$p=Motivation::lock($uid);Motivation::quests($uid,$p);});
invariant($quests===mce_all('SELECT template,target FROM mce_quests WHERE user_id=?',[$uid]),'Quest target snapshot does not change after queue changes');
mce_transaction(function()use($uid){$p=Motivation::lock($uid);Motivation::award($uid,'coin',10,'motivation-test:'.$uid);});
mce_query("UPDATE mce_balances SET amount=999 WHERE user_id=? AND currency='coin'",[$uid]);Jobs::reconcile();
invariant((int)mce_query("SELECT amount FROM mce_balances WHERE user_id=? AND currency='coin'",[$uid])->fetchColumn()===10,'Balance reconciliation matches ledger');
$p['quest_timezone']='America/New_York';invariant(Motivation::day($p,new DateTimeImmutable('2026-03-08 04:59:00',new DateTimeZone('UTC')))==='2026-03-07','Local date before midnight');
echo "PASS: fixed-clock streak, protected/missed days, ticket idempotency, no retroactive XP, quest snapshot, ledger reconciliation and timezone boundary\n";
