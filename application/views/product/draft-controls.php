<?php
// Staff-only partial, rendered with the persisted proposal/version, never its public projection.
$draftType=$draftType??'entity';
$draftStatus=$draftType==='article'?($draftDocument['status']??''):$draftRecord['status'];
$draftCommand=$draftType==='article'?'admin/article-workflow':'admin/entity-workflow';
$draftKey=$draftType==='article'?'versionId':'draftId';
?>
<?php if(!empty($draftDocument['reviewFeedback']['reason'])): ?><p><strong>Lý do trả lại:</strong> <?=h($draftDocument['reviewFeedback']['reason'])?></p><?php endif ?>
<?php if($draftStatus==='draft'):
$editDocument=$draftDocument;unset($editDocument['reviewFeedback'],$editDocument['baseSenseIds']);$editDocument['status']='draft';
$editingFailed=($pending['command']??'')==='admin/draft-save'&&($pending['type']??'')===$draftType&&(int)($pending['draftId']??0)===(int)$draftRecord['id'];
if($editingFailed)$editDocument=$pending['document']??$editDocument;
?>
<details <?=isset($_GET['draft'])||$editingFailed?'open':''?>><summary>Sửa bản nháp #<?=h($draftRecord['id'])?></summary>
<form method="post" class="auth-form">
<input type="hidden" name="csrf" value="<?=h($_SESSION['csrf'])?>">
<input type="hidden" name="command" value="admin/draft-save">
<input type="hidden" name="type" value="<?=h($draftType)?>">
<input type="hidden" name="draftId" value="<?=h($draftRecord['id'])?>">
<input type="hidden" name="expected" value="<?=h($editingFailed?($pending['expected']??''):hash('sha256',$draftRecord['document']))?>">
<label>Nội dung JSON của đúng bản nháp này<textarea name="document" rows="14" class="code-input" required><?=h(is_array($editDocument)?json_encode($editDocument,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT):$editDocument)?></textarea></label>
<p>Lưu chỉ sửa bản nháp này. Sau khi sửa, gửi duyệt lại. Nội dung đang công khai được giữ nguyên.</p>
<button class="button">Lưu bản nháp #<?=h($draftRecord['id'])?></button>
</form></details>
<a href="?draft=<?=h($draftRecord['id'])?>">Mở riêng bản nháp #<?=h($draftRecord['id'])?></a>
<?php endif ?>
<?php if($draftStatus==='in_review'&&mce_role()==='admin'): ?>
<form method="post" class="auth-form">
<input type="hidden" name="csrf" value="<?=h($_SESSION['csrf'])?>">
<input type="hidden" name="command" value="<?=h($draftCommand)?>">
<input type="hidden" name="<?=$draftKey?>" value="<?=h($draftRecord['id'])?>">
<input type="hidden" name="action" value="return">
<label>Lý do trả về nháp<textarea name="reason" required maxlength="2000" rows="2"></textarea></label>
<button class="button secondary">Trả về nháp</button>
</form>
<?php endif ?>
