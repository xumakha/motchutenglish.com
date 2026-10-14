<?php
declare(strict_types=1);
final class Pages
{
public function toeic(): array { return ['view'=>'pages/toeic', 'title'=>'TOEIC cơ bản']; }
public function placement(): array { return ['view'=>'pages/placement', 'title'=>'Tìm lớp phù hợp']; }
public function dashboard(): array { return ['view'=>'pages/dashboard', 'title'=>'Góc học tập']; }
}
