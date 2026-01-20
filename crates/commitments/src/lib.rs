//! Commitments crate for ZK-DPP
//!
//! Provides Merkle tree construction, claim hashing, and proof verification
//! for the zero-knowledge data passport protocol.

use blake3::Hasher;
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub mod merkle;

pub use merkle::{MerkleProof, MerkleTree};

/// Errors that can occur in commitment operations
#[derive(Error, Debug)]
pub enum CommitmentError {
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Invalid Merkle proof")]
    InvalidProof,

    #[error("Empty claims list")]
    EmptyClaims,

    #[error("Tree depth exceeded maximum of {0}")]
    DepthExceeded(usize),
}

pub type Result<T> = std::result::Result<T, CommitmentError>;

/// A commitment to a set of claims
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Commitment {
    /// Merkle root of all claim hashes
    pub root: [u8; 32],
    /// Number of claims in this commitment
    pub claim_count: usize,
    /// Timestamp when commitment was created (Unix epoch seconds)
    pub created_at: u64,
    /// Supplier identifier
    pub supplier_id: String,
}

/// Canonicalizes a JSON value for deterministic hashing.
///
/// Keys are sorted alphabetically at all levels of nesting.
/// This ensures the same data always produces the same hash,
/// regardless of the original key ordering.
pub fn canonicalize<T: Serialize>(value: &T) -> Result<String> {
    let json_value = serde_json::to_value(value)?;
    let canonical = canonicalize_value(&json_value);
    Ok(serde_json::to_string(&canonical)?)
}

fn canonicalize_value(value: &serde_json::Value) -> serde_json::Value {
    use serde_json::Value;

    match value {
        Value::Object(map) => {
            let mut sorted: Vec<_> = map.iter().collect();
            sorted.sort_by(|a, b| a.0.cmp(b.0));
            Value::Object(
                sorted
                    .into_iter()
                    .map(|(k, v)| (k.clone(), canonicalize_value(v)))
                    .collect(),
            )
        }
        Value::Array(arr) => Value::Array(arr.iter().map(canonicalize_value).collect()),
        other => other.clone(),
    }
}

/// Hashes a claim using BLAKE3 after canonicalization.
///
/// This is the leaf-level hash used in the Merkle tree.
pub fn hash_claim<T: Serialize>(claim: &T) -> Result<[u8; 32]> {
    let canonical = canonicalize(claim)?;
    let mut hasher = Hasher::new();
    hasher.update(canonical.as_bytes());
    Ok(*hasher.finalize().as_bytes())
}

/// Hashes raw bytes using BLAKE3.
pub fn hash_bytes(data: &[u8]) -> [u8; 32] {
    let mut hasher = Hasher::new();
    hasher.update(data);
    *hasher.finalize().as_bytes()
}

/// Converts a 32-byte array to a hex string.
pub fn to_hex(bytes: &[u8; 32]) -> String {
    hex::encode(bytes)
}

/// Parses a hex string into a 32-byte array.
pub fn from_hex(s: &str) -> std::result::Result<[u8; 32], hex::FromHexError> {
    let bytes = hex::decode(s)?;
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    Ok(arr)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_canonicalize_sorts_keys() {
        let obj = json!({"z": 1, "a": 2, "m": 3});
        let canonical = canonicalize(&obj).unwrap();
        assert_eq!(canonical, r#"{"a":2,"m":3,"z":1}"#);
    }

    #[test]
    fn test_canonicalize_nested() {
        let obj = json!({"outer": {"z": 1, "a": 2}});
        let canonical = canonicalize(&obj).unwrap();
        assert_eq!(canonical, r#"{"outer":{"a":2,"z":1}}"#);
    }

    #[test]
    fn test_hash_claim_deterministic() {
        let claim = json!({
            "type": "recycled_content",
            "value": 25,
            "unit": "percent"
        });

        let hash1 = hash_claim(&claim).unwrap();
        let hash2 = hash_claim(&claim).unwrap();

        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_hash_claim_key_order_independent() {
        let claim1 = json!({"a": 1, "b": 2});
        let claim2 = json!({"b": 2, "a": 1});

        let hash1 = hash_claim(&claim1).unwrap();
        let hash2 = hash_claim(&claim2).unwrap();

        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_hex_roundtrip() {
        let bytes = hash_bytes(b"test");
        let hex_str = to_hex(&bytes);
        let parsed = from_hex(&hex_str).unwrap();
        assert_eq!(bytes, parsed);
    }
}
