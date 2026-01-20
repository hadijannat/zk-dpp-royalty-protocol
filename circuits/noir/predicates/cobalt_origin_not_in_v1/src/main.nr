// COBALT_ORIGIN_NOT_IN_V1 Predicate Circuit
//
// Proves cobalt origin is NOT from conflict regions (OECD Due Diligence compliance)
//
// Public Inputs:
// - set_hash: Hash of the blocked conflict regions set
// - commitment_root: Merkle root of the supplier's claim commitment
// - product_binding: Hash binding this proof to a specific product
// - requester_binding: Hash binding this proof to the requester
//
// Private Inputs:
// - actual_value: The real cobalt_origin_country value (hashed)
// - set_elements: The complete set of ISO 3166-1 alpha-3 country code hashes
// - set_size: Number of valid elements in the set
// - claim_hash: BLAKE3 hash of (claim_type_hash || actual_value)
// - merkle_path: Sibling hashes in the Merkle tree
// - merkle_indices: Path directions (0=left, 1=right)

use zkdpp_lib::{verify_merkle_proof, hash_substance_list, hash_claim_bytes, assert_bytes_equal, bytes_equal, bind_context};

// Merkle tree depth (supports up to 2^8 = 256 claims per commitment)
global TREE_DEPTH: u32 = 8;

// Maximum number of elements in the set
global MAX_SET_SIZE: u32 = 32;

// Domain separator for this predicate type
global DOMAIN: [u8; 4] = [0x43, 0x4F, 0x42, 0x4C];

fn main(
    // ===== PUBLIC INPUTS =====
    set_hash: pub [u8; 32],
    commitment_root: pub [u8; 32],
    product_binding: pub [u8; 32],
    requester_binding: pub [u8; 32],

    // ===== PRIVATE INPUTS =====
    actual_value: [u8; 32],
    claim_type_hash: [u8; 32],
    set_elements: [[u8; 32]; MAX_SET_SIZE],
    set_size: u32,
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

    // 1b. Verify claim hash binds claim type and actual value
    let computed_claim_hash = hash_claim_bytes(claim_type_hash, actual_value);
    assert_bytes_equal(computed_claim_hash, claim_hash);

    // 1c. Bind proof context to product and requester
    bind_context(product_binding, requester_binding);

    // 2. Verify the set_hash matches the provided set elements
    // This ensures the prover uses the correct public set
    let computed_set_hash = hash_substance_list(
        DOMAIN,
        claim_type_hash,
        set_elements,
        set_size
    );
    assert_bytes_equal(computed_set_hash, set_hash);

    // 3. Check non_membership in the set
        let mut found = false;
    for i in 0..MAX_SET_SIZE {
        if (i as u32) < set_size {
            if bytes_equal(actual_value, set_elements[i]) {
                found = true;
            }
        }
    }
    assert(!found, "Cobalt origin is from blocked conflict region");
}

// Test with valid proof (value is NOT in blocked set)
#[test]
fn test_valid_proof() {
    // Build a test set
    let set_elements: [[u8; 32]; MAX_SET_SIZE] = [[0x43, 0x4F, 0x44, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32]];
    let set_size: u32 = 1;
    let claim_type_hash: [u8; 32] = [0x10; 32];

    let set_hash: [u8; 32] = hash_substance_list(
        DOMAIN,
        claim_type_hash,
        set_elements,
        set_size
    );

    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    // The actual value being tested
    let actual_value: [u8; 32] = [0x41, 0x55, 0x53, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    // For testing, claim_hash = commitment_root (single leaf)
    let claim_hash: [u8; 32] = hash_claim_bytes(claim_type_hash, actual_value);
    let commitment_root: [u8; 32] = claim_hash;
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0;

    main(
        set_hash,
        commitment_root,
        product_binding,
        requester_binding,
        actual_value,
        claim_type_hash,
        set_elements,
        set_size,
        claim_hash,
        merkle_path,
        merkle_indices,
        tree_depth
    );
}

#[test(should_fail_with = "Cobalt origin is from blocked conflict region")]
fn test_invalid_fails() {
    // Build a test set
    let set_elements: [[u8; 32]; MAX_SET_SIZE] = [[0x43, 0x4F, 0x44, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32]];
    let set_size: u32 = 1;
    let claim_type_hash: [u8; 32] = [0x10; 32];

    let set_hash: [u8; 32] = hash_substance_list(
        DOMAIN,
        claim_type_hash,
        set_elements,
        set_size
    );

    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];

    // The actual value that should fail
    let actual_value: [u8; 32] = [0x43, 0x4F, 0x44, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    let claim_hash: [u8; 32] = hash_claim_bytes(claim_type_hash, actual_value);
    let commitment_root: [u8; 32] = claim_hash;
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0;

    main(
        set_hash,
        commitment_root,
        product_binding,
        requester_binding,
        actual_value,
        claim_type_hash,
        set_elements,
        set_size,
        claim_hash,
        merkle_path,
        merkle_indices,
        tree_depth
    );
}
