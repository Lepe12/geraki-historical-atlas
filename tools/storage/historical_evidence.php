<?php
/** Additive evidence operations using the existing dedicated PDO connection. */
declare(strict_types=1);
function heQuery(PDO $db,string $sql,array $args=[]): PDOStatement {
    $s=$db->prepare($sql);$s->execute($args);return $s;
}
function heInstalled(PDO $db): bool {
    return (bool)heQuery($db,"SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pc_he_schema_migrations'")->fetchColumn();
}
function heBackupWrite($stream,string $text): void {
    while ($text!=='') {$written=gzwrite($stream,$text);if ($written===false||$written===0)throw new RuntimeException('BACKUP_WRITE_FAILED');$text=substr($text,$written);}
}
function heBackup(PDO $db,string $directory): array {
    if ($db->query('SELECT DATABASE()')->fetchColumn()!=='piratecartography') throw new RuntimeException('WRONG_DATABASE_BLOCKED');
    if (!is_dir($directory)&&!mkdir($directory,0700,true)) throw new RuntimeException('BACKUP_DIRECTORY_FAILED');
    chmod($directory,0700);
    $target=$directory.'/evidence-'.gmdate('YmdTHis').'-'.bin2hex(random_bytes(6)).'.sql.gz';
    $stream=gzopen($target,'wb6');if (!$stream) throw new RuntimeException('BACKUP_OPEN_FAILED');
    chmod($target,0600);$tables=0;$rows=0;
    try {
        $db->exec('START TRANSACTION WITH CONSISTENT SNAPSHOT');
        heBackupWrite($stream,"-- Dedicated piratecartography DB snapshot; restore to an empty dedicated DB.\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n");
        $names=$db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        $buffered=$db->getAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY);
        $db->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY,false);
        foreach ($names as $name) {
            if (!preg_match('/^[a-zA-Z0-9_]+$/D',$name)) throw new RuntimeException('UNSAFE_TABLE_IDENTIFIER');
            $ddl=$db->query('SHOW CREATE TABLE `'.$name.'`')->fetch(PDO::FETCH_NUM);
            heBackupWrite($stream,$ddl[1].";\n");$tables++;
            $q=$db->query('SELECT * FROM `'.$name.'`');
            while ($row=$q->fetch(PDO::FETCH_NUM)) {
                $values=array_map(fn($x)=>$x===null?'NULL':"X'".bin2hex((string)$x)."'",$row);
                heBackupWrite($stream,'INSERT INTO `'.$name.'` VALUES ('.implode(',',$values).");\n");
                $rows++;
            }
        }
        heBackupWrite($stream,"SET FOREIGN_KEY_CHECKS=1;\n");$db->commit();$db->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY,$buffered);gzclose($stream);
        $result=['file'=>$target,'sha256'=>hash_file('sha256',$target),'tables'=>$tables,'rows'=>$rows,'database'=>'piratecartography'];
        file_put_contents($target.'.json',json_encode($result,JSON_THROW_ON_ERROR));chmod($target.'.json',0600);
        return $result;
    } catch (Throwable $e) {if ($db->inTransaction())$db->rollBack();if (isset($buffered))$db->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY,$buffered);if (is_resource($stream))gzclose($stream);unlink($target);throw $e;}
}
function heMigrate(PDO $db): array {
    if ($db->query('SELECT DATABASE()')->fetchColumn()!=='piratecartography') throw new RuntimeException('WRONG_DATABASE_BLOCKED');
    $schema=file_get_contents(__DIR__.'/historical_evidence_schema.sql');if ($schema===false)throw new RuntimeException('EVIDENCE_SCHEMA_MISSING');
    $sha=hash('sha256',$schema);
    if (heInstalled($db)) {
        $old=heQuery($db,'SELECT schema_sha256 FROM pc_he_schema_migrations WHERE version=?',['evidence-v2'])->fetchColumn();
        if ($old!==false&&$old!==$sha) throw new RuntimeException('MIGRATION_CHECKSUM_CHANGED');
    }
    $exists=heQuery($db,"SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pc_he_citations'")->fetchColumn();
    if ($exists&&$db->query('SELECT COUNT(*) FROM pc_he_citations c LEFT JOIN pc_he_sources s ON s.id=c.source_id WHERE s.id IS NULL')->fetchColumn()) throw new RuntimeException('ORPHAN_CITATIONS_BLOCK_MIGRATION');
    foreach (explode(';',$schema) as $sql)if (trim($sql)!=='')$db->exec($sql);
    $db->exec('ALTER TABLE pc_he_sources ADD COLUMN IF NOT EXISTS source_sha256 CHAR(64) NULL, ADD COLUMN IF NOT EXISTS provenance_json LONGTEXT NULL');
    $db->exec("ALTER TABLE pc_he_attestations MODIFY status ENUM('UNREVIEWED','OPERATOR_ACCEPTED','REJECTED','RETRACTED') NOT NULL DEFAULT 'UNREVIEWED'");
    $fk=$db->query("SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='pc_he_citations' AND REFERENCED_TABLE_NAME='pc_he_sources'")->fetchColumn();
    if (!$fk)$db->exec('ALTER TABLE pc_he_citations ADD CONSTRAINT he_citation_source_fk FOREIGN KEY (source_id) REFERENCES pc_he_sources(id)');
    heQuery($db,'INSERT IGNORE INTO pc_he_schema_migrations (version,schema_sha256) VALUES (?,?)',['evidence-v2',$sha]);
    return ['version'=>'evidence-v2','schema_sha256'=>$sha,'database'=>'piratecartography'];
}
/** Caller owns transaction and supplies a trusted durable-byte reader. */
function heImportBundle(PDO $db,array $bundle,callable $readText): array {
    if (($bundle['schema']??'')!=='nabou-persistent-evidence-bundle-v1')throw new RuntimeException('INVALID_EVIDENCE_BUNDLE');
    $sources=[];$inserted=0;
    foreach ($bundle['sources']??[] as $source) {
        $text=$readText($source['text_path']);
        if (hash('sha256',$text)!==$source['text_sha256'])throw new RuntimeException('EVIDENCE_TEXT_CHECKSUM_MISMATCH');
        $sources[$source['id']]=['source'=>$source,'text'=>$text];
    }
    foreach ($bundle['attestations']??[] as $att) {
        if (($att['status']??'')!=='UNREVIEWED'||($att['historically_verified']??true)!==false||empty($att['citations']))throw new RuntimeException('AUTOMATIC_REVIEW_PROMOTION_BLOCKED');
        foreach ($att['citations'] as $citation) {
            $source=$sources[$citation['source_id']]??null;
            if (!$source||$citation['exact_excerpt']===''||!str_contains($source['text'],$citation['exact_excerpt']))throw new RuntimeException('QUOTE_REPLAY_FAILED');
        }
        $existing=heQuery($db,'SELECT entity_id,predicate,value_text FROM pc_he_attestations WHERE id=?',[$att['id']])->fetch(PDO::FETCH_NUM);
        if ($existing) {
            if ($existing!==[$att['entity_id'],$att['predicate'],$att['value']])throw new RuntimeException('IMMUTABLE_ATTESTATION_CONFLICT');
            $expected=array_map(fn($c)=>[$c['source_id'],$c['locator'],$c['exact_excerpt'],$c['attribution']],$att['citations']);sort($expected);
            $stored=heQuery($db,'SELECT source_id,locator,exact_excerpt,attribution FROM pc_he_citations WHERE attestation_id=?',[$att['id']])->fetchAll(PDO::FETCH_NUM);sort($stored);
            if ($stored!==$expected)throw new RuntimeException('IMMUTABLE_CITATION_CONFLICT');
            continue;
        }
        foreach ($att['citations'] as $citation) {
            $s=$sources[$citation['source_id']]['source'];
            heQuery($db,'INSERT IGNORE INTO pc_he_sources (id,title,source_url,source_type,provenance_json) VALUES (?,?,?,?,?)',[$s['id'],$s['title'],$s['url'],'UNVERIFIED',json_encode($s,JSON_THROW_ON_ERROR)]);
        }
        heQuery($db,'INSERT INTO pc_he_attestations (id,entity_id,predicate,value_text,start_year,end_year,status) VALUES (?,?,?,?,?,?,?)',[$att['id'],$att['entity_id'],$att['predicate'],$att['value'],$att['start_year']??null,$att['end_year']??null,'UNREVIEWED']);
        foreach ($att['citations'] as $citation)heQuery($db,'INSERT INTO pc_he_citations (attestation_id,source_id,locator,exact_excerpt,attribution) VALUES (?,?,?,?,?)',[$att['id'],$citation['source_id'],$citation['locator'],$citation['exact_excerpt'],$citation['attribution']]);
        $inserted++;
    }
    if (isset($bundle['graph']))heImportGraph($db,$bundle['graph']);
    return ['inserted_attestations'=>$inserted,'verified'=>0];
}
/** Replayed server records are ingested as UNREVIEWED, independently of UI selection. */
function heImportLearning(PDO $db,string $directory,string $id): array {
    if (!preg_match('/^src-[A-Za-z0-9-]+$/D',$id))throw new RuntimeException('INVALID_SOURCE_ID');
    if (!heInstalled($db))throw new RuntimeException('EVIDENCE_SCHEMA_NOT_INSTALLED');
    $record=json_decode(file_get_contents($directory.'/'.$id.'.json'),true,512,JSON_THROW_ON_ERROR);
    $pdf=$directory.'/uploads/'.$id.'.pdf';
    if (($record['pdf_replay']['original_pdf_replayed']??false)!==true||!is_file($pdf)||hash_file('sha256',$pdf)!==($record['source_sha256']??''))throw new RuntimeException('UPLOADED_PDF_REPLAY_REQUIRED');
    $sources=[];$attestations=[];$texts=[];
    foreach ($record['historical_evidence']['attestations']??[] as $att) {
        $page=$att['page'];$selected=null;
        foreach ($record['pdf_replay']['pages']??[] as $pg)if ($pg['page']===$page)$selected=$pg;
        if (!$selected||($att['source_sha256']??'')!==$record['source_sha256'])throw new RuntimeException('SOURCE_BINDING_MISMATCH');
        $sid='pdf_'.substr(hash('sha256',$record['source_sha256'].':'.$page),0,32);
        $texts[$sid]=$selected['text'];
        $sources[$sid]=['id'=>$sid,'title'=>$record['original_name'],'url'=>'urn:nabou:uploaded-pdf:'.$record['source_sha256'],
                        'text_path'=>$sid,'text_sha256'=>$selected['text_sha256'],'source_pdf_sha256'=>$record['source_sha256']];
        $attestations[]=['id'=>$att['id'],'entity_id'=>'mention:'.$att['id'],'predicate'=>$att['predicate'],'value'=>$att['text'],
                         'status'=>'UNREVIEWED','historically_verified'=>false,
                         'citations'=>[['source_id'=>$sid,'locator'=>$att['locator'],'exact_excerpt'=>$att['exact_excerpt'],'attribution'=>'stated']]];
    }
    $bundle=['schema'=>'nabou-persistent-evidence-bundle-v1','sources'=>array_values($sources),'attestations'=>$attestations];
    $db->beginTransaction();
    try {$result=heImportBundle($db,$bundle,fn(string $key)=>$texts[$key]);$db->commit();return $result;}
    catch (Throwable $e) {if ($db->inTransaction())$db->rollBack();throw $e;}
}

function heImportGraph(PDO $db,array $graph): void {
    $nodes=[];$citations=[];
    foreach ($graph['entities']??[] as $entity) {
        if (!in_array($entity['entity_type'],['Person','Place','Ship','Institution','Event','Source','Citation','Attestation','Relation'],true))throw new RuntimeException('INVALID_GRAPH_TYPE');
        if (isset($nodes[$entity['id']]))throw new RuntimeException('DUPLICATE_GRAPH_ID');
        $nodes[$entity['id']]=$entity;
        if ($entity['entity_type']==='Citation')$citations[$entity['id']]=$entity['properties'];
        $properties=json_encode($entity['properties']??[],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
        $old=heQuery($db,'SELECT entity_type,label,properties_json FROM pc_he_entities WHERE id=?',[$entity['id']])->fetch(PDO::FETCH_ASSOC);
        if ($old) {
            if ($old['entity_type']!==$entity['entity_type']||$old['label']!==$entity['label']||json_decode($old['properties_json'],true)!=$entity['properties'])throw new RuntimeException('IMMUTABLE_GRAPH_ENTITY_CONFLICT');
        } else heQuery($db,'INSERT INTO pc_he_entities (id,entity_type,label,properties_json) VALUES (?,?,?,?)',[$entity['id'],$entity['entity_type'],$entity['label'],$properties]);
    }
    foreach ($graph['relations']??[] as $relation) {
        if (!isset($nodes[$relation['subject_id']],$nodes[$relation['object_id']])||empty($relation['citation_ids'])||!in_array($relation['assertion_class'],['SOURCE_STATEMENT','INTERPRETATION','HYPOTHESIS'],true))throw new RuntimeException('INVALID_OR_UNCITED_GRAPH_RELATION');
        foreach ($relation['citation_ids'] as $id) {
            $c=$citations[$id]??null;
            if (!$c||empty($c['exact_excerpt']))throw new RuntimeException('GRAPH_CITATION_MISSING');
            $stored=heQuery($db,'SELECT id FROM pc_he_citations WHERE attestation_id=? AND source_id=? AND locator=? AND exact_excerpt=? LIMIT 1',[$relation['attestation_id']??$relation['subject_id'],$c['source_id'],$c['locator'],$c['exact_excerpt']])->fetchColumn();
            if ($stored===false)throw new RuntimeException('GRAPH_CITATION_NOT_PERSISTED');
            $identifier=$relation['id'].':'.$stored;$values=[$relation['subject_id'],$relation['predicate'],$relation['object_id'],$stored,$relation['assertion_class']];
            $old=heQuery($db,'SELECT subject_id,predicate,object_id,citation_id,assertion_class FROM pc_he_relations WHERE id=?',[$identifier])->fetch(PDO::FETCH_NUM);
            if ($old&&$old!=$values)throw new RuntimeException('IMMUTABLE_GRAPH_RELATION_CONFLICT');
            if (!$old)heQuery($db,'INSERT INTO pc_he_relations (id,subject_id,predicate,object_id,citation_id,assertion_class) VALUES (?,?,?,?,?,?)',array_merge([$identifier],$values));
        }
    }
}
