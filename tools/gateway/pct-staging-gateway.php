<?php
/**
 * Piratecartography read-only staging gateway (PHP 8.2+).
 * Deploy under HTTPS in a dedicated, isolated public endpoint.
 * Keep DB config and API secret outside httpdocs. No WordPress integration.
 * Requires environment PCT_GATEWAY_SECRET (random 32+ bytes, never commit).
 * Requires private config file path PCT_DB_CONFIG_PATH.
 *
 * Request: GET /pct-staging-gateway.php with headers:
 * X-PCT-Timestamp: Unix epoch seconds
 * X-PCT-Nonce: 32 hex chars
 * X-PCT-Signature: lowercase hex HMAC-SHA256 of
 * "GET\n" + path + "\n" + timestamp + "\n" + nonce
 * Signature uses PCT_GATEWAY_SECRET.
 * HTTPS enforced; timestamp +/-60 seconds. Read-only counts only.
 */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function fail(int $status, string $reason): never {
    http_response_code($status);
    echo json_encode(['status'=>'BLOCKED','reason'=>$reason]);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') fail(405, 'method');
if (($_SERVER['HTTPS'] ?? '') !== 'on') fail(403, 'https_required');
$secret = getenv('PCT_GATEWAY_SECRET');
$configPath = getenv('PCT_DB_CONFIG_PATH');
if (!is_string($secret) || strlen($secret) < 32 || !is_string($configPath) || $configPath === '') fail(503, 'not_configured');
$timestamp = $_SERVER['HTTP_X_PCT_TIMESTAMP'] ?? '';
$nonce = $_SERVER['HTTP_X_PCT_NONCE'] ?? '';
$signature = $_SERVER['HTTP_X_PCT_SIGNATURE'] ?? '';
if (!preg_match('/^[0-9]{10,12}$/D', $timestamp) ||
    abs(time() - (int)$timestamp) > 60 ||
    !preg_match('/^[a-f0-9]{32}$/D', $nonce) ||
    !preg_match('/^[a-f0-9]{64}$/D', $signature)) fail(401, 'invalid_auth');
$path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
if (!is_string($path) || $path === '') fail(400, 'invalid_path');
$payload = "GET\n" . $path . "\n" . $timestamp . "\n" . $nonce;
$expected = hash_hmac('sha256', $payload, $secret);
if (!hash_equals($expected, $signature)) fail(401, 'invalid_auth');
// The endpoint only returns fixed aggregate counts, no record payloads.
// Nonce is authenticated but not persisted: replay is possible within 60 seconds.
// Do not add writes until server-side nonce storage and authorization are implemented.
try {
    if (!is_file($configPath) || !is_readable($configPath)) fail(503, 'config_unavailable');
    $cfg = require $configPath;
    if (!is_array($cfg) || ($cfg['database'] ?? null) !== 'piratecartography') fail(503, 'config_invalid');
    $pdo = new PDO('mysql:host=localhost;port=3306;dbname=piratecartography;charset=utf8mb4',
        (string)($cfg['username'] ?? ''), (string)($cfg['password'] ?? ''),
        [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    $stmt = $pdo->prepare('SELECT r.airtable_table, COUNT(*) AS n FROM pc_mig_records r JOIN pc_mig_batches b ON b.batch_id=r.batch_id WHERE b.source_snapshot=:snapshot GROUP BY r.airtable_table');
    $stmt->execute(['snapshot'=>'20261012T113000Z']);
    $actual = ['PLACES'=>0,'SOURCES'=>0,'EVENTS'=>0,'ROUTES'=>0,'RESEARCH_JOBS'=>0];
    foreach ($stmt as $row) {
        $key = (string)$row['airtable_table'];
        if (array_key_exists($key, $actual)) $actual[$key] = (int)$row['n'];
    }
    $expectedCounts = ['PLACES'=>3,'SOURCES'=>11,'EVENTS'=>1,'ROUTES'=>0,'RESEARCH_JOBS'=>1];
    echo json_encode(['status'=>$actual === $expectedCounts ? 'PASS' : 'FAIL',
        'snapshot'=>'20261012T113000Z','counts'=>$actual], JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    fail(503, 'database_unavailable');
}
