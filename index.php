<?php
declare(strict_types=1);
require __DIR__.'/application/core/bootstrap.php';
try {
    start_auth_session();
    $page = request_page();
    ob_start();
    render_page(dispatch($page), $page);
    ob_end_flush();
} catch (Throwable $error) {
    if(ob_get_level()>0)ob_end_clean();
    $requestId=$_SERVER['MCE_REQUEST_ID']??bin2hex(random_bytes(8));
    error_log('Unhandled request '.$requestId.' '.get_class($error));
    http_response_code($error instanceof ProductError?$error->status:503);
    header('Content-Type: text/html; charset=utf-8');header('Cache-Control: no-store');header('X-Request-ID: '.$requestId);
    echo '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tạm thời gián đoạn</title><h1>Chưa thể tải trang</h1><p>Vui lòng thử lại sau. Mã yêu cầu: '.h($requestId).'</p><a href="/">Về trang chủ</a></html>';
}
