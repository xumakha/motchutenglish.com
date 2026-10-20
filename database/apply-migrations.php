<?php
declare(strict_types=1);
function apply_product_migrations(PDO $pdo): void {
    foreach(glob(__DIR__.'/migrations/*.php')?:[] as $file){
        $version=basename($file,'.php');$q=$pdo->prepare('SELECT version FROM mce_migrations WHERE version=?');$q->execute([$version]);if($q->fetchColumn())continue;
        $migration=require $file;$migration($pdo);
        $pdo->prepare('INSERT INTO mce_migrations(version) VALUES (?)')->execute([$version]);
    }
}
