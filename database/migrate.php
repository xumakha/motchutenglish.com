<?php
// Apply the initial schema to the already configured database; no CREATE DATABASE permission needed.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__).'/application/core/bootstrap.php';
try {
    $pdo = db();
    foreach (explode(';', file_get_contents(__DIR__.'/schema.sql')) as $statement) {
        if (trim($statement) !== '') $pdo->exec($statement);
    }
    echo "Schema applied. Existing tables and data preserved. Run php database/check.php to verify columns.\n";
} catch (Throwable $e) {
    $code = $e instanceof PDOException ? (int)($e->errorInfo[1]??0) : 0;
    fwrite(STDERR, 'Migration failed'.($code ? ' [MySQL '.$code.']' : '').'. Run php database/check.php and verify CREATE TABLE permissions.'.PHP_EOL);
    exit(1);
}
