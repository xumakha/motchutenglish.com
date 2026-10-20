<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require dirname(__DIR__).'/application/core/bootstrap.php';
$owner=mce_one("SELECT u.id,u.name,u.email FROM users u JOIN learning_roles r ON r.user_id=u.id WHERE r.role='admin' ORDER BY u.id LIMIT 1");
if(!$owner){fwrite(STDERR,"Register and grant an admin role first: php database/set-role.php EMAIL admin\n");exit(1);}
$_SESSION=['user'=>$owner];$publish=in_array('--publish-reviewed-samples',$argv,true);
$lock=(int)mce_query("SELECT GET_LOCK('mce_seed_product',5)")->fetchColumn();if(!$lock)throw new RuntimeException('Seed already running');
try {
    $seed=mce_decode(file_get_contents(__DIR__.'/product-seed.json'));
    mce_transaction(function()use($seed,$owner,$publish){
        $units=[];
        foreach($seed['paths'] as $i=>$p){
            mce_query('INSERT IGNORE INTO mce_paths(slug,title,description,level,objectives,prerequisites,status,sort_order) VALUES (?,?,?,?,?,?,?,?)',[$p['slug'],$p['title'],$p['description'].' Bộ nội dung mẫu, chưa phải khóa học đầy đủ.',$p['level'],$p['description'],'Không bắt buộc kiến thức trước.',$publish&&$i<2?'published':'draft',$i]);
            $path=mce_one('SELECT id FROM mce_paths WHERE slug=?',[$p['slug']]);
            for($n=0;$n<2;$n++){
                $u=mce_one('SELECT id FROM mce_units WHERE path_id=? AND sort_order=? ORDER BY id LIMIT 1',[$path['id'],$n]);
                if(!$u){mce_query('INSERT INTO mce_units(path_id,title,objectives,sort_order) VALUES (?,?,?,?)',[$path['id'],$n===0?'Chương 1: Bước đầu':'Chương 2: Luyện tập tiếp nối',$p['description'],$n]);$u=['id'=>(int)db()->lastInsertId()];}$units[$i][$n]=$u['id'];
            }
        }
        foreach($seed['lessons'] as $i=>$l){
            if(mce_one('SELECT id FROM mce_lessons WHERE external_key=?',['project-sample:'.$l['slug']]))continue;
            $ready=$publish&&empty($l['requiresAudio']);Assessment::document($l['document'],$ready);
            mce_query('INSERT INTO mce_lessons(unit_id,slug,external_key,subtype,sort_order,required) VALUES (?,?,?,?,?,?)',[$units[$l['path']][$l['unit']??0],$l['slug'],'project-sample:'.$l['slug'],$l['subtype']??'lesson',$i,($l['subtype']??'lesson')==='placement'?0:1]);$id=(int)db()->lastInsertId();
            mce_query('INSERT INTO mce_versions(lesson_id,title,document,status,author_id,published_at) VALUES (?,?,?,?,?,?)',[$id,$l['title'],mce_json($l['document']),$ready?'published':'draft',$owner['id'],$ready?mce_sqltime():null]);$vid=(int)db()->lastInsertId();
            if($ready)mce_query('UPDATE mce_lessons SET current_version=? WHERE id=?',[$vid,$id]);
        }
        foreach($seed['vocabulary'] as $v)mce_query('INSERT IGNORE INTO mce_vocabulary(slug,lemma,ipa,part_of_speech,topic,meaning,example,translation,level,status) VALUES (?,?,?,?,?,?,?,?,?,?)',[$v['slug'],$v['lemma'],$v['ipa'],$v['part_of_speech'],$v['topic'],$v['meaning'],$v['example'],$v['translation'],$v['level'],$publish?'published':'draft']);
        foreach($seed['vocabulary'] as $v){$sense=mce_one('SELECT id FROM mce_vocabulary WHERE slug=?',[$v['slug']]);Content::vocabularySet((int)$sense['id'],$v['topic'],$publish);}
        foreach([['mint','Màu avatar xanh bạc hà',30,'avatar-mint'],['gold','Khung vàng ấm',60,'avatar-gold'],['sun','Huy hiệu nắng nhỏ',100,'avatar-sun']] as $item)mce_query('INSERT IGNORE INTO mce_shop(id,title,price,style) VALUES (?,?,?,?)',$item);
        mce_query('INSERT IGNORE INTO mce_articles(slug,title,body,status) VALUES (?,?,?,?)',['hoc-mot-chut-moi-ngay','Học một chút mỗi ngày',"Chọn một mục tiêu nhỏ, đọc ví dụ rồi tự đặt câu.\nSau bài học, xem giải thích và ôn lại điều chưa nhớ.\nBắt đầu bằng 5-10 phút mỗi ngày. Đây là gợi ý học, không phải bảo đảm kết quả.",$publish?'published':'draft']);
        mce_query('INSERT IGNORE INTO mce_articles(slug,title,body,status) VALUES (?,?,?,?)',['on-lai-co-lich','Ôn lại có lịch',"Sau khi học từ, hãy tự nhớ nghĩa trước khi xem đáp án. Chọn mức nhớ phù hợp với trải nghiệm thật.\nThẻ khó sẽ quay lại sớm hơn. Lịch ôn là gợi ý thực hành, không bảo đảm bạn sẽ nhớ mãi.",$publish?'published':'draft']);
        mce_query('INSERT IGNORE INTO mce_articles(slug,title,body,status) VALUES (?,?,?,?)',['dung-tu-dat-cau','Từ ví dụ đến câu của mình',"Đọc một câu mẫu ngắn, xác định phần có thể thay rồi thử nói về chính mình.\nVới My name is Linh, bạn có thể thay Linh bằng tên mình. Khi viết tự do, đối chiếu tiêu chí thay vì coi một đáp án mẫu là cách đúng duy nhất.",$publish?'published':'draft']);
        mce_audit('seed_samples','catalog',['published'=>$publish]);
    });
    echo 'Sample catalog ready. '.($publish?'Samples published with explicit review flag.':'Review drafts in /admin/lessons before publication.')."\n";
}finally{mce_query("SELECT RELEASE_LOCK('mce_seed_product')");}
