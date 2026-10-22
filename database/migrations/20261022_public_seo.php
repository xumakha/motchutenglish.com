<?php
return static function(PDO $pdo): void {
    foreach(['paths','vocabulary','vocabulary_sets','articles'] as $kind)foreach(['seo_title'=>160,'seo_description'=>320] as $column=>$length){
        $q=$pdo->prepare('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?');$q->execute(['mce_'.$kind,$column]);
        if(!$q->fetchColumn())$pdo->exec('ALTER TABLE mce_'.$kind.' ADD '.$column.' VARCHAR('.$length.") NOT NULL DEFAULT ''");
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS mce_page_seo(path VARCHAR(255) PRIMARY KEY,title VARCHAR(160) NOT NULL DEFAULT '',description VARCHAR(320) NOT NULL DEFAULT '') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
};
