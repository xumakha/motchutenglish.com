<?php
declare(strict_types=1);
final class Seo {
    public static function text(mixed $value,int $max): string {
        $value=mce_text($value,$max,false);
        if(preg_match('/[<>\x00-\x1f\x7f]/u',$value))throw new ProductError(422,'SEO chỉ nhận văn bản thuần trên một dòng.');return $value;
    }
    public static function publicPath(string $path): bool {
        return $path==='/'||(bool)preg_match('#^/(?:lo-trinh|tu-vung|kien-thuc|courses|listening|toeic|placement|kiem-tra-dau-vao|gioi-thieu|lien-he|dieu-khoan|bao-mat)$#D',$path)
            ||(bool)preg_match('#^/(?:lo-trinh|bai-hoc|kien-thuc|chien-dich|listening|tu-vung)/[a-z0-9]+(?:-[a-z0-9]+)*$#D',$path)
            ||(bool)preg_match('#^/(?:tu-vung/chu-de/[a-z0-9]+(?:-[a-z0-9]+)*|courses/[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)?)$#D',$path);
    }
    public static function entityPath(string $path): bool {
        return (bool)preg_match('#^/(?:lo-trinh/[^/]+|bai-hoc/[^/]+|kien-thuc/[^/]+|tu-vung/(?:chu-de/[^/]+|(?!chu-de$)[^/]+))$#D',$path);
    }
    public static function save(array $data): void {
        mce_staff(true);$path=$data['path']??'';
        if(!is_string($path)||strlen($path)>255||!self::publicPath($path)||self::entityPath($path))throw new ProductError(422,'Chọn URL public hợp lệ, không có query. Nội dung riêng từng bài/lộ trình/từ cần sửa trong bản nháp của nội dung đó.');
        $title=mce_field('title',fn()=>self::text($data['title']??'',160));$description=mce_field('description',fn()=>self::text($data['description']??'',320));
        mce_transaction(function()use($path,$title,$description){
            if($title===''&&$description==='')mce_query('DELETE FROM mce_page_seo WHERE path=?',[$path]);
            else mce_query('INSERT INTO mce_page_seo(path,title,description) VALUES (?,?,?) ON DUPLICATE KEY UPDATE title=VALUES(title),description=VALUES(description)',[$path,$title,$description]);
            mce_audit('page_seo_saved',$path);
        });
    }
    public static function metadata(string $page,string $title,?string $description): array {
        $path='/'.trim($page,'/');$fallback=['title'=>$title,'description'=>$description??'Học tiếng Anh từng bước nhỏ, có giải thích và lịch ôn rõ ràng.'];
        if(http_response_code()>=400||!self::publicPath($path))return $fallback;
        $row=null;
        foreach(['lo-trinh'=>'paths','tu-vung/chu-de'=>'vocabulary_sets','tu-vung'=>'vocabulary','kien-thuc'=>'articles'] as $prefix=>$kind){
            if(preg_match('#^/'.preg_quote($prefix,'#').'/([a-z0-9-]+)$#D',$path,$m)){$row=mce_one("SELECT seo_title AS title,seo_description AS description".($kind==='vocabulary'?',lemma AS fallback_title':'')." FROM mce_".$kind." WHERE slug=? AND status='published'",[$m[1]]);if(!empty($row['fallback_title']))$fallback['title']=$row['fallback_title'];break;}
        }
        if(!$row)$row=mce_one('SELECT title,description FROM mce_page_seo WHERE path=?',[$path]);
        if($row)foreach(['title','description'] as $key)if(trim($row[$key]??'')!=='')$fallback[$key]=$row[$key];
        return $fallback;
    }
}
