<?php
declare(strict_types=1);
function start_auth_session(): void
{
    $c = app_config();
    $secure = $c['session_secure'] ?? (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name('mce_session');
    session_set_cookie_params(['lifetime'=>0, 'path'=>'/', 'secure'=>(bool)$secure, 'httponly'=>true, 'samesite'=>'Lax']);
    if (!empty($c['session_path'])) session_save_path($c['session_path']);
    if (!session_start()) throw new RuntimeException('Unable to start session');
    header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');
    $_SERVER['MCE_REQUEST_ID']=bin2hex(random_bytes(8));
    header('X-Request-ID: '.$_SERVER['MCE_REQUEST_ID']);
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    if ($secure) header('Strict-Transport-Security: max-age=31536000');
    if (!isset($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
}
function current_user(): ?array
{
    $u = $_SESSION['user'] ?? null;
    if (is_array($u) && function_exists('mce_one')) {
        static $checked=[];
        $key=$u['id'].':'.($u['session_version']??0);
        if (!array_key_exists($key,$checked)) {
            $p=mce_one('SELECT session_version,deleted_at FROM mce_profiles WHERE user_id=?',[(int)$u['id']]);
            $checked[$key]=!$p || (!$p['deleted_at']&&(int)$p['session_version']===(int)($u['session_version']??0));
        }
        if (!$checked[$key]) { unset($_SESSION['user']); return null; }
    }
    return is_array($u) ? $u : null;
}
function post_value(string $key): string
{
    return isset($_POST[$key]) && is_string($_POST[$key]) ? $_POST[$key] : '';
}
function csrf_valid(): bool
{
    return post_value('csrf') !== '' && hash_equals($_SESSION['csrf'], post_value('csrf'));
}
function auth_redirect(string $path): void
{
    header('Location: /'.ltrim($path, '/'), true, 303);
    exit;
}
function sign_in(array $user): void
{
    session_regenerate_id(true);
    $profile=function_exists('mce_profile')?mce_profile((int)$user['id']):[];
    if (!empty($profile['deleted_at'])) throw new RuntimeException('Account deletion in progress');
    $_SESSION['user'] = ['id'=>(int)$user['id'], 'name'=>$user['name'], 'email'=>$user['email'],'session_version'=>(int)($profile['session_version']??0)];
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}
function auth_limit_key(): string
{
    // Do not trust forwarded IP headers from arbitrary requests.
    return hash('sha256', 'auth:'.($_SERVER['REMOTE_ADDR']??'unknown'));
}
function handle_auth(string $page): array
{
    $errors = [];$GLOBALS['auth_field_errors']=[];
    $invalid=function(string $field,string $message)use(&$errors){$errors[]=$message;$GLOBALS['auth_field_errors'][$field]=$message;};
    if (!in_array($page, ['login','register','logout','account'], true)) return $errors;
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($page === 'account' && !current_user()) auth_redirect('login');
    if ($method !== 'POST') {
        if ($page === 'logout') { http_response_code(405); header('Allow: POST'); $errors[] = 'Vui lòng dùng nút Đăng xuất.'; }
        elseif (in_array($page, ['login','register'], true) && current_user()) auth_redirect('account');
        return $errors;
    }
    if (!csrf_valid()) { http_response_code(403); return ['Phiên làm việc đã hết hạn. Vui lòng tải lại trang và thử lại.']; }
    if ($page === 'logout') {
        $_SESSION = [];
        $params = session_get_cookie_params();
        setcookie(session_name(), '', ['expires'=>time()-3600, 'path'=>$params['path'], 'secure'=>$params['secure'], 'httponly'=>true, 'samesite'=>'Lax']);
        session_destroy();
        auth_redirect('login');
    }
    if ($page === 'account') { http_response_code(405); header('Allow: GET'); return ['Thao tác không được hỗ trợ.']; }
    if (current_user()) auth_redirect('account');
    $email = strtolower(trim(post_value('email')));
    $password = post_value('password');
    $name = trim(post_value('name'));
    if (strlen($email)>254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) $invalid('email','Vui lòng nhập email hợp lệ.');
    if ($password === '' || strlen($password)>72) $invalid('password','Mật khẩu phải có từ 1 đến 72 byte.');
    if ($page === 'register') {
        if ($name === '' || mb_strlen($name, 'UTF-8')>100) $invalid('name','Tên phải có từ 1 đến 100 ký tự.');
        if (mb_strlen($password, 'UTF-8')<8) $invalid('password','Mật khẩu cần ít nhất 8 ký tự.');
        if ($password !== post_value('password_confirm')) $invalid('password_confirm','Mật khẩu nhập lại chưa khớp.');
    }
    if ($errors) { http_response_code(422); return $errors; }
    try {
        $pdo = db();
        $key = auth_limit_key();
        if (!record_auth_attempt($pdo, $key)) { http_response_code(429); header('Retry-After: 900'); return ['Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.']; }
        if ($page === 'register') {
            try { $userId = User_model::create($name, $email, password_hash($password, PASSWORD_DEFAULT)); }
            catch (PDOException $e) {
                if ((int)($e->errorInfo[1]??0) === 1062) { $GLOBALS['auth_field_errors']['email']='Email này đã được đăng ký.';http_response_code(422); return ['Email này đã được đăng ký. Vui lòng đăng nhập.']; }
                throw $e;
            }
            sign_in(['id'=>$userId, 'name'=>$name, 'email'=>$email]);
            if(class_exists('MarketingAnalytics'))MarketingAnalytics::claimGuest($userId);
            if(function_exists('mce_event')) mce_event('signup:'.$userId,'signup_completed','account',$userId);
        } else {
            $user = User_model::findByEmail($email);
            // Run a password verification even when the email does not exist.
            $hash = $user ? $user['password_hash'] : '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi';
            $verified = password_verify($password, $hash);
            if (!$user || !$verified) { http_response_code(422); return ['Email hoặc mật khẩu chưa đúng.']; }
            if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
                User_model::updatePassword((int)$user['id'], password_hash($password, PASSWORD_DEFAULT));
            }
            sign_in($user);
        }
        auth_redirect('account');
    } catch (Throwable $e) {
        error_log('Authentication database error ['.($_SERVER['MCE_REQUEST_ID']??'cli').']: '.get_class($e));
        http_response_code(503);
        return ['Tạm thời chưa kết nối được hệ thống tài khoản. Vui lòng thử lại sau.'];
    }
}
