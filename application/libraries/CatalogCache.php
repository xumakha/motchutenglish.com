<?php
declare(strict_types=1);
final class CatalogCache {
    public static function remember(string $key,callable $loader): array {
        $generation=(app_config()['db_name']??'unconfigured').':'.mce_setting('catalog_revision','initial');$dir=ROOT_PATH.'/writable/cache';
        if(!is_dir($dir))@mkdir($dir,0700,true);
        $file=$dir.'/catalog-'.hash('sha256',$generation.':'.$key).'.json';
        if(is_file($file)&&filemtime($file)>time()-300) {
            $handle=fopen($file,'rb');if($handle){flock($handle,LOCK_SH);$raw=stream_get_contents($handle);flock($handle,LOCK_UN);fclose($handle);try{$value=mce_decode($raw);if(is_array($value))return $value;}catch(Throwable $e){}}
        }
        $value=$loader();if(is_dir($dir))@file_put_contents($file,mce_json($value),LOCK_EX);return $value;
    }
}
