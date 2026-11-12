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
        if (!in_array($status,['UNREVIEWED','MANUALLY_TRANSCRIBED','OCR_REVIEWED','OCR_PENDING'],true)) n7fail('INVALID_OCR_STATUS');
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
/** Accent-, case- and final-sigma-insensitive form used for matching only; stored text is never changed. */
function n7fold(string $s): string {
    static $cache=[];
    if (isset($cache[$s])) return $cache[$s];
    $f=$s;
    if (class_exists('Normalizer')) {
        $d=Normalizer::normalize($s, Normalizer::FORM_D);
        if ($d!==false) $f=(string)preg_replace('/\p{Mn}+/u','',$d);
    } else {
        $f=strtr($s,['ά'=>'α','έ'=>'ε','ή'=>'η','ί'=>'ι','ό'=>'ο','ύ'=>'υ','ώ'=>'ω','ϊ'=>'ι','ϋ'=>'υ','ΐ'=>'ι','ΰ'=>'υ',
            'Ά'=>'Α','Έ'=>'Ε','Ή'=>'Η','Ί'=>'Ι','Ό'=>'Ο','Ύ'=>'Υ','Ώ'=>'Ω','Ϊ'=>'Ι','Ϋ'=>'Υ']);
    }
    $f=str_replace('ς','σ',mb_strtolower($f,'UTF-8'));
    if (mb_strlen($s,'UTF-8')===1 && count($cache)<4096) $cache[$s]=$f;
    return $f;
}
/** Folds text while recording, for each folded character, the index of its original character. */
function n7foldIndexed(string $text): array {
    $out=''; $map=[]; $n=0;
    foreach (mb_str_split($text,1,'UTF-8') as $i=>$c) {
        foreach (mb_str_split(n7fold($c),1,'UTF-8') as $fc) { $out.=$fc; $map[$n++]=$i; }
    }
    return [$out,$map];
}
/** Returns [count, first original character position] of whole-word matches, or [0,-1]. */
function n7match(string $text,string $term): array {
    $needle=n7fold(trim($term));
    if ($needle==='') return [0,-1];
    [$folded,$map]=n7foldIndexed($text);
    $count=preg_match_all('/(?<![\p{L}\p{N}])'.preg_quote($needle,'/').'(?![\p{L}\p{N}])/u',$folded,$hits,PREG_OFFSET_CAPTURE);
    if (!$count) return [0,-1];
    $foldedPos=mb_strlen(substr($folded,0,$hits[0][0][1]),'UTF-8');
    return [$count,$map[$foldedPos]??0];
}
function n7search(PDO $db,string $term): array {
    $term=trim($term);
    if(mb_strlen($term)<2||mb_strlen($term)>150)n7fail('INVALID_SEARCH');
    // Prefilter with the typed and the folded spelling; collation differences cannot drop a page.
    $forms=array_values(array_unique([$term,n7fold($term)]));
    $patterns=array_map(static fn($t)=>'%'.str_replace(['!','%','_'],['!!','!%','!_'],$t).'%',$forms);
    $where=implode(' OR ',array_fill(0,count($patterns),"p.ocr_text LIKE ? ESCAPE '!'"));
    $rows=n7query($db,"SELECT s.source_id,s.title,s.author,s.publication_year,s.bibliographic_reference,s.source_uri,s.rights_note,p.scan_index,p.printed_page,p.ocr_status,p.ocr_text,p.text_sha256 FROM pc_library_pages p JOIN pc_library_sources s ON s.source_id=p.source_id WHERE ($where) ORDER BY p.scan_index LIMIT 600",$patterns)->fetchAll();
    $ranked=[];
    foreach($rows as $row){
        $label=(string)($row['printed_page']??'');
        $full=$row['ocr_text'];
        if($label!==''&&!ctype_digit($label))continue;
        if(preg_match('/^(contents|list of illustrations|illustrations|index)\\b/i',trim($full)))continue;
        if(n7isReferenceIndexPage($full))continue;
        [$count,$pos]=n7match($full,$term);
        if(!$count)continue;
        $start=max(0,$pos-140);
        if($start>0){
            $opening=mb_substr($full,$start,40,'UTF-8');
            if(preg_match('/^[^\\s]{0,36}\\s/u',$opening,$m))$start+=mb_strlen($m[0],'UTF-8');
        }
        $excerpt=mb_substr($full,$start,440,'UTF-8');
        if($start+440<mb_strlen($full,'UTF-8'))$excerpt=preg_replace('/\\s+\\S*$/u','',$excerpt);
        $row['excerpt']=($start>0?'…':'').trim($excerpt).($start+440<mb_strlen($full,'UTF-8')?'…':'');
        $row['relevance_score']=$count*10;
        $row['source_type']=str_contains(strtolower((string)($row['rights_note']??'')),'historical secondary source')?'SECONDARY_HISTORIOGRAPHY':'UNCLASSIFIED_REQUIRES_REVIEW';
        $row['evidence_state']='UNVERIFIED_SOURCE_TEXT';
        unset($row['ocr_text']);
        $ranked[]=$row;
    }
    usort($ranked,static fn($a,$b)=>($b['relevance_score']<=>$a['relevance_score'])?:strcmp($a['title'],$b['title'])?:($a['scan_index']<=>$b['scan_index']));
    return array_slice($ranked,0,30);
}

/* ---------- N7_HYBRID_SEARCH_V1 ----------
 * Lexical results (n7search, unchanged) fused by reciprocal rank with a semantic list.
 * Passage vectors are produced OFFLINE (multilingual-e5-small) and deployed as read-only files in
 * n7-semantic/; no model runs here. The query vector is a weighted mean of offline word vectors
 * looked up by binary search. Every semantic excerpt is cut from the CURRENT page text in the
 * database and is dropped if that page changed after indexing (text_sha256 mismatch).
 * Without a valid index, search is exactly the lexical search. */
const N7_SEM_DIR = __DIR__.'/n7-semantic';
const N7_SEM_DIMS = 384;
const N7_SEM_KEY_WIDTH = 48;
const N7_SEM_SCALE = 508;        // int8 = round(component * 508); |component| < 0.25 for e5 unit vectors
const N7_SEM_MIN_COSINE = 0.5;   // e5 passages relevant or not score 0.7-0.85; this only drops degenerate matches
function n7semIndex(string $dir=N7_SEM_DIR): ?array {
    static $cache=[];
    if (array_key_exists($dir,$cache)) return $cache[$dir];
    $cache[$dir]=null;
    $m=@json_decode((string)@file_get_contents($dir.'/manifest.json'),true);
    if (!is_array($m)||($m['schema']??'')!=='n7-semantic-index-v1'||(int)($m['dims']??0)!==N7_SEM_DIMS) return null;
    foreach (['chunks.i8','chunks.meta.json','words.keys','words.i8','words.w'] as $f) {
        $path=$dir.'/'.$f;
        if (!is_file($path)||is_link($path)||hash_file('sha256',$path)!==($m['files'][$f]??'')) return null;
    }
    $meta=json_decode((string)file_get_contents($dir.'/chunks.meta.json'),true);
    $n=(int)$m['chunks'];$w=(int)$m['words'];
    if (!is_array($meta)||count($meta)!==$n||filesize($dir.'/chunks.i8')!==$n*N7_SEM_DIMS||
        filesize($dir.'/words.i8')!==$w*N7_SEM_DIMS||filesize($dir.'/words.keys')!==$w*N7_SEM_KEY_WIDTH||filesize($dir.'/words.w')!==$w) return null;
    return $cache[$dir]=['dir'=>$dir,'meta'=>$meta,'chunks'=>$n,'words'=>$w,'model'=>(string)($m['model']??'')];
}
function n7semWord($fh,int $count,string $key): int {
    $key=substr($key,0,N7_SEM_KEY_WIDTH);$lo=0;$hi=$count-1;
    while ($lo<=$hi) {
        $mid=intdiv($lo+$hi,2);fseek($fh,$mid*N7_SEM_KEY_WIDTH);
        $cmp=strcmp(rtrim((string)fread($fh,N7_SEM_KEY_WIDTH),"\0"),$key);
        if ($cmp===0) return $mid;
        if ($cmp<0) $lo=$mid+1; else $hi=$mid-1;
    }
    return -1;
}
/** Query vector from offline word vectors; null when no query word is known. */
function n7semQuery(array $index,string $query): ?array {
    preg_match_all('/[\p{L}]{2,}/u',$query,$m);
    $keys=$index['dir'].'/words.keys';$vecs=$index['dir'].'/words.i8';$weights=$index['dir'].'/words.w';
    $fk=fopen($keys,'rb');$fv=fopen($vecs,'rb');$fw=fopen($weights,'rb');
    $sum=array_fill(0,N7_SEM_DIMS,0.0);$used=0;
    foreach (array_unique(array_map('n7fold',$m[0])) as $word) {
        if (strlen($word)>N7_SEM_KEY_WIDTH) continue;
        $i=n7semWord($fk,$index['words'],$word);
        if ($i<0) continue;
        fseek($fw,$i);$weight=ord((string)fread($fw,1))/20;
        fseek($fv,$i*N7_SEM_DIMS);$v=unpack('c'.N7_SEM_DIMS,(string)fread($fv,N7_SEM_DIMS));
        for ($k=0;$k<N7_SEM_DIMS;$k++) $sum[$k]+=$weight*$v[$k+1];
        $used++;
    }
    fclose($fk);fclose($fv);fclose($fw);
    if (!$used) return null;
    $norm=sqrt(array_sum(array_map(static fn($x)=>$x*$x,$sum)));
    return $norm>0?array_map(static fn($x)=>$x/$norm,$sum):null;
}
/** Top passages by dot product: [[chunk_index, score], ...]. */
function n7semTop(array $index,array $q,int $limit=200): array {
    $raw=(string)file_get_contents($index['dir'].'/chunks.i8');$top=[];
    for ($c=0;$c<$index['chunks'];$c++) {
        $v=unpack('c'.N7_SEM_DIMS,$raw,$c*N7_SEM_DIMS);$d=0.0;
        for ($k=0;$k<N7_SEM_DIMS;$k++) $d+=$q[$k]*$v[$k+1];
        $top[$c]=$d;
    }
    arsort($top);
    return array_slice($top,0,$limit,true);
}
function n7hybridSearch(PDO $db,string $term,?array $index=null): array {
    $lexical=array_map(static fn($r)=>$r+['retrieval'=>'lexical'],n7search($db,$term));
    $index=$index??n7semIndex();
    // Names, toponyms and short spellings stay exact (lexical); meaning is used for phrased questions.
    if (!$index||preg_match_all('/[\p{L}]{2,}/u',$term)<3) return $lexical;
    $q=n7semQuery($index,$term);
    if (!$q) return $lexical;
    $semantic=[];
    foreach (n7semTop($index,$q) as $c=>$score) {
        if ($score/N7_SEM_SCALE<N7_SEM_MIN_COSINE) break;
        [$sid,$scan,$start,$end,$hash]=$index['meta'][$c];
        $key=$sid.':'.$scan;
        if (!isset($semantic[$key])) $semantic[$key]=['chunk'=>$c,'score'=>$score,'start'=>$start,'end'=>$end,'hash'=>$hash];
    }
    $fused=[];$rank=0;
    foreach ($lexical as $row) $fused[$row['source_id'].':'.$row['scan_index']]=['rrf'=>1/(60+ ++$rank),'row'=>$row];
    $rank=0;
    foreach ($semantic as $key=>$hit) {
        $fused[$key]=$fused[$key]??['rrf'=>0.0,'row'=>null];
        $fused[$key]['rrf']+=1/(60+ ++$rank);$fused[$key]['sem']=$hit;
    }
    uasort($fused,static fn($a,$b)=>$b['rrf']<=>$a['rrf']);
    $out=[];
    $page=$db->prepare('SELECT s.source_id,s.title,s.author,s.publication_year,s.bibliographic_reference,s.source_uri,s.rights_note,p.scan_index,p.printed_page,p.ocr_status,p.ocr_text,p.text_sha256 FROM pc_library_pages p JOIN pc_library_sources s ON s.source_id=p.source_id WHERE p.source_id=? AND p.scan_index=?');
    foreach ($fused as $key=>$f) {
        if (count($out)>=30) break;
        $row=$f['row'];$sem=$f['sem']??null;
        if (!$row) {
            [$sid,$scan]=explode(':',$key);
            $page->execute([$sid,(int)$scan]);$row=$page->fetch();
            if (!$row||!hash_equals($row['text_sha256'],$sem['hash'])) continue; // page changed after indexing
            $label=(string)($row['printed_page']??'');$full=$row['ocr_text'];
            if (($label!==''&&!ctype_digit($label))||n7isReferenceIndexPage($full)) continue;
            $length=mb_strlen($full,'UTF-8');
            if ($sem['start']<0||$sem['end']>$length||$sem['end']<=$sem['start']) continue;
            $excerpt=trim(mb_substr($full,$sem['start'],min(560,$sem['end']-$sem['start']),'UTF-8'));
            $row['excerpt']=($sem['start']>0?'…':'').$excerpt.($sem['start']+560<$sem['end']||$sem['end']<$length?'…':'');
            $row['char_start']=$sem['start'];$row['char_end']=$sem['end'];
            $row['source_type']=str_contains(strtolower((string)($row['rights_note']??'')),'historical secondary source')?'SECONDARY_HISTORIOGRAPHY':'UNCLASSIFIED_REQUIRES_REVIEW';
            $row['evidence_state']='UNVERIFIED_SOURCE_TEXT';
            unset($row['ocr_text']);
        }
        $row['retrieval']=$f['row']?($sem?'lexical+semantic':'lexical'):'semantic';
        $row['semantic_score']=$sem?round($sem['score']/N7_SEM_SCALE,4):null;
        $row['fused_score']=round($f['rrf'],6);
        $out[]=$row;
    }
    return $out;
}

if (realpath((string)($argv[0]??''))!==realpath(__FILE__)) return; // included by a test harness
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
        $pending=$sample;$pending['pages'][0]['ocr_status']='OCR_PENDING';$pending['pages'][0]['text']='';
        if(n7parse(json_encode($pending,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR))['pages'][0]['ocr_status']!=='OCR_PENDING')n7fail('OCR_PENDING_UNDETECTED');
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
        $semantic=n7semIndex();
        n7out(['matches'=>n7hybridSearch($db,(string)($argv[2]??''),$semantic),'retrieval'=>$semantic?'hybrid-rrf':'lexical',
            'source_count'=>$count,'page_count'=>$pageCount]);
    }
    else {
        $id=(string)($argv[2]??'');$scan=filter_var($argv[3]??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
        if (!preg_match('/^[a-f0-9]{64}$/D',$id)||$scan===false) n7fail('INVALID_PAGE_REFERENCE');
        $page=n7query($db,'SELECT s.title,s.author,s.publication_year,s.bibliographic_reference,s.source_uri,s.rights_note,
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
