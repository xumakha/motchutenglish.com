<?php
declare(strict_types=1);
final class Content {
    public static function vocabularySet(int $sense,string $topic,bool $publish=false): void {
        $slug=preg_match('/^[a-z0-9-]{1,100}$/D',$topic)?$topic:'chu-de-'.substr(hash('sha256',$topic),0,12);
        $title=match($topic){'greetings'=>'Chào hỏi','daily'=>'Đời sống','work'=>'Công việc','time'=>'Thời gian',default=>$topic};
        mce_query('INSERT IGNORE INTO mce_vocabulary_sets(slug,title,description,status) VALUES (?,?,?,?)',[$slug,$title,'Các nghĩa từ và ví dụ theo chủ đề '.$title.'.',$publish?'published':'draft']);
        $set=mce_one('SELECT id FROM mce_vocabulary_sets WHERE slug=?',[$slug]);mce_query('INSERT IGNORE INTO mce_vocabulary_set_items(set_id,sense_id) VALUES (?,?)',[$set['id'],$sense]);
    }
    public static function redirect(string $old,string $new): void {
        if($old===$new)return;
        mce_query('DELETE FROM mce_redirects WHERE old_path=?',[$new]);
        mce_query('UPDATE mce_redirects SET new_path=? WHERE new_path=?',[$new,$old]);
        mce_query('INSERT INTO mce_redirects(old_path,new_path) VALUES (?,?) ON DUPLICATE KEY UPDATE new_path=VALUES(new_path)',[$old,$new]);
    }
    public static function slug(mixed $s): string { if(!is_string($s)||!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D',$s)||strlen($s)>150)throw new ProductError(422,'Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang.');return $s; }
    public static function paths(): array { return CatalogCache::remember('paths',fn()=>mce_all("SELECT p.*,COUNT(DISTINCT l.id) AS lesson_count FROM mce_paths p JOIN mce_units u ON u.path_id=p.id JOIN mce_lessons l ON l.unit_id=u.id JOIN mce_versions v ON v.id=l.current_version WHERE p.status='published' AND u.archived=0 AND l.archived=0 AND l.subtype<>'placement' AND v.status='published' GROUP BY p.id ORDER BY p.sort_order,p.id")); }
    public static function lessons(?int $pathId=null): array {
        return CatalogCache::remember('lessons:'.($pathId??'all'),fn()=>mce_all("SELECT l.*,v.title,v.document,v.id AS version_id,u.title AS unit_title,u.path_id,p.title AS path_title,p.slug AS path_slug FROM mce_lessons l JOIN mce_versions v ON v.id=l.current_version JOIN mce_units u ON u.id=l.unit_id JOIN mce_paths p ON p.id=u.path_id WHERE u.archived=0 AND l.archived=0 AND l.subtype<>'placement' AND v.status='published' AND p.status='published'".($pathId?' AND p.id=?':'').' ORDER BY p.sort_order,u.sort_order,l.sort_order,l.id',$pathId?[$pathId]:[]));
    }
    public static function saveVersion(array $data): int {
        mce_staff();$uid=mce_uid();$title=mce_text($data['title']??'',200);$document=$data['document']??null;
        if(!is_array($document)) throw new ProductError(422,'Document phải là JSON object.');Assessment::document($document);
        return mce_transaction(function()use($data,$document,$uid,$title){
            $lesson=(int)($data['lessonId']??0);
            if(!$lesson) {
                $unit=(int)($data['unitId']??0);if(!mce_one('SELECT id FROM mce_units WHERE id=?',[$unit]))throw new ProductError(422,'Chọn chương hợp lệ.');
                $subtype=$data['subtype']??'lesson';if(!in_array($subtype,['lesson','checkpoint','placement'],true))throw new ProductError(422,'Loại bài không hợp lệ.');
                mce_query('INSERT INTO mce_lessons(unit_id,slug,subtype,sort_order,external_key) VALUES (?,?,?,?,?)',[$unit,self::slug($data['slug']??''),$subtype,(int)($data['sortOrder']??0),$data['externalKey']??null]);$lesson=(int)db()->lastInsertId();
            } else {
                $existing=mce_one('SELECT * FROM mce_lessons WHERE id=? FOR UPDATE',[$lesson]);if(!$existing)throw new ProductError(404,'Không tìm thấy bài.');
                $document['slug']=self::slug($data['slug']??$existing['slug']);
                if($existing['current_version']) {
                    $published=mce_decode(mce_one('SELECT document FROM mce_versions WHERE id=?',[$existing['current_version']])['document']);$previous=array_column($published['exercises'],null,'id');
                    foreach($document['exercises'] as &$exercise) {
                        if(!isset($previous[$exercise['id']]))continue;
                        $old=$previous[$exercise['id']];$oldNumber=$old['contentVersion'];$candidate=$exercise;unset($old['contentVersion'],$candidate['contentVersion']);
                        $exercise['contentVersion']=$oldNumber+($old===$candidate?0:1);
                    }unset($exercise);
                }
            }
            $version=(int)($data['versionId']??0);
            if($version) {
                $v=mce_one('SELECT * FROM mce_versions WHERE id=? AND lesson_id=? FOR UPDATE',[$version,$lesson]);
                if(!$v||$v['status']!=='draft')throw new ProductError(409,'Chỉ sửa trực tiếp bản nháp. Hãy tạo bản nháp mới từ bản đã xuất bản.');
                mce_query('UPDATE mce_versions SET title=?,document=? WHERE id=?',[$title,mce_json($document),$version]);
            } else {
                mce_query('INSERT INTO mce_versions(lesson_id,title,document,author_id) VALUES (?,?,?,?)',[$lesson,$title,mce_json($document),$uid]);$version=(int)db()->lastInsertId();
            }
            mce_audit('draft_saved','version:'.$version);return $version;
        });
    }
    public static function workflow(int $version,string $action): void {
        mce_staff($action!=='review');
        mce_transaction(function()use($version,$action){
            $v=mce_one('SELECT * FROM mce_versions WHERE id=? FOR UPDATE',[$version]);if(!$v)throw new ProductError(404,'Không tìm thấy phiên bản.');
            if($action==='review') { if($v['status']!=='draft')throw new ProductError(409,'Chỉ gửi duyệt bản nháp.');Assessment::document(mce_decode($v['document']));mce_query("UPDATE mce_versions SET status='in_review' WHERE id=?",[$version]); }
            elseif($action==='publish') {
                if($v['status']==='published')return;
                if($v['status']!=='in_review')throw new ProductError(409,'Hãy gửi duyệt trước khi xuất bản.');$document=mce_decode($v['document']);Assessment::document($document,true);
                $lesson=mce_one('SELECT slug,subtype FROM mce_lessons WHERE id=? FOR UPDATE',[$v['lesson_id']]);
                if($lesson['subtype']==='checkpoint') {
                    $ids=$document['blueprint']['questionIds']??[];
                    if(!is_array($ids)||!$ids||array_diff($ids,array_column($document['exercises'],'id'))||!array_filter($document['exercises'],fn($e)=>!in_array($e['type'],['self','flashcard'],true)))throw new ProductError(422,'Checkpoint cần blueprint tham chiếu câu hỏi thật và phần chấm khách quan.');
                }
                if($lesson['subtype']==='placement') {
                    if(count($document['exercises'])!==20||($document['blueprint']['questionCount']??null)!==20||empty($document['blueprint']['rules']))throw new ProductError(422,'Kiểm tra gợi ý cần 20 câu cố định và quy tắc blueprint.');
                    foreach($document['blueprint']['rules'] as $rule)if(!is_int($rule['minPercent']??null)||$rule['minPercent']<0||$rule['minPercent']>100||!mce_one("SELECT p.id FROM mce_paths p JOIN mce_units u ON u.path_id=p.id JOIN mce_lessons l ON l.unit_id=u.id WHERE p.slug=? AND p.status='published' AND l.current_version IS NOT NULL AND l.archived=0 LIMIT 1",[$rule['pathSlug']??'']))throw new ProductError(422,'Quy tắc gợi ý phải trỏ tới lộ trình có bài học khả dụng.');
                }
                if(isset($document['slug'])&&$document['slug']!==$lesson['slug']) {
                    $slug=self::slug($document['slug']);mce_query('UPDATE mce_lessons SET slug=? WHERE id=?',[$slug,$v['lesson_id']]);self::redirect('/bai-hoc/'.$lesson['slug'],'/bai-hoc/'.$slug);
                }
                mce_query("UPDATE mce_versions SET status='published',published_at=? WHERE id=?",[mce_sqltime(),$version]);
                mce_query('UPDATE mce_lessons SET current_version=?,archived=0 WHERE id=?',[$version,$v['lesson_id']]);
            } elseif($action==='archive') { mce_query('UPDATE mce_lessons SET archived=1 WHERE id=?',[$v['lesson_id']]); }
            elseif($action==='restore') { if($v['status']!=='published')throw new ProductError(422,'Chỉ khôi phục bản đã xuất bản.');mce_query('UPDATE mce_lessons SET archived=0,current_version=? WHERE id=?',[$version,$v['lesson_id']]); }
            elseif($action==='return') { if($v['status']!=='in_review')throw new ProductError(409,'Phiên bản chưa được gửi duyệt.');mce_query("UPDATE mce_versions SET status='draft' WHERE id=?",[$version]); }
            else throw new ProductError(422,'Trạng thái không hợp lệ.');mce_audit($action,'version:'.$version);
        });
    }
    private static function entityRow(string $kind,array $data): array {
        $id=(int)($data['id']??0);
        $fields=match($kind){
            'paths'=>['slug','title','description','level','objectives','prerequisites','image_id','status','sort_order'],
            'units'=>['path_id','title','objectives','sort_order'],
            'vocabulary'=>['slug','lemma','ipa','part_of_speech','topic','meaning','example','translation','level','audio_id','status'],
            'articles'=>['slug','title','body','status'],
            'vocabulary_sets'=>['slug','title','description','status','sort_order'],
            default=>throw new ProductError(422,'Loại nội dung không hợp lệ.')};
        $row=[];foreach($fields as $f) {
            if(in_array($f,['sort_order','path_id'],true))$row[$f]=(int)($data[$f]??0);
            elseif(in_array($f,['audio_id','image_id'],true))$row[$f]=empty($data[$f])?null:(int)$data[$f];
            else {$max=match($f){'slug','lemma','ipa'=>150,'part_of_speech'=>60,'topic'=>100,'level','status'=>20,'description','body','objectives','prerequisites','meaning','example','translation'=>15000,default=>200};$row[$f]=mce_text($data[$f]??'',$max,!in_array($f,['ipa','prerequisites'],true));}
        }
        if(isset($row['slug']))self::slug($row['slug']);
        if($kind==='vocabulary')self::slug($row['topic']);
        if(!empty($row['audio_id'])) {
            $m=mce_one('SELECT * FROM mce_media WHERE id=?',[$row['audio_id']]);if(!$m||!str_starts_with($m['mime'],'audio/')||!$m['license_text']||!is_file(mce_storage()->path($m['storage_key'])))throw new ProductError(422,'Chọn audio từ thư viện có quyền sử dụng.');
        }
        if(!empty($row['image_id'])){$image=mce_one('SELECT mime FROM mce_media WHERE id=?',[$row['image_id']]);if(!$image||!str_starts_with($image['mime'],'image/'))throw new ProductError(422,'Ảnh lộ trình cần tệp ảnh trong thư viện.');}
        if(isset($row['status'])) {
            if(!in_array($row['status'],['draft','in_review','published','archived'],true))throw new ProductError(422,'Trạng thái không hợp lệ.');
            if(in_array($row['status'],['published','archived'],true))mce_staff(true);
        }
        if($kind==='units'&&!mce_one('SELECT id FROM mce_paths WHERE id=?',[$row['path_id']]))throw new ProductError(422,'Lộ trình không tồn tại.');
        if($kind==='vocabulary_sets'&&$row['status']==='published'&&(!$id||!mce_one("SELECT i.sense_id FROM mce_vocabulary_set_items i JOIN mce_vocabulary v ON v.id=i.sense_id WHERE i.set_id=? AND v.status='published' LIMIT 1",[$id])))throw new ProductError(422,'Thêm ít nhất một nghĩa từ đã xuất bản trước khi xuất bản bộ từ.');
        return $row;
    }
    public static function saveEntity(string $kind,array $data): int {
        mce_staff();$id=(int)($data['id']??0);$row=self::entityRow($kind,$data);
        return mce_transaction(function()use($kind,$id,$row){
            if($id) {
                $old=mce_one('SELECT * FROM mce_'.$kind.' WHERE id=? FOR UPDATE',[$id]);if(!$old)throw new ProductError(404,'Nội dung không tồn tại.');
                if(in_array($kind,['paths','vocabulary','vocabulary_sets'],true)&&$old['status']==='published'&&$row['status']!=='archived') {
                    $status=$row['status']==='published'?'in_review':$row['status'];
                    mce_query('INSERT INTO mce_entity_drafts(kind,entity_id,document,status,author_id) VALUES (?,?,?,?,?)',[$kind,$id,mce_json($row),$status,mce_uid()]);
                    mce_audit('entity_draft_created',$kind.':'.$id);return $id;
                }
                if($kind==='articles'&&$old['status']==='published'&&$row['status']!=='archived') {
                    // Drafts never replace the current published projection.
                    $draft=$row;$draft['status']=$row['status']==='published'?'in_review':$row['status'];
                    mce_query('INSERT INTO mce_article_versions(article_id,document,actor_id,created_at) VALUES (?,?,?,?)',[$id,mce_json($draft),mce_uid(),mce_sqltime()]);
                    mce_audit('article_draft_created','article:'.$id);return $id;
                }
                // Store revisions of public articles before replacing the published projection.
                if($kind==='articles') mce_query('INSERT INTO mce_article_versions(article_id,document,actor_id,created_at) VALUES (?,?,?,?)',[$id,mce_json($old),mce_uid(),mce_sqltime()]);
                mce_query('UPDATE mce_'.$kind.' SET '.implode(',',array_map(fn($k)=>$k.'=?',array_keys($row))).' WHERE id=?',[...array_values($row),$id]);
                if(isset($old['slug'])&&$old['slug']!==$row['slug']) {
                    $prefix=match($kind){'paths'=>'lo-trinh','vocabulary'=>'tu-vung','articles'=>'kien-thuc','vocabulary_sets'=>'tu-vung/chu-de'};
                    self::redirect('/'.$prefix.'/'.$old['slug'],'/'.$prefix.'/'.$row['slug']);
                }
            } else { mce_query('INSERT INTO mce_'.$kind.'('.implode(',',array_keys($row)).') VALUES ('.implode(',',array_fill(0,count($row),'?')).')',array_values($row));$id=(int)db()->lastInsertId(); }
            if($kind==='vocabulary')self::vocabularySet($id,$row['topic']);
            mce_audit('save_'.$kind,(string)$id);return $id;
        });
    }
    public static function articleWorkflow(int $version,string $action): void {
        mce_staff($action==='publish');
        mce_transaction(function()use($version,$action){
            $v=mce_one('SELECT * FROM mce_article_versions WHERE id=? FOR UPDATE',[$version]);if(!$v)throw new ProductError(404,'Không tìm thấy bản bài viết.');$d=mce_decode($v['document']);
            if($action==='review') {if(($d['status']??'')!=='draft')throw new ProductError(409,'Chỉ gửi duyệt bản nháp.');$d['status']='in_review';}
            elseif($action==='publish') {
                if(($d['status']??'')==='published')return;
                if(($d['status']??'')!=='in_review')throw new ProductError(409,'Bài viết chưa được gửi duyệt.');
                $old=mce_one('SELECT * FROM mce_articles WHERE id=? FOR UPDATE',[$v['article_id']]);
                mce_query('INSERT INTO mce_article_versions(article_id,document,actor_id,created_at) VALUES (?,?,?,?)',[$v['article_id'],mce_json($old),mce_uid(),mce_sqltime()]);
                $d['status']='published';mce_query("UPDATE mce_articles SET slug=?,title=?,body=?,status='published',revision=revision+1,updated_at=? WHERE id=?",[$d['slug'],$d['title'],$d['body'],mce_sqltime(),$v['article_id']]);
                if($old['slug']!==$d['slug'])self::redirect('/kien-thuc/'.$old['slug'],'/kien-thuc/'.$d['slug']);
            } else throw new ProductError(422,'Thao tác không hợp lệ.');
            mce_query('UPDATE mce_article_versions SET document=? WHERE id=?',[mce_json($d),$version]);mce_audit('article_'.$action,'article_version:'.$version);
        });
    }
    public static function entityWorkflow(int $draft,string $action): void {
        mce_staff($action==='publish');
        mce_transaction(function()use($draft,$action){
            $v=mce_one('SELECT * FROM mce_entity_drafts WHERE id=? FOR UPDATE',[$draft]);if(!$v)throw new ProductError(404,'Không tìm thấy bản đề xuất.');
            if($action==='review'){if($v['status']!=='draft')throw new ProductError(409,'Chỉ gửi duyệt bản nháp.');mce_query("UPDATE mce_entity_drafts SET status='in_review' WHERE id=?",[$draft]);}
            elseif($action==='publish') {
                if($v['status']==='published')return;if($v['status']!=='in_review')throw new ProductError(409,'Bản đề xuất chưa gửi duyệt.');
                $kind=$v['kind'];if(!in_array($kind,['paths','vocabulary','vocabulary_sets'],true))throw new ProductError(422,'Loại dữ liệu không hợp lệ.');$d=mce_decode($v['document']);$d['status']='published';
                $old=mce_one('SELECT slug FROM mce_'.$kind.' WHERE id=? FOR UPDATE',[$v['entity_id']]);
                mce_query('UPDATE mce_'.$kind.' SET '.implode(',',array_map(fn($k)=>$k.'=?',array_keys($d))).' WHERE id=?',[...array_values($d),$v['entity_id']]);
                if($old['slug']!==$d['slug']){ $prefix=match($kind){'paths'=>'/lo-trinh/','vocabulary_sets'=>'/tu-vung/chu-de/',default=>'/tu-vung/'};self::redirect($prefix.$old['slug'],$prefix.$d['slug']); }
                if($kind==='vocabulary')self::vocabularySet((int)$v['entity_id'],$d['topic']);
                mce_query("UPDATE mce_entity_drafts SET status='published' WHERE id=?",[$draft]);
            }else throw new ProductError(422,'Thao tác không hợp lệ.');
            mce_audit('entity_'.$action,'draft:'.$draft);
        });
    }
    public static function upload(array $file,array $data): int {
        mce_staff();mce_limit('upload',30);
        if(($file['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK||($file['size']??0)>10*1024*1024||!is_uploaded_file($file['tmp_name']??''))throw new ProductError(422,'Tệp không hợp lệ hoặc vượt quá 10 MB.');
        $mime=(new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
        $allow=['image/jpeg'=>['jpg','jpeg'],'image/png'=>['png'],'image/webp'=>['webp'],'audio/mpeg'=>['mp3'],'audio/ogg'=>['ogg'],'audio/x-wav'=>['wav'],'audio/wav'=>['wav']];
        $ext=strtolower(pathinfo($file['name'],PATHINFO_EXTENSION));if(!isset($allow[$mime])||!in_array($ext,$allow[$mime],true))throw new ProductError(422,'Chỉ nhận JPG, PNG, WebP, MP3, OGG hoặc WAV đúng MIME. Không nhận SVG.');
        $alt=mce_text($data['alt']??'',500);$source=mce_text($data['source']??'',2000);$license=mce_text($data['license']??'',500);
        $key=bin2hex(random_bytes(20)).'.'.$ext;$storage=mce_storage();$storage->putUploaded($file['tmp_name'],$key);
        try { mce_query('INSERT INTO mce_media(storage_key,filename,mime,bytes,alt_text,source,license_text,uploader_id) VALUES (?,?,?,?,?,?,?,?)',[$key,mb_substr(basename($file['name']),0,200),$mime,$file['size'],$alt,$source,$license,mce_uid()]);return (int)db()->lastInsertId(); }
        catch(Throwable $e){$storage->delete($key);throw $e;}
    }
    public static function importPreview(string $raw): array {
        mce_staff();mce_limit('import',10);if(strlen($raw)>1024*1024)throw new ProductError(422,'Batch tối đa 1 MB.');
        if(!str_starts_with(ltrim($raw),'{')) {
            $stream=fopen('php://temp','r+');fwrite($stream,$raw);rewind($stream);$headers=fgetcsv($stream,0,',','"','');
            $rows=[];if(!$headers||!in_array('externalId',$headers,true)){fclose($stream);throw new ProductError(422,'CSV cần header theo template từ vựng.');}
            while(($row=fgetcsv($stream,0,',','"',''))!==false) {
                if($row===[null])continue;
                if(count($row)!==count($headers)){fclose($stream);throw new ProductError(422,'CSV có số cột không khớp tại dòng '.(count($rows)+2).'.');}
                $rows[]=array_combine($headers,$row);if(count($rows)>1000){fclose($stream);throw new ProductError(422,'CSV tối đa 1000 records.');}
            }fclose($stream);$doc=['schemaVersion'=>1,'namespace'=>'csv-vocabulary','vocabulary'=>$rows];
        } else {try{$doc=mce_decode($raw);}catch(Throwable $e){throw new ProductError(422,'JSON không hợp lệ.');}}
        if(!is_array($doc)||!is_string($doc['namespace']??null)||!preg_match('/^[a-z0-9-]{1,50}$/D',$doc['namespace']))throw new ProductError(422,'Namespace không hợp lệ.');
        if(count(array_intersect(array_keys($doc),['paths','units','articles','vocabulary_sets','vocabulary','lessons']))!==1)throw new ProductError(422,'Mỗi batch chỉ chứa một loại dữ liệu.');
        foreach(['paths','units','articles','vocabulary_sets'] as $kind)if(isset($doc[$kind])) {
            if(($doc['schemaVersion']??0)!==1||!is_array($doc[$kind])||!array_is_list($doc[$kind])||count($doc[$kind])>1000)throw new ProductError(422,'Batch cần schemaVersion=1 và tối đa 1000 records.');
            $errors=[];$keys=[];$slugs=[];
            foreach($doc[$kind] as $i=>$record)try {
                if(!is_array($record))throw new ProductError(422,'Record phải là object.');
                $key=strtolower(mce_text($record['externalId']??'',100));if(isset($keys[$key]))throw new ProductError(422,'externalId trùng.');$keys[$key]=true;
                $record['status']='draft';$row=self::entityRow($kind,$record);
                if(isset($row['slug'])){if(isset($slugs[$row['slug']])||mce_one('SELECT id FROM mce_'.$kind.' WHERE slug=?',[$row['slug']]))throw new ProductError(422,'Slug đã tồn tại hoặc trùng trong batch.');$slugs[$row['slug']]=true;}
                if(mce_one('SELECT entity_id FROM mce_external_refs WHERE namespace=? AND external_id=? AND kind=?',[$doc['namespace'],$key,$kind]))throw new ProductError(422,'externalId đã tồn tại.');
            }catch(Throwable $e){$errors[]=['record'=>$i+1,'field'=>$kind.'.'.$i,'message'=>$e instanceof ProductError?$e->getMessage():'Record không hợp lệ.'];}
            $id=bin2hex(random_bytes(16));mce_query('INSERT INTO mce_imports(id,actor_id,document,errors) VALUES (?,?,?,?)',[$id,mce_uid(),mce_json($doc),mce_json($errors)]);return ['id'=>$id,'errors'=>$errors,'count'=>count($doc[$kind]),'status'=>'preview'];
        }
        if(isset($doc['vocabulary'])) {
            if(($doc['schemaVersion']??0)!==1||!is_array($doc['vocabulary'])||count($doc['vocabulary'])>1000||!preg_match('/^[a-z0-9-]{1,50}$/D',$doc['namespace']??''))throw new ProductError(422,'Batch từ vựng không hợp lệ.');
            $errors=[];$keys=[];$slugs=[];
            foreach($doc['vocabulary'] as $i=>$v) {
                try {
                    if(isset($v['schemaVersion'])&&(int)$v['schemaVersion']!==1)throw new ProductError(422,'schemaVersion record phải bằng 1.');
                    foreach(['externalId','slug','lemma','part_of_speech','topic','meaning','example','translation','level'] as $f) mce_text($v[$f]??'',in_array($f,['meaning','example','translation'],true)?15000:200);
                    $v['status']='draft';self::entityRow('vocabulary',$v);
                    if(isset($slugs[$v['slug']]))throw new ProductError(422,'Slug trùng trong batch.');$slugs[$v['slug']]=true;
                    self::slug($v['slug']);$key=strtolower(mce_text($v['externalId'],100));if(isset($keys[$key]))throw new ProductError(422,'externalId trùng.');$keys[$key]=true;
                    if(mce_one('SELECT id FROM mce_vocabulary WHERE slug=?',[$v['slug']])||mce_one("SELECT entity_id FROM mce_external_refs WHERE namespace=? AND external_id=? AND kind='vocabulary'",[$doc['namespace'],$key]))throw new ProductError(422,'Nội dung đã tồn tại, không ghi đè.');
                } catch(Throwable $e){$errors[]=['record'=>$i+1,'field'=>'vocabulary.'.$i,'message'=>$e instanceof ProductError?$e->getMessage():'Record không hợp lệ.'];}
            }
            $id=bin2hex(random_bytes(16));mce_query('INSERT INTO mce_imports(id,actor_id,document,errors) VALUES (?,?,?,?)',[$id,mce_uid(),mce_json($doc),mce_json($errors)]);return ['id'=>$id,'errors'=>$errors,'count'=>count($doc['vocabulary']),'status'=>'preview'];
        }
        if(!is_array($doc)||($doc['schemaVersion']??0)!==1||!preg_match('/^[a-z0-9-]{1,50}$/D',$doc['namespace']??'')||!is_array($doc['lessons']??null)||count($doc['lessons'])>1000)throw new ProductError(422,'Batch cần schemaVersion=1, namespace và tối đa 1000 lessons.');
        $errors=[];$keys=[];$slugs=[];
        foreach($doc['lessons'] as $i=>$row) {
            try {
                if(!is_array($row))throw new ProductError(422,'Record không hợp lệ.');self::slug($row['slug']??'');mce_text($row['title']??'',200);
                $slug=$row['slug'];if(isset($slugs[$slug]))throw new ProductError(422,'Slug trùng trong batch.');$slugs[$slug]=true;
                $key=$doc['namespace'].':'.strtolower(mce_text($row['externalId']??'',100));if(isset($keys[$key]))throw new ProductError(422,'externalId trùng trong batch.');$keys[$key]=true;
                if(!mce_one('SELECT id FROM mce_units WHERE id=?',[(int)($row['unitId']??0)]))throw new ProductError(422,'unitId không tồn tại.');
                Assessment::document($row['document']??[]);
                if(mce_one('SELECT id FROM mce_lessons WHERE external_key=? OR slug=?',[$key,$row['slug']]))throw new ProductError(422,'externalId hoặc slug đã tồn tại. Batch không ghi đè nội dung.');
            }catch(Throwable $e){$errors[]=['record'=>$i+1,'field'=>'lessons.'.$i,'message'=>$e instanceof ProductError?$e->getMessage():'Cấu trúc record không hợp lệ.'];}
        }
        $id=bin2hex(random_bytes(16));mce_query('INSERT INTO mce_imports(id,actor_id,document,errors) VALUES (?,?,?,?)',[$id,mce_uid(),mce_json($doc),mce_json($errors)]);
        return ['id'=>$id,'errors'=>$errors,'count'=>count($doc['lessons']),'status'=>'preview'];
    }
    public static function importCommit(string $id,bool $fromWorker=false): void {
        mce_staff();mce_transaction(function()use($id,$fromWorker){
            $job=mce_one('SELECT * FROM mce_imports WHERE id=? AND actor_id=? FOR UPDATE',[mce_key($id),mce_uid()]);if(!$job)throw new ProductError(404,'Không tìm thấy batch.');if($job['status']==='committed')return;
            if(mce_decode($job['errors']))throw new ProductError(422,'Batch còn lỗi. Không có nội dung nào được nhập.');
            $doc=mce_decode($job['document']);
            $kind=null;foreach(['paths','units','articles','vocabulary_sets'] as $candidate)if(isset($doc[$candidate])){$kind=$candidate;break;}
            if(!$fromWorker&&count($kind?$doc[$kind]:($doc['vocabulary']??$doc['lessons']))>100) {
                mce_query("INSERT IGNORE INTO mce_jobs(type,payload,event_key,available_at) VALUES ('import',?,?,?)",[mce_json(['actorId'=>mce_uid(),'importId'=>$id]),'import:'.$id,mce_sqltime()]);
                mce_query("UPDATE mce_imports SET status='queued' WHERE id=?",[$id]);mce_audit('import_queued',$id);return;
            }
            if($kind)foreach($doc[$kind] as $r){$r['status']='draft';$row=self::entityRow($kind,$r);mce_query('INSERT INTO mce_'.$kind.'('.implode(',',array_keys($row)).') VALUES ('.implode(',',array_fill(0,count($row),'?')).')',array_values($row));$entity=(int)db()->lastInsertId();mce_query('INSERT INTO mce_external_refs(namespace,external_id,kind,entity_id) VALUES (?,?,?,?)',[$doc['namespace'],$r['externalId'],$kind,$entity]);}
            elseif(isset($doc['vocabulary'])) foreach($doc['vocabulary'] as $v) {
                mce_query("INSERT INTO mce_vocabulary(slug,lemma,ipa,part_of_speech,topic,meaning,example,translation,level,status) VALUES (?,?,?,?,?,?,?,?,?,'draft')",[$v['slug'],$v['lemma'],$v['ipa']??'',$v['part_of_speech'],$v['topic'],$v['meaning'],$v['example'],$v['translation'],$v['level']]);
                $sense=(int)db()->lastInsertId();self::vocabularySet($sense,$v['topic']);
                mce_query("INSERT INTO mce_external_refs(namespace,external_id,kind,entity_id) VALUES (?,?,'vocabulary',?)",[$doc['namespace'],$v['externalId'],$sense]);
            } else foreach($doc['lessons'] as $r){Assessment::document($r['document']);mce_query('INSERT INTO mce_lessons(unit_id,slug,external_key) VALUES (?,?,?)',[$r['unitId'],$r['slug'],$doc['namespace'].':'.$r['externalId']]);$lesson=(int)db()->lastInsertId();mce_query('INSERT INTO mce_versions(lesson_id,title,document,author_id) VALUES (?,?,?,?)',[$lesson,$r['title'],mce_json($r['document']),mce_uid()]);}
            mce_query("UPDATE mce_imports SET status='committed' WHERE id=?",[$id]);mce_audit('import_committed',$id);
        });
    }
}
