<?php
/** One explicit, hash-bound migration request consumed by the existing CLI cron.
 * Caller must hold the existing host-local storage lock. No HTTP entry point.
 */
declare(strict_types=1);
function heApplyRequestedSchema(PDO $db,string $requestFile,string $privateDirectory): array {
    if (!is_file($requestFile))return ['status'=>'NOT_REQUESTED','requested_runs'=>[]];
    $stage='VALIDATE_REQUEST';$backup=null;$request=[];
    try {
        if ($db->query('SELECT DATABASE()')->fetchColumn()!=='piratecartography')throw new RuntimeException('WRONG_DATABASE_BLOCKED');
        if (filesize($requestFile)>8192)throw new RuntimeException('MIGRATION_REQUEST_TOO_LARGE');
        $raw=file_get_contents($requestFile);
        $request=json_decode($raw,true,32,JSON_THROW_ON_ERROR);
        if (!is_array($request)||($request['schema']??'')!=='nabou-evidence-schema-install-request-v1'
            ||($request['database']??'')!=='piratecartography'
            ||($request['confirmation']??'')!=='INSTALL-EXISTING-EVIDENCE-SCHEMA')throw new RuntimeException('MIGRATION_REQUEST_NOT_AUTHORIZED');
        if (!is_string($request['source_revision']??null)||!preg_match('/^[a-f0-9]{40}$/D',$request['source_revision']))throw new RuntimeException('MIGRATION_REVISION_REQUIRED');
        $files=['historical_evidence.php','historical_evidence_schema.sql','pct_research_store.php','evidence_schema_request.php'];
        if (array_keys($request['code_sha256']??[])!==$files)throw new RuntimeException('MIGRATION_FILE_SET_MISMATCH');
        foreach ($files as $name)if (!hash_equals(hash_file('sha256',__DIR__.'/'.$name),(string)$request['code_sha256'][$name]))throw new RuntimeException('MIGRATION_CODE_CHECKSUM_MISMATCH');
        $runs=$request['requested_runs']??[];
        if (!is_array($runs)||count($runs)>10)throw new RuntimeException('INVALID_MIGRATION_RESEARCH_RUNS');
        foreach ($runs as $run)if (!is_string($run)||!preg_match('/^[0-9]+$/D',$run))throw new RuntimeException('INVALID_MIGRATION_RESEARCH_RUNS');
        $stage='BACKUP';$backup=heBackup($db,$privateDirectory.'/backups');
        $stage='ADDITIVE_MIGRATION';$migration=heMigrate($db);
        $result=['schema'=>'nabou-evidence-schema-installation-v1','status'=>'PASS','completed_utc'=>gmdate('c'),
                 'database'=>'piratecartography','source_revision'=>$request['source_revision'],
                 'request_sha256'=>hash('sha256',$raw),'schema_version'=>$migration['version'],
                 'schema_sha256'=>$migration['schema_sha256'],'code_sha256'=>$request['code_sha256'],
                 'backup_created'=>true,'backup_sha256'=>$backup['sha256'],
                 'backup_tables'=>$backup['tables'],'backup_rows'=>$backup['rows'],
                 'requested_runs'=>$runs,'historical_verification_promoted'=>false];
        $receipt=$privateDirectory.'/pct-evidence-schema-last.json';
        if (file_put_contents($receipt,json_encode($result,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR).PHP_EOL,LOCK_EX)===false)throw new RuntimeException('MIGRATION_RECEIPT_WRITE_FAILED');
        chmod($receipt,0600);
        $stage='PRESERVE_APPLIED_REQUEST';
        if (!rename($requestFile,$requestFile.'.applied-'.gmdate('YmdTHis').'-'.bin2hex(random_bytes(4))))throw new RuntimeException('MIGRATION_REQUEST_ARCHIVE_FAILED');
        return $result;
    } catch (Throwable $error) {
        $result=['schema'=>'nabou-evidence-schema-installation-v1','status'=>'BLOCKED','completed_utc'=>gmdate('c'),
                 'failed_stage'=>$stage,'error_type'=>get_class($error),'backup_created'=>$backup!==null,
                 'historical_verification_promoted'=>false];
        if ($error instanceof RuntimeException&&preg_match('/^[A-Z0-9_]+$/D',$error->getMessage()))$result['reason']=$error->getMessage();
        $receipt=$privateDirectory.'/pct-evidence-schema-last.json';
        file_put_contents($receipt,json_encode($result,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR).PHP_EOL,LOCK_EX);chmod($receipt,0600);
        // Preserve failed intent without making cron repeat DDL/backups forever.
        if (is_file($requestFile))rename($requestFile,$requestFile.'.blocked-'.gmdate('YmdTHis').'-'.bin2hex(random_bytes(4)));
        throw $error;
    }
}
