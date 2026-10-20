<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title><?=h($title)?> | Một chút English</title><meta name="description" content="<?=h($metaDescription??'Học tiếng Anh từng bước nhỏ, có giải thích và lịch ôn rõ ràng.')?>"><link rel="icon" href="<?=h(mce_setting('favicon_media_id')?'/media/'.(int)mce_setting('favicon_media_id'):'/favicon.ico')?>" sizes="any">
<?php if (http_response_code()>=400 || in_array($parts[0], ['hoc','admin','ket-qua','account','dashboard','bat-dau','tai-khoan','tien-do','on-tap','so-tu-vung','tim-kiem','reward-shop','login','register','quen-mat-khau','dat-lai-mat-khau','xac-minh-email','huy-nhac-hoc','kiem-tra-dau-vao'], true)): ?><meta name="robots" content="noindex, nofollow"><?php endif ?>
<meta name="csrf-token" content="<?=h($_SESSION['csrf'])?>">
<link rel="canonical" href="<?=h(Identity::base().'/'.trim($page,'/'))?>"><meta property="og:title" content="<?=h($title)?> | Một Chút English"><meta property="og:type" content="website"><meta property="og:url" content="<?=h(Identity::base().'/'.trim($page,'/'))?>">
<script src="/assets/js/product.js" defer></script>
<meta property="og:description" content="<?=h($metaDescription??'Học tiếng Anh từng bước nhỏ, có giải thích và lịch ôn rõ ràng.')?>"><meta property="og:image" content="<?=h(Identity::base().(mce_setting('logo_media_id')?'/media/'.(int)mce_setting('logo_media_id'):'/android-chrome-512x512.png'))?>">
<?php if($page!==''&&http_response_code()<400&&in_array($parts[0],['lo-trinh','bai-hoc','tu-vung','kien-thuc','gioi-thieu'],true)): ?>
<script type="application/ld+json"><?=json_encode(['@context'=>'https://schema.org','@type'=>'BreadcrumbList','itemListElement'=>[['@type'=>'ListItem','position'=>1,'name'=>'Trang chủ','item'=>Identity::base().'/'],['@type'=>'ListItem','position'=>2,'name'=>$title,'item'=>Identity::base().'/'.trim($page,'/')]]],JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_UNESCAPED_UNICODE)?></script>
<?php endif ?>
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="<?=h(mce_setting('primary','#146b50'))?>">
<link rel="stylesheet" href="/assets/css/style.css"><link rel="stylesheet" href="/assets/css/product.css"><link rel="stylesheet" href="/theme.css"><script src="/assets/js/app.js" defer></script></head><body class="<?=str_starts_with($page,'hoc/luot/')?'lesson-mode ':''?><?=current_user()&&!mce_profile((int)current_user()['id'])['animations']?'mce-no-motion':''?>">
<header class="site-header"><a class="brand" href="<?=h(url())?>"><img class="brand-logo" src="<?=h(mce_setting('logo_media_id')?'/media/'.(int)mce_setting('logo_media_id'):'/assets/images/logo.png')?>" width="44" height="44" alt=""><span class="brand-name"><?=h(mce_setting('site_name','một chút english'))?></span><span class="brand-dot">.</span></a><nav class="nav" id="navigation" aria-label="Điều hướng chính"><?php foreach (['hoc'=>'Hôm nay','lo-trinh'=>'Lộ trình','on-tap'=>'Ôn tập','tai-khoan'=>'Tài khoản'] as $navPath=>$navLabel) linkTo($navPath,$navLabel,$parts[0]===$navPath?'active':''); ?></nav><?php require APP_PATH . '/views/partials/auth_nav.php'; ?><button class="menu" aria-controls="navigation" aria-expanded="false" aria-label="Mở menu">☰</button></header>
<main><div class="container page">
