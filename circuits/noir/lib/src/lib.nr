// ZK-DPP Shared Library for Noir Circuits
// Provides Merkle tree verification and common utilities

use std::hash::sha256;

// Maximum Merkle tree depth supported
global MAX_DEPTH: u32 = 16;

/// Computes SHA-256 hash of two 32-byte values concatenated
pub fn hash_pair(left: [u8; 32], right: [u8; 32]) -> [u8; 32] {
    let mut combined: [u8; 64] = [0; 64];
    for i in 0..32 {
        combined[i] = left[i];
        combined[i + 32] = right[i];
    }
    sha256(combined)
}

/// Verifies a Merkle proof for a leaf in a tree
///
/// # Arguments
/// * `leaf` - The leaf hash being proved
/// * `path` - Sibling hashes from leaf to root
/// * `indices` - Path direction at each level (0 = left, 1 = right)
/// * `root` - Expected Merkle root
/// * `depth` - Actual depth of the path
///
/// # Returns
/// True if the proof is valid
pub fn verify_merkle_proof<let DEPTH: u32>(
    leaf: [u8; 32],
    path: [[u8; 32]; DEPTH],
    indices: [u1; DEPTH],
    root: [u8; 32],
    depth: u32
) -> bool {
    let mut current = leaf;

    for i in 0..DEPTH {
        if i as u32 < depth {
            let sibling = path[i];
            let index = indices[i];

            current = if index == 0 {
                // Current is on the left
                hash_pair(current, sibling)
            } else {
                // Current is on the right
                hash_pair(sibling, current)
            };
        }
    }

    // Compare with expected root
    let mut equal = true;
    for i in 0..32 {
        if current[i] != root[i] {
            equal = false;
        }
    }
    equal
}

/// Converts a Field to bytes (for hashing)
pub fn field_to_bytes(f: Field) -> [u8; 32] {
    f.to_be_bytes()
}

/// Computes SHA-256 of a claim value for leaf computation
pub fn hash_claim_value(
    claim_type: [u8; 32],  // Padded claim type string hash
    value: u64,            // Numeric value
    unit: [u8; 32]         // Padded unit string hash
) -> [u8; 32] {
    // Create a deterministic hash of the claim components
    let mut data: [u8; 72] = [0; 72];

    for i in 0..32 {
        data[i] = claim_type[i];
    }

    // Encode value as big-endian bytes
    let value_bytes = (value as Field).to_be_bytes();
    for i in 0..8 {
        data[32 + i] = value_bytes[24 + i]; // Last 8 bytes
    }

    for i in 0..32 {
        data[40 + i] = unit[i];
    }

    sha256(data)
}

/// Asserts two byte arrays are equal
pub fn assert_bytes_equal(a: [u8; 32], b: [u8; 32]) {
    for i in 0..32 {
        assert(a[i] == b[i]);
    }
}

/// Checks if two byte arrays are equal
pub fn bytes_equal(a: [u8; 32], b: [u8; 32]) -> bool {
    let mut equal = true;
    for i in 0..32 {
        if a[i] != b[i] {
            equal = false;
        }
    }
    equal
}

// Test module
#[test]
fn test_hash_pair_deterministic() {
    let a: [u8; 32] = [1; 32];
    let b: [u8; 32] = [2; 32];

    let h1 = hash_pair(a, b);
    let h2 = hash_pair(a, b);

    assert(bytes_equal(h1, h2));
}

#[test]
fn test_hash_pair_order_matters() {
    let a: [u8; 32] = [1; 32];
    let b: [u8; 32] = [2; 32];

    let h1 = hash_pair(a, b);
    let h2 = hash_pair(b, a);

    // Hash of (a,b) should differ from hash of (b,a)
    assert(!bytes_equal(h1, h2));
}
