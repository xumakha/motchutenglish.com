<?php
declare(strict_types=1);
interface AssetStorage {
    public function putUploaded(string $temporary,string $key): void;
    public function path(string $key): string;
    public function delete(string $key): void;
}
final class LocalAssetStorage implements AssetStorage {
    public function path(string $key): string {
        if(!preg_match('/^[a-f0-9]{40}\.(jpg|jpeg|png|webp|mp3|ogg|wav)$/D',$key))throw new ProductError(422,'Mã media không hợp lệ.');return ROOT_PATH.'/writable/media/'.$key;
    }
    public function putUploaded(string $temporary,string $key): void {
        $path=$this->path($key);$dir=dirname($path);if(!is_dir($dir))mkdir($dir,0700,true);
        if(!move_uploaded_file($temporary,$path))throw new ProductError(503,'Không thể lưu tệp.');chmod($path,0600);
    }
    public function delete(string $key): void { $path=$this->path($key);if(is_file($path))unlink($path); }
}
function mce_storage(): AssetStorage {
    if((getenv('MEDIA_DRIVER')?:'local')!=='local')throw new ProductError(503,'Storage chưa được cấu hình.');return new LocalAssetStorage();
}
