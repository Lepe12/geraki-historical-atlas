<?php
/** N7 page library: private PHP CLI only. Additive MariaDB schema and query adapter. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit(1); }
const N7_CONFIG = '/var/www/vhosts/piratecartography.com/piratecartography-system/pct_db_config.php';
const N7_DB = 'piratecartography';
function n7fail(string $message): never { throw new RuntimeException($message); }
function n7out(array $data): void {
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), PHP_EOL;
}
function n7db(): PDO {
    $cfg = require N7_CONFIG;
    if (!is_array($cfg) || ($cfg['database'] ?? null) !== N7_DB) n7fail('DATABASE_CONFIGURATION_REJECTED');
    $db = new PDO('mysql:host=localhost;port=3306;dbname='.N7_DB.';charset=utf8mb4',
        (string)$cfg['username'], (string)$cfg['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]);
    if ($db->query('SELECT DATABASE()')->fetchColumn() !== N7_DB) n7fail('DATABASE_GATE_FAILED');
    return $db;
}
function n7query(PDO $db, string $sql, array $params=[]): PDOStatement {
    $stmt=$db->prepare($sql); $stmt->execute($params); return $stmt;
}
function n7parse(string $json): array {
    $source=json_decode($json,true,512,JSON_THROW_ON_ERROR);
    if (!is_array($source) || !array_is_list($source) && !isset($source['title'])) n7fail('INVALID_SOURCE');
    $title=trim((string)($source['title']??''));
    if ($title==='' || mb_strlen($title)>512) n7fail('INVALID_TITLE');
    $uri=trim((string)($source['source_uri']??''));
    $id=$source['source_id']??hash('sha256',json_encode([$uri,$title,(string)($source['author']??''),(string)($source['publication_year']??'')],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
    if (!is_string($id)||!preg_match('/^[a-f0-9]{64}$/D',$id)) n7fail('INVALID_SOURCE_ID');
    if (!is_array($source['pages']??null)) n7fail('PAGES_REQUIRED');
    $pages=[]; $seen=[];
    foreach ($source['pages'] as $page) {
        if (!is_array($page)||!isset($page['scan_index'])||!is_int($page['scan_index'])||$page['scan_index']<1||$page['scan_index']>4294967295) n7fail('INVALID_SCAN_INDEX');
        $i=$page['scan_index']; if (isset($seen[$i])) n7fail('DUPLICATE_SCAN_INDEX'); $seen[$i]=true;
        if (!isset($page['text'])||!is_string($page['text'])||!mb_check_encoding($page['text'],'UTF-8')) n7fail('INVALID_PAGE_TEXT');
        $status=$page['ocr_status']??'UNREVIEWED';
        if (!in_array($status,['UNREVIEWED','MANUALLY_TRANSCRIBED','OCR_REVIEWED'],true)) n7fail('INVALID_OCR_STATUS');
        $printed=$page['printed_page']??null;
        if ($printed!==null && (!is_string($printed)||mb_strlen($printed)>64)) n7fail('INVALID_PRINTED_PAGE');
        $pages[]=['scan_index'=>$i,'printed_page'=>$printed,'text'=>$page['text'],'ocr_status'=>$status];
    }
    foreach (['author'=>512,'publication_year'=>64] as $key=>$max)
        if (isset($source[$key]) && (!is_string($source[$key])||mb_strlen($source[$key])>$max)) n7fail('INVALID_'.strtoupper($key));
    return ['source_id'=>$id,'title'=>$title,'author'=>$source['author']??null,
        'publication_year'=>$source['publication_year']??null,
        'bibliographic_reference'=>$source['bibliographic_reference']??null,
        'source_uri'=>$source['source_uri']??null,'rights_note'=>$source['rights_note']??null,
        'pages'=>$pages];
}
function n7install(PDO $db): void {
    // Explicit fixed SQL, no untrusted dynamic identifiers.
    $schema=file_get_contents(__DIR__.'/schema.sql');
    if ($schema===false) n7fail('SCHEMA_MISSING');
    foreach (explode(';',$schema) as $part) {
        $sql=trim(preg_replace('/^\s*--[^\n]*(?:\n|$)/m','',$part));
        if ($sql!=='') $db->exec($sql);
    }
}
function n7import(PDO $db,array $source): array {
    $db->beginTransaction();
    try {
        n7query($db,'INSERT INTO pc_library_sources (source_id,title,author,publication_year,bibliographic_reference,source_uri,rights_note)
            VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE title=VALUES(title),author=VALUES(author),
            publication_year=VALUES(publication_year),bibliographic_reference=VALUES(bibliographic_reference),
            source_uri=VALUES(source_uri),rights_note=VALUES(rights_note)',
            [$source['source_id'],$source['title'],$source['author'],$source['publication_year'],$source['bibliographic_reference'],$source['source_uri'],$source['rights_note']]);
        $stmt=$db->prepare('INSERT INTO pc_library_pages
            (source_id,scan_index,printed_page,ocr_text,text_sha256,ocr_status) VALUES (?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE printed_page=VALUES(printed_page),ocr_text=VALUES(ocr_text),
            text_sha256=VALUES(text_sha256),ocr_status=VALUES(ocr_status)');
        foreach ($source['pages'] as $page)
            $stmt->execute([$source['source_id'],$page['scan_index'],$page['printed_page'],$page['text'],hash('sha256',$page['text']),$page['ocr_status']]);
        $db->commit();
        return ['status'=>'IMPORTED','source_id'=>$source['source_id'],'page_count'=>count($source['pages']),'note'=>'No historical claim verified'];
    } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
}
function n7isReferenceIndexPage(string $text): bool {
    // A back-of-book alphabetical index consists of dense comma/semicolon + page-number references.
    // Keep ordinary narrative pages with isolated historical dates and numbers.
    $refs=preg_match_all('/[,;]\\s*[0-9]{1,3}\\b/u',$text);
    $punct=preg_match_all('/[;,:]/u',$text);
    $chars=max(1,mb_strlen($text,'UTF-8'));
    return $refs>=8 && $punct>=12 && ($refs*1000/$chars)>=4.0;
}
function n7search(PDO $db,string $term): array {
    $term=trim($term);
    if(mb_strlen($term)<2||mb_strlen($term)>150)n7fail('INVALID_SEARCH');
    $pattern='%'.str_replace(['!','%','_'],['!!','!%','!_'],$term).'%';
    $rows=n7query($db,"SELECT s.source_id,s.title,s.author,s.publication_year,s.bibliographic_reference,s.source_uri,s.rights_note,p.scan_index,p.printed_page,p.ocr_status,p.ocr_text,p.text_sha256 FROM pc_library_pages p JOIN pc_library_sources s ON s.source_id=p.source_id WHERE p.ocr_text LIKE ? ESCAPE '!' ORDER BY p.scan_index LIMIT 600",[$pattern])->fetchAll();
    $ranked=[];
    foreach($rows as $row){
        $label=(string)($row['printed_page']??'');
        $full=$row['ocr_text'];
        if($label!==''&&!ctype_digit($label))continue;
        if(preg_match('/^(contents|list of illustrations|illustrations|index)\\b/i',trim($full)))continue;
        if(n7isReferenceIndexPage($full))continue;
        preg_match_all('/(?<![\\p{L}\\p{N}])'.preg_quote($term,'/').'(?![\\p{L}\\p{N}])/iu',$full,$hits,PREG_OFFSET_CAPTURE);
        $count=count($hits[0]);
        if(!$count)continue;
        $pos=mb_strlen(substr($full,0,$hits[0][0][1]),'UTF-8');
        $start=max(0,$pos-140);
        if($start>0){
            $opening=mb_substr($full,$start,40,'UTF-8');
            if(preg_match('/^[^\\s]{0,36}\\s/u',$opening,$m))$start+=mb_strlen($m[0],'UTF-8');
        }
        $excerpt=mb_substr($full,$start,440,'UTF-8');
        if($start+440<mb_strlen($full,'UTF-8'))$excerpt=preg_replace('/\\s+\\S*$/u','',$excerpt);
        $row['excerpt']=($start>0?'…':'').trim($excerpt).($start+440<mb_strlen($full,'UTF-8')?'…':'');
        $row['relevance_score']=$count*10;
        $row['source_type']='SECONDARY_HISTORIOGRAPHY';
        $row['evidence_state']='UNVERIFIED_SOURCE_TEXT';
        unset($row['ocr_text']);
        $ranked[]=$row;
    }
    usort($ranked,static fn($a,$b)=>($b['relevance_score']<=>$a['relevance_score'])?:strcmp($a['title'],$b['title'])?:($a['scan_index']<=>$b['scan_index']));
    return array_slice($ranked,0,30);
}

try {
    $action=$argv[1]??'';
    if ($action==='self-test') {
        $sample=['title'=>'Test source','pages'=>[['scan_index'=>1,'printed_page'=>'i','text'=>'Λάντζας']]];
        $parsed=n7parse(json_encode($sample,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
        if ($parsed['pages'][0]['printed_page']!=='i'||strlen($parsed['source_id'])!==64) n7fail('SELF_TEST_FAILED');
        $bad=$sample;$bad['pages'][]=$bad['pages'][0];
        try { n7parse(json_encode($bad,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)); n7fail('DUPLICATE_UNDETECTED'); }
        catch (RuntimeException $e) { if ($e->getMessage()!=='DUPLICATE_SCAN_INDEX') throw $e; }
        $index='Barbarossa, 17, 22, 108; raids, 24, 35, 43; Tunis, 59, 71; Doria, 103, 127; Dragut, 261, 279.';
        $narrative='Barbarossa commanded ships in the year 1538, and Andrea Doria opposed him. He moved towards the coast with the fleet and prepared for battle.';
        if(!n7isReferenceIndexPage($index)||n7isReferenceIndexPage($narrative))n7fail('INDEX_CLASSIFIER_FAILED');
        n7out(['status'=>'PASS','scope'=>'parser only; no live DB tested']); exit(0);
    }
    if (!in_array($action,['install','import','search','page'],true)) n7fail('USAGE: install | import FILE | search TERM | page SOURCE_ID SCAN_INDEX | self-test');
    if ($action==='import') {
        $path=$argv[2]??'';
        if ($path===''||!is_file($path)||is_link($path)||filesize($path)>33554432) n7fail('INVALID_IMPORT_FILE');
        $raw=file_get_contents($path);if ($raw===false) n7fail('SOURCE_READ_FAILED');
        $source=n7parse($raw); // validate BEFORE DB access
    }
    $db=n7db();
    if ($action==='install') {n7install($db); n7out(['status'=>'INSTALLED','database'=>N7_DB]);}
    elseif ($action==='import') n7out(n7import($db,$source));
    elseif ($action==='search') {
        $count=(int)$db->query('SELECT COUNT(*) FROM pc_library_sources')->fetchColumn();
        $pageCount=(int)$db->query('SELECT COUNT(*) FROM pc_library_pages')->fetchColumn();
        n7out(['matches'=>n7search($db,(string)($argv[2]??'')),
            'source_count'=>$count,'page_count'=>$pageCount]);
    }
    else {
        $id=(string)($argv[2]??'');$scan=filter_var($argv[3]??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
        if (!preg_match('/^[a-f0-9]{64}$/D',$id)||$scan===false) n7fail('INVALID_PAGE_REFERENCE');
        $page=n7query($db,'SELECT s.title,s.author,s.bibliographic_reference,s.source_uri,
            p.source_id,p.scan_index,p.printed_page,p.ocr_text,p.text_sha256,p.ocr_status
            FROM pc_library_pages p JOIN pc_library_sources s ON s.source_id=p.source_id
            WHERE p.source_id=? AND p.scan_index=?',[$id,$scan])->fetch();
        n7out($page?:['status'=>'NOT_FOUND']);
    }
} catch (Throwable $e) {
    // No credentials, SQL text or source bytes are emitted in errors.
    fwrite(STDERR,json_encode(['status'=>'ERROR','type'=>get_class($e),'reason'=>$e instanceof PDOException?'DATABASE_OPERATION_FAILED':$e->getMessage()],JSON_UNESCAPED_UNICODE).PHP_EOL);
    exit(1);
}
