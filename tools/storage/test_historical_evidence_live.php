<?php
/** Real PDO/MariaDB integration, only for an explicitly isolated localhost test DB. */
declare(strict_types=1);
require __DIR__.'/historical_evidence.php';
if (getenv('PCT_ISOLATED_DATABASE_TEST')!=='yes')throw new RuntimeException('ISOLATED_TEST_REQUIRED');
$port=(int)(getenv('PCT_TEST_DB_PORT')?:33077);
$db=new PDO('mysql:host=127.0.0.1;port='.$port.';dbname=piratecartography;charset=utf8mb4','root',getenv('PCT_TEST_DB_PASSWORD'),[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$first=heMigrate($db);if (heMigrate($db)!==$first)throw new RuntimeException('MIGRATION_IDEMPOTENCE_FAILED');
$key='php-test-'.bin2hex(random_bytes(6));$text='The ship anchored at Milo.';
$source=['id'=>$key,'title'=>'Synthetic PHP fixture','url'=>'urn:test:'.$key,'text_path'=>'fixture.txt','text_sha256'=>hash('sha256',$text)];
$att=['id'=>'att_'.bin2hex(random_bytes(12)),'entity_id'=>'mention:'.$key,'predicate'=>'SOURCE_STATEMENT','value'=>'The fixture reports an anchorage.',
      'status'=>'UNREVIEWED','historically_verified'=>false,'citations'=>[['source_id'=>$key,'locator'=>'scan 1','exact_excerpt'=>$text,'attribution'=>'stated']]];
$citation=$att['citations'][0];$cid='cite_'.$key;
$graph=['entities'=>[
 ['id'=>$key,'entity_type'=>'Source','label'=>'Synthetic PHP fixture','properties'=>$source],
 ['id'=>$att['id'],'entity_type'=>'Attestation','label'=>$att['value'],'properties'=>['status'=>'UNREVIEWED']],
 ['id'=>$cid,'entity_type'=>'Citation','label'=>'scan 1','properties'=>$citation]],
 'relations'=>[['id'=>'rel_'.$key,'subject_id'=>$att['id'],'object_id'=>$key,'predicate'=>'reportsInConsultedSource','citation_ids'=>[$cid],'assertion_class'=>'SOURCE_STATEMENT']]];
$bundle=['schema'=>'nabou-persistent-evidence-bundle-v1','sources'=>[$source],'attestations'=>[$att],'graph'=>$graph];
$db->beginTransaction();$result=heImportBundle($db,$bundle,fn($path)=>$text);$db->commit();
if ($result['inserted_attestations']!==1)throw new RuntimeException('IMPORT_FAILED');
if ($result['citation_readbacks']!==1)throw new RuntimeException('CITATION_READBACK_NOT_PERFORMED');
$db->beginTransaction();$result=heImportBundle($db,$bundle,fn($path)=>$text);$db->commit();
if ($result['inserted_attestations']!==0)throw new RuntimeException('IMPORT_DUPLICATED');
if ((int)heQuery($db,'SELECT COUNT(*) FROM pc_he_relations WHERE subject_id=?',[$att['id']])->fetchColumn()!==1)throw new RuntimeException('GRAPH_RELATION_NOT_PERSISTED');
try {$db->beginTransaction();heImportBundle($db,$bundle,fn($path)=>'Tampered source');throw new RuntimeException('TAMPERING_ACCEPTED');}
catch (RuntimeException $e) {$db->rollBack();if ($e->getMessage()!=='EVIDENCE_TEXT_CHECKSUM_MISMATCH')throw $e;}
$wrong=$bundle;$wrong['attestations'][0]['citations'][0]['locator']=json_encode(['start_char'=>1,'end_char'=>strlen($text),'offset_unit'=>'UNICODE_CODE_POINTS','span_semantics'=>'EXACT_QUOTE']);
try {$db->beginTransaction();heImportBundle($db,$wrong,fn($path)=>$text);throw new RuntimeException('WRONG_LOCATOR_ACCEPTED');}
catch (RuntimeException $e) {$db->rollBack();if ($e->getMessage()!=='QUOTE_LOCATOR_REPLAY_FAILED')throw $e;}
$unicode='α🙂Milo';$us=$source;$us['id'].='-unicode';$us['text_sha256']=hash('sha256',$unicode);
$ua=$att;$ua['id']='att_'.bin2hex(random_bytes(12));$ua['citations']=[['source_id'=>$us['id'],'locator'=>json_encode(['start_char'=>2,'end_char'=>6,'offset_unit'=>'UNICODE_CODE_POINTS','span_semantics'=>'EXACT_QUOTE']),'exact_excerpt'=>'Milo','attribution'=>'stated']];
$db->beginTransaction();heImportBundle($db,['schema'=>'nabou-persistent-evidence-bundle-v1','sources'=>[$us],'attestations'=>[$ua]],fn($path)=>$unicode);$db->commit();
$backup=heBackup($db,sys_get_temp_dir().'/nabou-php-backup-test-'.bin2hex(random_bytes(5)));
$sql=gzdecode(file_get_contents($backup['file']));if ($sql===false||!str_contains($sql,'CREATE TABLE')||hash_file('sha256',$backup['file'])!==$backup['sha256'])throw new RuntimeException('BACKUP_INVALID');
$restored='nabou_restore_'.bin2hex(random_bytes(5));$db->exec('CREATE DATABASE `'.$restored.'` CHARACTER SET utf8mb4');
try {
    $restore=new PDO('mysql:host=127.0.0.1;port='.$port.';dbname='.$restored.';charset=utf8mb4','root',getenv('PCT_TEST_DB_PASSWORD'),[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    $restore->exec($sql);
    $quote=heQuery($restore,'SELECT exact_excerpt FROM pc_he_citations WHERE attestation_id=?',[$att['id']])->fetchColumn();
    if ($quote!==$text)throw new RuntimeException('BACKUP_RESTORE_QUOTE_FAILED');
    $restore=null;
} finally {$db->exec('DROP DATABASE `'.$restored.'`');}
echo json_encode(['status'=>'PASS','environment'=>'ISOLATED_TEST_NOT_PRODUCTION','tests'=>['PDO migration','durable quote replay','idempotent import','citation-backed relational graph','tampered text rejected','wrong exact locator rejected','Greek and supplementary Unicode locator replay','complete database backup','restore into isolated database'],'migration'=>$first]),PHP_EOL;
