// CARBON_FOOTPRINT_LIFECYCLE_V1 Predicate Circuit
//
// Proves total lifecycle carbon footprint across all stages is within threshold
//
// This circuit aggregates multiple lifecycle stages and verifies the total
// is within the specified threshold.
//
// Public Inputs:
// - threshold: Maximum allowed total carbon footprint (kg CO2e/kWh)
// - commitment_root: Merkle root of the supplier's claim commitment
// - product_binding: Hash binding this proof to a specific product
// - requester_binding: Hash binding this proof to the requester
//
// Private Inputs:
// - stage_values: Array of values for each lifecycle stage
// - claim_type_hashes: Array of claim type hashes for each stage
// - claim_hashes: Array of claim hashes for each stage
// - merkle_paths: Merkle paths for each claim
// - merkle_indices: Path directions for each claim

use zkdpp_lib::{verify_merkle_proof, assert_bytes_equal, hash_claim_value, bind_context};
use std::hash::blake3;

// Merkle tree depth
global TREE_DEPTH: u32 = 8;

// Number of lifecycle stages
global NUM_STAGES: u32 = 5;

fn main(
    // ===== PUBLIC INPUTS =====
    threshold: pub u64,
    commitment_root: pub [u8; 32],
    product_binding: pub [u8; 32],
    requester_binding: pub [u8; 32],

    // ===== PRIVATE INPUTS =====
    // Each stage: raw materials, manufacturing, transport, use phase, end-of-life
    stage_values: [u64; NUM_STAGES],
    claim_type_hashes: [[u8; 32]; NUM_STAGES],
    unit_hashes: [[u8; 32]; NUM_STAGES],
    claim_hashes: [[u8; 32]; NUM_STAGES],
    merkle_paths: [[[u8; 32]; TREE_DEPTH]; NUM_STAGES],
    merkle_indices: [[u1; TREE_DEPTH]; NUM_STAGES],
    tree_depths: [u32; NUM_STAGES]
) {
    // 1. Verify each stage's claim is in the commitment
    for i in 0..NUM_STAGES {
        let merkle_valid = verify_merkle_proof(
            claim_hashes[i],
            merkle_paths[i],
            merkle_indices[i],
            commitment_root,
            tree_depths[i]
        );
        assert(merkle_valid, "Merkle proof verification failed for stage");

        // Verify claim hash binds claim type, value, and unit
        let computed_hash = hash_claim_value(
            claim_type_hashes[i],
            stage_values[i],
            unit_hashes[i]
        );
        assert_bytes_equal(computed_hash, claim_hashes[i]);
    }

    // 1b. Bind proof context to product and requester
    bind_context(product_binding, requester_binding);

    // 2. Compute total across all stages
    let mut total: u64 = 0;
    for i in 0..NUM_STAGES {
        total += stage_values[i];
        // Overflow check: total should not wrap around
        assert(total >= stage_values[i], "Overflow in total calculation");
    }

    // 3. Verify total is within threshold
    assert(total <= threshold, "Total carbon footprint exceeds threshold");

    // 4. Validate individual stage values are reasonable
        // Each stage must be non-negative (already enforced by u64)
    // Maximum single stage: 1,000,000 kg CO2e/kWh (sanity check)
    for i in 0..NUM_STAGES {
        assert(stage_values[i] <= 1000000, "Single stage exceeds maximum");
    }
}

// Test with valid proof (total under threshold)
#[test]
fn test_valid_total_under_threshold() {
    let threshold: u64 = 50;
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    // Stage values that sum to less than threshold
    let stage_values: [u64; NUM_STAGES] = [8, 8, 8, 8, 8];

    // Generate claim hashes for each stage
    let claim_type_hashes: [[u8; 32]; NUM_STAGES] = [[0x11; 32], [0x11; 32], [0x11; 32], [0x11; 32], [0x11; 32]];
    let unit_hashes: [[u8; 32]; NUM_STAGES] = [[0x20; 32], [0x20; 32], [0x20; 32], [0x20; 32], [0x20; 32]];

    let mut claim_hashes: [[u8; 32]; NUM_STAGES] = [[0; 32]; NUM_STAGES];
    for i in 0..NUM_STAGES {
        claim_hashes[i] = hash_claim_value(claim_type_hashes[i], stage_values[i], unit_hashes[i]);
    }

    // Build a simple commitment root (hash of all claim hashes)
    let mut combined: [u8; 64] = [0; 64];
    let mut commitment_root: [u8; 32] = claim_hashes[0];
    for i in 1..NUM_STAGES {
        for j in 0..32 {
            combined[j] = commitment_root[j];
            combined[32 + j] = claim_hashes[i][j];
        }
        commitment_root = blake3(combined);
    }

    // For single-leaf test, each claim is its own root
    // In practice, would need proper Merkle tree construction
    let merkle_paths: [[[u8; 32]; TREE_DEPTH]; NUM_STAGES] = [[[0; 32]; TREE_DEPTH]; NUM_STAGES];
    let merkle_indices: [[u1; TREE_DEPTH]; NUM_STAGES] = [[0; TREE_DEPTH]; NUM_STAGES];
    let tree_depths: [u32; NUM_STAGES] = [0; NUM_STAGES];

    // Use first claim hash as root for simple test
    let test_root: [u8; 32] = claim_hashes[0];

    main(
        threshold,
        test_root,
        product_binding,
        requester_binding,
        stage_values,
        claim_type_hashes,
        unit_hashes,
        claim_hashes,
        merkle_paths,
        merkle_indices,
        tree_depths
    );
}

#[test(should_fail_with = "Total carbon footprint exceeds threshold")]
fn test_total_exceeds_threshold() {
    let threshold: u64 = 50;
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    // Stage values that sum to more than threshold
    let stage_values: [u64; NUM_STAGES] = [15, 15, 15, 15, 15];

    let claim_type_hashes: [[u8; 32]; NUM_STAGES] = [[0x11; 32], [0x11; 32], [0x11; 32], [0x11; 32], [0x11; 32]];
    let unit_hashes: [[u8; 32]; NUM_STAGES] = [[0x20; 32], [0x20; 32], [0x20; 32], [0x20; 32], [0x20; 32]];

    let mut claim_hashes: [[u8; 32]; NUM_STAGES] = [[0; 32]; NUM_STAGES];
    for i in 0..NUM_STAGES {
        claim_hashes[i] = hash_claim_value(claim_type_hashes[i], stage_values[i], unit_hashes[i]);
    }

    let merkle_paths: [[[u8; 32]; TREE_DEPTH]; NUM_STAGES] = [[[0; 32]; TREE_DEPTH]; NUM_STAGES];
    let merkle_indices: [[u1; TREE_DEPTH]; NUM_STAGES] = [[0; TREE_DEPTH]; NUM_STAGES];
    let tree_depths: [u32; NUM_STAGES] = [0; NUM_STAGES];

    let test_root: [u8; 32] = claim_hashes[0];

    main(
        threshold,
        test_root,
        product_binding,
        requester_binding,
        stage_values,
        claim_type_hashes,
        unit_hashes,
        claim_hashes,
        merkle_paths,
        merkle_indices,
        tree_depths
    );
}
