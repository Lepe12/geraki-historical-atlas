-- N7 persistent historical book library. Additive, dedicated piratecartography DB only.
-- An item is not a VERIFIED historical claim merely because its OCR text is indexed.
CREATE TABLE IF NOT EXISTS pc_library_sources (
 source_id CHAR(64) PRIMARY KEY,
 title VARCHAR(512) NOT NULL,
 author VARCHAR(512) NULL,
 publication_year VARCHAR(64) NULL,
 bibliographic_reference TEXT NULL,
 source_uri TEXT NULL,
 rights_note TEXT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS pc_library_pages (
 source_id CHAR(64) NOT NULL,
 scan_index INT UNSIGNED NOT NULL,
 printed_page VARCHAR(64) NULL,
 ocr_text LONGTEXT NOT NULL,
 text_sha256 CHAR(64) NOT NULL,
 ocr_status VARCHAR(32) NOT NULL DEFAULT 'UNREVIEWED',
 imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (source_id,scan_index),
 FULLTEXT KEY idx_ocr_text (ocr_text),
 CONSTRAINT fk_pc_library_source FOREIGN KEY (source_id)
 REFERENCES pc_library_sources(source_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
