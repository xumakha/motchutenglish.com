<?php
declare(strict_types=1);
require dirname(__DIR__).'/application/core/bootstrap.php';
function expect(bool $ok,string $message): void {if(!$ok)throw new RuntimeException($message);}
function rejects(callable $fn): void {try{$fn();}catch(ProductError $e){return;}throw new RuntimeException('Expected rejection');}
$d=mce_decode(file_get_contents(dirname(__DIR__).'/database/templates/all-exercises.json'));
Assessment::document($d);$e=array_column($d['exercises'],null,'type');
expect(Assessment::grade($e['choice'],'greeting')['score']===1,'Choice stable ID');
expect(Assessment::grade($e['true_false'],true)['isCorrect']===true,'Boolean');
expect(Assessment::grade($e['fill'],['verb'=>'  AM.  '])['score']===1,'Whitespace/case/punctuation');
expect(Assessment::grade($e['fill'],['verb'=>"\u{00A0}AM .\u{00A0}"])['score']===1,'Unicode whitespace and punctuation policy');
$fill=$e['fill'];$fill['payload']['blanks']['verb']=["can't"];
expect(Assessment::grade($fill,['verb'=>'cant'])['score']===0,'Apostrophe changes meaning');
$fill['payload']['blanks']['verb']=['café'];
expect(Assessment::grade($fill,['verb'=>"cafe\u{0301}"])['score']===1,'Unicode NFC');
$order=$e['order'];$order['payload']['tokens']=['a'=>'the','b'=>'the'];$order['payload']['acceptedOrders']=[['a','b']];
Assessment::validate($order);expect(Assessment::grade($order,['a','b'])['score']===1,'Duplicate text stable tokens');rejects(fn()=>Assessment::grade($order,['a','a']));
expect(Assessment::grade($e['match'],['hello'=>'hello','thanks'=>'thanks'])['score']===2,'Match partial units');
expect(Assessment::grade($e['self'],'Anything')['score']===null,'Self assessment is not objective');
expect(Assessment::grade($e['flashcard'],'')['isCorrect']===null,'Flashcard null correctness');
foreach($d['exercises'] as $exercise){$public=mce_json(Assessment::publicExercise($exercise));foreach(['answerId','acceptedAnswers','acceptedOrders','modelAnswer','explanation'] as $secret)expect(!str_contains($public,'"'.$secret.'"'),'Answer stripped: '.$secret);}
$now=new DateTimeImmutable('2026-03-08 06:55:00',new DateTimeZone('UTC'));
expect(Review::schedule('again',30,$now)['dueAt']==='2026-03-08 07:05:00','Again 10 minutes');
expect(Review::schedule('hard',3,$now)['intervalDays']===4,'Hard ceil');
expect(Review::schedule('good',0,$now)['intervalDays']===1,'New good');
expect(Review::schedule('easy',0,$now)['intervalDays']===3,'New easy');
expect(Review::schedule('easy',100,$now)['intervalDays']===180,'Interval cap');
expect(Review::schedule('good',0,$now)['dueAt']==='2026-03-09 06:55:00','UTC duration across DST');
echo "PASS: exercise validation, all non-audio graders, Unicode, apostrophe, stable tokens, self assessment, redaction, UTC review scheduling\n";
