<?php
// Local setup only. On hosting, create the database in the panel and import schema.sql.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__).'/application/core/bootstrap.php';
$c = app_config();
$name = $c['db_name'] ?? '';
if (!preg_match('/\A[a-zA-Z0-9_]+\z/', $name)) throw new RuntimeException('Invalid database name');
$pdo = new PDO('mysql:host='.($c['db_host']??'127.0.0.1').';port='.($c['db_port']??'3306').';charset=utf8mb4', $c['db_user']??'', $c['db_password']??'', [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$pdo->exec('CREATE DATABASE IF NOT EXISTS `'.$name.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
$pdo->exec('USE `'.$name.'`');
foreach (explode(';', file_get_contents(dirname(__DIR__).'/database/schema.sql')) as $statement) {
    if (trim($statement) !== '') $pdo->exec($statement);
}
foreach (explode(';', file_get_contents(__DIR__.'/product.sql')) as $statement) {
    if (trim($statement) !== '') $pdo->exec($statement);
}
require __DIR__.'/apply-migrations.php';apply_product_migrations($pdo);
echo "Database and authentication tables ready.\n";
