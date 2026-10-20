<?php
declare(strict_types=1);
return function(PDO $pdo): void {
    $relations=[
        ['mce_lessons','current_version','mce_versions','id'],
        ['mce_profiles','path_id','mce_paths','id'],
        ['mce_timezone_changes','user_id','users','id'],
        ['mce_consents','user_id','users','id'],['mce_cohorts','user_id','users','id'],
        ['mce_review_events','user_id','users','id'],['mce_streak_calendar','user_id','users','id'],
        ['mce_inventory_events','user_id','users','id'],['mce_inventory','user_id','users','id'],
        ['mce_purchases','user_id','users','id'],['mce_badges','user_id','users','id'],
        ['mce_reminders','user_id','users','id'],['mce_deliveries','user_id','users','id'],
        ['mce_media','uploader_id','users','id'],['mce_reports','user_id','users','id'],
        ['mce_audit','actor_id','users','id'],['mce_imports','actor_id','users','id'],
        ['mce_entity_drafts','author_id','users','id'],['mce_article_versions','actor_id','users','id'],
        ['reward_ledger','user_id','users','id'],
    ];
    foreach($relations as [$table,$column,$target,$targetColumn]) {
        $q=$pdo->prepare('SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? AND REFERENCED_TABLE_NAME=?');$q->execute([$table,$column,$target]);if($q->fetchColumn())continue;
        // A legacy orphan is a migration blocker, never a reason to delete user data.
        $count=(int)$pdo->query('SELECT COUNT(*) FROM '.$table.' s LEFT JOIN '.$target.' t ON t.'.$targetColumn.'=s.'.$column.' WHERE s.'.$column.' IS NOT NULL AND t.'.$targetColumn.' IS NULL')->fetchColumn();
        if($count)throw new RuntimeException('Repair orphan references before adding FK: '.$table.'.'.$column);
        $name='fk_'.substr(hash('sha256',$table.'.'.$column),0,20);
        $pdo->exec('ALTER TABLE '.$table.' ADD CONSTRAINT '.$name.' FOREIGN KEY ('.$column.') REFERENCES '.$target.'('.$targetColumn.')');
    }
};
