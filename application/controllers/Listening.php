<?php
declare(strict_types=1);
final class Listening
{
public function index(): array { return ['view'=>'listening/index', 'title'=>'Luyện nghe']; }
public function show(string $id): array {
    $item = Course_model::listening($id);
    return $item ? ['view'=>'listening/show', 'title'=>$item['title'], 'item'=>$item] : not_found();
}
}
