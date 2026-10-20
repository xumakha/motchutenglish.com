<?php
if (PHP_SAPI !== 'cli') exit;
require dirname(__DIR__).'/application/core/bootstrap.php';
$pdo=db();
$rows=$pdo->query("SELECT password_hash FROM users WHERE email LIKE 'test-%@example.com'")->fetchAll();
foreach ($rows as $row) {
    if (!password_verify('Test-password-123!', $row['password_hash'])) throw new RuntimeException('Invalid password hash');
    if ($row['password_hash']==='Test-password-123!') throw new RuntimeException('Plaintext password');
}
if (!$rows) throw new RuntimeException('Missing registered test user');
echo "PASS: MySQL stores verifiable password hashes, not plaintext\n";
