<?php
declare(strict_types=1);
final class Auth
{
public function index(string $page): array {
    $titles = ['login'=>'Đăng nhập', 'register'=>'Đăng ký', 'account'=>'Tài khoản', 'logout'=>'Đăng xuất'];
    return ['view'=>'auth/index', 'title'=>$titles[$page], 'authErrors'=>handle_auth($page)];
}
}
