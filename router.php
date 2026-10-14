<?php
// Local development router; hosting uses .htaccess.
declare(strict_types=1);
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (in_array($path, ['/assets/style.css', '/assets/app.js', '/assets/courses.json'], true)) {
    return false;
}
require __DIR__ . '/index.php';
