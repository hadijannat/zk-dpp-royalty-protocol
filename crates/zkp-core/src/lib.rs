//! ZKP Core - Zero-Knowledge Proof verification for Noir circuits
//!
//! This crate provides proof verification capabilities for the ZK-DPP protocol.
//! It can be compiled to WASM for use in TypeScript services.

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

/// Errors that can occur during proof verification
#[derive(Error, Debug)]
pub enum ZkpError {
    #[error("Invalid proof format")]
    InvalidProofFormat,

    #[error("Invalid public inputs")]
    InvalidPublicInputs,

    #[error("Verification key not found for predicate: {0}")]
    VerificationKeyNotFound(String),

    #[error("Proof verification failed")]
    VerificationFailed,

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Hex decoding error: {0}")]
    HexDecode(#[from] hex::FromHexError),
}

pub type Result<T> = std::result::Result<T, ZkpError>;

/// A predicate identifier with version
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct PredicateId {
    pub name: String,
    pub version: String,
}

impl PredicateId {
    pub fn new(name: &str, version: &str) -> Self {
        PredicateId {
            name: name.to_string(),
            version: version.to_string(),
        }
    }

    pub fn canonical(&self) -> String {
        format!("{}_{}", self.name, self.version.replace('.', "_"))
    }
}

/// Public inputs for a ZK proof
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicInputs {
    /// The predicate-specific threshold or comparison value
    pub threshold: Option<u64>,
    /// Merkle root of the supplier's commitment
    pub commitment_root: String,
    /// Binding to product identifier (hash)
    pub product_binding: String,
    /// Binding to requester identifier (hash)
    pub requester_binding: String,
    /// Timestamp for time-based predicates
    pub timestamp: Option<u64>,
    /// Additional predicate-specific public inputs
    #[serde(default)]
    pub extra: serde_json::Value,
}

/// A complete proof package ready for verification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofPackage {
    /// Identifier of the predicate being proved
    pub predicate_id: PredicateId,
    /// The ZK proof bytes (hex-encoded)
    pub proof: String,
    /// Public inputs visible to the verifier
    pub public_inputs: PublicInputs,
    /// Nonce to prevent replay attacks
    pub nonce: String,
    /// Timestamp when proof was generated
    pub generated_at: u64,
    /// Signature from the supplier over the package
    pub supplier_signature: Option<String>,
}

/// A verification key for a predicate circuit
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationKey {
    /// The predicate this key verifies
    pub predicate_id: PredicateId,
    /// The verification key bytes (hex-encoded)
    pub key: String,
    /// Hash of the circuit for integrity check
    pub circuit_hash: String,
}

/// Result of proof verification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationResult {
    /// Whether the proof verified successfully
    pub valid: bool,
    /// The predicate that was verified
    pub predicate_id: PredicateId,
    /// Public inputs that were verified
    pub public_inputs: PublicInputs,
    /// Timestamp of verification
    pub verified_at: u64,
    /// Any error message if verification failed
    pub error: Option<String>,
}

/// Verifies a ZK proof against a verification key.
///
/// This is the main entry point for proof verification.
/// In production, this will use Noir's verification library.
pub fn verify_proof(package: &ProofPackage, vkey: &VerificationKey) -> Result<VerificationResult> {
    // Validate predicate IDs match
    if package.predicate_id != vkey.predicate_id {
        return Err(ZkpError::VerificationKeyNotFound(
            package.predicate_id.canonical(),
        ));
    }

    // Decode proof bytes
    let _proof_bytes = hex::decode(&package.proof)?;

    // Decode verification key
    let _vkey_bytes = hex::decode(&vkey.key)?;

    // TODO: Integrate with Noir verification library
    // Fail closed until real verification is wired.
    //
    // In production, this would:
    // 1. Deserialize the Noir proof
    // 2. Serialize public inputs to field elements
    // 3. Call noir_verifier::verify(proof, vkey, public_inputs)

    // Until Noir verification is wired, fail closed to avoid false positives.
    Err(ZkpError::VerificationFailed)
}

/// Validates the structure of a proof package without full verification.
///
/// Use this for quick validation before expensive proof verification.
pub fn validate_proof_package(package: &ProofPackage) -> Result<()> {
    // Check proof is valid hex
    hex::decode(&package.proof).map_err(|_| ZkpError::InvalidProofFormat)?;

    // Check commitment root is valid hex
    let root_bytes = hex::decode(&package.public_inputs.commitment_root)
        .map_err(|_| ZkpError::InvalidPublicInputs)?;
    if root_bytes.len() != 32 {
        return Err(ZkpError::InvalidPublicInputs);
    }

    // Check product binding is valid hex
    let product_bytes = hex::decode(&package.public_inputs.product_binding)
        .map_err(|_| ZkpError::InvalidPublicInputs)?;
    if product_bytes.len() != 32 {
        return Err(ZkpError::InvalidPublicInputs);
    }

    // Check requester binding is valid hex
    let requester_bytes = hex::decode(&package.public_inputs.requester_binding)
        .map_err(|_| ZkpError::InvalidPublicInputs)?;
    if requester_bytes.len() != 32 {
        return Err(ZkpError::InvalidPublicInputs);
    }

    // Check nonce is valid hex
    hex::decode(&package.nonce).map_err(|_| ZkpError::InvalidProofFormat)?;

    Ok(())
}

// WASM bindings for use in TypeScript services
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn verify_proof_wasm(
    package_json: &str,
    vkey_json: &str,
) -> std::result::Result<String, JsValue> {
    let package: ProofPackage =
        serde_json::from_str(package_json).map_err(|e| JsValue::from_str(&e.to_string()))?;

    let vkey: VerificationKey =
        serde_json::from_str(vkey_json).map_err(|e| JsValue::from_str(&e.to_string()))?;

    let result = verify_proof(&package, &vkey).map_err(|e| JsValue::from_str(&e.to_string()))?;

    serde_json::to_string(&result).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn validate_proof_package_wasm(package_json: &str) -> std::result::Result<bool, JsValue> {
    let package: ProofPackage =
        serde_json::from_str(package_json).map_err(|e| JsValue::from_str(&e.to_string()))?;

    validate_proof_package(&package).map_err(|e| JsValue::from_str(&e.to_string()))?;

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_package() -> ProofPackage {
        ProofPackage {
            predicate_id: PredicateId::new("RECYCLED_CONTENT_GTE", "V1"),
            proof: hex::encode([0u8; 64]), // Placeholder proof
            public_inputs: PublicInputs {
                threshold: Some(20),
                commitment_root: hex::encode([1u8; 32]),
                product_binding: hex::encode([2u8; 32]),
                requester_binding: hex::encode([3u8; 32]),
                timestamp: None,
                extra: serde_json::Value::Null,
            },
            nonce: hex::encode([4u8; 16]),
            generated_at: 1704067200,
            supplier_signature: None,
        }
    }

    fn make_test_vkey() -> VerificationKey {
        VerificationKey {
            predicate_id: PredicateId::new("RECYCLED_CONTENT_GTE", "V1"),
            key: hex::encode([0u8; 32]), // Placeholder vkey
            circuit_hash: hex::encode([0u8; 32]),
        }
    }

    #[test]
    fn test_predicate_id_canonical() {
        let id = PredicateId::new("RECYCLED_CONTENT_GTE", "V1");
        assert_eq!(id.canonical(), "RECYCLED_CONTENT_GTE_V1");

        let id2 = PredicateId::new("CERT_VALID", "1.0.0");
        assert_eq!(id2.canonical(), "CERT_VALID_1_0_0");
    }

    #[test]
    fn test_validate_proof_package() {
        let package = make_test_package();
        assert!(validate_proof_package(&package).is_ok());
    }

    #[test]
    fn test_validate_proof_package_invalid_root() {
        let mut package = make_test_package();
        package.public_inputs.commitment_root = "invalid".to_string();
        assert!(matches!(
            validate_proof_package(&package),
            Err(ZkpError::InvalidPublicInputs)
        ));
    }

    #[test]
    fn test_validate_proof_package_wrong_length() {
        let mut package = make_test_package();
        package.public_inputs.commitment_root = hex::encode([0u8; 16]); // Wrong length
        assert!(matches!(
            validate_proof_package(&package),
            Err(ZkpError::InvalidPublicInputs)
        ));
    }

    #[test]
    fn test_verify_proof_structure() {
        let package = make_test_package();
        let vkey = make_test_vkey();

        assert!(matches!(
            verify_proof(&package, &vkey),
            Err(ZkpError::VerificationFailed)
        ));
    }

    #[test]
    fn test_verify_proof_wrong_predicate() {
        let package = make_test_package();
        let mut vkey = make_test_vkey();
        vkey.predicate_id = PredicateId::new("CARBON_FOOTPRINT_LTE", "V1");

        assert!(matches!(
            verify_proof(&package, &vkey),
            Err(ZkpError::VerificationKeyNotFound(_))
        ));
    }

    #[test]
    fn test_proof_package_serialization() {
        let package = make_test_package();
        let json = serde_json::to_string(&package).unwrap();
        let restored: ProofPackage = serde_json::from_str(&json).unwrap();

        assert_eq!(package.predicate_id, restored.predicate_id);
        assert_eq!(package.proof, restored.proof);
        assert_eq!(package.nonce, restored.nonce);
    }
}
