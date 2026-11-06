<?php
/** One-shot host-local, hash-bound N7 library schema installation by existing research cron. */
declare(strict_types=1);
function n7LibrarySchemaRequest(PDO $db, string $requestPath, string $privateDirectory): array {
    if (!is_file($requestPath)) return ['status'=>'NOT_REQUESTED'];
    $statusPath=__DIR__.'/.n7-library-schema-status.json';
    $phase='VALIDATE';
    try {
        if ($db->query('SELECT DATABASE()')->fetchColumn()!=='piratecartography')
            throw new RuntimeException('WRONG_DATABASE_BLOCKED');
        if (filesize($requestPath) > 4096) throw new RuntimeException('REQUEST_TOO_LARGE');
        $raw=file_get_contents($requestPath);
        if ($raw === false) throw new RuntimeException('REQUEST_UNREADABLE');
        $request=json_decode($raw,true,16,JSON_THROW_ON_ERROR);
        if (!is_array($request)
            || ($request['schema']??'')!=='n7-library-additive-install-request-v1'
            || ($request['database']??'')!=='piratecartography'
            || ($request['confirmation']??'')!=='INSTALL-N7-LIBRARY-SCHEMA'
            || !preg_match('/^[a-f0-9]{40}$/D',(string)($request['source_revision']??'')))
            throw new RuntimeException('REQUEST_NOT_AUTHORIZED');
        $files=['schema.sql','n7_library.php'];
        if (array_keys($request['code_sha256']??[]) !== $files)
            throw new RuntimeException('UNEXPECTED_FILE_SET');
        foreach ($files as $file) {
            $path=__DIR__.'/../library/'.$file;
            if (!is_file($path) || !hash_equals((string)$request['code_sha256'][$file],hash_file('sha256',$path)))
                throw new RuntimeException('LIBRARY_CHECKSUM_MISMATCH');
        }
        $schema=file_get_contents(__DIR__.'/../library/schema.sql');
        if ($schema===false) throw new RuntimeException('SCHEMA_MISSING');
        $phase='INSTALL';
        foreach(explode(';',$schema) as $statement) {
            $sql=trim(preg_replace('/^\\s*--[^\\n]*(?:\\n|$)/m','',$statement));
            if($sql!=='') {
                if (!preg_match('/^CREATE TABLE IF NOT EXISTS pc_library_(sources|pages)\\s*\\(/i',$sql))
                    throw new RuntimeException('SCHEMA_STATEMENT_NOT_ALLOWED');
                $db->exec($sql);
            }
        }
        $phase='VERIFY';
        $required=[
            'pc_library_sources'=>['source_id','title','author','publication_year','bibliographic_reference','source_uri','rights_note'],
            'pc_library_pages'=>['source_id','scan_index','printed_page','ocr_text','text_sha256','ocr_status']
        ];
        foreach($required as $table=>$columns) {
            $actual=$db->query('SHOW COLUMNS FROM '.$table)->fetchAll(PDO::FETCH_COLUMN);
            foreach ($columns as $column)
                if (!in_array($column,$actual,true)) throw new RuntimeException('SCHEMA_COLUMN_MISSING');
        }
        // Real roundtrip, within a rollback-only transaction. Never asserts historical verification.
        $db->beginTransaction();
        try {
            $id=hash('sha256','n7-library-migration-smoke-test');
            $db->prepare('INSERT INTO pc_library_sources(source_id,title) VALUES (?,?) ON DUPLICATE KEY UPDATE title=VALUES(title)')
                ->execute([$id,'N7 migration smoke test']);
            $db->prepare('INSERT INTO pc_library_pages(source_id,scan_index,printed_page,ocr_text,text_sha256,ocr_status) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE ocr_text=VALUES(ocr_text)')
                ->execute([$id,1,'i','Λάντζας 1582',hash('sha256','Λάντζας 1582'),'UNREVIEWED']);
            $s=$db->prepare('SELECT ocr_text FROM pc_library_pages WHERE source_id=? AND scan_index=1');
            $s->execute([$id]);
            if ($s->fetchColumn()!=='Λάντζας 1582') throw new RuntimeException('DB_ROUNDTRIP_FAILED');
        } finally {
            if ($db->inTransaction()) $db->rollBack();
        }
        $record=['schema'=>'n7-library-install-receipt-v1','status'=>'PASS','source_revision'=>$request['source_revision'],
            'completed_utc'=>gmdate('c'),'request_sha256'=>hash('sha256',$raw),
            'database'=>'piratecartography','created_or_reused_tables'=>array_keys($required),
            'roundtrip'=>'PASS_ROLLED_BACK','historical_claims_verified'=>false];
        $serialized=json_encode($record,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR)."\n";
        $privateReceipt=$privateDirectory.'/pct-n7-library-schema-last.json';
        if (file_put_contents($privateReceipt,$serialized,LOCK_EX)===false) throw new RuntimeException('PRIVATE_RECEIPT_WRITE_FAILED');
        chmod($privateReceipt,0600);
        if (file_put_contents($statusPath,$serialized,LOCK_EX)===false) throw new RuntimeException('STATUS_WRITE_FAILED');
        chmod($statusPath,0600);
        if (!rename($requestPath,$requestPath.'.applied-'.gmdate('YmdHis'))) throw new RuntimeException('REQUEST_ARCHIVE_FAILED');
        return $record;
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        $record=['schema'=>'n7-library-install-receipt-v1','status'=>'BLOCKED','phase'=>$phase,
            'error_type'=>get_class($error),'completed_utc'=>gmdate('c'),
            'historical_claims_verified'=>false];
        if ($error instanceof RuntimeException && preg_match('/^[A-Z0-9_]+$/D',$error->getMessage()))
            $record['reason']=$error->getMessage();
        file_put_contents($statusPath,json_encode($record,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR)."\n",LOCK_EX);
        if (is_file($requestPath)) rename($requestPath,$requestPath.'.blocked-'.gmdate('YmdHis'));
        return $record;
    }
}
