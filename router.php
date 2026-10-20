<?php
// Local development equivalent of the public routes in .htaccess.
declare(strict_types=1);
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$aliases = ['/assets/style.css'=>'/assets/css/style.css', '/assets/app.js'=>'/assets/js/app.js', '/assets/courses.json'=>'/assets/json/courses.json'];
if (isset($aliases[$path])) { header('Location: '.$aliases[$path], true, 301); return; }
$static = ['/assets/css/style.css', '/assets/css/product.css', '/assets/js/app.js', '/assets/js/product.js', '/assets/json/courses.json', '/assets/images/logo.png', '/favicon.ico', '/favicon-32x32.png', '/favicon-16x16.png', '/apple-touch-icon.png', '/site.webmanifest', '/android-chrome-192x192.png', '/android-chrome-512x512.png'];
if (in_array($path, $static, true)) return false;
require __DIR__.'/index.php';
