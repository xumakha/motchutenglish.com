<?php
declare(strict_types=1);
final class Exports {
    public static function request(int $uid,string $kind,string $key): void {
        if(!in_array($kind,['personal','content'],true))throw new ProductError(422,'Loại bản xuất không hợp lệ.');if($kind==='content')mce_staff();$key=mce_key($key);mce_limit('export',5,3600);
        mce_transaction(function()use($uid,$kind,$key){
            Motivation::lock($uid);$old=mce_one('SELECT user_id,kind FROM mce_exports WHERE id=?',[$key]);if($old){if((int)$old['user_id']!==$uid||$old['kind']!==$kind)throw new ProductError(409,'Mã yêu cầu đã được sử dụng.');return;}
            mce_query('INSERT INTO mce_exports(id,user_id,kind,expires_at) VALUES (?,?,?,?)',[$key,$uid,$kind,mce_sqltime(mce_now()->modify('+1 day'))]);
            mce_query("INSERT INTO mce_jobs(type,payload,event_key,available_at) VALUES ('export',?,?,?)",[mce_json(['userId'=>$uid,'exportId'=>$key]),'export:'.$key,mce_sqltime()]);mce_audit('export_requested',$kind);
        });
    }
    public static function file(string $key): string {if(!preg_match('/^[a-f0-9]{32}\.json$/D',$key))throw new ProductError(404,'Không tìm thấy tệp.');return ROOT_PATH.'/writable/exports/'.$key;}
    public static function build(string $id,int $uid): void {
        $e=mce_one('SELECT * FROM mce_exports WHERE id=? AND user_id=?',[$id,$uid]);if(!$e||$e['status']==='ready'||$e['expires_at']<=mce_sqltime())return;
        if(mce_profile($uid)['deleted_at'])return;if($e['kind']==='content'&&!in_array(learning_role(db(),$uid),['admin','editor'],true))throw new ProductError(403,'Quyền xuất nội dung đã bị thu hồi.');
        $personal=[
            'user'=>['SELECT id,name,email,created_at FROM users WHERE id=?',[$uid]],
            'answers'=>["SELECT i.attempt_id,i.exercise_id,i.response,i.first_response,i.state,CASE WHEN a.mode='test' AND a.status<>'finished' THEN NULL ELSE i.grading END AS grading FROM mce_items i JOIN mce_attempts a ON a.id=i.attempt_id WHERE a.user_id=?",[$uid]],
            'legacy_attempts'=>['SELECT id,lesson_id,response,score,submitted_at FROM learning_attempts WHERE user_id=?',[$uid]],
            'reminders'=>['SELECT enabled,hour FROM mce_reminders WHERE user_id=?',[$uid]],
            'rewards'=>['SELECT currency,amount,event_key,rule_version,created_at FROM reward_ledger WHERE user_id=?',[$uid]],
        ];
        foreach(['profiles','enrollments','progress','attempts','user_vocabulary','review_cards','review_events','activities','quests','streak_state','streak_calendar','badges','inventory','purchases','consents','cohorts','active_time'] as $table)$personal[$table]=['SELECT * FROM mce_'.$table.' WHERE user_id=?',[$uid]];
        $content=[];
        foreach(['paths','units','lessons','vocabulary','vocabulary_sets','vocabulary_set_items','articles'] as $table)$content[$table]=['SELECT * FROM mce_'.$table,[]];
        $content['versions']=['SELECT id,lesson_id,title,document,status,created_at,published_at FROM mce_versions',[]];
        $content['media']=['SELECT id,storage_key,filename,mime,bytes,alt_text,source,license_text FROM mce_media',[]];
        if($e['file_key']){$old=self::file($e['file_key']);if(is_file($old))unlink($old);}
        $queries=$e['kind']==='personal'?$personal:$content;$key=bin2hex(random_bytes(16)).'.json';$path=self::file($key);$dir=dirname($path);if(!is_dir($dir))mkdir($dir,0700,true);
        mce_query("UPDATE mce_exports SET status='running',file_key=? WHERE id=?",[$key,$id]);$handle=fopen($path,'xb');if(!$handle)throw new RuntimeException('Export storage unavailable');chmod($path,0600);
        $pdo=db();$buffering=defined('Pdo\\Mysql::ATTR_USE_BUFFERED_QUERY')?constant('Pdo\\Mysql::ATTR_USE_BUFFERED_QUERY'):constant('PDO::MYSQL_ATTR_USE_BUFFERED_QUERY');$pdo->setAttribute($buffering,false);
        $write=function(string $s)use($handle){if(fwrite($handle,$s)!==strlen($s))throw new RuntimeException('Export storage write failed');};
        try {
            $write('{"schemaVersion":1,"kind":'.mce_json($e['kind']));
            foreach($queries as $name=>[$sql,$params]) {
                $write(','.mce_json($name).':[');$q=$pdo->prepare($sql);$q->execute($params);$first=true;
                while($row=$q->fetch(PDO::FETCH_ASSOC)){if(!$first)$write(',');$write(mce_json($row));$first=false;}$q->closeCursor();$write(']');
            }$write('}');fclose($handle);$handle=null;
        }catch(Throwable $error){if(is_resource($handle))fclose($handle);if(is_file($path))unlink($path);throw $error;}
        finally{$pdo->setAttribute($buffering,true);}
        if(mce_profile($uid)['deleted_at']){unlink($path);return;}
        mce_query("UPDATE mce_exports SET status='ready',file_key=? WHERE id=?",[$key,$id]);
    }
    public static function deleteFor(int $uid): void {foreach(mce_all('SELECT file_key FROM mce_exports WHERE user_id=?',[$uid]) as $e)if($e['file_key']){$path=self::file($e['file_key']);if(is_file($path))unlink($path);}mce_query('DELETE FROM mce_exports WHERE user_id=?',[$uid]);}
    public static function cleanup(): void {foreach(mce_all('SELECT id,file_key FROM mce_exports WHERE expires_at<?',[mce_sqltime()]) as $e){if($e['file_key']){$path=self::file($e['file_key']);if(is_file($path))unlink($path);}mce_query('DELETE FROM mce_exports WHERE id=?',[$e['id']]);}}
}
