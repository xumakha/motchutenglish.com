<?php
declare(strict_types=1);
function record_auth_attempt(PDO $pdo, string $key): bool
{
    $now = time();
    $stmt = $pdo->prepare('INSERT INTO auth_attempts (identifier, attempts, window_started_at) VALUES (?, 1, ?) ON DUPLICATE KEY UPDATE attempts = IF(window_started_at <= ?, 1, attempts + 1), window_started_at = IF(window_started_at <= ?, ?, window_started_at)');
    $stmt->execute([$key, $now, $now-900, $now-900, $now]);
    $stmt = $pdo->prepare('SELECT attempts FROM auth_attempts WHERE identifier = ?');
    $stmt->execute([$key]);
    return (int)$stmt->fetchColumn() <= 15;
}
