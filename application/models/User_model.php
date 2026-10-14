<?php
declare(strict_types=1);
final class User_model
{
    public static function findByEmail(string $email): ?array
    {
        $stmt = db()->prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?');
        $stmt->execute([$email]);
        return $stmt->fetch() ?: null;
    }
    public static function create(string $name, string $email, string $hash): int
    {
        $stmt = db()->prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
        $stmt->execute([$name, $email, $hash]);
        return (int) db()->lastInsertId();
    }
    public static function updatePassword(int $id, string $hash): void
    {
        $stmt = db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
        $stmt->execute([$hash, $id]);
    }
}
