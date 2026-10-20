<?php
declare(strict_types=1);
return function(PDO $pdo): void {
    foreach($pdo->query('SELECT DISTINCT topic FROM mce_vocabulary')->fetchAll(PDO::FETCH_COLUMN) as $topic) {
        $slug=preg_match('/^[a-z0-9-]{1,100}$/D',$topic)?$topic:'chu-de-'.substr(hash('sha256',$topic),0,12);
        $title=match($topic){'greetings'=>'Chào hỏi','daily'=>'Đời sống','work'=>'Công việc','time'=>'Thời gian',default=>$topic};
        $q=$pdo->prepare("SELECT COUNT(*) FROM mce_vocabulary WHERE topic=? AND status='published'");$q->execute([$topic]);$published=(bool)$q->fetchColumn();
        $pdo->prepare('INSERT IGNORE INTO mce_vocabulary_sets(slug,title,description,status) VALUES (?,?,?,?)')->execute([$slug,$title,'Bộ nghĩa từ và ví dụ theo chủ đề '.$title.'.',$published?'published':'draft']);
        $q=$pdo->prepare('SELECT id FROM mce_vocabulary_sets WHERE slug=?');$q->execute([$slug]);$id=(int)$q->fetchColumn();
        $pdo->prepare('INSERT IGNORE INTO mce_vocabulary_set_items(set_id,sense_id) SELECT ?,id FROM mce_vocabulary WHERE topic=?')->execute([$id,$topic]);
    }
};
