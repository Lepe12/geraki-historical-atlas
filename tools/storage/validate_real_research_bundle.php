<?php
declare(strict_types=1);
require __DIR__.'/historical_evidence.php';
if (getenv('PCT_ISOLATED_DATABASE_TEST')!=='yes')throw new RuntimeException('ISOLATED_TEST_REQUIRED');
if (count($argv)!==5||!preg_match('/^[0-9]+$/D',$argv[3])||!preg_match('/^[0-9]+$/D',$argv[4]))throw new RuntimeException('USAGE_BUNDLE_REPOSITORY_PARENT_RUN_ANALYSIS_RUN');
$root=realpath($argv[2].'/evidence/runs/'.$argv[3]);if (!$root)throw new RuntimeException('PARENT_RUN_NOT_FOUND');
$port=(int)(getenv('PCT_TEST_DB_PORT')?:33077);
$db=new PDO('mysql:host=127.0.0.1;port='.$port.';dbname=piratecartography;charset=utf8mb4','root',getenv('PCT_TEST_DB_PASSWORD'),[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$bundle=json_decode(file_get_contents($argv[1]),true,512,JSON_THROW_ON_ERROR);
$reader=function($path)use($root){$full=realpath($root.'/'.$path);if (!$full||!str_starts_with($full,$root.'/'))throw new RuntimeException('UNSAFE_DURABLE_PATH');return file_get_contents($full);};
$db->beginTransaction();$first=heImportBundle($db,$bundle,$reader);$db->commit();
$db->beginTransaction();$second=heImportBundle($db,$bundle,$reader);$db->commit();
if ($second['inserted_attestations']!==0)throw new RuntimeException('IMPORT_NOT_IDEMPOTENT');
$quotes=0;$states=[];
foreach ($bundle['attestations'] as $att) {
 foreach ($att['citations'] as $c){
  $q=heQuery($db,'SELECT exact_excerpt FROM pc_he_citations WHERE attestation_id=? AND source_id=? AND locator=?',[$att['id'],$c['source_id'],$c['locator']])->fetchColumn();
  if($q!==$c['exact_excerpt'])throw new RuntimeException('READBACK_MISMATCH');$quotes++;
 }
 $states[]=heQuery($db,'SELECT status FROM pc_he_attestations WHERE id=?',[$att['id']])->fetchColumn();
}
if(array_unique($states)!==['UNREVIEWED'])throw new RuntimeException('AUTOMATIC_REVIEW_PROMOTION');
echo json_encode(['status'=>'PASS','environment'=>'ISOLATED_MARIADB_NOT_PRODUCTION','input_research_run'=>$argv[3],'input_analysis_run'=>$argv[4],'software_revision'=>getenv('PCT_TEST_SOFTWARE_REVISION')?:null,'bundle_sha256'=>hash_file('sha256',$argv[1]),'purpose'=>'REAL_ACQUIRED_SOURCE_BYTE_REPLAY_AND_PERSISTENCE; NOT SEMANTIC_ACCEPTANCE','sources'=>count($bundle['sources']),'attestations'=>count($bundle['attestations']),'exact_citation_readbacks'=>$quotes,'historically_verified'=>0,'imported_or_already_present'=>$first,'idempotent_import'=>$second,'source_urls'=>array_column($bundle['sources'],'url')],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE),PHP_EOL;
