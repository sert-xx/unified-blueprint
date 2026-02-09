import type { Migration } from '../types.js';

const INITIAL_SCHEMA_SQL = `
-- schema_version
CREATE TABLE IF NOT EXISTS schema_version (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT    NOT NULL,
    description TEXT
);

-- documents
CREATE TABLE IF NOT EXISTS documents (
    id          TEXT    PRIMARY KEY,
    filepath    TEXT    NOT NULL UNIQUE,
    title       TEXT    NOT NULL,
    doc_type    TEXT    NOT NULL DEFAULT 'spec'
                        CHECK(doc_type IN ('spec','design','db-schema','api','config','guide')),
    body_hash   TEXT    NOT NULL,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_filepath ON documents(filepath);
CREATE INDEX IF NOT EXISTS idx_documents_title ON documents(title);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at);
CREATE INDEX IF NOT EXISTS idx_documents_doc_type ON documents(doc_type);

-- sections
CREATE TABLE IF NOT EXISTS sections (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id          TEXT    NOT NULL
                            REFERENCES documents(id) ON DELETE CASCADE,
    heading         TEXT,
    section_order   INTEGER NOT NULL,
    content         TEXT    NOT NULL,
    content_hash    TEXT    NOT NULL,
    embedding       BLOB,
    embedding_model TEXT,
    token_count     INTEGER,
    updated_at      TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sections_doc_id ON sections(doc_id);
CREATE INDEX IF NOT EXISTS idx_sections_heading ON sections(heading) WHERE heading IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sections_embedding_model ON sections(embedding_model);
CREATE INDEX IF NOT EXISTS idx_sections_content_hash ON sections(content_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sections_doc_order ON sections(doc_id, section_order);

-- links
CREATE TABLE IF NOT EXISTS links (
    source_doc_id       TEXT    NOT NULL
                                REFERENCES documents(id) ON DELETE CASCADE,
    target_doc_id       TEXT    REFERENCES documents(id) ON DELETE CASCADE,
    type                TEXT    NOT NULL DEFAULT 'references'
                                CHECK(type IN ('references','depends_on','implements','extends','conflicts_with')),
    context             TEXT,
    source_section_id   INTEGER REFERENCES sections(id) ON DELETE SET NULL,
    target_title        TEXT,
    created_at          TEXT    NOT NULL
);

-- Composite unique constraint using COALESCE for dangling link support
CREATE UNIQUE INDEX IF NOT EXISTS idx_links_pk ON links(source_doc_id, COALESCE(target_doc_id, ''), type);

CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_doc_id) WHERE target_doc_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_links_type ON links(type);
CREATE INDEX IF NOT EXISTS idx_links_source_section ON links(source_section_id);
CREATE INDEX IF NOT EXISTS idx_links_dangling ON links(source_doc_id) WHERE target_doc_id IS NULL;

-- source_refs_state
CREATE TABLE IF NOT EXISTS source_refs_state (
    doc_id              TEXT    NOT NULL
                                REFERENCES documents(id) ON DELETE CASCADE,
    file_path           TEXT    NOT NULL,
    last_synced_hash    TEXT,
    last_synced_at      TEXT,
    is_stale            INTEGER NOT NULL DEFAULT 0
                                CHECK(is_stale IN (0, 1)),
    PRIMARY KEY (doc_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_source_refs_stale ON source_refs_state(is_stale) WHERE is_stale = 1;

-- FTS5
CREATE VIRTUAL TABLE IF NOT EXISTS sections_fts USING fts5(
    heading,
    content,
    content='sections',
    content_rowid='id',
    tokenize='trigram'
);

-- FTS5 sync triggers
CREATE TRIGGER IF NOT EXISTS sections_fts_insert
AFTER INSERT ON sections
BEGIN
    INSERT INTO sections_fts(rowid, heading, content)
    VALUES (NEW.id, NEW.heading, NEW.content);
END;

CREATE TRIGGER IF NOT EXISTS sections_fts_update
AFTER UPDATE OF heading, content ON sections
BEGIN
    INSERT INTO sections_fts(sections_fts, rowid, heading, content)
    VALUES ('delete', OLD.id, OLD.heading, OLD.content);
    INSERT INTO sections_fts(rowid, heading, content)
    VALUES (NEW.id, NEW.heading, NEW.content);
END;

CREATE TRIGGER IF NOT EXISTS sections_fts_delete
AFTER DELETE ON sections
BEGIN
    INSERT INTO sections_fts(sections_fts, rowid, heading, content)
    VALUES ('delete', OLD.id, OLD.heading, OLD.content);
END;
`;

export const migration001: Migration = {
  version: 1,
  description: '初期スキーマ作成',
  up: (db) => {
    db.exec(INITIAL_SCHEMA_SQL);
    db.prepare(
      'INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)',
    ).run(1, new Date().toISOString(), '初期スキーマ作成');
  },
};
