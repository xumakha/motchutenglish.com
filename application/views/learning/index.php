<?php heading($title,'Học một chút mỗi ngày, lưu tiến bộ cùng tài khoản của bạn.'); ?>
<?php if ($error): ?><p role="alert"><?=h($error)?></p><?php else: ?>
<nav class="audio-player"><a class="button" href="/hoc">Học hôm nay</a><?php if (in_array($role,['admin','editor'],true)): ?><a class="button" href="/admin">Quản trị nội dung</a><?php endif ?></nav>
<?php if ($section==='admin'): ?>
<section class="panel green"><h2>Quản trị nội dung đầy đủ</h2><p>Mở CMS lộ trình, phiên bản bài học, từ vựng, báo lỗi và nhập/xuất. Biểu mẫu bên dưới được giữ để tương thích bài cũ.</p><a class="button" href="/admin/lessons">Mở CMS mới</a></section>
<section class="panel"><h2><?=isset($draft)?'Sửa bài học nháp':'Tạo bài học nháp'?></h2><p>Bản đầu hỗ trợ nội dung văn bản và một câu trắc nghiệm. Bài đã xuất bản được giữ nguyên; tạo bài mới khi cần thay nội dung.</p>
<form method="post"><input type="hidden" name="csrf" value="<?=h($_SESSION['csrf'])?>">
<?php if (isset($draft)): ?><input type="hidden" name="action" value="edit"><input type="hidden" name="lesson_id" value="<?=h($draft['id'])?>"><?php endif ?>
<?php foreach (['title'=>'Tên bài học','body'=>'Nội dung bài học','question'=>'Câu hỏi','one'=>'Lựa chọn thứ nhất','two'=>'Lựa chọn thứ hai','explanation'=>'Giải thích đáp án'] as $key=>$label): ?><p><label><?=h($label)?><textarea name="<?=h($key)?>" required maxlength="<?=$key==='body'?30000:($key==='title'?200:($key==='question'||$key==='explanation'?5000:2000))?>"><?=h($draft[$key]??$draft['choices'][$key]??'')?></textarea></label></p><?php endforeach ?>
<label>Đáp án đúng <select name="answer"><option value="one">Lựa chọn thứ nhất</option><option value="two" <?=($draft['answer_id']??'')==='two'?'selected':''?>>Lựa chọn thứ hai</option></select></label><p><button class="button">Lưu bản nháp</button></p></form></section>
<?php else: ?><section class="panel green"><h2><?=h($xp)?> XP - Cấp hoạt động <?=1+(int)floor($xp/200)?></h2><p>XP ghi nhận hoạt động, không đại diện trình độ tiếng Anh.</p></section><?php endif ?>
<h2><?=$section==='admin'?'Nội dung':'Bài học đã xuất bản'?></h2>
<?php if (!$lessons): ?><p>Chưa có bài học được xuất bản trong hệ thống mới. <a href="/courses">Xem các bài học thử hiện có</a>.</p><?php endif ?>
<?php foreach ($lessons as $item): ?><section class="panel"><h3><?=h($item['title'])?></h3>
<?php if ($section==='admin' && $item['status']==='draft'): ?><p><a href="/admin?edit=<?=$item['id']?>">Sửa bản nháp</a></p><?php endif ?>
<?php if ($section==='admin'): ?><p><a href="/admin/preview/<?=$item['id']?>">Xem trước</a></p><p><?=h($item['status']==='draft'?'Bản nháp':'Đã xuất bản')?></p><?php if ($item['status']==='draft' && $role==='admin'): ?><form method="post"><input type="hidden" name="csrf" value="<?=h($_SESSION['csrf'])?>"><input type="hidden" name="action" value="publish"><input type="hidden" name="lesson_id" value="<?=$item['id']?>"><button class="button">Xuất bản</button></form><?php endif ?><?php endif ?>
<?php if ($item['status']==='published'): ?><form method="post" action="/hoc/bai/<?=$item['id']?>"><input type="hidden" name="csrf" value="<?=h($_SESSION['csrf'])?>"><input type="hidden" name="request_key" value="<?=bin2hex(random_bytes(16))?>"><button class="button">Bắt đầu học</button></form><?php endif ?></section><?php endforeach ?>
<?php if ($section!=='admin'): ?><h2>Lịch sử và bài đang học</h2><?php foreach ($history as $a): $snapshot=json_decode($a['snapshot'],true); ?><p><a href="/ket-qua/<?=h($a['id'])?>"><?=h($snapshot['title'])?> - <?=$a['submitted_at']===null?'Tiếp tục học':($a['score']?'Đã đạt - 100%':'Đã hoàn thành - 0%')?></a></p><?php endforeach ?><?php endif ?>
<?php endif ?>
