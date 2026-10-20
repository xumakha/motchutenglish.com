<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require dirname(__DIR__).'/application/core/bootstrap.php';
$email=strtolower(trim($argv[1]??''));$name=$argv[2]??'Quản trị viên';$local=in_array('--local',$argv,true);
if(!filter_var($email,FILTER_VALIDATE_EMAIL)) {fwrite(STDERR,"Usage: php database/create-admin.php EMAIL NAME [--local]\nProvide password on standard input; --local generates credentials in a private local file.\n");exit(1);}
if($local&&(getenv('APP_ENV')==='production'||!in_array(app_config()['db_host']??'',['127.0.0.1','localhost'],true)))throw new RuntimeException('Local credentials are only allowed on local databases');
$password=$local?bin2hex(random_bytes(12)):rtrim(stream_get_contents(STDIN),"\r\n");Identity::password($password);
mce_transaction(function()use($email,$name,$password){
    if(User_model::findByEmail($email))throw new RuntimeException('Account exists. Use set-role.php to grant access; passwords are never overwritten.');
    $uid=User_model::create(mce_text($name,100),$email,password_hash($password,PASSWORD_DEFAULT));
    mce_query("INSERT INTO learning_roles(user_id,role) VALUES (?,'admin')",[$uid]);mce_profile($uid);
    mce_query('INSERT INTO mce_audit(actor_id,action,target,details,occurred_at) VALUES (?,?,?,?,?)',[$uid,'cli_admin_created','user:'.$uid,'{}',mce_sqltime()]);
});
if($local){$dir=ROOT_PATH.'/writable';if(!is_dir($dir))mkdir($dir,0700,true);$file=$dir.'/local-admin-'.bin2hex(random_bytes(4)).'.txt';file_put_contents($file,"Local development account only\nEmail: ".$email."\nPassword: ".$password."\n",LOCK_EX);chmod($file,0600);echo 'Local credentials saved privately: '.$file.PHP_EOL;}
else echo "Administrator created.\n";
