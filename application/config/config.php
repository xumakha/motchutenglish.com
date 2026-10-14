<?php
declare(strict_types=1);
function app_config(): array
{
    static $config;
    if ($config === null) {
        $file = __DIR__ . '/database.php';
        if (!is_file($file)) $file = ROOT_PATH . '/config.php';
        $config = is_file($file) ? require $file : [];
        foreach (['db_host'=>'DB_HOST', 'db_port'=>'DB_PORT', 'db_name'=>'DB_NAME', 'db_user'=>'DB_USER', 'db_password'=>'DB_PASSWORD'] as $key=>$env) {
            $value = getenv($env);
            if ($value !== false) $config[$key] = $value;
        }
        if (getenv('SESSION_SECURE') !== false) $config['session_secure'] = getenv('SESSION_SECURE') === '1';
    }
    return $config;
}
