<?php
declare(strict_types=1);
final class Course_model
{
    public static function catalog(): array
    {
        static $data;
        if ($data === null) $data = json_decode(file_get_contents(ROOT_PATH.'/assets/json/courses.json'), true, 512, JSON_THROW_ON_ERROR);
        return $data;
    }
    public static function course(string $id): ?array
    {
        foreach (self::catalog()['courses'] as $course) if ($course['id'] === $id) return $course;
        return null;
    }
    public static function lesson(array $course, string $id): ?array
    {
        foreach ($course['lessons'] as $lesson) if ($lesson['id'] === $id) return $lesson;
        return null;
    }
    public static function listening(string $id): ?array
    {
        foreach (self::catalog()['listening'] as $item) if ($item['id'] === $id) return $item;
        return null;
    }
}
