// ENERGY_DENSITY_RANGE_V1 Predicate Circuit
//
// Proves battery energy density (Wh/kg) is within declared range
//
// Public Inputs:
// - min_threshold: The minimum energy_density allowed
// - max_threshold: The maximum energy_density allowed
// - commitment_root: Merkle root of the supplier's claim commitment
// - product_binding: Hash binding this proof to a specific product
// - requester_binding: Hash binding this proof to the requester
//
// Private Inputs:
// - actual_value: The real energy_density value
// - claim_type_hash: BLAKE3 of claim type string
// - unit_hash: BLAKE3 of unit string ("Wh/kg")
// - claim_hash: BLAKE3 hash of (claim_type_hash || value || unit_hash)
// - merkle_path: Sibling hashes in the Merkle tree
// - merkle_indices: Path directions (0=left, 1=right)

use zkdpp_lib::{verify_merkle_proof, assert_bytes_equal, hash_claim_value, bind_context};

// Merkle tree depth (supports up to 2^8 = 256 claims per commitment)
global TREE_DEPTH: u32 = 8;

fn main(
    // ===== PUBLIC INPUTS =====
    min_threshold: pub u32,
    max_threshold: pub u32,
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
    tree_depth: u32
) {
    // 0. Validate threshold bounds are sensible
    assert(max_threshold >= min_threshold, "Invalid threshold range: max < min");

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

    // 1c. Bind proof context to product and requester
    bind_context(product_binding, requester_binding);

    // 2. Verify the predicate: min_threshold <= actual_value <= max_threshold
    assert(actual_value >= min_threshold, "energy_density below minimum threshold");
    assert(actual_value <= max_threshold, "energy_density above maximum threshold");

    // 3. Verify value is within valid physical range
        // Energy density physical limits: 50-500 Wh/kg (current technology)
    assert(actual_value >= 50, "Energy density below physical minimum");
    assert(actual_value <= 500, "Energy density above physical maximum");
}

// Test with valid proof (value within range)
#[test]
fn test_valid_in_range() {
    let min_threshold: u32 = 200;
    let max_threshold: u32 = 300;
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    let actual_value: u32 = 250;
    let claim_type_hash: [u8; 32] = [0x10; 32];
    let unit_hash: [u8; 32] = [0x20; 32];
    let claim_hash: [u8; 32] = hash_claim_value(claim_type_hash, actual_value as u64, unit_hash);
    let commitment_root: [u8; 32] = claim_hash;
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0;

    main(
        min_threshold,
        max_threshold,
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

#[test(should_fail_with = "energy_density below minimum threshold")]
fn test_below_min() {
    let min_threshold: u32 = 200;
    let max_threshold: u32 = 300;
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    let actual_value: u32 = 180;
    let claim_type_hash: [u8; 32] = [0x10; 32];
    let unit_hash: [u8; 32] = [0x20; 32];
    let claim_hash: [u8; 32] = hash_claim_value(claim_type_hash, actual_value as u64, unit_hash);
    let commitment_root: [u8; 32] = claim_hash;
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0;

    main(
        min_threshold,
        max_threshold,
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

#[test(should_fail_with = "energy_density above maximum threshold")]
fn test_above_max() {
    let min_threshold: u32 = 200;
    let max_threshold: u32 = 300;
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    let actual_value: u32 = 350;
    let claim_type_hash: [u8; 32] = [0x10; 32];
    let unit_hash: [u8; 32] = [0x20; 32];
    let claim_hash: [u8; 32] = hash_claim_value(claim_type_hash, actual_value as u64, unit_hash);
    let commitment_root: [u8; 32] = claim_hash;
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0;

    main(
        min_threshold,
        max_threshold,
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
fn test_at_exact_bounds() {
    // Test at min_threshold (should pass)
    let min_threshold: u32 = 200;
    let max_threshold: u32 = 300;
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    let actual_value: u32 = min_threshold;
    let claim_type_hash: [u8; 32] = [0x10; 32];
    let unit_hash: [u8; 32] = [0x20; 32];
    let claim_hash: [u8; 32] = hash_claim_value(claim_type_hash, actual_value as u64, unit_hash);
    let commitment_root: [u8; 32] = claim_hash;
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0;

    main(
        min_threshold,
        max_threshold,
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
