// CERT_VALID_V1 Predicate Circuit
//
// Proves that a certification is valid (not expired) at a given timestamp,
// without revealing the exact expiry date or certificate details.
//
// Public Inputs:
// - check_timestamp: The timestamp to verify validity against (Unix seconds)
// - commitment_root: Merkle root of the supplier's claim commitment
// - product_binding: Hash binding this proof to a specific product
// - requester_binding: Hash binding this proof to the requester
//
// Private Inputs:
// - valid_from: Certificate validity start (Unix seconds)
// - valid_until: Certificate expiry date (Unix seconds)
// - claim_type_hash: BLAKE3 of claim type string
// - claim_hash: BLAKE3 hash of (claim_type_hash || valid_from || valid_until)
// - merkle_path: Sibling hashes in the Merkle tree
// - merkle_indices: Path directions (0=left, 1=right)

use zkdpp_lib::{verify_merkle_proof, assert_bytes_equal, hash_cert_window, bind_context};

// Merkle tree depth
global TREE_DEPTH: u32 = 8;

fn main(
    // ===== PUBLIC INPUTS =====
    check_timestamp: pub u64,       // Time to check validity
    commitment_root: pub [u8; 32],
    product_binding: pub [u8; 32],
    requester_binding: pub [u8; 32],

    // ===== PRIVATE INPUTS =====
    valid_from: u64,                // Certificate start time
    valid_until: u64,               // Certificate expiry time
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

    // 1b. Verify claim hash binds claim type and validity window
    let computed_hash = hash_cert_window(claim_type_hash, valid_from, valid_until);
    assert_bytes_equal(computed_hash, claim_hash);

    // 1c. Bind proof context to product and requester
    bind_context(product_binding, requester_binding);

    // 2. Verify certificate validity window
    // Certificate must have started before check time
    assert(valid_from <= check_timestamp, "Certificate not yet valid");

    // Certificate must not have expired
    assert(check_timestamp < valid_until, "Certificate has expired");

    // 3. Sanity check: valid_from must be before valid_until
    assert(valid_from < valid_until, "Invalid validity window");
}

#[test]
fn test_valid_certificate() {
    // Certificate valid from 2024-01-01 to 2025-01-01
    // Checking at 2024-06-15
    let check_timestamp: u64 = 1718409600; // 2024-06-15
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    let valid_from: u64 = 1704067200;  // 2024-01-01
    let valid_until: u64 = 1735689600; // 2025-01-01
    let claim_type_hash: [u8; 32] = [0x10; 32];
    let claim_hash: [u8; 32] = hash_cert_window(claim_type_hash, valid_from, valid_until);
    let commitment_root: [u8; 32] = claim_hash;
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0;

    main(
        check_timestamp,
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

#[test(should_fail_with = "Certificate has expired")]
fn test_expired_certificate() {
    // Certificate expired on 2024-01-01
    // Checking at 2024-06-15
    let check_timestamp: u64 = 1718409600; // 2024-06-15
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    let valid_from: u64 = 1672531200;  // 2023-01-01
    let valid_until: u64 = 1704067200; // 2024-01-01 (already passed)
    let claim_type_hash: [u8; 32] = [0x10; 32];
    let claim_hash: [u8; 32] = hash_cert_window(claim_type_hash, valid_from, valid_until);
    let commitment_root: [u8; 32] = claim_hash;
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0;

    main(
        check_timestamp,
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

#[test(should_fail_with = "Certificate not yet valid")]
fn test_not_yet_valid() {
    // Certificate starts 2025-01-01
    // Checking at 2024-06-15
    let check_timestamp: u64 = 1718409600; // 2024-06-15
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    let valid_from: u64 = 1735689600;  // 2025-01-01 (future)
    let valid_until: u64 = 1767225600; // 2026-01-01
    let claim_type_hash: [u8; 32] = [0x10; 32];
    let claim_hash: [u8; 32] = hash_cert_window(claim_type_hash, valid_from, valid_until);
    let commitment_root: [u8; 32] = claim_hash;
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0;

    main(
        check_timestamp,
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

#[test]
fn test_just_before_expiry() {
    // Check exactly 1 second before expiry
    let valid_until: u64 = 1735689600; // 2025-01-01
    let check_timestamp: u64 = valid_until - 1;
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    let valid_from: u64 = 1704067200;
    let claim_type_hash: [u8; 32] = [0x10; 32];
    let claim_hash: [u8; 32] = hash_cert_window(claim_type_hash, valid_from, valid_until);
    let commitment_root: [u8; 32] = claim_hash;
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0;

    main(
        check_timestamp,
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
