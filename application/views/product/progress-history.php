<section class="panel"><h2>Tuần học của bạn</h2>
<p><?=h($weekStart)?> – <?=h($weekEnd)?> · <?=h($profile['timezone'])?></p>
<nav class="product-nav" aria-label="Chọn tuần thống kê">
<?php if($weekOffset<520): ?><a href="/tien-do?week=<?=$weekOffset+1?>">Tuần trước</a><?php endif ?>
<?php if($weekOffset>0): ?><a href="/tien-do?week=<?=$weekOffset-1?>">Tuần sau</a><a href="/tien-do">Tuần này</a><?php endif ?></nav>
<div class="stats-grid">
<p><strong><?=h($weekTotals['lessons'])?></strong> lượt hoàn thành bài</p>
<p><strong><?=h($weekTotals['activeDays'])?> / 7</strong> ngày hoạt động</p>
<p><strong><?=h($weekTotals['reviews'])?></strong> lượt ôn</p>
<p>Độ chính xác: <strong><?=!empty($weekScore['max_score'])?round(100*$weekScore['score']/$weekScore['max_score'],1).'%':'Chưa có dữ liệu'?></strong></p>
<p><?=h(round($weekSeconds/60,1))?> phút tương tác ước tính</p></div>
<p>Số bài/ngày hoạt động/lượt ôn theo ngày đã ghi nhận khi học; độ chính xác tính các lượt bài khách quan kết thúc trong tuần theo múi giờ hiển thị, không tính kiểm tra gợi ý hoặc preview. Bài tự đánh giá không tính thành 0%.</p>
<?php if(!$weekDays): ?><p>Tuần này chưa có hoạt động được ghi nhận.</p><?php else: ?><ul><?php foreach($weekDays as $day): ?><li><?=h($day['local_date'])?>: <?=h($day['lessons'])?> bài, <?=h($day['reviews'])?> lượt ôn</li><?php endforeach ?></ul><?php endif ?>
</section>
<section class="panel"><h2>Lịch sử lượt học đã kết thúc</h2><p>Lịch sử tất cả thời gian, mở đúng phiên bản đã học. Không bao gồm lượt xem trước của staff.</p>
<?php if(!$history): ?><p>Bạn chưa có lượt học đã kết thúc.</p><?php endif ?>
<?php foreach($history as $attempt): ?><article class="panel"><h3><a href="/hoc/luot/<?=h($attempt['id'])?>"><?=h($attempt['title'])?></a></h3>
<p><?=h((new DateTimeImmutable($attempt['finished_at'],new DateTimeZone('UTC')))->setTimezone(new DateTimeZone($profile['timezone']))->format('d/m/Y H:i'))?> · Phiên bản #<?=h($attempt['version_id'])?><?=!empty($attempt['archived'])?' · Bài đã lưu trữ':''?><?=$attempt['subtype']==='placement'?' · Kiểm tra gợi ý':''?></p>
<p><?=!empty($attempt['max_score'])?h($attempt['score']).' / '.h($attempt['max_score']).' ('.h(round(100*$attempt['score']/$attempt['max_score'],1)).'%)':'Tự đánh giá / chưa có điểm khách quan'?></p></article><?php endforeach ?>
<nav class="product-nav" aria-label="Phân trang lịch sử"><span>Trang <?=h($historyPaging['page'])?> / <?=h($historyPaging['pages'])?> · <?=h($historyPaging['total'])?> lượt</span>
<?php if($historyPaging['page']>1): ?><a rel="prev" href="/tien-do?week=<?=$weekOffset?>&amp;page=<?=$historyPaging['page']-1?>">Trang trước</a><?php endif ?>
<?php if($historyPaging['page']<$historyPaging['pages']): ?><a rel="next" href="/tien-do?week=<?=$weekOffset?>&amp;page=<?=$historyPaging['page']+1?>">Trang sau</a><?php endif ?></nav></section>
