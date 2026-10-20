<?php
declare(strict_types=1);
function db(): PDO
{
    static $pdo;
    if (!$pdo) {
        $c = app_config();
        if (empty($c['db_name']) || empty($c['db_user'])) throw new RuntimeException('Database is not configured');
        $pdo = new PDO('mysql:host='.($c['db_host']??'localhost').';port='.($c['db_port']??'3306').';dbname='.$c['db_name'].';charset=utf8mb4', $c['db_user'], $c['db_password']??'', [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES=>false]);
        $pdo->exec("SET time_zone = '+00:00'");
        $pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
    }
    return $pdo;
}
