<section class="panel"><h2>Đo lường chiến dịch — tùy chọn</h2>
<p>Nếu bạn đồng ý, chúng tôi ghi nhận hành trình từ trang chiến dịch → học thử → đăng ký → hoàn thành bài → quay lại học. Khi bạn tạo tài khoản mới trong phiên này, lựa chọn đồng ý được lưu cùng tài khoản. Không lưu email, đáp án, ghi chú hoặc UTM tùy ý trong hành trình này. Analytics ngoài chỉ gửi khi đã được cấu hình.</p>
<p>Bạn vẫn có thể học khi từ chối. Có thể rút lại tại đây hoặc trong Tài khoản. <a href="/bao-mat">Quyền riêng tư</a>.</p>
<?php $trackingEnabled=current_user()?!empty(mce_one('SELECT analytics FROM mce_consents WHERE user_id=?',[mce_uid()])['analytics']):!empty($_SESSION['marketing_consent']); ?>
<p>Hiện tại: <?=$trackingEnabled?'Đã đồng ý':'Chưa đồng ý'?>.</p>
<form method="post" class="auth-form"><input type="hidden" name="csrf" value="<?=h($_SESSION['csrf'])?>"><input type="hidden" name="command" value="analytics/consent"><input type="hidden" name="campaignSlug" value="<?=h($campaign['slug'])?>">
<?php foreach(['source','medium','campaign'] as $label): ?><input type="hidden" name="utm_<?=$label?>" value="<?=h($campaignLabels[$label])?>"><?php endforeach ?>
<button class="button secondary" name="enabled" value="yes">Đồng ý đo lường</button>
<button class="button secondary" name="enabled" value="no">Từ chối / rút lại đồng ý</button></form></section>
