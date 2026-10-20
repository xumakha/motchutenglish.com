<?php
declare(strict_types=1);
final class MarketingAnalytics {
    public static function configured(): bool {return (bool)(getenv('GA4_MEASUREMENT_ID')&&getenv('GA4_API_SECRET'));}
    public static function enqueue(string $eventId,int $uid,string $type,string $resource): void {
        if(!self::configured())return;
        $c=mce_one('SELECT analytics,client_id FROM mce_consents WHERE user_id=?',[$uid]);if(!$c||!$c['analytics'])return;
        mce_query("INSERT IGNORE INTO mce_jobs(type,payload,event_key,available_at) VALUES ('analytics',?,?,?)",[mce_json(['userId'=>$uid,'clientId'=>$c['client_id'],'eventId'=>$eventId,'type'=>$type,'resource'=>$resource]),'analytics:'.$eventId,mce_sqltime()]);
    }
    public static function payload(array $e): array {
        return ['client_id'=>$e['clientId'],'consent'=>['ad_user_data'=>'DENIED','ad_personalization'=>'DENIED'],'events'=>[['name'=>$e['type'],'params'=>['event_id'=>$e['eventId'],'event_version'=>1,'resource_id'=>$e['resource'],'engagement_time_msec'=>1]]]];
    }
    public static function send(array $event): void {
        $consent=mce_one('SELECT analytics FROM mce_consents WHERE user_id=?',[(int)$event['userId']]);if(!$consent||!$consent['analytics'])return;
        if(!self::configured())throw new RuntimeException('Analytics not configured');
        $url='https://www.google-analytics.com/mp/collect?'.http_build_query(['measurement_id'=>getenv('GA4_MEASUREMENT_ID'),'api_secret'=>getenv('GA4_API_SECRET')]);
        $context=stream_context_create(['http'=>['method'=>'POST','header'=>"Content-Type: application/json\r\n",'content'=>mce_json(self::payload($event)),'timeout'=>10,'ignore_errors'=>true]]);
        $stream=@fopen($url,'rb',false,$context);if(!$stream)throw new RuntimeException('Analytics transport failed');
        $meta=stream_get_meta_data($stream);$status=$meta['wrapper_data'][0]??'';fclose($stream);
        if(!preg_match('/\s2\d\d\s/',$status))throw new RuntimeException('Analytics transport failed');
        // HTTP acceptance is not proof that GA4 processed the event. Verify payloads with Google's validation endpoint before launch.
    }
}
