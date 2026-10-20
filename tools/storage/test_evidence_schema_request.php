<?php
/** Real MariaDB backup/migration request test; isolated database only. */
declare(strict_types=1);
if (getenv('PCT_ISOLATED_DATABASE_TEST')!=='yes')throw new RuntimeException('ISOLATED_TEST_REQUIRED');
require __DIR__.'/historical_evidence.php';
require __DIR__.'/evidence_schema_request.php';
$db=new PDO('mysql:host=127.0.0.1;port='.(getenv('PCT_TEST_DB_PORT')?:33077).';dbname=piratecartography;charset=utf8mb4',
            'root',getenv('PCT_TEST_DB_PASSWORD'),[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$directory=sys_get_temp_dir().'/nabou-schema-request-'.bin2hex(random_bytes(8));mkdir($directory,0700);
$requestFile=$directory.'/request.json';
$files=['historical_evidence.php','historical_evidence_schema.sql','pct_research_store.php','evidence_schema_request.php'];
$hashes=[];foreach ($files as $name)$hashes[$name]=hash_file('sha256',__DIR__.'/'.$name);
$request=['schema'=>'nabou-evidence-schema-install-request-v1','database'=>'piratecartography',
          'confirmation'=>'INSTALL-EXISTING-EVIDENCE-SCHEMA','source_revision'=>str_repeat('a',40),
          'code_sha256'=>$hashes,'requested_runs'=>['12345']];
$bad=$request;$bad['code_sha256']['historical_evidence.php']=str_repeat('0',64);
file_put_contents($requestFile,json_encode($bad,JSON_THROW_ON_ERROR));
try {heApplyRequestedSchema($db,$requestFile,$directory);throw new RuntimeException('TAMPERED_REQUEST_ACCEPTED');}
catch (RuntimeException $error) {if ($error->getMessage()!=='MIGRATION_CODE_CHECKSUM_MISMATCH')throw $error;}
if (is_dir($directory.'/backups'))throw new RuntimeException('UNAUTHORIZED_BACKUP_STARTED');
$counts=[];foreach (['pc_he_sources','pc_he_attestations','pc_he_citations'] as $table)$counts[$table]=(int)$db->query('SELECT COUNT(*) FROM '.$table)->fetchColumn();
file_put_contents($requestFile,json_encode($request,JSON_THROW_ON_ERROR));
$result=heApplyRequestedSchema($db,$requestFile,$directory);
if ($result['status']!=='PASS'||!$result['backup_created']||is_file($requestFile))throw new RuntimeException('REQUEST_NOT_APPLIED_AND_CONSUMED');
foreach ($counts as $table=>$count)if ((int)$db->query('SELECT COUNT(*) FROM '.$table)->fetchColumn()!==$count)throw new RuntimeException('EXISTING_EVIDENCE_ROWS_CHANGED');
$backups=glob($directory.'/backups/*.sql.gz');
if (count($backups)!==1||hash_file('sha256',$backups[0])!==$result['backup_sha256'])throw new RuntimeException('BACKUP_HASH_MISMATCH');
if ((fileperms($backups[0])&0777)!==0600)throw new RuntimeException('BACKUP_PERMISSIONS_INVALID');
$dump=gzdecode(file_get_contents($backups[0]));
if ($dump===false||!str_contains($dump,'CREATE TABLE')||!str_contains($dump,'pc_he_citations'))throw new RuntimeException('DATABASE_BACKUP_INCOMPLETE');
if (heApplyRequestedSchema($db,$requestFile,$directory)['status']!=='NOT_REQUESTED'||count(glob($directory.'/backups/*.sql.gz'))!==1)throw new RuntimeException('CONSUMED_REQUEST_REAPPLIED');
echo json_encode(['status'=>'PASS','environment'=>'ISOLATED_MARIADB_NOT_PRODUCTION',
                  'tampered_request_rejected_before_backup'=>true,'existing_evidence_row_counts_preserved'=>$counts,
                  'private_database_backup_hash_verified'=>true,'backup_mode'=>'0600','backup_sha256'=>$result['backup_sha256'],
                  'migration_version'=>$result['schema_version'],'schema_sha256'=>$result['schema_sha256'],
                  'request_consumed'=>true,'second_invocation'=>'NOT_REQUESTED','historical_verification_promoted'=>false],JSON_PRETTY_PRINT),PHP_EOL;
