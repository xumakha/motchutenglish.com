<?php
declare(strict_types=1);
final class Review {
    public static function schedule(string $rating,int $previous,DateTimeImmutable $now): array {
        if (!in_array($rating,['again','hard','good','easy'],true)||$previous<0) throw new ProductError(422,'Mức nhớ không hợp lệ.');
        $days=match($rating){'again'=>0,'hard'=>max(1,(int)ceil($previous*1.2)),'good'=>$previous===0?1:max(1,$previous*2),'easy'=>$previous===0?3:max(3,$previous*3)};
        $days=min(180,$days);
        // A scheduling day is exactly 24 hours elapsed in UTC, independent of DST.
        return ['intervalDays'=>$days,'dueAt'=>mce_sqltime($now->modify($rating==='again'?'+10 minutes':('+'.$days.' days'))),'algorithmVersion'=>1];
    }
    public static function add(int $uid,string $target,array $snapshot): void {
        mce_query('INSERT INTO mce_review_cards(user_id,target_key,snapshot,due_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE revision=revision+IF(hidden<>0,1,0),hidden=0',[$uid,$target,mce_json($snapshot),mce_sqltime()]);
    }
    public static function usedToday(int $uid,array $p): int {
        $start=new DateTimeImmutable(Motivation::day($p).' 00:00:00',new DateTimeZone($p['quest_timezone']));
        return (int)mce_query('SELECT COUNT(*) FROM mce_review_events WHERE user_id=? AND occurred_at>=? AND occurred_at<?',[$uid,mce_sqltime($start),mce_sqltime($start->modify('+1 day'))])->fetchColumn();
    }
    public static function rate(int $uid,int $cardId,string $rating,string $key,int $revision,bool $extra=false): array {
        return mce_transaction(function()use($uid,$cardId,$rating,$key,$revision,$extra){
            $p=Motivation::lock($uid);Motivation::quests($uid,$p);$key=mce_key($key);
            $prior=mce_one('SELECT * FROM mce_review_events WHERE request_key=?',[$key]);
            if($prior) { if((int)$prior['user_id']!==$uid||(int)$prior['card_id']!==$cardId||$prior['rating']!==$rating) throw new ProductError(409,'Yêu cầu đã được sử dụng.');return mce_decode($prior['new_schedule']); }
            $c=mce_one('SELECT * FROM mce_review_cards WHERE id=? AND user_id=? FOR UPDATE',[$cardId,$uid]);
            if(!$c) throw new ProductError(404,'Không tìm thấy thẻ ôn.');
            if(!$extra&&self::usedToday($uid,$p)>=(int)$p['review_limit'])throw new ProductError(422,'Bạn đã đạt giới hạn ôn hôm nay. Chọn Ôn thêm nếu muốn tiếp tục.');
            if((int)$c['revision']!==$revision) throw new ProductError(409,'Thẻ đã thay đổi ở tab khác. Vui lòng tải lại.');
            if($c['hidden']||$c['due_at']>mce_sqltime()) throw new ProductError(422,'Thẻ chưa đến hạn hoặc đã tạm ẩn.');
            $new=self::schedule($rating,(int)$c['interval_days'],mce_now());
            mce_query('UPDATE mce_review_cards SET interval_days=?,due_at=?,revision=revision+1 WHERE id=?',[$new['intervalDays'],$new['dueAt'],$cardId]);
            mce_query('INSERT INTO mce_review_events(user_id,card_id,request_key,rating,previous_schedule,new_schedule,occurred_at) VALUES (?,?,?,?,?,?,?)',[$uid,$cardId,$key,$rating,mce_json(['intervalDays'=>(int)$c['interval_days'],'dueAt'=>$c['due_at']]),mce_json($new),mce_sqltime()]);
            Motivation::activity($uid,$p,'review');
            if($p['gamification']) {
                $day=Motivation::day($p);$prefix='v2:review:'.$uid.':'.$day.':';
                if((int)mce_query('SELECT COUNT(*) FROM reward_ledger WHERE event_key LIKE ?',[$prefix.'%'])->fetchColumn()<10) Motivation::award($uid,'xp',2,'review:'.$uid.':'.$day.':'.$cardId);
                Motivation::questEvent($uid,$p,'review','card:'.$cardId);
            }
            mce_event('review:'.$key,'review_completed',(string)$cardId,$uid);return $new;
        });
    }
}
