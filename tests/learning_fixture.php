<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
require dirname(__DIR__).'/application/core/bootstrap.php';
if (!preg_match('/^mce_auth_test_[a-f0-9]+$/', app_config()['db_name'] ?? '')) throw new RuntimeException('Dedicated test database required');
$pdo=db();
if (($argv[1] ?? '') === 'submit') {
    learning_submit($pdo,$argv[2],(int)$argv[3],$argv[4]);
    echo "Submitted\n"; exit;
}
if (($argv[1] ?? '') === 'setup') {
    $users=[];
    foreach (['admin','editor','learner','other'] as $role) {
        $email=$role.'-'.bin2hex(random_bytes(5)).'@example.com';
        $id=User_model::create($role,$email,password_hash('Learning-test-123!',PASSWORD_DEFAULT));
        if (in_array($role,['admin','editor'],true)) $pdo->prepare('INSERT INTO learning_roles(user_id,role) VALUES (?,?)')->execute([$id,$role]);
        $users[$role]=['id'=>$id,'email'=>$email];
    }
    echo json_encode($users); exit;
}
if (($argv[1] ?? '') === 'verify') {
    if ((int)$pdo->query("SELECT COUNT(*) FROM learning_seed_keys WHERE seed_key='sample-greetings-v1'")->fetchColumn()!==1) throw new RuntimeException('Seed not idempotent');
    $uid=(int)$argv[2]; $lesson=(int)$argv[3];
    $q=$pdo->prepare('SELECT SUM(amount) AS total,COUNT(*) AS entries FROM reward_ledger WHERE user_id=?'); $q->execute([$uid]);
    $r=$q->fetch();
    if ((int)$r['total']!==25 || (int)$r['entries']!==2) throw new RuntimeException('Duplicate or missing XP');
    $q=$pdo->prepare("SELECT COUNT(*) FROM learning_audit WHERE action='publish' AND target_id=?"); $q->execute([$lesson]);
    if ((int)$q->fetchColumn()!==1) throw new RuntimeException('Publication audit must be idempotent');
    $q=$pdo->prepare('SELECT COUNT(*) AS events,COUNT(DISTINCT attempt_id) AS attempts FROM learning_events WHERE user_id=?');$q->execute([$uid]);$events=$q->fetch();
    if ((int)$events['events']!==3 || (int)$events['attempts']!==3) throw new RuntimeException('Duplicate or missing completion event');
    echo "PASS: persisted XP ledger and publication audit are idempotent\n"; exit;
}
if (($argv[1] ?? '') === 'change-content') {
    // Simulate a later publication changing source data. Existing attempts must retain their snapshot.
    $pdo->prepare('UPDATE learning_lessons SET answer_id=?,explanation=? WHERE id=?')->execute(['two','Changed source explanation',(int)$argv[2]]);
    exit;
}
throw new RuntimeException('Unknown fixture operation');
