// DUE_DILIGENCE_VALID_V1 Predicate Circuit
//
// Proves supply chain due diligence certification is valid (not expired)
//
// Public Inputs:
// - current_timestamp: Unix timestamp for verification time
// - commitment_root: Merkle root of the supplier's claim commitment
// - product_binding: Hash binding this proof to a specific product
// - requester_binding: Hash binding this proof to the requester
//
// Private Inputs:
// - valid_from: Certificate/credential start timestamp
// - valid_until: Certificate/credential expiry timestamp
// - claim_type_hash: BLAKE3 of claim type string ("due_diligence_cert")
// - claim_hash: BLAKE3 hash of the validity window
// - merkle_path: Sibling hashes in the Merkle tree
// - merkle_indices: Path directions (0=left, 1=right)

use zkdpp_lib::{verify_merkle_proof, hash_cert_window, assert_bytes_equal, bind_context};

// Merkle tree depth (supports up to 2^8 = 256 claims per commitment)
global TREE_DEPTH: u32 = 8;

fn main(
    // ===== PUBLIC INPUTS =====
    current_timestamp: pub u64,
    commitment_root: pub [u8; 32],
    product_binding: pub [u8; 32],
    requester_binding: pub [u8; 32],

    // ===== PRIVATE INPUTS =====
    valid_from: u64,
    valid_until: u64,
    claim_type_hash: [u8; 32],
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

    // 2. Verify claim hash binds the validity window
    let computed_hash = hash_cert_window(claim_type_hash, valid_from, valid_until);
    assert_bytes_equal(computed_hash, claim_hash);

    // 2b. Bind proof context to product and requester
    bind_context(product_binding, requester_binding);

    // 3. Verify the Due diligence certification is currently valid
    // valid_from <= current_timestamp <= valid_until
    assert(current_timestamp >= valid_from, "Due diligence certification not yet valid");
    assert(current_timestamp <= valid_until, "Due diligence certification has expired");

    // 4. Additional validation: validity window must be reasonable
    assert(valid_until > valid_from, "Invalid validity window");
}

// Test with valid certificate (timestamp within validity window)
#[test]
fn test_valid_cert() {
    let valid_from: u64 = 1704067200;      // 2024-01-01
    let valid_until: u64 = 1735689600;     // 2025-01-01
    let current_timestamp: u64 = 1720000000; // Mid-2024

    let claim_type_hash: [u8; 32] = [0x10; 32];
    let claim_hash: [u8; 32] = hash_cert_window(claim_type_hash, valid_from, valid_until);
    let commitment_root: [u8; 32] = claim_hash;

    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0;

    main(
        current_timestamp,
        commitment_root,
        product_binding,
        requester_binding,
        valid_from,
        valid_until,
        claim_type_hash,
        claim_hash,
        merkle_path,
        merkle_indices,
        tree_depth
    );
}

#[test(should_fail_with = "Due diligence certification has expired")]
fn test_expired_cert() {
    let valid_from: u64 = 1704067200;      // 2024-01-01
    let valid_until: u64 = 1735689600;     // 2025-01-01
    let current_timestamp: u64 = 1800000000; // After expiry

    let claim_type_hash: [u8; 32] = [0x10; 32];
    let claim_hash: [u8; 32] = hash_cert_window(claim_type_hash, valid_from, valid_until);
    let commitment_root: [u8; 32] = claim_hash;

    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0;

    main(
        current_timestamp,
        commitment_root,
        product_binding,
        requester_binding,
        valid_from,
        valid_until,
        claim_type_hash,
        claim_hash,
        merkle_path,
        merkle_indices,
        tree_depth
    );
}

#[test(should_fail_with = "Due diligence certification not yet valid")]
fn test_not_yet_valid() {
    let valid_from: u64 = 1750000000;      // Future
    let valid_until: u64 = 1800000000;     // Further future
    let current_timestamp: u64 = 1720000000; // Before valid_from

    let claim_type_hash: [u8; 32] = [0x10; 32];
    let claim_hash: [u8; 32] = hash_cert_window(claim_type_hash, valid_from, valid_until);
    let commitment_root: [u8; 32] = claim_hash;

    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0;

    main(
        current_timestamp,
        commitment_root,
        product_binding,
        requester_binding,
        valid_from,
        valid_until,
        claim_type_hash,
        claim_hash,
        merkle_path,
        merkle_indices,
        tree_depth
    );
}
