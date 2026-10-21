<?php
declare(strict_types=1);
final class Home
{
public function index(): array {
    try {$paths=Content::paths();$lessons=Content::lessons();}catch(Throwable $e){$paths=[];$lessons=[];}
    return ['view'=>'home/product','title'=>'Học một chút, tiến bộ mỗi ngày','publicPaths'=>$paths,'sampleLessons'=>array_slice(array_values(array_filter($lessons,fn($l)=>!empty(mce_decode($l['document'])['preview']))),0,2)];
}
}
