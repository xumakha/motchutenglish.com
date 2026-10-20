<?php
// Run from SSH: php database/check.php. Never expose diagnostics over HTTP.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__).'/application/core/bootstrap.php';
$configFile = is_file(APP_PATH.'/config/database.php') ? 'application/config/database.php' : (is_file(ROOT_PATH.'/config.php') ? 'config.php (legacy)' : 'environment variables only');
echo 'Configuration: '.$configFile.PHP_EOL;
try {
    if (!extension_loaded('pdo_mysql')) throw new RuntimeException('PDO_MYSQL_MISSING');
    foreach(['mbstring','intl','fileinfo'] as $extension)if(!extension_loaded($extension))throw new RuntimeException('REQUIRED_EXTENSION_MISSING');
    if(PHP_VERSION_ID<80300||PHP_VERSION_ID>=80600)throw new RuntimeException('PHP_VERSION_UNSUPPORTED');
    $config = app_config();
    if (empty($config['db_name']) || empty($config['db_user'])) throw new RuntimeException('CONFIG_MISSING');
    $pdo = db();
    echo "PASS: connected to configured MySQL database.\n";
    $pdo->query('SELECT id, name, email, password_hash, created_at FROM users LIMIT 0');
    echo "PASS: users table and required columns exist.\n";
    $pdo->query('SELECT identifier, attempts, window_started_at FROM auth_attempts LIMIT 0');
    echo "PASS: auth_attempts table and required columns exist.\n";
    foreach ([
        'learning_roles'=>'user_id,role',
        'learning_lessons'=>'id,title,body,question,choices,answer_id,explanation,status,created_by',
        'learning_attempts'=>'id,user_id,lesson_id,snapshot,response,score,submitted_at',
        'reward_ledger'=>'id,user_id,currency,amount,event_key,rule_version',
        'learning_audit'=>'id,actor_id,action,target_id',
        'learning_events'=>'id,event_key,user_id,lesson_id,attempt_id,event_type,payload',
        'learning_seed_keys'=>'seed_key,lesson_id',
    ] as $table=>$columns) {
        $pdo->query('SELECT '.$columns.' FROM '.$table.' LIMIT 0');
        echo 'PASS: '.$table." table and required columns exist.\n";
    }
    foreach(['profiles','paths','units','lessons','versions','attempts','items','progress','vocabulary','vocabulary_sets','vocabulary_set_items','review_cards','review_events','jobs','exports','audit','migrations'] as $table)$pdo->query('SELECT * FROM mce_'.$table.' LIMIT 0');
    echo "PASS: product schema and required extensions exist.\n";
    echo "Read-only checks passed. If registration still fails, check INSERT/UPDATE permissions and the PHP error log.\n";
} catch (Throwable $e) {
    $code = $e instanceof PDOException ? (int)($e->errorInfo[1]??0) : 0;
    $hints = [
        1045=>'MySQL rejected the username/password. Check db_user, db_password and the account host.',
        1044=>'The MySQL user cannot access this database. Assign the user to the database in the hosting panel.',
        1049=>'Database not found. Check db_name including the hosting account prefix.',
        1146=>'A required table is missing. Run: php database/migrate.php',
        1054=>'The existing table has different columns. Compare its structure with database/schema.sql; do not delete user data.',
        1142=>'The MySQL user lacks table permissions. Grant SELECT, INSERT, UPDATE, DELETE for this database.',
        1524=>'The authentication plugin configured for this MySQL user is not loaded. Ask the hosting administrator to repair the user authentication plugin or recreate the database user with a supported plugin.',
        2002=>'MySQL host/port/socket is unreachable. Check db_host and db_port against the hosting panel.',
        2003=>'Cannot connect to MySQL. Check db_host, db_port and whether MySQL is running.',
        2005=>'Unknown MySQL host. Check db_host.',
    ];
    if ($e->getMessage()==='PDO_MYSQL_MISSING') $hint='Enable the pdo_mysql PHP extension for the website and CLI.';
    elseif ($e->getMessage()==='REQUIRED_EXTENSION_MISSING') $hint='Enable mbstring, intl and fileinfo; use php-local.ps1 for local commands.';
    elseif ($e->getMessage()==='PHP_VERSION_UNSUPPORTED') $hint='Supported PHP range: >=8.3 and <8.6.';
    elseif ($e->getMessage()==='CONFIG_MISSING' || $e->getMessage()==='Database is not configured') $hint='Missing db_name/db_user. Copy config-example/database.php to application/config/database.php and fill in hosting credentials.';
    else $hint=$hints[$code]??'Check the server PHP error log for the detailed cause. No credentials are printed by this command.';
    fwrite(STDERR, 'FAIL'.($code ? ' [MySQL '.$code.']' : '').': '.$hint.PHP_EOL);
    exit(1);
}
