<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require dirname(__DIR__).'/application/core/bootstrap.php';
$c=app_config();$dir=ROOT_PATH.'/writable/backups';if(!is_dir($dir))mkdir($dir,0700,true);
$file=$dir.'/backup-'.gmdate('Ymd-His').'-'.bin2hex(random_bytes(4)).'.sql';
$bin=getenv('MYSQLDUMP_BIN')?:'mysqldump';
$process=proc_open([$bin,'--host='.($c['db_host']??'127.0.0.1'),'--port='.($c['db_port']??3306),'--user='.$c['db_user'],'--single-transaction','--skip-lock-tables','--hex-blob',$c['db_name']],
 [0=>['pipe','r'],1=>['file',$file,'wb'],2=>['pipe','w']],$pipes,ROOT_PATH,array_merge(getenv(),['MYSQL_PWD'=>$c['db_password']??'']),['bypass_shell'=>true]);
if(!is_resource($process))throw new RuntimeException('Could not start database backup');
fclose($pipes[0]);$error=stream_get_contents($pipes[2]);fclose($pipes[2]);$code=proc_close($process);
if($code!==0){if(is_file($file))unlink($file);fwrite(STDERR,"Backup failed. Verify dump binary and database permissions.\n");exit(1);}
chmod($file,0600);echo $file.PHP_EOL;
