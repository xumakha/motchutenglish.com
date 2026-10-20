<?php
declare(strict_types=1);
final class Assessment {
    public const TYPES=['choice','true_false','fill','order','match','correction','listening_choice','listening_fill','closed','self','flashcard'];
    public static function id(mixed $id): bool {return is_string($id)&&preg_match('/^[a-zA-Z0-9_-]{1,80}$/D',$id)&&!in_array($id,['__proto__','prototype','constructor'],true);}
    private static function answers(mixed $answers): bool {return is_array($answers)&&array_is_list($answers)&&count($answers)>0&&count($answers)<=30&&count(array_filter($answers,fn($s)=>is_string($s)&&trim($s)!==''&&mb_strlen($s)<=4000))===count($answers);}
    public static function normalize(string $s,array $p=[]): string {
        if (!class_exists('Normalizer')) throw new ProductError(503,'Máy chủ cần bật phần mở rộng intl để chấm bài điền từ.');
        $s=Normalizer::normalize($s,Normalizer::FORM_C);
        $policy=$p['whitespace']??'collapse';
        if ($policy==='collapse') $s=preg_replace('/[\s\p{Z}]+/u',' ',$s);
        if ($policy!=='preserve') $s=preg_replace('/^[\s\p{Z}]+|[\s\p{Z}]+$/u','',$s);
        if (!empty($p['ignoreTerminalPunctuation'])) $s=preg_replace('/[.!?]+$/u','',$s);
        if ($policy!=='preserve') $s=preg_replace('/^[\s\p{Z}]+|[\s\p{Z}]+$/u','',$s);
        return !empty($p['caseSensitive'])?$s:mb_strtolower($s,'UTF-8');
    }
    public static function validate(array $e,string $field='exercise',bool $publishing=false): void {
        $fail=fn(string $s)=>throw new ProductError(422,$field.': '.$s,[$field=>$s]);
        if (!isset($e['id'],$e['type'],$e['payload'],$e['explanation'])||!self::id($e['id'])||!in_array($e['type'],self::TYPES,true)||!is_array($e['payload'])) $fail('Cấu trúc câu hỏi không hợp lệ.');
        if (($e['schemaVersion']??0)!==1||!is_int($e['contentVersion']??null)||!is_array($e['skillTags']??null)||!is_string($e['level']??null)) $fail('Thiếu metadata phiên bản, kỹ năng hoặc trình độ.');
        if(!is_string($e['explanation'])||mb_strlen($e['explanation'])>5000||!array_is_list($e['skillTags'])||count($e['skillTags'])>20||$e['contentVersion']<1||mb_strlen($e['level'])>20) $fail('Giải thích hoặc metadata không hợp lệ.');
        foreach($e['skillTags'] as $tag)if(!is_string($tag)||mb_strlen($tag)>80)$fail('Mỗi tag phải là chuỗi tối đa 80 ký tự.');
        $p=$e['payload'];$t=$e['type'];
        if(isset($p['whitespace'])&&!in_array($p['whitespace'],['preserve','trim','collapse'],true))$fail('Whitespace policy không hợp lệ.');
        foreach(['caseSensitive','ignoreTerminalPunctuation','partialCredit'] as $flag)if(isset($p[$flag])&&!is_bool($p[$flag]))$fail($flag.' phải là boolean.');
        if (!is_string($p['prompt']??null)||trim($p['prompt'])===''||mb_strlen($p['prompt'])>5000) $fail('Câu hỏi cần từ 1 đến 5000 ký tự.');
        if (in_array($t,['choice','listening_choice'],true)) {
            $c=$p['choices']??[];if (!is_array($c)||count($c)<2||count($c)>6||!is_string($p['answerId']??null)||!isset($c[$p['answerId']??''])) $fail('Cần 2-6 lựa chọn và một answerId hợp lệ.');
            foreach($c as $id=>$text) if (!is_string($text)||trim($text)===''||mb_strlen($text)>2000||!self::id($id)) $fail('ID hoặc nội dung lựa chọn không hợp lệ.');
        }
        if ($t==='true_false'&&(!is_bool($p['answer']??null)||($p['answer']===false&&(!is_string($p['correction']??null)||trim($p['correction'])==='')))) $fail('Cần đáp án boolean và câu sửa cho mệnh đề sai.');
        if (in_array($t,['fill','listening_fill'],true)) {
            if (empty($p['blanks'])||!is_array($p['blanks'])) $fail('Thiếu blanks.');
            foreach($p['blanks'] as $id=>$answers) if(!self::id($id)||!self::answers($answers))$fail('Mỗi blank cần ID và acceptedAnswers dạng danh sách không rỗng.');
        }
        if (in_array($t,['closed','correction'],true)&&!self::answers($p['acceptedAnswers']??null))$fail('Cần danh sách đáp án biên tập hợp lệ.');
        if ($t==='correction'&&isset($p['errorSegment'])) {
            $seg=$p['errorSegment'];$text=$p['prompt'];
            if (!is_array($seg)||!is_int($seg['start']??null)||!is_int($seg['length']??null)||$seg['start']<0||$seg['length']<1||$seg['start']+$seg['length']>mb_strlen($text)) $fail('Vị trí lỗi không hợp lệ.');
        }
        if ($t==='order') {
            $tokens=$p['tokens']??[];if (!is_array($tokens)||count($tokens)<2||count($tokens)>100||empty($p['acceptedOrders'])||!is_array($p['acceptedOrders'])) $fail('Thiếu tokens hoặc acceptedOrders.');
            foreach($tokens as $id=>$text)if(!self::id($id)||!is_string($text)||trim($text)===''||mb_strlen($text)>300)$fail('Token cần stable ID và nội dung hợp lệ.');
            $ids=array_keys($tokens);sort($ids);
            foreach($p['acceptedOrders'] as $order) { if(!is_array($order)||!array_is_list($order))$fail('Order không hợp lệ.');sort($order);if ($order!==$ids) $fail('Mỗi token phải xuất hiện đúng một lần.'); }
        }
        if ($t==='match') {
            if (empty($p['pairs'])||!is_array($p['pairs'])) $fail('Thiếu các cặp.');
            foreach($p['pairs'] as $id=>$pair) if(!self::id($id)||!is_array($pair)||!is_string($pair['left']??null)||!is_string($pair['right']??null)||trim($pair['left'])===''||trim($pair['right'])==='')$fail('Cặp không hợp lệ.');
        }
        if(in_array($t,['self','flashcard'],true)&&(!is_string($p['modelAnswer']??null)||trim($p['modelAnswer'])===''||mb_strlen($p['modelAnswer'])>5000||!(is_string($p['criteria']??null)?trim($p['criteria'])!=='':self::answers($p['criteria']??null))))$fail('Cần đáp án mẫu và tiêu chí tự đánh giá dạng văn bản/danh sách.');
        if (str_starts_with($t,'listening_')&&($publishing||!empty($p['audioId']))) {
            $media=mce_one('SELECT * FROM mce_media WHERE id=?',[(int)($p['audioId']??0)]);
            if (!$media||!str_starts_with($media['mime'],'audio/')||empty($media['license_text'])||empty($p['transcript'])||!is_file(mce_storage()->path($media['storage_key']))) $fail('Bài nghe cần audio hợp lệ, quyền sử dụng và transcript.');
        }
    }
    public static function grade(array $e,mixed $r): array {
        $p=$e['payload'];$t=$e['type'];$correct=false;$max=1;$score=0;$display='';
        if (in_array($t,['self','flashcard'],true)) return ['score'=>null,'maxScore'=>null,'isCorrect'=>null,'feedback'=>$e['explanation'],'acceptedAnswerDisplay'=>$p['modelAnswer'],'gradingMode'=>'self_assessed','criteria'=>$p['criteria']];
        if (in_array($t,['choice','listening_choice'],true)) {
            if (!is_string($r)||!array_key_exists($r,$p['choices'])) throw new ProductError(422,'Chọn một đáp án hợp lệ.');
            $correct=$r===$p['answerId'];$display=$p['choices'][$p['answerId']];
        } elseif($t==='true_false') {
            if (!is_bool($r)) throw new ProductError(422,'Đáp án phải là đúng hoặc sai.');
            $correct=$r===$p['answer'];$display=$p['answer']?'Đúng':('Sai. '.$p['correction']);
        } elseif(in_array($t,['fill','listening_fill'],true)) {
            if (!is_array($r)||array_diff(array_keys($r),array_keys($p['blanks']))||array_diff(array_keys($p['blanks']),array_keys($r))) throw new ProductError(422,'Điền đủ các ô trống.');
            $max=count($p['blanks']);$n=0;$answers=[];
            foreach($p['blanks'] as $id=>$accepted) { if (!is_string($r[$id])) throw new ProductError(422,'Đáp án không hợp lệ.');$match=array_map(fn($s)=>self::normalize($s,$p),$accepted);$n+=in_array(self::normalize($r[$id],$p),$match,true)?1:0;$answers[]='Ô '.(count($answers)+1).': '.implode(' / ',$accepted); }
            $score=$n;$correct=$n===$max;$display=implode('; ',$answers);
        } elseif(in_array($t,['closed','correction'],true)) {
            if (!is_string($r)||mb_strlen($r)>4000) throw new ProductError(422,'Đáp án không hợp lệ.');
            $correct=in_array(self::normalize($r,$p),array_map(fn($s)=>self::normalize($s,$p),$p['acceptedAnswers']),true);$display=implode(' / ',$p['acceptedAnswers']);
        } elseif($t==='order') {
            if (!is_array($r)||!array_is_list($r)) throw new ProductError(422,'Thứ tự không hợp lệ.');
            $ids=array_keys($p['tokens']);$sorted=$r;sort($ids);sort($sorted);
            if ($ids!==$sorted) throw new ProductError(422,'Mỗi token phải được dùng đúng một lần.');
            $correct=in_array($r,$p['acceptedOrders'],true);$display=implode(' ',array_map(fn($id)=>$p['tokens'][$id],$p['acceptedOrders'][0]));
        } elseif($t==='match') {
            if (!is_array($r)||count($r)!==count($p['pairs'])||count(array_filter($r,'is_string'))!==count($r)||count(array_unique($r))!==count($r)) throw new ProductError(422,'Ghép đủ các cặp, không dùng trùng.');
            $n=0;foreach($p['pairs'] as $id=>$pair) { if (!isset($r[$id])||!isset($p['pairs'][$r[$id]])) throw new ProductError(422,'Cặp không hợp lệ.');$n+=($r[$id]===$id)?1:0; }
            $correct=$n===count($p['pairs']);$max=!empty($p['partialCredit'])?count($p['pairs']):1;$score=!empty($p['partialCredit'])?$n:($correct?1:0);$display=implode('; ',array_map(fn($v)=>$v['left'].' = '.$v['right'],$p['pairs']));
        } else throw new ProductError(422,'Dạng bài chưa được hỗ trợ.');
        if (!in_array($t,['fill','listening_fill','match'],true)) $score=$correct?1:0;
        return ['score'=>$score,'maxScore'=>$max,'isCorrect'=>$correct,'feedback'=>$e['explanation'],'acceptedAnswerDisplay'=>$display,'gradingMode'=>'objective'];
    }
    public static function publicExercise(array $e): array {
        $p=$e['payload'];
        foreach(['answerId','answer','correction','acceptedAnswers','acceptedOrders','modelAnswer','criteria','transcript'] as $key) unset($p[$key]);
        if (isset($p['blanks'])) $p['blanks']=array_keys($p['blanks']);
        if (isset($p['pairs'])) { $pairs=$p['pairs'];$left=[];$right=[];foreach($pairs as $id=>$v){$left[$id]=$v['left'];$right[$id]=$v['right'];} $p['left']=$left;$p['right']=$right;unset($p['pairs']); }
        return ['id'=>$e['id'],'type'=>$e['type'],'payload'=>$p];
    }
    public static function solution(array $e): array {
        $p=$e['payload'];$response=match($e['type']) {
            'choice','listening_choice'=>$p['answerId'], 'true_false'=>$p['answer'],
            'fill','listening_fill'=>array_map(fn($a)=>$a[0],$p['blanks']),
            'closed','correction'=>$p['acceptedAnswers'][0], 'order'=>$p['acceptedOrders'][0],
            'match'=>array_combine(array_keys($p['pairs']),array_keys($p['pairs'])), default=>''
        };
        return self::grade($e,$response);
    }
    public static function document(array $d,bool $publishing=false): void {
        if (($d['schemaVersion']??null)!==1||!is_array($d['blocks']??null)||!is_array($d['exercises']??null)||!is_string($d['objectives']??null)||trim($d['objectives'])===''||mb_strlen($d['objectives'])>2000||!is_int($d['minutes']??null)||$d['minutes']<1||$d['minutes']>120) throw new ProductError(422,'Bài học thiếu schemaVersion, mục tiêu, thời lượng, blocks hoặc exercises.');
        if(!array_is_list($d['blocks'])||!array_is_list($d['exercises'])||count($d['blocks'])>100||count($d['exercises'])>100)throw new ProductError(422,'Blocks và exercises phải là danh sách, tối đa 100 mục mỗi loại.');
        if (!isset($d['passThreshold'])||!is_int($d['passThreshold'])||$d['passThreshold']<0||$d['passThreshold']>100) throw new ProductError(422,'Ngưỡng đạt phải từ 0 đến 100.');
        $ids=[];
        foreach($d['blocks'] as $i=>$b) {
            if (!is_array($b)||!self::id($b['id']??null)||isset($ids[$b['id']])||!in_array($b['type']??'', ['text','heading','bilingual','table','audio','dialogue','vocabulary','tip'],true)) throw new ProductError(422,'blocks.'.$i.': ID hoặc loại block không hợp lệ.');
            $ids[$b['id']]=true;
            if ($b['type']==='audio'&&($publishing||!empty($b['audioId']))) {
                $m=mce_one('SELECT * FROM mce_media WHERE id=?',[(int)($b['audioId']??0)]);
                if (!$m||!str_starts_with($m['mime'],'audio/')||empty($m['license_text'])||empty($b['transcript'])||!is_file(mce_storage()->path($m['storage_key']))) throw new ProductError(422,'Block audio cần tệp có quyền sử dụng và transcript.');
            } elseif($b['type']!=='audio'&&(!is_string($b['text']??null)||mb_strlen($b['text'])>20000)) throw new ProductError(422,'Block cần text tối đa 20000 ký tự.');
        }
        foreach($d['exercises'] as $i=>$e) { self::validate($e,'exercises.'.$i,$publishing);if(isset($ids[$e['id']])) throw new ProductError(422,'ID block/câu hỏi bị trùng.');$ids[$e['id']]=true; }
        if (!$d['blocks']&&!$d['exercises']) throw new ProductError(422,'Bài học không được trống.');
    }
}
