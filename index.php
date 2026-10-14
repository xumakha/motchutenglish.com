<?php
declare(strict_types=1);
require __DIR__.'/application/core/bootstrap.php';
start_auth_session();
$page = request_page();
render_page(dispatch($page), $page);
