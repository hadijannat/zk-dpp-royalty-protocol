//! Cryptographic primitives for ZK-DPP
//!
//! Provides Ed25519 key generation, signing, and verification.

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey, SECRET_KEY_LENGTH};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Errors that can occur in cryptographic operations
#[derive(Error, Debug)]
pub enum CryptoError {
    #[error("Invalid key length: expected {expected}, got {got}")]
    InvalidKeyLength { expected: usize, got: usize },

    #[error("Invalid signature")]
    InvalidSignature,

    #[error("Key parsing error: {0}")]
    KeyParsing(String),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Hex decoding error: {0}")]
    HexDecode(#[from] hex::FromHexError),
}

pub type Result<T> = std::result::Result<T, CryptoError>;

/// A keypair for signing commitments
#[derive(Clone)]
pub struct KeyPair {
    signing_key: SigningKey,
}

/// A serializable representation of a keypair
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerializableKeyPair {
    /// Secret key bytes (hex-encoded)
    pub secret_key: String,
    /// Public key bytes (hex-encoded)
    pub public_key: String,
}

/// A serializable public key for verification
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PublicKey {
    /// Public key bytes (hex-encoded)
    pub key: String,
}

impl KeyPair {
    /// Generates a new random keypair using OS entropy.
    pub fn generate() -> Self {
        let signing_key = SigningKey::generate(&mut OsRng);
        KeyPair { signing_key }
    }

    /// Creates a keypair from raw secret key bytes.
    pub fn from_bytes(secret_bytes: &[u8]) -> Result<Self> {
        if secret_bytes.len() != SECRET_KEY_LENGTH {
            return Err(CryptoError::InvalidKeyLength {
                expected: SECRET_KEY_LENGTH,
                got: secret_bytes.len(),
            });
        }

        let mut key_bytes = [0u8; SECRET_KEY_LENGTH];
        key_bytes.copy_from_slice(secret_bytes);

        let signing_key = SigningKey::from_bytes(&key_bytes);
        Ok(KeyPair { signing_key })
    }

    /// Creates a keypair from a hex-encoded secret key.
    pub fn from_hex(hex_str: &str) -> Result<Self> {
        let bytes = hex::decode(hex_str)?;
        Self::from_bytes(&bytes)
    }

    /// Returns the public key.
    pub fn public_key(&self) -> PublicKey {
        let verifying_key = self.signing_key.verifying_key();
        PublicKey {
            key: hex::encode(verifying_key.as_bytes()),
        }
    }

    /// Returns the secret key bytes (handle with care!).
    pub fn secret_bytes(&self) -> [u8; SECRET_KEY_LENGTH] {
        self.signing_key.to_bytes()
    }

    /// Serializes the keypair to a portable format.
    pub fn to_serializable(&self) -> SerializableKeyPair {
        SerializableKeyPair {
            secret_key: hex::encode(self.secret_bytes()),
            public_key: self.public_key().key,
        }
    }

    /// Deserializes a keypair from its portable format.
    pub fn from_serializable(s: &SerializableKeyPair) -> Result<Self> {
        Self::from_hex(&s.secret_key)
    }

    /// Signs a message and returns the signature bytes.
    pub fn sign(&self, message: &[u8]) -> [u8; 64] {
        let signature = self.signing_key.sign(message);
        signature.to_bytes()
    }

    /// Signs a message and returns a hex-encoded signature.
    pub fn sign_hex(&self, message: &[u8]) -> String {
        hex::encode(self.sign(message))
    }
}

impl PublicKey {
    /// Creates a public key from hex-encoded bytes.
    pub fn from_hex(hex_str: &str) -> Result<Self> {
        // Validate the hex decodes to correct length
        let bytes = hex::decode(hex_str)?;
        if bytes.len() != 32 {
            return Err(CryptoError::InvalidKeyLength {
                expected: 32,
                got: bytes.len(),
            });
        }
        Ok(PublicKey {
            key: hex_str.to_string(),
        })
    }

    /// Verifies a signature against a message.
    pub fn verify(&self, message: &[u8], signature: &[u8; 64]) -> Result<bool> {
        let key_bytes = hex::decode(&self.key)?;
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&key_bytes);

        let verifying_key =
            VerifyingKey::from_bytes(&arr).map_err(|e| CryptoError::KeyParsing(e.to_string()))?;

        let sig = Signature::from_bytes(signature);

        Ok(verifying_key.verify(message, &sig).is_ok())
    }

    /// Verifies a hex-encoded signature against a message.
    pub fn verify_hex(&self, message: &[u8], signature_hex: &str) -> Result<bool> {
        let sig_bytes = hex::decode(signature_hex)?;
        if sig_bytes.len() != 64 {
            return Err(CryptoError::InvalidSignature);
        }
        let mut arr = [0u8; 64];
        arr.copy_from_slice(&sig_bytes);
        self.verify(message, &arr)
    }
}

/// Convenience function to generate a new keypair.
pub fn generate_keypair() -> KeyPair {
    KeyPair::generate()
}

/// Convenience function to sign a message.
pub fn sign(keypair: &KeyPair, message: &[u8]) -> [u8; 64] {
    keypair.sign(message)
}

/// Convenience function to verify a signature.
pub fn verify(public_key: &PublicKey, message: &[u8], signature: &[u8; 64]) -> Result<bool> {
    public_key.verify(message, signature)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_keypair() {
        let kp = KeyPair::generate();
        let pk = kp.public_key();
        assert_eq!(pk.key.len(), 64); // 32 bytes = 64 hex chars
    }

    #[test]
    fn test_sign_and_verify() {
        let kp = KeyPair::generate();
        let message = b"Hello, ZK-DPP!";

        let signature = kp.sign(message);
        let pk = kp.public_key();

        assert!(pk.verify(message, &signature).unwrap());
    }

    #[test]
    fn test_sign_and_verify_hex() {
        let kp = KeyPair::generate();
        let message = b"Hello, ZK-DPP!";

        let signature_hex = kp.sign_hex(message);
        let pk = kp.public_key();

        assert!(pk.verify_hex(message, &signature_hex).unwrap());
    }

    #[test]
    fn test_invalid_signature() {
        let kp1 = KeyPair::generate();
        let kp2 = KeyPair::generate();
        let message = b"Hello, ZK-DPP!";

        let signature = kp1.sign(message);
        let pk2 = kp2.public_key();

        // Signature from kp1 shouldn't verify with kp2's public key
        assert!(!pk2.verify(message, &signature).unwrap());
    }

    #[test]
    fn test_wrong_message() {
        let kp = KeyPair::generate();
        let message1 = b"Original message";
        let message2 = b"Different message";

        let signature = kp.sign(message1);
        let pk = kp.public_key();

        // Signature for message1 shouldn't verify message2
        assert!(!pk.verify(message2, &signature).unwrap());
    }

    #[test]
    fn test_keypair_serialization() {
        let kp = KeyPair::generate();
        let serializable = kp.to_serializable();

        let restored = KeyPair::from_serializable(&serializable).unwrap();

        // Same keys should produce same signature
        let message = b"Test message";
        assert_eq!(kp.sign(message), restored.sign(message));
    }

    #[test]
    fn test_from_hex() {
        let kp = KeyPair::generate();
        let hex_secret = hex::encode(kp.secret_bytes());

        let restored = KeyPair::from_hex(&hex_secret).unwrap();
        assert_eq!(kp.public_key(), restored.public_key());
    }

    #[test]
    fn test_deterministic_signatures() {
        let kp = KeyPair::generate();
        let message = b"Same message";

        let sig1 = kp.sign(message);
        let sig2 = kp.sign(message);

        // Ed25519 signatures should be deterministic
        assert_eq!(sig1, sig2);
    }
}
