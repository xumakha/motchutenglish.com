<?php
declare(strict_types=1);
final class Motivation {
    public static function lock(int $uid,bool $allowDeleted=false,?DateTimeImmutable $now=null): array {
        $now??=mce_now();
        $p=mce_profile($uid,true);
        if($p['deleted_at']&&!$allowDeleted)throw new ProductError(401,'Tài khoản đang được xóa.');
        $pending=mce_one('SELECT * FROM mce_timezone_changes WHERE user_id=?',[$uid]);
        if($pending&&$pending['effective_after']<=mce_sqltime($now)) {
            mce_query('UPDATE mce_profiles SET quest_timezone=? WHERE user_id=?',[$pending['timezone'],$uid]);
            $p['quest_timezone']=$pending['timezone'];mce_query('DELETE FROM mce_timezone_changes WHERE user_id=?',[$uid]);
        }
        if(mce_setting('gamification','1')==='0')$p['gamification']=0;
        return $p;
    }
    public static function award(int $uid,string $currency,int $amount,string $key): bool {
        if ($amount===0) return false;
        $inserted=mce_query('INSERT IGNORE INTO reward_ledger(user_id,currency,amount,event_key,rule_version) VALUES (?,?,?,?,1)',[$uid,$currency,$amount,'v2:'.$key])->rowCount()>0;
        if ($inserted) {
            mce_query('INSERT IGNORE INTO mce_balances(user_id,currency,amount) VALUES (?,?,0)',[$uid,$currency]);
            // Sum includes legacy rewards as well. All callers hold the profile lock.
            mce_query('UPDATE mce_balances SET amount=(SELECT COALESCE(SUM(amount),0) FROM reward_ledger WHERE user_id=? AND currency=?) WHERE user_id=? AND currency=?',[$uid,$currency,$uid,$currency]);
            mce_event('reward:'.$key,'reward_awarded',$currency,$uid);
        }
        return $inserted;
    }
    public static function day(array $profile,?DateTimeImmutable $now=null): string { return ($now??mce_now())->setTimezone(new DateTimeZone($profile['quest_timezone']))->format('Y-m-d'); }
    public static function quests(int $uid,array $p,?DateTimeImmutable $now=null): void {
        $now??=mce_now();$date=self::day($p,$now);
        if (mce_one('SELECT user_id FROM mce_quests WHERE user_id=? AND local_date=? LIMIT 1',[$uid,$date])) return;
        $available=Content::lessons();$count=count($available);
        $due=(int)mce_query('SELECT COUNT(*) FROM mce_review_cards WHERE user_id=? AND hidden=0 AND due_at<=?',[$uid,mce_sqltime($now)])->fetchColumn();
        if(!$count&&!$due)return;
        $objective=0;
        foreach($available as $v)foreach(mce_decode($v['document'])['exercises'] as $e)if(!in_array($e['type'],['self','flashcard'],true))$objective++;
        $tasks=$count?['lesson'=>1]:[];
        if ($due>0) $tasks['review']=min(5,$due); elseif($count) $tasks['practice']=1;
        if ($objective) $tasks['correct']=min(5,$objective);
        foreach($tasks as $type=>$target) mce_query('INSERT IGNORE INTO mce_quests(user_id,local_date,template,timezone,target) VALUES (?,?,?,?,?)',[$uid,$date,$type,$p['quest_timezone'],$target]);
    }
    public static function questEvent(int $uid,array $p,string $type,string $source): void {
        $date=self::day($p);$q=mce_one('SELECT * FROM mce_quests WHERE user_id=? AND local_date=? AND template=? FOR UPDATE',[$uid,$date,$type]);if(!$q) return;
        if($q['rewarded'])return;
        if (!mce_query('INSERT IGNORE INTO mce_quest_events(user_id,local_date,template,source_key) VALUES (?,?,?,?)',[$uid,$date,$type,$source])->rowCount()) return;
        $n=min((int)$q['target'],(int)$q['progress']+1);
        mce_query('UPDATE mce_quests SET progress=? WHERE user_id=? AND local_date=? AND template=?',[$n,$uid,$date,$type]);
        if ($n===(int)$q['target']&&!$q['rewarded']) {
            self::award($uid,'coin',5,'quest:'.$uid.':'.$date.':'.$type);
            mce_query('UPDATE mce_quests SET rewarded=1 WHERE user_id=? AND local_date=? AND template=?',[$uid,$date,$type]);
            mce_event('quest:'.$uid.':'.$date.':'.$type,'quest_completed',$type,$uid);
        }
        $left=(int)mce_query('SELECT COUNT(*) FROM mce_quests WHERE user_id=? AND local_date=? AND rewarded=0',[$uid,$date])->fetchColumn();
        if (!$left) self::award($uid,'coin',5,'quest-set:'.$uid.':'.$date);
    }
    public static function streak(int $uid,array $p,bool $learned=false,?DateTimeImmutable $now=null): array {
        $now??=mce_now();$today=self::day($p,$now);
        mce_query('INSERT IGNORE INTO mce_streak_state(user_id) VALUES (?)',[$uid]);
        $s=mce_one('SELECT * FROM mce_streak_state WHERE user_id=? FOR UPDATE',[$uid]);
        // A timezone change may move the displayed date backwards. Closed dates are immutable.
        if($s['last_date']&&$today<$s['last_date'])return $s;
        if ($s['last_date']) {
            $day=(new DateTimeImmutable($s['last_date'],new DateTimeZone('UTC')))->modify('+1 day');
            while($day->format('Y-m-d')<$today) {
                $date=$day->format('Y-m-d');$status='missed';
                if ($s['auto_protect']&&(int)$s['tickets']>0) {
                    $status='protected';$s['tickets']--;
                    mce_query('INSERT IGNORE INTO mce_inventory_events(user_id,event_key,amount,occurred_at) VALUES (?,?,?,?)',[$uid,'protect:'.$uid.':'.$date,-1,mce_sqltime($now)]);
                    mce_event('protect:'.$uid.':'.$date,'streak_protected',$date,$uid);
                } else $s['current_streak']=0;
                mce_query('INSERT IGNORE INTO mce_streak_calendar(user_id,local_date,status,timezone,evaluated_at) VALUES (?,?,?,?,?)',[$uid,$date,$status,$p['quest_timezone'],mce_sqltime($now)]);
                $s['last_date']=$date;$day=$day->modify('+1 day');
            }
        }
        if ($learned&&!mce_one('SELECT status FROM mce_streak_calendar WHERE user_id=? AND local_date=?',[$uid,$today])) {
            $s['current_streak']++;$s['learned_days']++;$s['longest_streak']=max((int)$s['longest_streak'],(int)$s['current_streak']);
            mce_query('INSERT INTO mce_streak_calendar(user_id,local_date,status,timezone,evaluated_at) VALUES (?,?,?,?,?)',[$uid,$today,'learned',$p['quest_timezone'],mce_sqltime($now)]);
            if ($s['learned_days']%7===0&&(int)$s['tickets']<2) {
                $s['tickets']++;mce_query('INSERT IGNORE INTO mce_inventory_events(user_id,event_key,amount,occurred_at) VALUES (?,?,1,?)',[$uid,'ticket:'.$uid.':'.$s['learned_days'],mce_sqltime($now)]);
            }
            $s['last_date']=$today;
        }
        mce_query('UPDATE mce_streak_state SET current_streak=?,longest_streak=?,learned_days=?,tickets=?,last_date=? WHERE user_id=?',[$s['current_streak'],$s['longest_streak'],$s['learned_days'],$s['tickets'],$s['last_date'],$uid]);
        return $s;
    }
    public static function activity(int $uid,array $p,string $kind): void {
        $column=$kind==='review'?'reviews':'lessons';$day=self::day($p);
        mce_query('INSERT INTO mce_activities(user_id,local_date,timezone,'.$column.') VALUES (?,?,?,1) ON DUPLICATE KEY UPDATE '.$column.'='.$column.'+1',[$uid,$day,$p['quest_timezone']]);
        self::streak($uid,$p,true);
        self::badges($uid);
    }
    public static function badges(int $uid): void {
        $rules=[
            'first_lesson'=>(int)mce_query('SELECT COUNT(*) FROM mce_progress WHERE user_id=?',[$uid])->fetchColumn()>=1,
            'seven_days'=>(int)mce_query('SELECT learned_days FROM mce_streak_state WHERE user_id=?',[$uid])->fetchColumn()>=7,
            'review_fifty'=>(int)mce_query('SELECT COUNT(DISTINCT card_id) FROM mce_review_events WHERE user_id=?',[$uid])->fetchColumn()>=50,
        ];
        $rules['first_unit']=(bool)mce_one("SELECT u.id FROM mce_units u JOIN mce_lessons l ON l.unit_id=u.id JOIN mce_versions v ON v.id=l.current_version LEFT JOIN mce_progress p ON p.lesson_id=l.id AND p.user_id=? WHERE l.required=1 AND l.archived=0 AND v.status='published' GROUP BY u.id HAVING COUNT(*)=COUNT(p.lesson_id) LIMIT 1",[$uid]);
        foreach($rules as $badge=>$ok) if($ok) mce_query('INSERT IGNORE INTO mce_badges(user_id,badge,awarded_at) VALUES (?,?,?)',[$uid,$badge,mce_sqltime()]);
    }
    public static function completion(int $uid,array $p,int $lessonId,string $subtype,bool $passed,bool $objective,bool $first): void {
        self::activity($uid,$p,'lesson');
        if (!$p['gamification']) return;
        $day=self::day($p);$base=$subtype==='checkpoint'?'checkpoint':'lesson';
        if ($first) self::award($uid,'xp',$subtype==='checkpoint'?30:20,$base.':'.$uid.':'.$lessonId);
        elseif ($subtype!=='checkpoint') {
            $firstReward=mce_one('SELECT created_at FROM reward_ledger WHERE event_key=?',['v2:lesson:'.$uid.':'.$lessonId]);
            $firstDay=$firstReward?(new DateTimeImmutable($firstReward['created_at'],new DateTimeZone('UTC')))->setTimezone(new DateTimeZone($p['quest_timezone']))->format('Y-m-d'):null;
            $prefix='v2:repeat:'.$uid.':'.$day.':';
            if($firstDay!==$day&&(int)mce_query('SELECT COUNT(*) FROM reward_ledger WHERE event_key LIKE ?',[$prefix.'%'])->fetchColumn()<2) self::award($uid,'xp',5,'repeat:'.$uid.':'.$day.':'.$lessonId);
        }
        if ($passed&&$objective&&$subtype!=='checkpoint') self::award($uid,'xp',5,'pass:'.$uid.':'.$lessonId);
        self::questEvent($uid,$p,'lesson','lesson:'.$lessonId);
        self::questEvent($uid,$p,'practice','lesson:'.$lessonId);
    }
    public static function purchase(int $uid,string $item,string $key): void {
        mce_transaction(function()use($uid,$item,$key){
            self::lock($uid);$key=mce_key($key);
            $prior=mce_one('SELECT * FROM mce_purchases WHERE request_key=?',[$key]);
            if ($prior) { if ((int)$prior['user_id']!==$uid||$prior['item_id']!==$item) throw new ProductError(409,'Mã yêu cầu đã được sử dụng.');return; }
            $i=mce_one('SELECT * FROM mce_shop WHERE id=? AND active=1',[$item]);if(!$i) throw new ProductError(404,'Vật phẩm không còn được bán.');
            if(mce_one('SELECT item_id FROM mce_inventory WHERE user_id=? AND item_id=?',[$uid,$item])) {
                mce_query('INSERT INTO mce_purchases(request_key,user_id,item_id,price,created_at) VALUES (?,?,?,?,?)',[$key,$uid,$item,0,mce_sqltime()]);return;
            }
            $balance=(int)mce_query("SELECT COALESCE(SUM(amount),0) FROM reward_ledger WHERE user_id=? AND currency='coin'",[$uid])->fetchColumn();
            if($balance<(int)$i['price']) throw new ProductError(422,'Bạn chưa đủ xu học tập. Hãy tiếp tục học và hoàn thành nhiệm vụ.');
            self::award($uid,'coin',-(int)$i['price'],'purchase:'.$key);
            mce_query('INSERT INTO mce_inventory(user_id,item_id,purchased_at) VALUES (?,?,?)',[$uid,$item,mce_sqltime()]);
            mce_query('INSERT INTO mce_purchases(request_key,user_id,item_id,price,created_at) VALUES (?,?,?,?,?)',[$key,$uid,$item,$i['price'],mce_sqltime()]);
            mce_event('purchase:'.$key,'reward_purchased',$item,$uid);
        });
    }
}
