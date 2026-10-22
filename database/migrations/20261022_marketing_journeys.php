<?php
return static function(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS mce_journeys (
        id CHAR(32) PRIMARY KEY,user_id BIGINT UNSIGNED NULL,path_slug VARCHAR(150) NOT NULL,
        source VARCHAR(30) NOT NULL,medium VARCHAR(30) NOT NULL,campaign VARCHAR(150) NOT NULL,
        landed_at DATETIME NOT NULL,guest_trial_at DATETIME NULL,signup_at DATETIME NULL,
        first_lesson_at DATETIME NULL,returned_at DATETIME NULL,
        KEY(user_id,landed_at),KEY(landed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
};
