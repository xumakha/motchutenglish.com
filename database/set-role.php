<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
require dirname(__DIR__).'/application/core/bootstrap.php';
$email=$argv[1]??''; $role=$argv[2]??'';
if (!filter_var($email,FILTER_VALIDATE_EMAIL) || !in_array($role,['admin','editor'],true)) { fwrite(STDERR,"Usage: php database/set-role.php email admin|editor\n"); exit(1); }
$pdo=db(); $q=$pdo->prepare('SELECT id FROM users WHERE email=?');$q->execute([$email]);$id=$q->fetchColumn();
if (!$id) { fwrite(STDERR,"Register the account first.\n"); exit(1); }
$pdo->beginTransaction();
try {
$pdo->prepare('INSERT INTO learning_roles(user_id,role) VALUES (?,?) ON DUPLICATE KEY UPDATE role=VALUES(role)')->execute([$id,$role]);
$pdo->prepare('INSERT INTO learning_audit(actor_id,action,target_id) VALUES (?,?,?)')->execute([$id,'cli_role_'.$role,$id]);
$pdo->commit(); echo "Role updated.\n";
} catch (Throwable $e) { $pdo->rollBack(); throw $e; }
