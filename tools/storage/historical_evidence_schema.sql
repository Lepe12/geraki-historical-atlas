-- Additive research-evidence tables; does not modify existing production tables.
CREATE TABLE IF NOT EXISTS pc_he_sources (
 id VARCHAR(160) PRIMARY KEY,
 title TEXT NOT NULL,
 source_url TEXT NULL,
 source_type VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN',
 acquired_at DATETIME NULL
) CHARACTER SET utf8mb4;
CREATE TABLE IF NOT EXISTS pc_he_attestations (
 id VARCHAR(32) PRIMARY KEY,
 entity_id VARCHAR(160) NOT NULL,
 predicate VARCHAR(100) NOT NULL,
 value_text TEXT NOT NULL,
 start_year SMALLINT NULL,
 end_year SMALLINT NULL,
 status ENUM('UNREVIEWED','OPERATOR_ACCEPTED','REJECTED') NOT NULL DEFAULT 'UNREVIEWED',
 reviewer VARCHAR(160) NULL,
 reviewed_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX he_entity_idx(entity_id),
 INDEX he_status_idx(status)
) CHARACTER SET utf8mb4;
CREATE TABLE IF NOT EXISTS pc_he_citations (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 attestation_id VARCHAR(32) NOT NULL,
 source_id VARCHAR(160) NOT NULL,
 locator VARCHAR(512) NOT NULL,
 exact_excerpt TEXT NOT NULL,
 attribution ENUM('stated','inferred') NOT NULL DEFAULT 'stated',
 FOREIGN KEY (attestation_id) REFERENCES pc_he_attestations(id)
) CHARACTER SET utf8mb4;
CREATE TABLE IF NOT EXISTS pc_he_candidate_sets (
 run_id VARCHAR(160) PRIMARY KEY,
 parameters_json LONGTEXT NOT NULL,
 snapshot_hash CHAR(64) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4;
CREATE TABLE IF NOT EXISTS pc_he_candidates (
 id VARCHAR(32) PRIMARY KEY,
 run_id VARCHAR(160) NOT NULL,
 subject_id VARCHAR(160) NOT NULL,
 object_id VARCHAR(160) NOT NULL,
 similarity_score DECIMAL(6,5) NOT NULL,
 algorithm VARCHAR(120) NOT NULL,
 FOREIGN KEY (run_id) REFERENCES pc_he_candidate_sets(run_id)
) CHARACTER SET utf8mb4;
