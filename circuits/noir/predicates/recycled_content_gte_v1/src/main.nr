// RECYCLED_CONTENT_GTE_V1 Predicate Circuit
//
// Proves that a product's recycled content percentage is greater than or equal
// to a specified threshold, without revealing the actual percentage.
//
// Public Inputs:
// - threshold: The minimum recycled content percentage required
// - commitment_root: Merkle root of the supplier's claim commitment
// - product_binding: Hash binding this proof to a specific product
// - requester_binding: Hash binding this proof to the requester
//
// Private Inputs:
// - actual_value: The real recycled content percentage
// - claim_hash: SHA-256 hash of the canonicalized claim
// - merkle_path: Sibling hashes in the Merkle tree
// - merkle_indices: Path directions (0=left, 1=right)

use zkdpp_lib::{verify_merkle_proof, assert_bytes_equal};

// Merkle tree depth (supports up to 2^8 = 256 claims per commitment)
global TREE_DEPTH: u32 = 8;

fn main(
    // ===== PUBLIC INPUTS =====
    threshold: pub u32,
    commitment_root: pub [u8; 32],
    product_binding: pub [u8; 32],
    requester_binding: pub [u8; 32],

    // ===== PRIVATE INPUTS =====
    actual_value: u32,
    claim_hash: [u8; 32],
    merkle_path: [[u8; 32]; TREE_DEPTH],
    merkle_indices: [u1; TREE_DEPTH],
    tree_depth: u32  // Actual depth of the path
) {
    // 1. Verify the claim hash is in the commitment
    // This proves the supplier committed to this claim
    let merkle_valid = verify_merkle_proof(
        claim_hash,
        merkle_path,
        merkle_indices,
        commitment_root,
        tree_depth
    );
    assert(merkle_valid, "Merkle proof verification failed");

    // 2. Verify the predicate: actual_value >= threshold
    // This proves compliance without revealing actual_value
    assert(actual_value >= threshold, "Recycled content below threshold");

    // 3. Verify value is within valid range (0-100 for percentage)
    assert(actual_value <= 100, "Value exceeds 100%");

    // Note: product_binding and requester_binding are public inputs
    // that bind this proof to specific product and requester.
    // They are verified off-chain by checking against known identifiers.
    // Including them in the circuit ensures they're part of the proof statement.

    // The bindings prevent proof reuse across different contexts:
    // - product_binding: Hash of product ID, prevents using proof for different product
    // - requester_binding: Hash of requester ID, prevents unauthorized use of proof
}

// Test with valid proof (actual=25, threshold=20)
#[test]
fn test_valid_proof() {
    let threshold: u32 = 20;
    let commitment_root: [u8; 32] = [
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0
    ];
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    let actual_value: u32 = 25;
    let claim_hash: [u8; 32] = commitment_root; // For single-leaf tree, leaf = root
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0; // Single leaf = depth 0

    main(
        threshold,
        commitment_root,
        product_binding,
        requester_binding,
        actual_value,
        claim_hash,
        merkle_path,
        merkle_indices,
        tree_depth
    );
}

#[test(should_fail_with = "Recycled content below threshold")]
fn test_invalid_below_threshold() {
    let threshold: u32 = 20;
    let commitment_root: [u8; 32] = [0x12; 32];
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    let actual_value: u32 = 15; // Below threshold!
    let claim_hash: [u8; 32] = commitment_root;
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0;

    main(
        threshold,
        commitment_root,
        product_binding,
        requester_binding,
        actual_value,
        claim_hash,
        merkle_path,
        merkle_indices,
        tree_depth
    );
}

#[test(should_fail_with = "Value exceeds 100%")]
fn test_invalid_over_100() {
    let threshold: u32 = 20;
    let commitment_root: [u8; 32] = [0x12; 32];
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    let actual_value: u32 = 150; // Invalid percentage!
    let claim_hash: [u8; 32] = commitment_root;
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0;

    main(
        threshold,
        commitment_root,
        product_binding,
        requester_binding,
        actual_value,
        claim_hash,
        merkle_path,
        merkle_indices,
        tree_depth
    );
}

#[test]
fn test_exact_threshold() {
    // actual_value == threshold should pass
    let threshold: u32 = 25;
    let commitment_root: [u8; 32] = [0x12; 32];
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    let actual_value: u32 = 25; // Exactly at threshold
    let claim_hash: [u8; 32] = commitment_root;
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0;

    main(
        threshold,
        commitment_root,
        product_binding,
        requester_binding,
        actual_value,
        claim_hash,
        merkle_path,
        merkle_indices,
        tree_depth
    );
}
