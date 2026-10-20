<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require dirname(__DIR__).'/application/core/bootstrap.php';
$file=realpath($argv[1]??'');$root=realpath(ROOT_PATH.'/writable/backups');
if(!$file||!$root||!str_starts_with(strtolower($file),strtolower($root.DIRECTORY_SEPARATOR))||!is_file($file))throw new RuntimeException('Choose a backup inside writable/backups');
$name='mce_restore_test_'.bin2hex(random_bytes(6));$c=app_config();$start=microtime(true);
db()->exec('CREATE DATABASE `'.$name.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
$bin=getenv('MYSQL_BIN')?:'mysql';
$process=proc_open([$bin,'--host='.($c['db_host']??'127.0.0.1'),'--port='.($c['db_port']??3306),'--user='.$c['db_user'],$name],
 [0=>['file',$file,'rb'],1=>['pipe','w'],2=>['pipe','w']],$pipes,ROOT_PATH,array_merge(getenv(),['MYSQL_PWD'=>$c['db_password']??'']),['bypass_shell'=>true]);
if(!is_resource($process))throw new RuntimeException('Could not start restore client');
$output=stream_get_contents($pipes[1]);$error=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);$code=proc_close($process);if($code!==0)throw new RuntimeException('Restore failed; original database unchanged');
$pdo=new PDO('mysql:host='.$c['db_host'].';port='.($c['db_port']??3306).';dbname='.$name.';charset=utf8mb4',$c['db_user'],$c['db_password']??'',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$counts=[];foreach(['users','mce_lessons','mce_versions','mce_attempts','mce_progress','mce_review_cards','reward_ledger'] as $table){$expected=(int)db()->query('SELECT COUNT(*) FROM '.$table)->fetchColumn();$actual=(int)$pdo->query('SELECT COUNT(*) FROM '.$table)->fetchColumn();if($actual!==$expected)throw new RuntimeException('Restored count mismatch: '.$table);$counts[$table]=$actual;}
$report=['database'=>$name,'seconds'=>round(microtime(true)-$start,3),'counts'=>$counts,'originalDatabaseUnchanged'=>true];
if(!is_dir(ROOT_PATH.'/docs/artifacts'))mkdir(ROOT_PATH.'/docs/artifacts',0755,true);
file_put_contents(ROOT_PATH.'/docs/artifacts/restore-report.json',mce_json($report));echo mce_json($report).PHP_EOL;
