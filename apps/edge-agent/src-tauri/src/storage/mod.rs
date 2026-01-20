//! SQLite storage for the Edge Agent
//!
//! Stores evidence, claims, commitments, and keys locally with encryption.

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Evidence record - source documents
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Evidence {
    pub id: String,
    pub evidence_type: String,
    pub original_filename: Option<String>,
    pub mime_type: Option<String>,
    pub content_hash: String,
    pub extracted_text: Option<String>,
    pub issuer_name: Option<String>,
    pub issuer_type: Option<String>,
    pub valid_from: Option<DateTime<Utc>>,
    pub valid_until: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// Claim record - extracted data points
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claim {
    pub id: String,
    pub claim_type: String,
    pub value: serde_json::Value,
    pub unit: String,
    pub product_id: String,
    pub evidence_ids: Vec<String>,
    pub confidence: Option<f64>,
    pub verified: bool,
    pub metadata: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Commitment record - Merkle root of claims
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Commitment {
    pub id: String,
    pub root: String,
    pub claim_count: usize,
    pub claim_ids: Vec<String>,
    pub public_key: String,
    pub signature: String,
    pub valid_from: Option<DateTime<Utc>>,
    pub valid_until: Option<DateTime<Utc>>,
    pub revoked: bool,
    pub revoked_at: Option<DateTime<Utc>>,
    pub revoked_reason: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Keypair stored locally
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredKeypair {
    pub id: String,
    pub public_key: String,
    pub secret_key_encrypted: String, // Encrypted with user password
    pub created_at: DateTime<Utc>,
    pub is_active: bool,
}

/// Database connection wrapper
pub struct Database {
    conn: Connection,
}

impl Database {
    /// Creates a new database connection, initializing schema if needed
    pub fn new() -> Result<Self> {
        // Get app data directory
        let data_dir = dirs::data_dir()
            .context("Could not find data directory")?
            .join("zkdpp-edge-agent");

        std::fs::create_dir_all(&data_dir)?;

        let db_path = data_dir.join("edge-agent.db");
        let conn = Connection::open(&db_path)?;

        let db = Database { conn };
        db.init_schema()?;

        Ok(db)
    }

    /// Initializes the database schema
    fn init_schema(&self) -> Result<()> {
        self.conn.execute_batch(
            r#"
            -- Evidence table
            CREATE TABLE IF NOT EXISTS evidence (
                id TEXT PRIMARY KEY,
                evidence_type TEXT NOT NULL,
                original_filename TEXT,
                mime_type TEXT,
                content_hash TEXT NOT NULL,
                extracted_text TEXT,
                issuer_name TEXT,
                issuer_type TEXT,
                valid_from TEXT,
                valid_until TEXT,
                raw_content BLOB,
                created_at TEXT NOT NULL
            );

            -- Claims table
            CREATE TABLE IF NOT EXISTS claims (
                id TEXT PRIMARY KEY,
                claim_type TEXT NOT NULL,
                value TEXT NOT NULL,
                unit TEXT NOT NULL,
                product_id TEXT NOT NULL,
                evidence_ids TEXT NOT NULL,
                confidence REAL,
                verified INTEGER NOT NULL DEFAULT 0,
                metadata TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            -- Commitments table
            CREATE TABLE IF NOT EXISTS commitments (
                id TEXT PRIMARY KEY,
                root TEXT NOT NULL,
                claim_count INTEGER NOT NULL,
                claim_ids TEXT NOT NULL,
                public_key TEXT NOT NULL,
                signature TEXT NOT NULL,
                valid_from TEXT,
                valid_until TEXT,
                revoked INTEGER NOT NULL DEFAULT 0,
                revoked_at TEXT,
                revoked_reason TEXT,
                created_at TEXT NOT NULL
            );

            -- Keypairs table
            CREATE TABLE IF NOT EXISTS keypairs (
                id TEXT PRIMARY KEY,
                public_key TEXT NOT NULL UNIQUE,
                secret_key_encrypted TEXT NOT NULL,
                created_at TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 0
            );

            -- Settings table
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            -- Indexes
            CREATE INDEX IF NOT EXISTS idx_claims_product ON claims(product_id);
            CREATE INDEX IF NOT EXISTS idx_claims_type ON claims(claim_type);
            CREATE INDEX IF NOT EXISTS idx_commitments_root ON commitments(root);
            "#,
        )?;

        Ok(())
    }

    // === Evidence operations ===

    pub fn insert_evidence(&self, evidence: &Evidence, raw_content: Option<&[u8]>) -> Result<()> {
        self.conn.execute(
            r#"
            INSERT INTO evidence (id, evidence_type, original_filename, mime_type,
                content_hash, extracted_text, issuer_name, issuer_type,
                valid_from, valid_until, raw_content, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            "#,
            params![
                evidence.id,
                evidence.evidence_type,
                evidence.original_filename,
                evidence.mime_type,
                evidence.content_hash,
                evidence.extracted_text,
                evidence.issuer_name,
                evidence.issuer_type,
                evidence.valid_from.map(|d| d.to_rfc3339()),
                evidence.valid_until.map(|d| d.to_rfc3339()),
                raw_content,
                evidence.created_at.to_rfc3339()
            ],
        )?;
        Ok(())
    }

    pub fn list_evidence(&self) -> Result<Vec<Evidence>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, evidence_type, original_filename, mime_type, content_hash,
                    extracted_text, issuer_name, issuer_type, valid_from, valid_until, created_at
             FROM evidence ORDER BY created_at DESC"
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(Evidence {
                id: row.get(0)?,
                evidence_type: row.get(1)?,
                original_filename: row.get(2)?,
                mime_type: row.get(3)?,
                content_hash: row.get(4)?,
                extracted_text: row.get(5)?,
                issuer_name: row.get(6)?,
                issuer_type: row.get(7)?,
                valid_from: row.get::<_, Option<String>>(8)?
                    .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                    .map(|d| d.with_timezone(&Utc)),
                valid_until: row.get::<_, Option<String>>(9)?
                    .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                    .map(|d| d.with_timezone(&Utc)),
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(10)?)
                    .map(|d| d.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
            })
        })?;

        rows.collect::<std::result::Result<Vec<_>, _>>()
            .context("Failed to list evidence")
    }

    pub fn get_evidence(&self, id: &str) -> Result<Option<Evidence>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, evidence_type, original_filename, mime_type, content_hash,
                    extracted_text, issuer_name, issuer_type, valid_from, valid_until, created_at
             FROM evidence WHERE id = ?1"
        )?;

        let result = stmt.query_row([id], |row| {
            Ok(Evidence {
                id: row.get(0)?,
                evidence_type: row.get(1)?,
                original_filename: row.get(2)?,
                mime_type: row.get(3)?,
                content_hash: row.get(4)?,
                extracted_text: row.get(5)?,
                issuer_name: row.get(6)?,
                issuer_type: row.get(7)?,
                valid_from: row.get::<_, Option<String>>(8)?
                    .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                    .map(|d| d.with_timezone(&Utc)),
                valid_until: row.get::<_, Option<String>>(9)?
                    .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                    .map(|d| d.with_timezone(&Utc)),
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(10)?)
                    .map(|d| d.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
            })
        });

        match result {
            Ok(evidence) => Ok(Some(evidence)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn delete_evidence(&self, id: &str) -> Result<bool> {
        let affected = self.conn.execute("DELETE FROM evidence WHERE id = ?1", [id])?;
        Ok(affected > 0)
    }

    // === Claim operations ===

    pub fn insert_claim(&self, claim: &Claim) -> Result<()> {
        self.conn.execute(
            r#"
            INSERT INTO claims (id, claim_type, value, unit, product_id, evidence_ids,
                confidence, verified, metadata, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            "#,
            params![
                claim.id,
                claim.claim_type,
                serde_json::to_string(&claim.value)?,
                claim.unit,
                claim.product_id,
                serde_json::to_string(&claim.evidence_ids)?,
                claim.confidence,
                claim.verified as i32,
                serde_json::to_string(&claim.metadata)?,
                claim.created_at.to_rfc3339(),
                claim.updated_at.to_rfc3339()
            ],
        )?;
        Ok(())
    }

    pub fn list_claims(&self, product_id: Option<&str>) -> Result<Vec<Claim>> {
        let query = match product_id {
            Some(_) => "SELECT id, claim_type, value, unit, product_id, evidence_ids,
                               confidence, verified, metadata, created_at, updated_at
                        FROM claims WHERE product_id = ?1 ORDER BY created_at DESC",
            None => "SELECT id, claim_type, value, unit, product_id, evidence_ids,
                            confidence, verified, metadata, created_at, updated_at
                     FROM claims ORDER BY created_at DESC",
        };

        let mut stmt = self.conn.prepare(query)?;

        let rows = if let Some(pid) = product_id {
            stmt.query_map([pid], Self::map_claim_row)?
        } else {
            stmt.query_map([], Self::map_claim_row)?
        };

        rows.collect::<std::result::Result<Vec<_>, _>>()
            .context("Failed to list claims")
    }

    fn map_claim_row(row: &rusqlite::Row) -> rusqlite::Result<Claim> {
        Ok(Claim {
            id: row.get(0)?,
            claim_type: row.get(1)?,
            value: serde_json::from_str(&row.get::<_, String>(2)?).unwrap_or(serde_json::Value::Null),
            unit: row.get(3)?,
            product_id: row.get(4)?,
            evidence_ids: serde_json::from_str(&row.get::<_, String>(5)?).unwrap_or_default(),
            confidence: row.get(6)?,
            verified: row.get::<_, i32>(7)? != 0,
            metadata: serde_json::from_str(&row.get::<_, String>(8)?).unwrap_or(serde_json::Value::Object(Default::default())),
            created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(9)?)
                .map(|d| d.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            updated_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(10)?)
                .map(|d| d.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
        })
    }

    pub fn get_claim(&self, id: &str) -> Result<Option<Claim>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, claim_type, value, unit, product_id, evidence_ids,
                    confidence, verified, metadata, created_at, updated_at
             FROM claims WHERE id = ?1"
        )?;

        let result = stmt.query_row([id], Self::map_claim_row);

        match result {
            Ok(claim) => Ok(Some(claim)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn update_claim(&self, claim: &Claim) -> Result<bool> {
        let affected = self.conn.execute(
            r#"
            UPDATE claims SET
                claim_type = ?2, value = ?3, unit = ?4, product_id = ?5,
                evidence_ids = ?6, confidence = ?7, verified = ?8,
                metadata = ?9, updated_at = ?10
            WHERE id = ?1
            "#,
            params![
                claim.id,
                claim.claim_type,
                serde_json::to_string(&claim.value)?,
                claim.unit,
                claim.product_id,
                serde_json::to_string(&claim.evidence_ids)?,
                claim.confidence,
                claim.verified as i32,
                serde_json::to_string(&claim.metadata)?,
                Utc::now().to_rfc3339()
            ],
        )?;
        Ok(affected > 0)
    }

    pub fn delete_claim(&self, id: &str) -> Result<bool> {
        let affected = self.conn.execute("DELETE FROM claims WHERE id = ?1", [id])?;
        Ok(affected > 0)
    }

    // === Commitment operations ===

    pub fn insert_commitment(&self, commitment: &Commitment) -> Result<()> {
        self.conn.execute(
            r#"
            INSERT INTO commitments (id, root, claim_count, claim_ids, public_key,
                signature, valid_from, valid_until, revoked, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            "#,
            params![
                commitment.id,
                commitment.root,
                commitment.claim_count as i64,
                serde_json::to_string(&commitment.claim_ids)?,
                commitment.public_key,
                commitment.signature,
                commitment.valid_from.map(|d| d.to_rfc3339()),
                commitment.valid_until.map(|d| d.to_rfc3339()),
                commitment.revoked as i32,
                commitment.created_at.to_rfc3339()
            ],
        )?;
        Ok(())
    }

    pub fn list_commitments(&self) -> Result<Vec<Commitment>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, root, claim_count, claim_ids, public_key, signature,
                    valid_from, valid_until, revoked, revoked_at, revoked_reason, created_at
             FROM commitments ORDER BY created_at DESC"
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(Commitment {
                id: row.get(0)?,
                root: row.get(1)?,
                claim_count: row.get::<_, i64>(2)? as usize,
                claim_ids: serde_json::from_str(&row.get::<_, String>(3)?).unwrap_or_default(),
                public_key: row.get(4)?,
                signature: row.get(5)?,
                valid_from: row.get::<_, Option<String>>(6)?
                    .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                    .map(|d| d.with_timezone(&Utc)),
                valid_until: row.get::<_, Option<String>>(7)?
                    .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                    .map(|d| d.with_timezone(&Utc)),
                revoked: row.get::<_, i32>(8)? != 0,
                revoked_at: row.get::<_, Option<String>>(9)?
                    .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                    .map(|d| d.with_timezone(&Utc)),
                revoked_reason: row.get(10)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(11)?)
                    .map(|d| d.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
            })
        })?;

        rows.collect::<std::result::Result<Vec<_>, _>>()
            .context("Failed to list commitments")
    }

    pub fn get_commitment(&self, id: &str) -> Result<Option<Commitment>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, root, claim_count, claim_ids, public_key, signature,
                    valid_from, valid_until, revoked, revoked_at, revoked_reason, created_at
             FROM commitments WHERE id = ?1"
        )?;

        let result = stmt.query_row([id], |row| {
            Ok(Commitment {
                id: row.get(0)?,
                root: row.get(1)?,
                claim_count: row.get::<_, i64>(2)? as usize,
                claim_ids: serde_json::from_str(&row.get::<_, String>(3)?).unwrap_or_default(),
                public_key: row.get(4)?,
                signature: row.get(5)?,
                valid_from: row.get::<_, Option<String>>(6)?
                    .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                    .map(|d| d.with_timezone(&Utc)),
                valid_until: row.get::<_, Option<String>>(7)?
                    .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                    .map(|d| d.with_timezone(&Utc)),
                revoked: row.get::<_, i32>(8)? != 0,
                revoked_at: row.get::<_, Option<String>>(9)?
                    .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                    .map(|d| d.with_timezone(&Utc)),
                revoked_reason: row.get(10)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(11)?)
                    .map(|d| d.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
            })
        });

        match result {
            Ok(commitment) => Ok(Some(commitment)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn revoke_commitment(&self, id: &str, reason: &str) -> Result<bool> {
        let affected = self.conn.execute(
            r#"
            UPDATE commitments SET
                revoked = 1,
                revoked_at = ?2,
                revoked_reason = ?3
            WHERE id = ?1
            "#,
            params![id, Utc::now().to_rfc3339(), reason],
        )?;
        Ok(affected > 0)
    }

    // === Keypair operations ===

    pub fn get_active_keypair(&self) -> Result<Option<StoredKeypair>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, public_key, secret_key_encrypted, created_at, is_active
             FROM keypairs WHERE is_active = 1 LIMIT 1"
        )?;

        let result = stmt.query_row([], |row| {
            Ok(StoredKeypair {
                id: row.get(0)?,
                public_key: row.get(1)?,
                secret_key_encrypted: row.get(2)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(3)?)
                    .map(|d| d.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                is_active: row.get::<_, i32>(4)? != 0,
            })
        });

        match result {
            Ok(kp) => Ok(Some(kp)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn insert_keypair(&self, keypair: &StoredKeypair) -> Result<()> {
        // Deactivate existing keypairs if this one is active
        if keypair.is_active {
            self.conn.execute("UPDATE keypairs SET is_active = 0", [])?;
        }

        self.conn.execute(
            r#"
            INSERT INTO keypairs (id, public_key, secret_key_encrypted, created_at, is_active)
            VALUES (?1, ?2, ?3, ?4, ?5)
            "#,
            params![
                keypair.id,
                keypair.public_key,
                keypair.secret_key_encrypted,
                keypair.created_at.to_rfc3339(),
                keypair.is_active as i32
            ],
        )?;
        Ok(())
    }

    // === Settings operations ===

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let mut stmt = self.conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let result = stmt.query_row([key], |row| row.get(0));

        match result {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }
}
