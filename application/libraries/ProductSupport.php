<?php
declare(strict_types=1);
final class ProductError extends RuntimeException {
    public function __construct(public int $status, string $message, public array $fields=[]) { parent::__construct($message); }
}
function mce_field(string $field,callable $read): mixed {
    try{return $read();}catch(ProductError $e){throw new ProductError($e->status,$e->getMessage(),$e->fields?:[$field=>$e->getMessage()]);}
}
function mce_form_error_state(array $values,array $fields): array {
    $safe=[];foreach($values as $key=>$value)if(!preg_match('/password|token|csrf|current|secret/i',(string)$key))$safe[$key]=$value;
    return ['values'=>$safe,'fields'=>$fields];
}
function mce_query(string $sql, array $params=[]): PDOStatement { $q=db()->prepare($sql);$q->execute($params);return $q; }
function mce_one(string $sql,array $params=[]): ?array { return mce_query($sql,$params)->fetch() ?: null; }
function mce_all(string $sql,array $params=[]): array { return mce_query($sql,$params)->fetchAll(); }
function mce_json(mixed $value): string { return json_encode($value,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR); }
function mce_decode(string $value): mixed { return json_decode($value,true,64,JSON_THROW_ON_ERROR); }
function mce_equal_response(string $stored,mixed $response): bool {
    $canonical=function(mixed $value)use(&$canonical): mixed {if(!is_array($value))return $value;if(!array_is_list($value))ksort($value);foreach($value as &$v)$v=$canonical($v);unset($v);return $value;};
    return mce_json($canonical(mce_decode($stored)))===mce_json($canonical($response));
}
function mce_now(): DateTimeImmutable { return new DateTimeImmutable('now',new DateTimeZone('UTC')); }
function mce_sqltime(?DateTimeImmutable $now=null): string { return ($now??mce_now())->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s'); }
function mce_transaction(callable $fn): mixed {
    $pdo=db();
    for($attempt=0;$attempt<3;$attempt++) {
        $pdo->beginTransaction();
        try { $result=$fn();$pdo->commit();return $result; }
        catch(Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            if($e instanceof PDOException&&in_array((int)($e->errorInfo[1]??0),[1205,1213],true)&&$attempt<2) {usleep(random_int(10000,50000));continue;}
            if($e instanceof PDOException&&in_array((int)($e->errorInfo[1]??0),[1062,1205,1213],true))throw new ProductError(409,'Dữ liệu đã tồn tại hoặc vừa được cập nhật. Vui lòng tải lại và kiểm tra trước khi thử lại.');
            if($e instanceof PDOException&&in_array((int)($e->errorInfo[1]??0),[1451,1452],true))throw new ProductError(422,'Nội dung liên kết không còn hợp lệ. Vui lòng kiểm tra lại lựa chọn.');
            throw $e;
        }
    }
    throw new RuntimeException('Transaction failed');
}
function mce_uid(): int { if (!current_user()) throw new ProductError(401,'Bạn cần đăng nhập để thực hiện thao tác này.');return (int)current_user()['id']; }
function mce_role(): string { return current_user()?learning_role(db(),mce_uid()):'guest'; }
function mce_staff(bool $admin=false): void { if (!in_array(mce_role(),$admin?['admin']:['editor','admin'],true)) throw new ProductError(403,'Bạn không có quyền thực hiện thao tác này.'); }
function mce_profile(int $uid,bool $forUpdate=false): array {
    $sql='SELECT * FROM mce_profiles WHERE user_id=?'.($forUpdate?' FOR UPDATE':'');
    $profile=mce_one($sql,[$uid]);
    if(!$profile) {
        $minutes=(int)mce_setting('default_minutes','10');if(!in_array($minutes,[5,10,15,20],true))$minutes=10;
        mce_query('INSERT INTO mce_profiles(user_id,minutes) VALUES (?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)',[$uid,$minutes]);
        $profile=mce_one($sql,[$uid]);
    }
    if(mce_setting('gamification','1')==='0')$profile['gamification']=0;
    static $cohorts=[];
    if(!isset($cohorts[$uid])&&!$profile['deleted_at']&&!mce_one('SELECT user_id FROM mce_cohorts WHERE user_id=?',[$uid])) {
        $created=mce_one('SELECT created_at FROM users WHERE id=?',[$uid])['created_at'];$date=(new DateTimeImmutable($created,new DateTimeZone('UTC')))->setTimezone(new DateTimeZone($profile['timezone']))->format('Y-m-d');
        mce_query('INSERT IGNORE INTO mce_cohorts(user_id,local_date,timezone) VALUES (?,?,?)',[$uid,$date,$profile['timezone']]);
    }
    $cohorts[$uid]=true;
    return $profile;
}
function mce_audit(string $action,string $target,array $details=[]): void {
    mce_query('INSERT INTO mce_audit(actor_id,action,target,details,occurred_at) VALUES (?,?,?,?,?)',[current_user()['id']??null,$action,$target,mce_json($details),mce_sqltime()]);
    mce_query("INSERT INTO mce_settings(name,value) VALUES ('catalog_revision',?) ON DUPLICATE KEY UPDATE value=VALUES(value)",[bin2hex(random_bytes(16))]);
    $GLOBALS['mce_settings_cache']=[];
}
function mce_event(string $key,string $type,string $resource,?int $uid=null): bool {
    $at=mce_sqltime();$id=bin2hex(random_bytes(16));$inserted=mce_query('INSERT IGNORE INTO mce_events(id,event_key,user_id,type,resource_id,occurred_at) VALUES (?,?,?,?,?,?)',[$id,$key,$uid,$type,$resource,$at])->rowCount()>0;
    if($inserted&&class_exists('MarketingAnalytics')){MarketingAnalytics::record($uid,$type,$resource,$at);if($uid)MarketingAnalytics::enqueue($id,$uid,$type,$resource);}
    return $inserted;
}
function mce_key(mixed $key): string { if (!is_string($key)||!preg_match('/^[a-f0-9]{32}$/D',$key)) throw new ProductError(422,'Mã yêu cầu không hợp lệ.');return $key; }
function mce_limit(string $scope,int $max=30,int $seconds=900): void {
    $key=hash('sha256',$scope.':'.($_SERVER['REMOTE_ADDR']??'cli').':'.(current_user()['id']??'guest'));
    mce_transaction(function()use($key,$max,$seconds){
        mce_query('INSERT IGNORE INTO auth_attempts(identifier,attempts,window_started_at) VALUES (?,0,?)',[$key,time()]);
        $r=mce_one('SELECT * FROM auth_attempts WHERE identifier=? FOR UPDATE',[$key]);
        $n=time()-(int)$r['window_started_at']>=$seconds?0:(int)$r['attempts'];
        if ($n >= $max) throw new ProductError(429,'Bạn thao tác quá nhanh. Vui lòng thử lại sau.');
        mce_query('UPDATE auth_attempts SET attempts=?,window_started_at=? WHERE identifier=?',[$n+1,$n===0?time():$r['window_started_at'],$key]);
    });
}
function mce_setting(string $key,string $default=''): string {
    $cacheKey=(app_config()['db_name']??'').':'.$key;
    if(array_key_exists($cacheKey,$GLOBALS['mce_settings_cache']??[]))return $GLOBALS['mce_settings_cache'][$cacheKey]??$default;
    try{$value=mce_one('SELECT value FROM mce_settings WHERE name=?',[$key])['value']??null;$GLOBALS['mce_settings_cache'][$cacheKey]=$value;return $value??$default;}catch(Throwable $e){return $default;}
}
function mce_text(mixed $value,int $max=5000,bool $required=true): string {
    if (!is_string($value)||mb_strlen($value)>$max||($required&&trim($value)==='')) throw new ProductError(422,'Nội dung trống hoặc quá dài.');return trim($value);
}
