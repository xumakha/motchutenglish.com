<section class="panel"><h2>Hành trình chiến dịch — 30 ngày gần nhất</h2>
<p>Chỉ các phiên đã đồng ý đo lường. Ghi nhận nguồn đầu tiên trong 30 ngày; tải lại trang không tạo thêm một lượt. Quay lại: bắt đầu/hoàn thành bài ít nhất 24 giờ sau bài đầu tiên, không tính chỉ đăng nhập hoặc kiểm tra gợi ý. Không đại diện toàn bộ khách truy cập. Hiển thị tối đa 100 nhóm có nhiều hành trình nhất.</p>
<?php if(!$adminData['funnel']): ?><p>Chưa có hành trình đã đồng ý trong khoảng này.</p><?php else: ?>
<div class="table-scroll"><table><thead><tr><th>Lộ trình / nguồn / phương tiện / chiến dịch</th><th>Đến trang</th><th>Học thử</th><th>Đăng ký sau học thử</th><th>Bài đầu</th><th>Quay lại</th></tr></thead><tbody>
<?php foreach($adminData['funnel'] as $f): ?><tr><td><?=h($f['path_slug'])?> / <?=h($f['source'])?> / <?=h($f['medium'])?> / <?=h($f['campaign']?:'Không gắn nhãn')?></td><?php foreach(['landings','trials','signups','first_lessons','returns'] as $field): ?><td><?=h($f[$field])?></td><?php endforeach ?></tr><?php endforeach ?>
</tbody></table></div><?php endif ?></section>
