<?php
/** Host-local storage adapter. No HTTP routes, exposed DB port or embedded credentials. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
const PCT_VHOST = '/var/www/vhosts/piratecartography.com';
const PCT_PRIVATE = PCT_VHOST . '/piratecartography-system';
const PCT_GIT = PCT_VHOST . '/git/geraki-historical-atlas.git';
const PCT_TEXT_LIMIT = 16777216;

function emit(array $value): void {
    echo json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), PHP_EOL;
}
function command(array $args): string {
    $p = proc_open($args, [0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']], $pipes);
    if (!is_resource($p)) throw new RuntimeException('PROCESS_START_FAILED');
    fclose($pipes[0]); $out=stream_get_contents($pipes[1]); $err=stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]); $code=proc_close($p);
    // Git errors can contain credential-bearing remote URLs; never echo stderr.
    if ($code !== 0) throw new RuntimeException('GIT_COMMAND_FAILED_' . $code);
    return (string)$out;
}
function git(array $args): string { return command(array_merge(['/usr/bin/git','--git-dir='.PCT_GIT],$args)); }
function database(): PDO {
    $cfg=require PCT_PRIVATE . '/pct_db_config.php';
    if (!is_array($cfg) || ($cfg['database']??'') !== 'piratecartography') throw new RuntimeException('WRONG_DATABASE_BLOCKED');
    $db=new PDO('mysql:host=localhost;port=3306;dbname=piratecartography;charset=utf8mb4',
        (string)$cfg['username'], (string)$cfg['password'],
        [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
    if ($db->query('SELECT DATABASE()')->fetchColumn() !== 'piratecartography') throw new RuntimeException('DATABASE_GATE_FAILED');
    return $db;
}
function query(PDO $db, string $sql, array $args=[]): PDOStatement {
    $s=$db->prepare($sql); $s->execute($args); return $s;
}
function audit(PDO $db, ?string $run, string $action, string $status, array $details): void {
    query($db,'INSERT INTO pc_research_storage_audit (run_id,action,status,details_json,created_at) VALUES (?,?,?,?,UTC_TIMESTAMP())',
        [$run,$action,$status,json_encode($details,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
}
function payload(PDO $db, string $raw): string {
    $sha=hash('sha256',$raw); $zip=gzencode($raw,6);
    if ($zip===false) throw new RuntimeException('COMPRESSION_FAILED');
    query($db,'INSERT IGNORE INTO pc_research_payloads (sha256,encoding,byte_count,compressed_payload) VALUES (?,\'gzip\',?,?)',[$sha,strlen($raw),$zip]);
    return $sha;
}
function valueText(mixed $value): ?string {
    if ($value===null) return null;
    if (is_array($value)) return json_encode($value,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
    return (string)$value;
}
function parseTree(string $raw): array {
    $groups=[];
    foreach (explode(chr(0),$raw) as $line) {
        if ($line==='') continue;
        if (!preg_match('/^\d+ blob ([a-f0-9]{40})\s+(\d+)\t(evidence\/runs\/([0-9]+)\/(.+))$/D',$line,$m)) throw new RuntimeException('UNEXPECTED_EVIDENCE_TREE_ENTRY');
        $groups[$m[4]][]=['path'=>$m[3],'relative'=>$m[5],'blob'=>$m[1],'bytes'=>(int)$m[2]];
    }
    foreach ($groups as &$entries) usort($entries,fn($a,$b)=>strcmp($a['path'],$b['path']));
    unset($entries); uksort($groups,fn($a,$b)=>strnatcmp((string)$a,(string)$b));
    return $groups;
}
function treeDigest(array $entries): string {
    $ctx=hash_init('sha256');
    foreach ($entries as $e) hash_update($ctx,$e['path'].chr(0).$e['blob'].chr(0));
    return hash_final($ctx);
}
/** One persistent cat-file process avoids thousands of process launches. */
final class GitBlobs {
    private $process; private array $pipes = [];
    public function __construct() {
        $this->process=proc_open(['/usr/bin/git','--git-dir='.PCT_GIT,'cat-file','--batch'],[0=>['pipe','r'],1=>['pipe','w'],2=>['file','/dev/null','w']],$this->pipes);
        if (!is_resource($this->process)) throw new RuntimeException('BLOB_READER_FAILED');
    }
    public function read(string $sha): string {
        if (!preg_match('/^[a-f0-9]{40}$/D',$sha)) throw new RuntimeException('INVALID_BLOB_ID');
        fwrite($this->pipes[0],$sha.PHP_EOL); fflush($this->pipes[0]);
        $header=fgets($this->pipes[1]);
        if (!$header || !preg_match('/^([a-f0-9]{40}) blob ([0-9]+)\n$/D',$header,$m) || $m[1]!==$sha) throw new RuntimeException('BLOB_HEADER_FAILED');
        $remaining=(int)$m[2]; $raw='';
        while ($remaining>0) { $chunk=fread($this->pipes[1],min($remaining,1048576)); if ($chunk===false||$chunk==='') throw new RuntimeException('BLOB_TRUNCATED'); $raw.=$chunk; $remaining-=strlen($chunk); }
        if (fread($this->pipes[1],1)!==chr(10)) throw new RuntimeException('BLOB_DELIMITER_FAILED');
        return $raw;
    }
    public function close(): void { fclose($this->pipes[0]); fclose($this->pipes[1]); proc_close($this->process); }
}
function importItem(PDO $db,string $run,string $lane,string $kind,array $item,string $documentKey,int $number): void {
    $raw=json_encode($item,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
    $sha=payload($db,$raw);
    $external=valueText($item['candidate_id']??$item['identifier']??$item['url']??null);
    $key=hash('sha256',$documentKey.chr(0).$kind.chr(0).$number.chr(0).$sha);
    // Preserve all declared fields in payload. Imported candidates are NEVER promoted.
    query($db,'INSERT INTO pc_research_items (version_key,run_id,lane,kind,external_id,title,reference,declared_evidence_state,review_status,is_verified,payload_sha256,source_document_key,is_current) VALUES (?,?,?,?,?,?,?,?,?,0,?,?,1) ON DUPLICATE KEY UPDATE is_current=1',
        [$key,$run,$lane,$kind,$external===null?null:mb_substr($external,0,512),valueText($item['title']??$item['source_file']??null),valueText($item['url']??$item['digital_url']??$item['identifier']??null),valueText($item['evidence_state']??null),'IMPORTED_UNREVIEWED',$sha,$documentKey]);
}
function importRun(PDO $db,string $run,array $entries,string $commit,GitBlobs $reader): array {
    $digest=treeDigest($entries);
    if (query($db,'SELECT tree_sha256 FROM pc_research_runs WHERE run_id=?',[$run])->fetchColumn()===$digest) return ['run_id'=>$run,'status'=>'UNCHANGED'];
    $db->beginTransaction();
    try {
        query($db,'UPDATE pc_research_documents SET is_current=0 WHERE run_id=?',[$run]);
        query($db,'UPDATE pc_research_items SET is_current=0 WHERE run_id=?',[$run]);
        $identity=[]; $references=0; $stored=0; $sourceCount=0; $eventCount=0;
        foreach ($entries as $e) {
            $relative=$e['relative']; $parts=explode('/',$relative);
            $lane=count($parts)>1?$parts[0]:'aggregate';
            $ext=strtolower(pathinfo($relative,PATHINFO_EXTENSION));
            $isText=in_array($ext,['json','jsonl','md','txt','csv','tsv','xml','html'],true);
            $raw=null; $data=null; $hash=null; $kind='BINARY_REFERENCE';
            if ($isText && $e['bytes']<=PCT_TEXT_LIMIT) {
                $raw=$reader->read($e['blob']);
                if (strlen($raw)!==$e['bytes']) throw new RuntimeException('BLOB_SIZE_MISMATCH');
                if (!mb_check_encoding($raw,'UTF-8')) { $kind='BINARY_REFERENCE'; $raw=null; }
                else {
                    $kind=$ext==='json'?'JSON':'TEXT';
                    if ($ext==='json') $data=json_decode($raw,true,512,JSON_THROW_ON_ERROR);
                    $hash=payload($db,$raw); $stored++;
                }
            } elseif ($isText) $kind='LARGE_TEXT_REFERENCE';
            if ($hash===null) $references++;
            $docKey=hash('sha256',$run.chr(0).$relative.chr(0).$e['blob']);
            query($db,'INSERT INTO pc_research_documents (version_key,run_id,lane,source_path,git_blob,source_commit,byte_count,content_kind,payload_sha256,is_current,imported_at) VALUES (?,?,?,?,?,?,?,?,?,1,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE is_current=1',
                [$docKey,$run,$lane,$e['path'],$e['blob'],$commit,$e['bytes'],$kind,$hash]);
            if (is_array($data) && preg_match('/^[^\/]+\/research_lanes\/[^\/]+\.json$/D',$relative)) {
                $identity[]=['job'=>$data['research_job_id']??null,'hash'=>$data['request_sha256']??null,'request'=>$data['normalized_request']??null];
            }
            if (is_array($data) && str_ends_with($relative,'/library_acquisition/acquisition_report.json')) {
                foreach (($data['results']??[]) as $i=>$item) if (is_array($item)) { importItem($db,$run,$lane,'SOURCE',$item,$docKey,(int)$i); $sourceCount++; }
            }
            if (is_array($data) && str_ends_with($relative,'/structured_output/candidate_events.json')) {
                foreach (($data['events']??[]) as $i=>$item) if (is_array($item)) { importItem($db,$run,$lane,'EVENT_CANDIDATE',$item,$docKey,(int)$i); $eventCount++; }
            }
        }
        $jobs=array_values(array_unique(array_filter(array_column($identity,'job'),fn($x)=>is_string($x)&&$x!=='')));
        $hashes=array_values(array_unique(array_filter(array_column($identity,'hash'),fn($x)=>is_string($x)&&preg_match('/^[a-f0-9]{64}$/D',$x))));
        $requests=[]; foreach ($identity as $i) if (is_array($i['request'])) $requests[json_encode($i['request'],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]=$i['request'];
        $consistent=count($jobs)===1&&count($hashes)===1&&count($requests)===1;
        $status=$consistent?'CONSISTENT_RECORDED_IDENTITY':(count($jobs)>1||count($hashes)>1||count($requests)>1?'IDENTITY_CONFLICT':'LEGACY_OR_PARTIAL_IDENTITY');
        $request=$consistent?array_values($requests)[0]:null;
        query($db,'INSERT INTO pc_research_runs (run_id,research_job_id,request_sha256,target,request_json,identity_status,tree_sha256,source_commit,document_count,imported_at) VALUES (?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE research_job_id=VALUES(research_job_id),request_sha256=VALUES(request_sha256),target=VALUES(target),request_json=VALUES(request_json),identity_status=VALUES(identity_status),tree_sha256=VALUES(tree_sha256),source_commit=VALUES(source_commit),document_count=VALUES(document_count),imported_at=UTC_TIMESTAMP()',
            [$run,$consistent?$jobs[0]:null,$consistent?$hashes[0]:null,$request===null?null:mb_substr((string)($request['target']??''),0,512),$request===null?null:json_encode($request,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$status,$digest,$commit,count($entries)]);
        $details=['run_id'=>$run,'status'=>'IMPORTED','documents'=>count($entries),'stored_texts'=>$stored,'binary_or_large_references'=>$references,'sources'=>$sourceCount,'event_candidates'=>$eventCount,'identity_status'=>$status];
        audit($db,$run,'IMPORT','PASS',$details); $db->commit(); return $details;
    } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); audit($db,$run,'IMPORT','BLOCKED',['error'=>get_class($e),'reason'=>$e instanceof JsonException?'MALFORMED_JSON':($e instanceof PDOException?'DATABASE_WRITE_FAILED':$e->getMessage())]); throw $e; }
}
function status(PDO $db): array {
    $counts=[]; foreach (['pc_research_runs','pc_research_documents','pc_research_payloads','pc_research_items'] as $table) $counts[$table]=(int)$db->query('SELECT COUNT(*) FROM '.$table)->fetchColumn();
    $counts['current_documents']=(int)$db->query('SELECT COUNT(*) FROM pc_research_documents WHERE is_current=1')->fetchColumn();
    $counts['current_sources']=(int)$db->query("SELECT COUNT(*) FROM pc_research_items WHERE is_current=1 AND kind='SOURCE'")->fetchColumn();
    $counts['current_event_candidates']=(int)$db->query("SELECT COUNT(*) FROM pc_research_items WHERE is_current=1 AND kind='EVENT_CANDIDATE'")->fetchColumn();
    $counts['verified_items']=(int)$db->query('SELECT COUNT(*) FROM pc_research_items WHERE is_verified=1')->fetchColumn();
    return ['database'=>'piratecartography','backend'=>'host-local-mariadb','counts'=>$counts,'recent_runs'=>$db->query('SELECT run_id,target,identity_status,document_count,imported_at FROM pc_research_runs ORDER BY imported_at DESC,run_id DESC LIMIT 10')->fetchAll()];
}
try {
    $action=$argv[1]??'status';
    if ($action==='self-test-parser') {
        $entry="100644 blob ".str_repeat('a',40)." 7\tevidence/runs/123/travellers/report.json".chr(0);
        $tree=parseTree($entry); if ($tree[123][0]['bytes']!==7 || strlen(treeDigest($tree[123]))!==64) throw new RuntimeException('TREE_TEST_FAILED');
        try { parseTree("invalid".chr(0)); throw new RuntimeException('REJECTION_TEST_FAILED'); } catch (RuntimeException $e) { if ($e->getMessage()!=='UNEXPECTED_EVIDENCE_TREE_ENTRY') throw $e; }
        $original='{"title":"Χειμάρρα","verified":false}'; if (gzdecode(gzencode($original,6))!==$original) throw new RuntimeException('UTF8_COMPRESSION_TEST_FAILED');
        emit(['status'=>'PASS','tests'=>['tree_parser','invalid_tree_rejected','utf8_gzip_roundtrip']]); exit;
    }
    $db=database();
    if ($action==='install') {
        $schema=file_get_contents(__DIR__.'/schema.sql'); if ($schema===false) throw new RuntimeException('SCHEMA_MISSING');
        foreach (explode(';',$schema) as $statement) if (trim($statement)!=='') $db->exec($statement);
        emit(['status'=>'PASS','schema'=>'pct-host-local-storage-v1']);
    } elseif ($action==='sync') {
        $lock=fopen(PCT_PRIVATE.'/pct-research-storage.lock','c');
        if (!$lock || !flock($lock,LOCK_EX|LOCK_NB)) { emit(['status'=>'BUSY','reason'=>'OTHER_IMPORT_RUNNING']); exit; }
        if (!in_array('--no-fetch',$argv,true)) git(['fetch','--quiet','origin']);
        $commit=trim(git(['rev-parse','main'])); if (!preg_match('/^[a-f0-9]{40}$/D',$commit)) throw new RuntimeException('INVALID_COMMIT');
        $groups=parseTree(git(['ls-tree','-rlz',$commit,'--','evidence/runs']));
        $reader=new GitBlobs(); $imported=0; $unchanged=0; $blocked=0;
        $only=null; foreach ($argv as $arg) if (str_starts_with($arg,'--run=')) $only=substr($arg,6);
        foreach ($groups as $run=>$entries) {
            if ($only!==null && (string)$run!==$only) continue;
            try { $result=importRun($db,(string)$run,$entries,$commit,$reader); if ($result['status']==='UNCHANGED') $unchanged++; else { $imported++; emit($result); } }
            catch (Throwable $e) { $blocked++; emit(['run_id'=>(string)$run,'status'=>'BLOCKED','error'=>get_class($e)]); }
        }
        $reader->close();
        $summary=['status'=>$blocked===0?'PASS':'PARTIAL_BLOCKED','source_commit'=>$commit,'imported_runs'=>$imported,'unchanged_runs'=>$unchanged,'blocked_runs'=>$blocked];
        audit($db,null,'SYNC',$summary['status'],$summary); emit($summary); emit(status($db));
        file_put_contents(PCT_PRIVATE.'/pct-research-storage-last.json',json_encode($summary,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR).PHP_EOL,LOCK_EX);
        chmod(PCT_PRIVATE.'/pct-research-storage-last.json',0600); flock($lock,LOCK_UN); fclose($lock); exit($blocked===0?0:1);
    } elseif ($action==='status') emit(status($db));
    elseif ($action==='job') {
        $id=$argv[2]??'';
        $run=query($db,'SELECT * FROM pc_research_runs WHERE run_id=? OR research_job_id=?',[$id,$id])->fetch();
        if (!$run) throw new RuntimeException('JOB_NOT_FOUND');
        emit(['run'=>$run,'items'=>query($db,'SELECT kind,lane,COUNT(*) AS n FROM pc_research_items WHERE run_id=? AND is_current=1 GROUP BY kind,lane',[$run['run_id']])->fetchAll()]);
    } elseif ($action==='search') {
        $term=$argv[2]??''; if ($term==='') throw new RuntimeException('SEARCH_TERM_REQUIRED');
        $like='%'.str_replace(['\\','%','_'],['\\\\','\\%','\\_'],$term).'%';
        emit(['runs'=>query($db,'SELECT run_id,target,identity_status FROM pc_research_runs WHERE target LIKE ? LIMIT 30',[$like])->fetchAll(),
            'items'=>query($db,'SELECT run_id,lane,kind,title,reference,declared_evidence_state,review_status,is_verified FROM pc_research_items WHERE is_current=1 AND (title LIKE ? OR reference LIKE ?) LIMIT 30',[$like,$like])->fetchAll()]);
    } elseif ($action==='document') {
        $row=query($db,'SELECT d.payload_sha256,p.compressed_payload FROM pc_research_documents d JOIN pc_research_payloads p ON p.sha256=d.payload_sha256 WHERE d.run_id=? AND d.source_path=? AND d.is_current=1',[$argv[2]??'',$argv[3]??''])->fetch();
        if (!$row) throw new RuntimeException('TEXT_DOCUMENT_NOT_FOUND');
        $raw=gzdecode($row['compressed_payload']); if ($raw===false||hash('sha256',$raw)!==$row['payload_sha256']) throw new RuntimeException('PAYLOAD_CHECKSUM_FAILED'); echo $raw;
    } elseif ($action==='verify-run') {
        $run=$argv[2]??'';
        if (!query($db,'SELECT run_id FROM pc_research_runs WHERE run_id=?',[$run])->fetchColumn()) throw new RuntimeException('JOB_NOT_FOUND');
        $rows=query($db,'SELECT d.git_blob,d.byte_count,d.payload_sha256,p.compressed_payload FROM pc_research_documents d JOIN pc_research_payloads p ON p.sha256=d.payload_sha256 WHERE d.run_id=? AND d.is_current=1',[$run]);
        $checked=0;
        while ($row=$rows->fetch()) {
            $raw=gzdecode($row['compressed_payload']);
            if ($raw===false || strlen($raw)!==(int)$row['byte_count'] || hash('sha256',$raw)!==$row['payload_sha256'] || sha1('blob '.strlen($raw).chr(0).$raw)!==$row['git_blob']) throw new RuntimeException('STORED_DOCUMENT_INTEGRITY_FAILED');
            $checked++;
        }
        emit(['status'=>'PASS','run_id'=>$run,'stored_documents_verified_against_git_bytes'=>$checked,'binary_reference_bytes_checked'=>false]);
    } elseif ($action==='self-test-db') {
        $db->beginTransaction(); $raw='{"control":"storage-roundtrip","verified":false}';
        $before=(int)$db->query('SELECT COUNT(*) FROM pc_research_payloads')->fetchColumn(); $sha=payload($db,$raw); payload($db,$raw);
        $row=query($db,'SELECT compressed_payload,byte_count FROM pc_research_payloads WHERE sha256=?',[$sha])->fetch();
        if (gzdecode($row['compressed_payload'])!==$raw||(int)$row['byte_count']!==strlen($raw)) throw new RuntimeException('ROUNDTRIP_FAILED');
        $after=(int)$db->query('SELECT COUNT(*) FROM pc_research_payloads')->fetchColumn(); if ($after>$before+1) throw new RuntimeException('DUPLICATE_PAYLOAD_CREATED');
        $db->rollBack(); emit(['status'=>'PASS','tests'=>['real_database_write_read','gzip_checksum_roundtrip','idempotent_payload','test_transaction_rolled_back']]);
    } else throw new RuntimeException('UNKNOWN_ACTION');
} catch (Throwable $e) {
    if (isset($db) && $db instanceof PDO && $db->inTransaction()) $db->rollBack();
    // Do not print SQL values, credential files, passwords or exception traces.
    emit(['status'=>'BLOCKED','error'=>get_class($e),'reason'=>$e instanceof PDOException?'DATABASE_OPERATION_FAILED':($e instanceof JsonException?'MALFORMED_JSON':$e->getMessage())]); exit(1);
}
