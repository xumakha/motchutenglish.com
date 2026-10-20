<?php
require dirname(__DIR__).'/application/core/bootstrap.php';
if(PHP_SAPI!=='cli'||!preg_match('/^mce_restore_test_[a-f0-9]+$/D',app_config()['db_name']??''))exit(1);
$u=mce_one("SELECT u.id,u.email FROM users u JOIN mce_progress p ON p.user_id=u.id WHERE u.email LIKE 'product-learner-%@example.com' LIMIT 1");
$a=mce_one("SELECT id,score,max_score FROM mce_attempts WHERE user_id=? AND status='finished' AND mode='practice' ORDER BY finished_at LIMIT 1",[$u['id']]);
echo mce_json(['email'=>$u['email'],'attempt'=>$a]);
