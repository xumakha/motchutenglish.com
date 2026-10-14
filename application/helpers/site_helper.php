<?php
declare(strict_types=1);
function h($value): string { return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8'); }
function url(string $path = ''): string { return '/' . implode('/', array_map('rawurlencode', explode('/', trim($path, '/')))); }
function linkTo(string $path, string $label, string $class = 'button'): void { echo '<a class="'.h($class).'" href="'.h(url($path)).'">'.h($label).'</a>'; }
function heading(string $title, string $description = '', string $eyebrow = 'MỘT CHÚT MỖI NGÀY'): void { echo '<div class="page-heading"><span class="eyebrow">'.h($eyebrow).'</span><h1>'.h($title).'</h1><p>'.h($description).'</p></div>'; }
function audio(string $text): void { echo '<div class="audio-player"><button class="button" data-audio="'.h($text).'">▶ Nghe mẫu</button><label class="speed">Tốc độ <select><option value="0.65">Chậm</option><option value="0.8" selected>Vừa</option><option value="1">Bình thường</option></select></label><span role="status" class="audio-error"></span></div>'; }
function quiz(array $q, string $id): void { ?>
<section class="quiz" data-quiz data-id="<?=h($id)?>" data-answer="<?=h($q['answer'])?>" data-explanation="<?=h($q['explanation'])?>"><h3><?=h($q['prompt'])?></h3><div class="answers"><?php foreach ($q['choices'] as $i => $choice): ?><button class="answer" data-choice="<?=$i?>"><span><?=chr(65+$i)?></span><?=h($choice)?></button><?php endforeach ?></div><button class="button" data-check disabled>Kiểm tra đáp án</button><div role="status" data-feedback></div></section>
<?php }
function card(array $c): void { ?>
<article class="course-card <?=h($c['id'])?>" data-filter-item="<?=h($c['id'])?>"><div class="card-top"><span class="course-icon"><?=h($c['icon'])?></span><span class="badge"><?=h($c['level'])?></span></div><h3><?=h($c['title'])?></h3><p><?=h($c['description'])?></p><div class="course-meta"><span>10–15 phút / bài</span><span><?=count($c['lessons'])?> bài học</span></div><div class="progress"><span data-course-progress="<?=h($c['id'])?>"></span></div><?php linkTo('courses/'.$c['id'], 'Khám phá lộ trình →', 'card-link'); ?></article>
<?php }
function overview(array $c): void { ?>
<div class="learning-layout"><div class="lesson-list"><?php foreach ($c['lessons'] as $i => $l): ?><a class="lesson-row" href="<?=h(url('courses/'.$c['id'].'/'.$l['id']))?>"><span class="lesson-number" data-completed="<?=h($c['id'].'/'.$l['id'])?>"><?=sprintf('%02d', $i+1)?></span><div><h3><?=h($l['title'])?></h3><span>Đọc mẫu câu · Luyện nghe · Thực hành</span></div><span class="lesson-time">10–15 phút</span>→</a><?php endforeach ?></div><aside class="panel green"><span class="eyebrow">LỘ TRÌNH CỦA BẠN</span><h2><span data-course-count="<?=h($c['id'])?>">0</span>/<?=count($c['lessons'])?> bài hoàn thành</h2><div class="progress"><span data-course-progress="<?=h($c['id'])?>"></span></div><p>Mỗi bài học là một bước nhỏ. Hãy học theo thứ tự hoặc chọn chủ đề bạn cần.</p><a class="button" data-resume="<?=h($c['id'])?>" href="<?=h(url('courses/'.$c['id'].'/'.$c['lessons'][0]['id']))?>">Tiếp tục học →</a></aside></div>
<?php }
