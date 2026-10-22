<?php
declare(strict_types=1);
final class ImportStatus {
    public static function document(mixed $document): void {
        if(!is_array($document))throw new ProductError(422,'Document cần object.',['document'=>'Cần object bài học.']);
        try{Assessment::document($document);}catch(ProductError $e){$fields=[];foreach($e->fields?:[''=>$e->getMessage()] as $field=>$message)$fields['document'.($field!==''?'.'.$field:'')]=$message;throw new ProductError($e->status,$e->getMessage(),$fields);}
    }
    public static function write(string $id,int $processed,int $total,string $phase): void {
        // A second autocommit connection exposes attempted work while content remains atomic/uncommitted.
        try {
            static $pdo;if(!$pdo){$c=app_config();$pdo=new PDO('mysql:host='.($c['db_host']??'localhost').';port='.($c['db_port']??3306).';dbname='.$c['db_name'].';charset=utf8mb4',$c['db_user'],$c['db_password']??'',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]);}
            $q=$pdo->prepare('INSERT INTO mce_import_progress(import_id,processed,total,phase,updated_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE processed=VALUES(processed),total=VALUES(total),phase=VALUES(phase),updated_at=VALUES(updated_at)');$q->execute([$id,$processed,$total,$phase,mce_sqltime()]);
        }catch(Throwable $e){error_log('Import progress telemetry unavailable');}
    }
    public static function errors(Throwable $e,string $prefix,int $index,string $phase='preview'): array {
        $fields=$e instanceof ProductError?$e->fields:[];
        if(!$fields)$fields=[''=>$e instanceof ProductError?$e->getMessage():'Record không hợp lệ hoặc xung đột dữ liệu.'];
        $out=[];foreach($fields as $field=>$message)$out[]=['record'=>$index+1,'field'=>$prefix.($field!==''?'.'.$field:''),'message'=>(string)$message,'phase'=>$phase];return $out;
    }
    public static function read(string $id): array {
        mce_staff();$row=mce_one('SELECT i.id,i.actor_id,i.status,i.errors,p.processed,COALESCE(p.total,JSON_LENGTH(i.document,\'$.paths\'),JSON_LENGTH(i.document,\'$.units\'),JSON_LENGTH(i.document,\'$.articles\'),JSON_LENGTH(i.document,\'$.vocabulary_sets\'),JSON_LENGTH(i.document,\'$.vocabulary\'),JSON_LENGTH(i.document,\'$.lessons\'),0) AS total,p.phase,p.updated_at FROM mce_imports i LEFT JOIN mce_import_progress p ON p.import_id=i.id WHERE i.id=?',[mce_key($id)]);
        if(!$row||(mce_role()!=='admin'&&(int)$row['actor_id']!==mce_uid()))throw new ProductError(404,'Không tìm thấy batch.');
        $total=(int)$row['total'];$processed=(int)$row['processed'];if($row['status']==='committed')$processed=$total;
        $job=mce_one("SELECT status,attempts,available_at FROM mce_jobs WHERE event_key=?",['import:'.$id]);
        return ['canCommit'=>(int)$row['actor_id']===mce_uid()&&$row['status']==='preview'&&!mce_decode($row['errors']),'id'=>$id,'status'=>$row['status'],'processed'=>min($processed,$total),'total'=>$total,'committed'=>$row['status']==='committed'?$total:0,'phase'=>$row['status']==='committed'?'committed':($row['status']==='failed'?'failed':($row['phase']??$row['status'])),'errors'=>mce_decode($row['errors']),'updatedAt'=>$row['updated_at'],'job'=>$job];
    }
}
