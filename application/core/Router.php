<?php
declare(strict_types=1);
function request_page(): string
{
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    $page = trim(is_string($path) ? $path : '/', '/');
    if ($page === 'index.php' || ($page === '' && isset($_GET['page']))) {
        $legacy = $_GET['page'] ?? '';
        if (!is_string($legacy)) return 'invalid';
        header('Location: '.url($legacy), true, 301);
        exit;
    }
    if ($page !== '' && substr($path, -1) === '/') {
        header('Location: '.url($page), true, 301);
        exit;
    }
    return $page;
}
function dispatch(string $page): array
{
    foreach (require APP_PATH.'/config/routes.php' as $pattern=>$target) {
        if (preg_match($pattern, $page, $matches)) {
            array_shift($matches);
            return (new $target[0])->{$target[1]}(...$matches);
        }
    }
    return not_found();
}
function not_found(): array
{
    http_response_code(404);
    return ['view'=>'errors/404', 'title'=>'Không tìm thấy trang'];
}
