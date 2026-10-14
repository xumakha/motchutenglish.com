<?php
declare(strict_types=1);
define('ROOT_PATH', dirname(__DIR__, 2));
define('APP_PATH', ROOT_PATH.'/application');
require APP_PATH.'/config/config.php';
require APP_PATH.'/core/Database.php';
require APP_PATH.'/models/User_model.php';
require APP_PATH.'/models/Auth_attempt_model.php';
require APP_PATH.'/models/Course_model.php';
require APP_PATH.'/libraries/Auth.php';
require APP_PATH.'/helpers/site_helper.php';
require APP_PATH.'/core/Router.php';
require APP_PATH.'/core/View.php';
foreach (['Home','Courses','Listening','Pages','Auth'] as $controller) require APP_PATH.'/controllers/'.$controller.'.php';
