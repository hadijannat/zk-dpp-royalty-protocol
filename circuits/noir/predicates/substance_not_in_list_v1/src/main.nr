// SUBSTANCE_NOT_IN_LIST_V1 Predicate Circuit
//
// Proves that a product does not contain any substances from a forbidden list,
// without revealing which substances the product actually contains.
//
// This uses a set non-membership proof:
// - The supplier commits to a list of substance identifiers in the product
// - The circuit verifies none of these match the forbidden list
//
// Public Inputs:
// - forbidden_list_hash: Hash of the canonical forbidden substances list
// - commitment_root: Merkle root of the supplier's claim commitment
// - product_binding: Hash binding this proof to a specific product
// - requester_binding: Hash binding this proof to the requester
//
// Private Inputs:
// - product_substances: List of substance IDs in the product (as hashes)
// - num_substances: Actual number of substances (rest are zero-padded)
// - forbidden_substances: The actual forbidden list (to verify hash)
// - num_forbidden: Actual number in forbidden list
// - claim_type_hash: BLAKE3 of claim type string
// - claim_hash: hash_substance_list("SUBP", claim_type_hash, product_substances)
// - merkle_path, merkle_indices, tree_depth: Merkle proof components

use zkdpp_lib::{verify_merkle_proof, assert_bytes_equal, bytes_equal, hash_substance_list, bind_context};

// Maximum substances we can check
global MAX_PRODUCT_SUBSTANCES: u32 = 32;
global MAX_FORBIDDEN_SUBSTANCES: u32 = 64;

// Merkle tree depth
global TREE_DEPTH: u32 = 8;

fn main(
    // ===== PUBLIC INPUTS =====
    forbidden_list_hash: pub [u8; 32],
    commitment_root: pub [u8; 32],
    product_binding: pub [u8; 32],
    requester_binding: pub [u8; 32],

    // ===== PRIVATE INPUTS =====
    // Product's substances (each as 32-byte identifier hash)
    product_substances: [[u8; 32]; MAX_PRODUCT_SUBSTANCES],
    num_substances: u32,

    // Forbidden substances list
    forbidden_substances: [[u8; 32]; MAX_FORBIDDEN_SUBSTANCES],
    num_forbidden: u32,

    // Commitment proof
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

    // 2. Verify the forbidden list hash matches
    // This ensures the prover is using the correct forbidden list
    let forbidden_hash = hash_substance_list([0x53, 0x55, 0x42, 0x46], claim_type_hash, forbidden_substances, num_forbidden);
    assert_bytes_equal(forbidden_hash, forbidden_list_hash);

    // 2b. Verify claim hash binds product substance list
    let product_hash = hash_substance_list([0x53, 0x55, 0x42, 0x50], claim_type_hash, product_substances, num_substances);
    assert_bytes_equal(product_hash, claim_hash);

    // 2c. Bind proof context to product and requester
    bind_context(product_binding, requester_binding);

    // 3. Verify non-membership: no product substance is in forbidden list
    for i in 0..MAX_PRODUCT_SUBSTANCES {
        if (i as u32) < num_substances {
            let substance = product_substances[i];

            // Check this substance is not in forbidden list
            for j in 0..MAX_FORBIDDEN_SUBSTANCES {
                if (j as u32) < num_forbidden {
                    let forbidden = forbidden_substances[j];
                    let is_match = bytes_equal(substance, forbidden);
                    assert(!is_match, "Product contains forbidden substance");
                }
            }
        }
    }
}

#[test]
fn test_no_forbidden_substances() {
    // Product contains substances A, B, C (not forbidden)
    // Forbidden list contains X, Y, Z
    let mut product_substances: [[u8; 32]; MAX_PRODUCT_SUBSTANCES] = [[0; 32]; MAX_PRODUCT_SUBSTANCES];
    product_substances[0] = [0x0A; 32]; // Substance A
    product_substances[1] = [0x0B; 32]; // Substance B
    product_substances[2] = [0x0C; 32]; // Substance C
    let num_substances: u32 = 3;

    let mut forbidden_substances: [[u8; 32]; MAX_FORBIDDEN_SUBSTANCES] = [[0; 32]; MAX_FORBIDDEN_SUBSTANCES];
    forbidden_substances[0] = [0x58; 32]; // Substance X
    forbidden_substances[1] = [0x59; 32]; // Substance Y
    forbidden_substances[2] = [0x5A; 32]; // Substance Z
    let num_forbidden: u32 = 3;

    let claim_type_hash: [u8; 32] = [0x10; 32];
    let forbidden_list_hash = hash_substance_list([0x53, 0x55, 0x42, 0x46], claim_type_hash, forbidden_substances, num_forbidden);
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];
    let claim_hash: [u8; 32] = hash_substance_list([0x53, 0x55, 0x42, 0x50], claim_type_hash, product_substances, num_substances);
    let commitment_root: [u8; 32] = claim_hash;
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0;

    main(
        forbidden_list_hash,
        commitment_root,
        product_binding,
        requester_binding,
        product_substances,
        num_substances,
        forbidden_substances,
        num_forbidden,
        claim_type_hash,
        claim_hash,
        merkle_path,
        merkle_indices,
        tree_depth
    );
}

#[test(should_fail_with = "Product contains forbidden substance")]
fn test_contains_forbidden_substance() {
    // Product contains substance X which is forbidden
    let mut product_substances: [[u8; 32]; MAX_PRODUCT_SUBSTANCES] = [[0; 32]; MAX_PRODUCT_SUBSTANCES];
    product_substances[0] = [0x0A; 32]; // Substance A (ok)
    product_substances[1] = [0x58; 32]; // Substance X (FORBIDDEN!)
    let num_substances: u32 = 2;

    let mut forbidden_substances: [[u8; 32]; MAX_FORBIDDEN_SUBSTANCES] = [[0; 32]; MAX_FORBIDDEN_SUBSTANCES];
    forbidden_substances[0] = [0x58; 32]; // Substance X
    forbidden_substances[1] = [0x59; 32]; // Substance Y
    let num_forbidden: u32 = 2;

    let claim_type_hash: [u8; 32] = [0x10; 32];
    let forbidden_list_hash = hash_substance_list([0x53, 0x55, 0x42, 0x46], claim_type_hash, forbidden_substances, num_forbidden);
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];
    let claim_hash: [u8; 32] = hash_substance_list([0x53, 0x55, 0x42, 0x50], claim_type_hash, product_substances, num_substances);
    let commitment_root: [u8; 32] = claim_hash;
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0;

    main(
        forbidden_list_hash,
        commitment_root,
        product_binding,
        requester_binding,
        product_substances,
        num_substances,
        forbidden_substances,
        num_forbidden,
        claim_type_hash,
        claim_hash,
        merkle_path,
        merkle_indices,
        tree_depth
    );
}

#[test]
fn test_empty_product() {
    // Product contains no substances
    let product_substances: [[u8; 32]; MAX_PRODUCT_SUBSTANCES] = [[0; 32]; MAX_PRODUCT_SUBSTANCES];
    let num_substances: u32 = 0;

    let mut forbidden_substances: [[u8; 32]; MAX_FORBIDDEN_SUBSTANCES] = [[0; 32]; MAX_FORBIDDEN_SUBSTANCES];
    forbidden_substances[0] = [0x58; 32];
    let num_forbidden: u32 = 1;

    let claim_type_hash: [u8; 32] = [0x10; 32];
    let forbidden_list_hash = hash_substance_list([0x53, 0x55, 0x42, 0x46], claim_type_hash, forbidden_substances, num_forbidden);
    let product_binding: [u8; 32] = [1; 32];
    let requester_binding: [u8; 32] = [2; 32];
    let claim_hash: [u8; 32] = hash_substance_list([0x53, 0x55, 0x42, 0x50], claim_type_hash, product_substances, num_substances);
    let commitment_root: [u8; 32] = claim_hash;
    let merkle_path: [[u8; 32]; TREE_DEPTH] = [[0; 32]; TREE_DEPTH];
    let merkle_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let tree_depth: u32 = 0;

    main(
        forbidden_list_hash,
        commitment_root,
        product_binding,
        requester_binding,
        product_substances,
        num_substances,
        forbidden_substances,
        num_forbidden,
        claim_type_hash,
        claim_hash,
        merkle_path,
        merkle_indices,
        tree_depth
    );
}
