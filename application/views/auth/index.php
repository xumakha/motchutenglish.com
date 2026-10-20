<?php
if ($page === 'account' && current_user()): $user = current_user();
    heading('Chào '.$user['name'].'!', 'Chào mừng bạn đến với Một chút English.', 'TÀI KHOẢN CỦA BẠN'); ?>
    <section class="panel narrow"><h2>Thông tin tài khoản</h2><p>Tên: <?=h($user['name'])?></p><p>Email: <?=h($user['email'])?></p><p class="muted">Bài học mới được đồng bộ cùng tài khoản. Các bài học thử cũ vẫn lưu trên trình duyệt.</p><?php linkTo('hoc', 'Đến trang học →'); ?></section>
<?php else:
    $register = $page === 'register';
    heading($register ? 'Tạo tài khoản của bạn.' : 'Chào mừng bạn trở lại.', 'Học nhẹ nhàng, tiến bộ mỗi ngày.', $register ? 'ĐĂNG KÝ' : 'ĐĂNG NHẬP'); ?>
    <section class="panel narrow auth-panel">
    <?php if ($authErrors): ?><div class="feedback retry" role="alert"><?php foreach ($authErrors as $error): ?><p><?=h($error)?></p><?php endforeach ?></div><?php endif ?>
    <?php if ($page !== 'logout'): ?>
    <form method="post" action="<?=h(url($page))?>" class="auth-form">
        <input type="hidden" name="csrf" value="<?=h($_SESSION['csrf'])?>">
        <?php if ($register): ?><label for="name">Tên của bạn</label><input id="name" name="name" autocomplete="name" maxlength="100" required value="<?=h(post_value('name'))?>"><?php endif ?>
        <label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" maxlength="254" required value="<?=h(post_value('email'))?>">
        <label for="password">Mật khẩu</label><input id="password" name="password" type="password" autocomplete="<?=$register?'new-password':'current-password'?>" <?=$register?'minlength="8"':''?> required aria-describedby="password-hint">
        <span id="password-hint" class="muted small"><?=$register?'Ít nhất 8 ký tự, tối đa 72 byte (khoảng 72 ký tự tiếng Anh).':'Nhập mật khẩu tài khoản của bạn.'?></span>
        <?php if ($register): ?><label for="password_confirm">Nhập lại mật khẩu</label><input id="password_confirm" name="password_confirm" type="password" autocomplete="new-password" minlength="8" required><?php endif ?>
        <button class="button" type="submit"><?=$register?'Đăng ký':'Đăng nhập'?></button>
    </form>
    <p class="auth-switch"><?=$register?'Đã có tài khoản?':'Chưa có tài khoản?'?> <?php linkTo($register?'login':'register', $register?'Đăng nhập':'Đăng ký', 'text-link'); ?></p>
    <?php endif ?>
    </section>
<?php endif ?>

<p><a href="/quen-mat-khau">Quên mật khẩu?</a> - <a href="/tai-khoan">Cài đặt và quyền riêng tư</a></p>
