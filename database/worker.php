<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require dirname(__DIR__).'/application/core/bootstrap.php';
$action=$argv[1]??'run';
if($action==='tick') { Jobs::tick();echo "Daily evaluation and eligible reminders queued.\n"; }
elseif($action==='cleanup') { Jobs::cleanup();echo "Expired transient data cleaned.\n"; }
elseif($action==='reconcile') { Jobs::reconcile();echo "Reward balances rebuilt from ledger.\n"; }
elseif($action==='run')echo mce_json(Jobs::run(min(100,max(1,(int)($argv[2]??50))))).PHP_EOL;
else {fwrite(STDERR,"Usage: php database/worker.php run [limit]|tick|cleanup|reconcile\n");exit(1);}
