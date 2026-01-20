// STATE_OF_HEALTH_GTE_V1 Predicate Circuit
//
// Proves battery state of health (SOH) percentage is at or above threshold
//
// Public Inputs:
// - threshold: The minimum SOH percentage (0-100)
// - commitment_root: Merkle root of the supplier's claim commitment
// - product_binding: Hash binding this proof to a specific product
// - requester_binding: Hash binding this proof to the requester
//
// Private Inputs:
// - actual_value: The real state_of_health value
// - claim_type_hash: BLAKE3 of claim type string
// - unit_hash: BLAKE3 of unit string ("percent")
// - claim_hash: BLAKE3 hash of (claim_type_hash || value || unit_hash)
// - merkle_path: Sibling hashes in the Merkle tree
// - merkle_indices: Path directions (0=left, 1=right)

use zkdpp_lib::{verify_merkle_proof, assert_bytes_equal, hash_claim_value, bind_context};

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
    claim_type_hash: [u8; 32],
    unit_hash: [u8; 32],
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

    // 1b. Verify claim hash binds claim type, value, and unit
    let computed_hash = hash_claim_value(claim_type_hash, actual_value as u64, unit_hash);
    assert_bytes_equal(computed_hash, claim_hash);

    // 1c. Bind proof context to product and requester
    bind_context(product_binding, requester_binding);

    // 2. Verify the predicate: actual_value >= threshold
    // This proves compliance without revealing actual_value
    assert(actual_value >= threshold, "State of health below threshold");

    // 3. Verify value is within valid range
        // SOH is a percentage: 0-100
    assert(actual_value <= 100, "SOH exceeds 100%");

    // Note: product_binding and requester_binding are public inputs
    // that bind this proof to specific product and requester.
    // They are verified off-chain by checking against known identifiers.
}

// Test with valid proof
#[test]
fn test_valid_proof() {
    let threshold: u32 = 80;
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    let actual_value: u32 = 85;
    let claim_type_hash: [u8; 32] = [0x10; 32];
    let unit_hash: [u8; 32] = [0x20; 32];
    let claim_hash: [u8; 32] = hash_claim_value(claim_type_hash, actual_value as u64, unit_hash);
    let commitment_root: [u8; 32] = claim_hash;
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0;

    main(
        threshold,
        commitment_root,
        product_binding,
        requester_binding,
        actual_value,
        claim_type_hash,
        unit_hash,
        claim_hash,
        merkle_path,
        merkle_indices,
        tree_depth
    );
}

#[test(should_fail_with = "State of health below threshold")]
fn test_invalid_fails_threshold() {
    let threshold: u32 = 80;
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    let actual_value: u32 = 65;
    let claim_type_hash: [u8; 32] = [0x10; 32];
    let unit_hash: [u8; 32] = [0x20; 32];
    let claim_hash: [u8; 32] = hash_claim_value(claim_type_hash, actual_value as u64, unit_hash);
    let commitment_root: [u8; 32] = claim_hash;
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0;

    main(
        threshold,
        commitment_root,
        product_binding,
        requester_binding,
        actual_value,
        claim_type_hash,
        unit_hash,
        claim_hash,
        merkle_path,
        merkle_indices,
        tree_depth
    );
}

#[test]
fn test_exact_threshold() {
    let threshold: u32 = 80;
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    let actual_value: u32 = 80;
    let claim_type_hash: [u8; 32] = [0x10; 32];
    let unit_hash: [u8; 32] = [0x20; 32];
    let claim_hash: [u8; 32] = hash_claim_value(claim_type_hash, actual_value as u64, unit_hash);
    let commitment_root: [u8; 32] = claim_hash;
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0;

    main(
        threshold,
        commitment_root,
        product_binding,
        requester_binding,
        actual_value,
        claim_type_hash,
        unit_hash,
        claim_hash,
        merkle_path,
        merkle_indices,
        tree_depth
    );
}
