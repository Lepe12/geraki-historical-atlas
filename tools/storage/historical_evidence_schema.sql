-- Additive research-evidence tables. Does not modify existing research tables.
CREATE TABLE IF NOT EXISTS pc_he_sources (
 id VARCHAR(160) PRIMARY KEY,
 title TEXT NOT NULL,
 source_url TEXT NULL,
 source_type VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN',
 acquired_at DATETIME NULL,
 source_sha256 CHAR(64) NULL,
 provenance_json LONGTEXT NULL
) ENGINE=InnoDB CHARACTER SET utf8mb4;
CREATE TABLE IF NOT EXISTS pc_he_attestations (
 id VARCHAR(32) PRIMARY KEY,
 entity_id VARCHAR(160) NOT NULL,
 predicate VARCHAR(100) NOT NULL,
 value_text TEXT NOT NULL,
 start_year SMALLINT NULL,
 end_year SMALLINT NULL,
 status ENUM('UNREVIEWED','OPERATOR_ACCEPTED','REJECTED','RETRACTED') NOT NULL DEFAULT 'UNREVIEWED',
 reviewer VARCHAR(160) NULL,
 reviewed_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX he_entity_idx(entity_id),
 INDEX he_status_idx(status)
) ENGINE=InnoDB CHARACTER SET utf8mb4;
CREATE TABLE IF NOT EXISTS pc_he_citations (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 attestation_id VARCHAR(32) NOT NULL,
 source_id VARCHAR(160) NOT NULL,
 locator VARCHAR(512) NOT NULL,
 exact_excerpt TEXT NOT NULL,
 attribution ENUM('stated','inferred') NOT NULL DEFAULT 'stated',
 FOREIGN KEY (attestation_id) REFERENCES pc_he_attestations(id),
 CONSTRAINT he_citation_source_fk FOREIGN KEY (source_id) REFERENCES pc_he_sources(id)
) ENGINE=InnoDB CHARACTER SET utf8mb4;
CREATE TABLE IF NOT EXISTS pc_he_candidate_sets (
 run_id VARCHAR(160) PRIMARY KEY,
 parameters_json LONGTEXT NOT NULL,
 snapshot_hash CHAR(64) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB CHARACTER SET utf8mb4;
CREATE TABLE IF NOT EXISTS pc_he_candidates (
 id VARCHAR(32) PRIMARY KEY,
 run_id VARCHAR(160) NOT NULL,
 subject_id VARCHAR(160) NOT NULL,
 object_id VARCHAR(160) NOT NULL,
 similarity_score DECIMAL(6,5) NOT NULL,
 algorithm VARCHAR(120) NOT NULL,
 FOREIGN KEY (run_id) REFERENCES pc_he_candidate_sets(run_id)
) ENGINE=InnoDB CHARACTER SET utf8mb4;
CREATE TABLE IF NOT EXISTS pc_he_review_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 attestation_id VARCHAR(32) NOT NULL,
 previous_status VARCHAR(32) NOT NULL,
 new_status VARCHAR(32) NOT NULL,
 reviewer VARCHAR(160) NOT NULL,
 reason TEXT NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (attestation_id) REFERENCES pc_he_attestations(id)
) ENGINE=InnoDB CHARACTER SET utf8mb4;
CREATE TABLE IF NOT EXISTS pc_he_schema_migrations (
 version VARCHAR(64) PRIMARY KEY,
 schema_sha256 CHAR(64) NOT NULL,
 applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB CHARACTER SET utf8mb4;
CREATE TABLE IF NOT EXISTS pc_he_entities (
 id VARCHAR(160) PRIMARY KEY,
 entity_type ENUM('Person','Place','Ship','Institution','Event','Source','Citation','Attestation','Relation') NOT NULL,
 label TEXT NOT NULL,
 properties_json LONGTEXT NOT NULL
) ENGINE=InnoDB CHARACTER SET utf8mb4;
CREATE TABLE IF NOT EXISTS pc_he_relations (
 id VARCHAR(160) PRIMARY KEY,
 subject_id VARCHAR(160) NOT NULL,
 predicate VARCHAR(160) NOT NULL,
 object_id VARCHAR(160) NOT NULL,
 citation_id BIGINT UNSIGNED NOT NULL,
 assertion_class ENUM('SOURCE_STATEMENT','INTERPRETATION','HYPOTHESIS') NOT NULL,
 FOREIGN KEY (subject_id) REFERENCES pc_he_entities(id),
 FOREIGN KEY (object_id) REFERENCES pc_he_entities(id),
 FOREIGN KEY (citation_id) REFERENCES pc_he_citations(id)
) ENGINE=InnoDB CHARACTER SET utf8mb4;
