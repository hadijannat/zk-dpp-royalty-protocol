// CARBON_FOOTPRINT_LTE_V1 Predicate Circuit
//
// Proves that a product's carbon footprint is less than or equal to
// a specified threshold, without revealing the actual footprint value.
//
// Public Inputs:
// - threshold: Maximum allowed carbon footprint (in kg CO2e, scaled by 100)
// - commitment_root: Merkle root of the supplier's claim commitment
// - product_binding: Hash binding this proof to a specific product
// - requester_binding: Hash binding this proof to the requester
//
// Private Inputs:
// - actual_value: The real carbon footprint value (scaled by 100)
// - claim_type_hash: BLAKE3 of claim type string
// - unit_hash: BLAKE3 of unit string
// - claim_hash: BLAKE3 hash of (claim_type_hash || value || unit_hash)
// - merkle_path: Sibling hashes in the Merkle tree
// - merkle_indices: Path directions (0=left, 1=right)

use zkdpp_lib::{verify_merkle_proof, assert_bytes_equal, hash_claim_value};

// Merkle tree depth
global TREE_DEPTH: u32 = 8;

// Maximum reasonable carbon footprint (100,000 kg CO2e scaled by 100)
global MAX_FOOTPRINT: u32 = 10_000_000;

fn main(
    // ===== PUBLIC INPUTS =====
    threshold: pub u32,             // Max allowed footprint (scaled by 100)
    commitment_root: pub [u8; 32],
    product_binding: pub [u8; 32],
    requester_binding: pub [u8; 32],

    // ===== PRIVATE INPUTS =====
    actual_value: u32,              // Actual footprint (scaled by 100)
    claim_type_hash: [u8; 32],
    unit_hash: [u8; 32],
    claim_hash: [u8; 32],
    merkle_path: [[u8; 32]; TREE_DEPTH],
    merkle_indices: [u1; TREE_DEPTH],
    tree_depth: u32
) {
    // 1. Verify the claim hash is in the commitment
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

    // 2. Verify the predicate: actual_value <= threshold
    // This proves the product meets carbon footprint requirements
    assert(actual_value <= threshold, "Carbon footprint exceeds threshold");

    // 3. Sanity check: value should be non-negative and reasonable
    // (u32 is already non-negative, but we add an upper bound check)
    assert(actual_value <= MAX_FOOTPRINT, "Value exceeds maximum");
    assert(threshold <= MAX_FOOTPRINT, "Threshold exceeds maximum");
}

#[test]
fn test_valid_below_threshold() {
    let threshold: u32 = 5000; // 50.00 kg CO2e
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    let actual_value: u32 = 3500; // 35.00 kg CO2e - below threshold
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
fn test_valid_at_threshold() {
    let threshold: u32 = 5000;
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    let actual_value: u32 = 5000; // Exactly at threshold
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

#[test(should_fail_with = "Carbon footprint exceeds threshold")]
fn test_invalid_above_threshold() {
    let threshold: u32 = 5000;
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    let actual_value: u32 = 7500; // Above threshold!
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
fn test_zero_footprint() {
    // Zero footprint should always pass
    let threshold: u32 = 5000;
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    let actual_value: u32 = 0;
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
