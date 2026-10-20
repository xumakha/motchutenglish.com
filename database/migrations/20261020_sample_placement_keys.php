<?php
declare(strict_types=1);
return function(PDO $pdo): void {
    $q=$pdo->query("SELECT l.id AS lesson_id,v.* FROM mce_lessons l JOIN mce_versions v ON v.id=l.current_version WHERE l.external_key='project-sample:goi-y-hoc-20-cau'");$version=$q->fetch(PDO::FETCH_ASSOC);if(!$version)return;
    $document=json_decode($version['document'],true,64,JSON_THROW_ON_ERROR);$changed=false;
    foreach($document['exercises'] as &$e){
        $p=&$e['payload'];if(!isset($p['choices']['correct']))continue;$mapping=[];$choices=[];
        foreach($p['choices'] as $id=>$text){$mapping[$id]='opt-'.substr(hash('sha256',$e['id'].$text),0,12);$choices[$mapping[$id]]=$text;}
        $p['answerId']=$mapping[$p['answerId']];$p['choices']=$choices;$e['contentVersion']++;$changed=true;
    }unset($e,$p);
    if(!$changed)return;
    $document['blueprint']['rules']=[['minPercent'=>0,'pathSlug'=>'bat-dau-tu-nen-tang'],['minPercent'=>50,'pathSlug'=>'giao-tiep-hang-ngay']];
    $pdo->beginTransaction();
    try {
        $q=$pdo->prepare("INSERT INTO mce_versions(lesson_id,title,document,status,author_id,published_at) VALUES (?,?,?,'published',?,UTC_TIMESTAMP())");
        $q->execute([$version['lesson_id'],$version['title'],json_encode($document,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$version['author_id']]);$id=(int)$pdo->lastInsertId();
        $pdo->prepare('UPDATE mce_lessons SET current_version=? WHERE id=?')->execute([$id,$version['lesson_id']]);
        $pdo->prepare('INSERT INTO mce_audit(actor_id,action,target,details,occurred_at) VALUES (NULL,?,?,?,UTC_TIMESTAMP())')->execute(['data_migration','lesson:'.$version['lesson_id'],'{"migration":"placement_opaque_ids","oldAttemptsPreserved":true}']);
        $pdo->prepare("INSERT INTO mce_settings(name,value) VALUES ('catalog_revision',?) ON DUPLICATE KEY UPDATE value=VALUES(value)")->execute([bin2hex(random_bytes(16))]);
        $pdo->commit();
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
};
