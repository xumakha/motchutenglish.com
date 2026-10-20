<?php
declare(strict_types=1);
return function(PDO $pdo): void {
    $q=$pdo->query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='mce_paths' AND COLUMN_NAME='image_id'");
    if(!$q->fetchColumn())$pdo->exec('ALTER TABLE mce_paths ADD image_id BIGINT UNSIGNED NULL, ADD CONSTRAINT fk_path_image FOREIGN KEY(image_id) REFERENCES mce_media(id)');
};
