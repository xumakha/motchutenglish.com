<?php
declare(strict_types=1);
function render_page(array $result, string $page): void
{
    $data = Course_model::catalog();
    $courses = $data['courses'];
    $listening = $data['listening'];
    $parts = explode('/', $page);
    extract($result, EXTR_SKIP);
    require APP_PATH.'/views/layouts/header.php';
    require APP_PATH.'/views/'.$result['view'].'.php';
    require APP_PATH.'/views/layouts/footer.php';
}
