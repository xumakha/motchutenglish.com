<?php if(!empty($paging)):
$query=$root==='so-tu-vung'?['q'=>is_string($_GET['q']??null)?mb_substr($_GET['q'],0,100):'','filter'=>$wordFilter??'all']:['manage'=>1];
$pageUrl=fn($n)=>'/'.$root.'?'.http_build_query($query+['page'=>$n]);
?>
<nav class="product-nav" aria-label="Phân trang">
<span>Trang <?=h($paging['page'])?> / <?=h($paging['pages'])?> · <?=h($paging['total'])?> mục</span>
<?php if($paging['page']>1): ?><a rel="prev" href="<?=h($pageUrl($paging['page']-1))?>">Trang trước</a><?php endif ?>
<?php if($paging['page']<$paging['pages']): ?><a rel="next" href="<?=h($pageUrl($paging['page']+1))?>">Trang sau</a><?php endif ?>
</nav>
<?php endif ?>
