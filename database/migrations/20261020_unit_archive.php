<?php
declare(strict_types=1);
return function(PDO $pdo): void {
    $q=$pdo->query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='mce_units' AND COLUMN_NAME='archived'");
    if(!$q->fetchColumn())$pdo->exec('ALTER TABLE mce_units ADD archived TINYINT NOT NULL DEFAULT 0');
};
