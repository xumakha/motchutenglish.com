<?php
declare(strict_types=1);
return function(PDO $pdo): void {
    foreach([
        'mce_paths'=>['catalog_status_order'=>'status,sort_order,id'],
        'mce_units'=>['unit_path_order'=>'path_id,sort_order,id'],
        'mce_lessons'=>['lesson_unit_order'=>'unit_id,archived,sort_order,id'],
        'mce_attempts'=>['attempt_resume'=>'user_id,status,started_at'],
        'reward_ledger'=>['ledger_user_currency'=>'user_id,currency,created_at'],
        'mce_review_events'=>['review_user_target'=>'user_id,card_id'],
        'mce_events'=>['operational_events'=>'type,occurred_at,user_id'],
    ] as $table=>$indexes)foreach($indexes as $name=>$columns){
        $q=$pdo->prepare('SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?');$q->execute([$table,$name]);
        if(!$q->fetchColumn())$pdo->exec('CREATE INDEX '.$name.' ON '.$table.'('.$columns.')');
    }
};
