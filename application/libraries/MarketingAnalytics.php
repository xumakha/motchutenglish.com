<?php
declare(strict_types=1);
final class MarketingAnalytics {
    public static function labels(array $query,string $path): array {
        return [
            'source'=>in_array($query['utm_source']??'', ['direct','google','facebook','instagram','youtube','tiktok','newsletter','partner'],true)?$query['utm_source']:'direct',
            'medium'=>in_array($query['utm_medium']??'', ['none','organic','cpc','social','email','referral'],true)?$query['utm_medium']:'none',
            'campaign'=>($query['utm_campaign']??'')===$path?$path:''
        ];
    }
    public static function consent(?int $uid,bool $enabled): void {
        mce_transaction(function()use($uid,$enabled){
            if($uid) {
                mce_query('INSERT INTO mce_consents(user_id,analytics,client_id,updated_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE analytics=VALUES(analytics),updated_at=VALUES(updated_at)',[$uid,(int)$enabled,random_int(100000000,999999999).'.'.time(),mce_sqltime()]);
                if(!$enabled) {
                    mce_query('DELETE FROM mce_journeys WHERE user_id=?',[$uid]);
                    mce_query("DELETE FROM mce_jobs WHERE type='analytics' AND JSON_EXTRACT(payload,'$.userId')=?",[$uid]);
                }
            }
            if(!$enabled&&!empty($_SESSION['marketing_journey']))mce_query('DELETE FROM mce_journeys WHERE id=? AND user_id IS NULL',[$_SESSION['marketing_journey']]);
        });
        $_SESSION['marketing_consent']=$enabled;
        if(!$enabled)unset($_SESSION['marketing_journey']);
    }
    private static function allowed(?int $uid): bool {
        return $uid?(bool)(mce_one('SELECT analytics FROM mce_consents WHERE user_id=?',[$uid])['analytics']??false):!empty($_SESSION['marketing_consent']);
    }
    public static function landing(string $path,array $query): void {
        $uid=current_user()?mce_uid():null;if(!self::allowed($uid))return;
        if(!mce_one("SELECT id FROM mce_paths WHERE slug=? AND status='published'",[$path]))throw new ProductError(404,'Không tìm thấy chiến dịch.');
        $existing=$uid?mce_one('SELECT id FROM mce_journeys WHERE user_id=? AND landed_at>=? ORDER BY landed_at,id LIMIT 1',[$uid,mce_sqltime(mce_now()->modify('-30 days'))]):null;
        if(!$existing&&!empty($_SESSION['marketing_journey']))$existing=mce_one('SELECT id FROM mce_journeys WHERE id=? AND user_id <=> ? AND landed_at>=?',[$_SESSION['marketing_journey'],$uid,mce_sqltime(mce_now()->modify('-30 days'))]);
        if($existing){$_SESSION['marketing_journey']=$existing['id'];return;}
        $labels=self::labels($query,$path);$id=bin2hex(random_bytes(16));
        mce_query('INSERT INTO mce_journeys(id,user_id,path_slug,source,medium,campaign,landed_at) VALUES (?,?,?,?,?,?,?)',[$id,$uid,$path,$labels['source'],$labels['medium'],$labels['campaign'],mce_sqltime()]);$_SESSION['marketing_journey']=$id;
    }
    public static function claimGuest(int $uid): void {
        if(empty($_SESSION['marketing_consent'])||empty($_SESSION['marketing_journey']))return;
        $claimed=mce_query('UPDATE mce_journeys SET user_id=? WHERE id=? AND user_id IS NULL AND landed_at>=?',[$uid,$_SESSION['marketing_journey'],mce_sqltime(mce_now()->modify('-30 days'))])->rowCount();
        if($claimed)self::consent($uid,true);
    }
    public static function record(?int $uid,string $type,string $resource,string $at): void {
        if(!in_array($type,['signup_completed','lesson_started','lesson_completed'],true)||!self::allowed($uid))return;
        if($type==='lesson_started'&&(!($lesson=mce_one('SELECT subtype FROM mce_lessons WHERE id=?',[(int)$resource]))||$lesson['subtype']==='placement'))return;
        $cutoff=mce_sqltime((new DateTimeImmutable($at,new DateTimeZone('UTC')))->modify('-30 days'));
        $j=$uid?mce_one('SELECT * FROM mce_journeys WHERE user_id=? AND landed_at>=? ORDER BY landed_at,id LIMIT 1',[$uid,$cutoff]):(!empty($_SESSION['marketing_journey'])?mce_one('SELECT * FROM mce_journeys WHERE id=? AND user_id IS NULL AND landed_at>=?',[$_SESSION['marketing_journey'],$cutoff]):null);
        if(!$j)return;
        if(!$uid&&$type==='lesson_started')mce_query('UPDATE mce_journeys SET guest_trial_at=COALESCE(guest_trial_at,?) WHERE id=?',[$at,$j['id']]);
        elseif($uid&&$type==='signup_completed')mce_query('UPDATE mce_journeys SET signup_at=COALESCE(signup_at,?) WHERE id=?',[$at,$j['id']]);
        elseif($uid&&$j['signup_at']&&$type==='lesson_completed')mce_query('UPDATE mce_journeys SET first_lesson_at=COALESCE(first_lesson_at,?) WHERE id=?',[$at,$j['id']]);
        if($uid&&$j['first_lesson_at']&&in_array($type,['lesson_started','lesson_completed'],true))mce_query('UPDATE mce_journeys SET returned_at=COALESCE(returned_at,?) WHERE id=? AND first_lesson_at<=?',[$at,$j['id'],mce_sqltime((new DateTimeImmutable($at,new DateTimeZone('UTC')))->modify('-24 hours'))]);
    }
    public static function report(): array {
        return mce_all('SELECT path_slug,source,medium,campaign,COUNT(*) AS landings,SUM(guest_trial_at IS NOT NULL) AS trials,SUM(guest_trial_at IS NOT NULL AND signup_at IS NOT NULL) AS signups,SUM(guest_trial_at IS NOT NULL AND signup_at IS NOT NULL AND first_lesson_at IS NOT NULL) AS first_lessons,SUM(guest_trial_at IS NOT NULL AND signup_at IS NOT NULL AND first_lesson_at IS NOT NULL AND returned_at IS NOT NULL) AS returns FROM mce_journeys WHERE landed_at>=? GROUP BY path_slug,source,medium,campaign ORDER BY landings DESC,path_slug,source,medium,campaign LIMIT 100',[mce_sqltime(mce_now()->modify('-30 days'))]);
    }
    public static function configured(): bool {return (bool)(getenv('GA4_MEASUREMENT_ID')&&getenv('GA4_API_SECRET'));}
    public static function enqueue(string $eventId,int $uid,string $type,string $resource): void {
        if(!self::configured())return;
        $c=mce_one('SELECT analytics,client_id FROM mce_consents WHERE user_id=?',[$uid]);if(!$c||!$c['analytics'])return;
        $event=mce_one('SELECT occurred_at FROM mce_events WHERE id=?',[$eventId]);if(!$event)return;
        mce_query("INSERT IGNORE INTO mce_jobs(type,payload,event_key,available_at) VALUES ('analytics',?,?,?)",[mce_json(['userId'=>$uid,'clientId'=>$c['client_id'],'eventId'=>$eventId,'type'=>$type,'resource'=>$resource,'occurredAt'=>$event['occurred_at']]),'analytics:'.$eventId,mce_sqltime()]);
    }
    public static function payload(array $e): array {
        $at=new DateTimeImmutable($e['occurredAt'],new DateTimeZone('UTC'));
        return ['client_id'=>$e['clientId'],'timestamp_micros'=>$at->getTimestamp()*1000000,'consent'=>['ad_user_data'=>'DENIED','ad_personalization'=>'DENIED'],'events'=>[['name'=>$e['type'],'params'=>['event_id'=>$e['eventId'],'event_version'=>1,'resource_id'=>$e['resource'],'engagement_time_msec'=>1]]]];
    }
    public static function send(array $event): void {
        $consent=mce_one('SELECT analytics FROM mce_consents WHERE user_id=?',[(int)$event['userId']]);if(!$consent||!$consent['analytics'])return;
        if(!self::configured())throw new RuntimeException('Analytics not configured');
        $event['occurredAt']??=mce_one('SELECT occurred_at FROM mce_events WHERE id=?',[$event['eventId']])['occurred_at']??null;
        if(!$event['occurredAt'])throw new RuntimeException('Analytics original event time unavailable');
        if(new DateTimeImmutable($event['occurredAt'],new DateTimeZone('UTC'))<mce_now()->modify('-72 hours'))throw new RuntimeException('Analytics event too old; original time preserved, do not replay');
        $url='https://www.google-analytics.com/mp/collect?'.http_build_query(['measurement_id'=>getenv('GA4_MEASUREMENT_ID'),'api_secret'=>getenv('GA4_API_SECRET')]);
        $context=stream_context_create(['http'=>['method'=>'POST','header'=>"Content-Type: application/json\r\n",'content'=>mce_json(self::payload($event)),'timeout'=>10,'ignore_errors'=>true]]);
        $stream=@fopen($url,'rb',false,$context);if(!$stream)throw new RuntimeException('Analytics transport failed');
        $meta=stream_get_meta_data($stream);$status=$meta['wrapper_data'][0]??'';fclose($stream);
        if(!preg_match('/\s2\d\d\s/',$status))throw new RuntimeException('Analytics transport failed');
        // HTTP acceptance is not proof that GA4 processed the event. Verify payloads with Google's validation endpoint before launch.
    }
}
