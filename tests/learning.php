<?php
require dirname(__DIR__).'/application/libraries/Learning.php';
$s=['choices'=>['one'=>'Hello','two'=>'Bye'],'answer_id'=>'one'];
function check(bool $ok): void { if (!$ok) throw new RuntimeException('Assertion failed'); }
check(learning_grade($s,'one')===1); check(learning_grade($s,'two')===0);
$s['choices']=array_reverse($s['choices'],true); check(learning_grade($s,'one')===1);
$s['choices']=json_encode($s['choices']); check(learning_grade($s,'one')===1);
try { learning_grade($s,'invalid'); throw new RuntimeException('Invalid response accepted'); } catch (InvalidArgumentException $e) {}
echo "PASS: stable answer IDs, reordered choices, JSON snapshot, invalid answer rejection.\n";
