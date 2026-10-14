<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title><?=h($title)?> | Một chút English</title><meta name="description" content="Học tiếng Anh từ cơ bản, tiếng Anh công sở và TOEIC. Luyện nghe và theo dõi tiến độ mỗi ngày."><link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#075fe4">
<link rel="stylesheet" href="/assets/css/style.css"><script src="/assets/js/app.js" defer></script></head><body>
<header class="site-header"><a class="brand" href="<?=h(url())?>"><img class="brand-logo" src="/assets/images/logo.png" width="44" height="44" alt="">một chút english<span class="brand-dot">.</span></a><nav class="nav" id="navigation" aria-label="Điều hướng chính"><?php foreach (['courses'=>'Lộ trình học','listening'=>'Luyện nghe','toeic'=>'TOEIC','dashboard'=>'Góc học tập'] as $path=>$label) linkTo($path,$label,$parts[0]===$path?'active':''); ?></nav><?php require APP_PATH . '/views/partials/auth_nav.php'; ?><button class="menu" aria-controls="navigation" aria-expanded="false" aria-label="Mở menu">☰</button></header>
<main><div class="container page">
