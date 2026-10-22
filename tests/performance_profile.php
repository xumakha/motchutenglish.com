<?php
// CLI-only diagnostic; SQL text, sessions and user data never enter the report.
declare(strict_types=1);
$started=hrtime(true);
require dirname(__DIR__).'/application/core/bootstrap.php';
if(PHP_SAPI!=='cli'||!preg_match('/^mce_auth_test_[a-f0-9]+$/D',app_config()['db_name']??''))throw new RuntimeException('Isolated test DB required');
$session=json_decode(stream_get_contents(STDIN),true,64,JSON_THROW_ON_ERROR);
$times=['bootstrapMs'=>(hrtime(true)-$started)/1e6];
session_save_path(ROOT_PATH.'/writable/sessions');session_id(explode('=',$session['cookie'],2)[1]);
start_auth_session();
$pdo=db();$pdo->exec('SET profiling_history_size=100');$pdo->exec('SET profiling=1');
$at=hrtime(true);current_user();$times['identityMs']=(hrtime(true)-$at)/1e6;
$at=hrtime(true);mce_limit('study',500,60);$times['rateLimitMs']=(hrtime(true)-$at)/1e6;
$at=hrtime(true);Study::mutate($session['attempt'],['action'=>'submit','revision'=>0,'exerciseId'=>'hello','response'=>'greeting']);$times['mutateMs']=(hrtime(true)-$at)/1e6;
$at=hrtime(true);$result=Study::publicAttempt(Study::read($session['attempt']));mce_json($result);$times['readSerializeMs']=(hrtime(true)-$at)/1e6;
$profiles=$pdo->query('SHOW PROFILES')->fetchAll();
$times['queryCount']=count($profiles);$times['sqlMs']=array_sum(array_column($profiles,'Duration'))*1000;
$times['totalMs']=(hrtime(true)-$started)/1e6;
$times['correct']=$result['items'][0]['feedback']['isCorrect']===true;
echo mce_json($times);
