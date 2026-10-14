<?php
// Only these route patterns can select controllers. User input is never a filename.
return [
    '#^$#' => [Home::class, 'index'],
    '#^courses$#' => [Courses::class, 'index'],
    '#^courses/([a-z0-9-]+)$#' => [Courses::class, 'show'],
    '#^courses/([a-z0-9-]+)/([a-z0-9-]+)$#' => [Courses::class, 'lesson'],
    '#^listening$#' => [Listening::class, 'index'],
    '#^listening/([a-z0-9-]+)$#' => [Listening::class, 'show'],
    '#^toeic$#' => [Pages::class, 'toeic'],
    '#^placement$#' => [Pages::class, 'placement'],
    '#^dashboard$#' => [Pages::class, 'dashboard'],
    '#^(login|register|account|logout)$#' => [Auth::class, 'index'],
];
