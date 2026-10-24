<?php
// Golden-file generator: runs the PHP Assessment class over every sample exercise with a set of
// correct, wrong and malformed responses, plus normalisation and document-validation cases.
// The TypeScript port must reproduce this output exactly (web/src/domain/assessment/golden.test.ts).
//   php web/tests/golden/assessment.php > web/tests/golden/assessment.json
declare(strict_types=1);
$root=dirname(__DIR__,3);
require $root.'/application/core/bootstrap.php';

function attempt(callable $fn): array {
    try { return ['ok'=>$fn()]; }
    catch (ProductError $e) { return ['error'=>['status'=>$e->status,'message'=>$e->getMessage(),'fields'=>(object)$e->fields]]; }
}

$exercises=[];
$all=mce_decode(file_get_contents($root.'/database/templates/all-exercises.json'));
foreach($all['exercises'] as $e)$exercises[]=$e;
$seed=mce_decode(file_get_contents($root.'/database/product-seed.json'));
foreach($seed['lessons'] as $l)foreach($l['document']['exercises'] as $e)$exercises[]=$e;

function responses(array $e): array {
    $p=$e['payload'];$out=[];
    switch($e['type']) {
        case 'choice': case 'listening_choice':
            foreach(array_keys($p['choices']) as $id)$out[]=(string)$id;$out[]='nope';$out[]=1;$out[]=null;break;
        case 'true_false': $out=[true,false,'true',null];break;
        case 'fill': case 'listening_fill':
            $first=array_map(fn($a)=>$a[0],$p['blanks']);$out[]=$first;
            $out[]=array_map(fn($a)=>"  ".mb_strtoupper($a[0])." .\u{00A0}",$p['blanks']);
            $out[]=array_map(fn($a)=>'wrong',$p['blanks']);
            $out[]=array_slice($first,0,max(0,count($first)-1),true);$out[]=array_values($first);
            $out[]=array_map(fn($a)=>5,$p['blanks']);break;
        case 'closed': case 'correction':
            foreach($p['acceptedAnswers'] as $a){$out[]=$a;$out[]=' '.mb_strtoupper($a).'! ';$out[]=$a."\n";}
            $out[]='definitely wrong';$out[]=7;break;
        case 'order':
            $o=$p['acceptedOrders'][0];$out[]=$o;$out[]=array_reverse($o);$out[]=array_merge([$o[0]],$o);$out[]=array_slice($o,1);$out[]=['x'=>$o[0]];break;
        case 'match':
            $ids=array_keys($p['pairs']);$out[]=array_combine($ids,$ids);
            $rot=$ids;$rot[]=array_shift($rot);$out[]=array_combine($ids,$rot);
            $dup=array_fill_keys($ids,$ids[0]);$out[]=$dup;$out[]=array_values($ids);$out[]=[$ids[0]=>'missing'];break;
        default: $out=['anything',''];
    }
    return $out;
}

$grades=[];
foreach($exercises as $i=>$e) {
    $rows=[];
    foreach(responses($e) as $r)$rows[]=['response'=>$r,'result'=>attempt(fn()=>Assessment::grade($e,$r))];
    $rows[]=['response'=>'__solution__','result'=>attempt(fn()=>Assessment::solution($e))];
    $grades[]=['exercise'=>$e,'cases'=>$rows,'public'=>Assessment::publicExercise($e)];
}

$strings=["  Hello   World  ","HELLO.","hello!!!","hello?!\n","a\u{00A0}b\u{2009}c","\u{FEFF}bom","cafe\u{0301}","İstanbul","ΣΟΦΟΣ","Đường Việt Nam","tab\tand\nnewline","trailing.\n","x . ","can't"];
$policies=[[],['whitespace'=>'preserve'],['whitespace'=>'trim'],['ignoreTerminalPunctuation'=>true],['caseSensitive'=>true],['whitespace'=>'preserve','ignoreTerminalPunctuation'=>true]];
$normalize=[];
foreach($strings as $s)foreach($policies as $p)$normalize[]=['input'=>$s,'policy'=>(object)$p,'output'=>Assessment::normalize($s,$p)];

// Document validation: start from a valid document and break one thing at a time.
$base=$all;
$mutations=[
 'valid'=>fn($d)=>$d,
 'no schemaVersion'=>function($d){unset($d['schemaVersion']);return $d;},
 'objectives blank'=>function($d){$d['objectives']='   ';return $d;},
 'minutes 0'=>function($d){$d['minutes']=0;return $d;},
 'passThreshold 101'=>function($d){$d['passThreshold']=101;return $d;},
 'blocks not list'=>function($d){$d['blocks']=['a'=>1];return $d;},
 'empty lesson'=>function($d){$d['blocks']=[];$d['exercises']=[];return $d;},
 'duplicate block id'=>function($d){$d['blocks'][]=$d['blocks'][0];return $d;},
 'bad block type'=>function($d){$d['blocks'][0]['type']='video';return $d;},
 'block text too long'=>function($d){$d['blocks'][0]['text']=str_repeat('a',20001);return $d;},
 'seo html'=>function($d){$d['seo']=['title'=>'<b>x</b>'];return $d;},
 'seo list'=>function($d){$d['seo']=['x'];return $d;},
 'exercise id clash with block'=>function($d){$d['exercises'][0]['id']=$d['blocks'][0]['id'];return $d;},
 'reserved id'=>function($d){$d['exercises'][0]['id']='__proto__';return $d;},
 'unknown type'=>function($d){$d['exercises'][0]['type']='essay';return $d;},
 'contentVersion 0'=>function($d){$d['exercises'][0]['contentVersion']=0;return $d;},
 'long tag'=>function($d){$d['exercises'][0]['skillTags']=[str_repeat('t',81)];return $d;},
 'bad whitespace'=>function($d){$d['exercises'][0]['payload']['whitespace']='squash';return $d;},
 'flag not bool'=>function($d){$d['exercises'][0]['payload']['caseSensitive']='yes';return $d;},
 'blank prompt'=>function($d){$d['exercises'][0]['payload']['prompt']=' ';return $d;},
];
$byType=[];foreach($base['exercises'] as $i=>$e)$byType[$e['type']]=$i;
$typed=[
 'choice one option'=>['choice',function($p){$p['choices']=['a'=>'x'];$p['answerId']='a';return $p;}],
 'choice bad answerId'=>['choice',function($p){$p['answerId']='zzz';return $p;}],
 'choice numeric id'=>['choice',function($p){$p['choices']=['1'=>'x','b'=>'y'];$p['answerId']='b';return $p;}],
 'true_false no correction'=>['true_false',function($p){$p['answer']=false;unset($p['correction']);return $p;}],
 'true_false not bool'=>['true_false',function($p){$p['answer']='true';return $p;}],
 'fill empty'=>['fill',function($p){$p['blanks']=[];return $p;}],
 'fill blank answers'=>['fill',function($p){$p['blanks']=['verb'=>['  ']];return $p;}],
 'closed no answers'=>['closed',function($p){$p['acceptedAnswers']=[];return $p;}],
 'correction bad segment'=>['correction',function($p){$p['errorSegment']=['start'=>0,'length'=>9999];return $p;}],
 'order missing token'=>['order',function($p){$p['acceptedOrders']=[array_slice(array_keys($p['tokens']),1)];return $p;}],
 'order one token'=>['order',function($p){$p['tokens']=['a'=>'x'];$p['acceptedOrders']=[['a']];return $p;}],
 'match blank side'=>['match',function($p){$k=array_key_first($p['pairs']);$p['pairs'][$k]['right']=' ';return $p;}],
 'self no criteria'=>['self',function($p){unset($p['criteria']);return $p;}],
 'flashcard no model'=>['flashcard',function($p){$p['modelAnswer']='';return $p;}],
];
foreach($typed as $name=>[$type,$fn])if(isset($byType[$type]))$mutations[$name]=function($d)use($byType,$type,$fn){$i=$byType[$type];$d['exercises'][$i]['payload']=$fn($d['exercises'][$i]['payload']);return $d;};
$documents=[];
foreach($mutations as $name=>$fn){$doc=$fn($base);$documents[]=['name'=>$name,'document'=>$doc,'result'=>attempt(function()use($doc){Assessment::document($doc);return true;})];}

echo json_encode(['grades'=>$grades,'normalize'=>$normalize,'documents'=>$documents],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),"\n";
