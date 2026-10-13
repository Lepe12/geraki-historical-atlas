-- Additive schema for the dedicated piratecartography database only.
CREATE TABLE IF NOT EXISTS pc_research_runs (
 run_id VARCHAR(64) PRIMARY KEY,
 research_job_id VARCHAR(191) NULL,
 request_sha256 CHAR(64) NULL,
 target VARCHAR(512) NULL,
 request_json LONGTEXT NULL,
 identity_status VARCHAR(64) NOT NULL,
 tree_sha256 CHAR(64) NOT NULL,
 source_commit CHAR(40) NOT NULL,
 document_count INT UNSIGNED NOT NULL,
 imported_at DATETIME NOT NULL,
 INDEX idx_research_job (research_job_id), INDEX idx_research_target (target(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS pc_research_payloads (
 sha256 CHAR(64) PRIMARY KEY,
 encoding VARCHAR(16) NOT NULL,
 byte_count BIGINT UNSIGNED NOT NULL,
 compressed_payload LONGBLOB NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pc_research_documents (
 version_key CHAR(64) PRIMARY KEY,
 run_id VARCHAR(64) NOT NULL,
 lane VARCHAR(64) NOT NULL,
 source_path VARCHAR(1024) NOT NULL,
 git_blob CHAR(40) NOT NULL,
 source_commit CHAR(40) NOT NULL,
 byte_count BIGINT UNSIGNED NOT NULL,
 content_kind VARCHAR(32) NOT NULL,
 payload_sha256 CHAR(64) NULL,
 is_current TINYINT NOT NULL DEFAULT 1,
 imported_at DATETIME NOT NULL,
 INDEX idx_documents_run (run_id, is_current),
 INDEX idx_documents_lane (lane, is_current),
 INDEX idx_documents_payload (payload_sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS pc_research_items (
 version_key CHAR(64) PRIMARY KEY,
 run_id VARCHAR(64) NOT NULL,
 lane VARCHAR(64) NOT NULL,
 kind VARCHAR(16) NOT NULL,
 external_id VARCHAR(512) NULL,
 title TEXT NULL,
 reference TEXT NULL,
 declared_evidence_state VARCHAR(64) NULL,
 review_status VARCHAR(64) NOT NULL,
 is_verified TINYINT NOT NULL DEFAULT 0,
 payload_sha256 CHAR(64) NOT NULL,
 source_document_key CHAR(64) NOT NULL,
 is_current TINYINT NOT NULL DEFAULT 1,
 INDEX idx_items_run (run_id, is_current),
 INDEX idx_items_kind (kind, is_current),
 INDEX idx_items_payload (payload_sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS pc_research_storage_audit (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 run_id VARCHAR(64) NULL,
 action VARCHAR(32) NOT NULL,
 status VARCHAR(32) NOT NULL,
 details_json LONGTEXT NOT NULL,
 created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
