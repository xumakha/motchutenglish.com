<?php
return static function(PDO $pdo): void {
    // Deliberately separate from the locked import/content transaction: telemetry is not a partial commit.
    $pdo->exec("CREATE TABLE IF NOT EXISTS mce_import_progress (
        import_id CHAR(32) PRIMARY KEY,processed INT UNSIGNED NOT NULL DEFAULT 0,total INT UNSIGNED NOT NULL DEFAULT 0,
        phase VARCHAR(20) NOT NULL DEFAULT 'preview',updated_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
};
