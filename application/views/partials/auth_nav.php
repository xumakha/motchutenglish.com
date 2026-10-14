<?php if (current_user()): ?>
<div class="auth-nav"><a class="text-link" href="/account">Tài khoản</a><form method="post" action="/logout"><input type="hidden" name="csrf" value="<?=h($_SESSION['csrf'])?>"><button class="text-link" type="submit">Đăng xuất</button></form></div>
<?php else: ?>
<div class="auth-nav"><a class="text-link" href="/login">Đăng nhập</a><a class="button header-cta" href="/register">Đăng ký</a></div>
<?php endif ?>
