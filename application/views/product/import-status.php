<section class="panel" data-import-id="<?=h($job['id'])?>" data-import-poll="<?=in_array($importState['status'],['queued','running'],true)||in_array($importState['job']['status']??'',['pending','running'],true)?'1':'0'?>">
<h2>Batch <?=h($job['id'])?></h2><p data-import-status role="status">Trạng thái: <?=h($importState['status'])?> · <?=h($importState['phase'])?></p>
<progress data-import-progress aria-label="Số record đã xử lý, chưa phải số đã lưu" value="<?=h($importState['processed'])?>" max="<?=max(1,$importState['total'])?>"></progress>
<p data-import-count>Đã xử lý <?=h($importState['processed'])?> / <?=h($importState['total'])?> record. Đã xác nhận lưu: <?=h($importState['committed'])?>.</p>
<p>Tiến độ là số record đã xử lý trong giao dịch hiện tại. Chỉ “committed” xác nhận lưu tất cả; lỗi hoặc worker bị ngắt sẽ không lưu một phần. Retry bắt đầu lại từ 0.</p>
<p data-import-job><?php if($importState['job']): ?>Worker: <?=h($importState['job']['status'])?> · lần thử <?=h($importState['job']['attempts'])?> · lịch UTC <?=h($importState['job']['available_at'])?><?php endif ?></p>
<ul data-import-errors><?php foreach($importState['errors'] as $issue): ?><li>Record <?=h($issue['record'])?> · <?=h($issue['field'])?>: <?=h($issue['message'])?></li><?php endforeach ?></ul>
<?php if($importState['canCommit'])product_form('admin/import-commit','Xác nhận commit',['importId'=>$job['id']]); ?>
</section>
