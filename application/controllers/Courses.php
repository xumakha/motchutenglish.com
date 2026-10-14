<?php
declare(strict_types=1);
final class Courses
{
public function index(): array { return ['view'=>'courses/index', 'title'=>'Lộ trình học']; }
public function show(string $courseId): array {
    $course = Course_model::course($courseId);
    return $course ? ['view'=>'courses/show', 'title'=>$course['title'], 'course'=>$course] : not_found();
}
public function lesson(string $courseId, string $lessonId): array {
    $course = Course_model::course($courseId);
    $lesson = $course ? Course_model::lesson($course, $lessonId) : null;
    return $lesson ? ['view'=>'courses/lesson', 'title'=>$lesson['title'], 'course'=>$course, 'lesson'=>$lesson] : not_found();
}
}
