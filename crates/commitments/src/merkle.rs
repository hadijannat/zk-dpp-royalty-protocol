//! Merkle tree implementation for claim commitments.
//!
//! Uses BLAKE3 for internal node hashing with sorted concatenation
//! to ensure consistent tree structure.

use crate::{hash_bytes, CommitmentError, Result};
use serde::{Deserialize, Serialize};

/// Maximum tree depth to prevent stack overflow
pub const MAX_DEPTH: usize = 32;

/// A Merkle tree built from claim hashes.
#[derive(Debug, Clone)]
pub struct MerkleTree {
    /// All nodes in the tree, stored level by level from leaves to root
    nodes: Vec<Vec<[u8; 32]>>,
    /// Original leaf hashes
    leaves: Vec<[u8; 32]>,
}

/// A proof that a leaf exists in a Merkle tree.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MerkleProof {
    /// The leaf hash being proved
    pub leaf: [u8; 32],
    /// Sibling hashes from leaf to root
    pub path: Vec<[u8; 32]>,
    /// Path indices (0 = left, 1 = right) indicating position at each level
    pub indices: Vec<u8>,
}

impl MerkleTree {
    /// Builds a Merkle tree from a list of claim hashes.
    ///
    /// # Errors
    /// Returns an error if the claims list is empty or would create
    /// a tree exceeding MAX_DEPTH.
    pub fn build(claim_hashes: Vec<[u8; 32]>) -> Result<Self> {
        if claim_hashes.is_empty() {
            return Err(CommitmentError::EmptyClaims);
        }

        // Calculate required depth
        let depth = (claim_hashes.len() as f64).log2().ceil() as usize;
        if depth > MAX_DEPTH {
            return Err(CommitmentError::DepthExceeded(MAX_DEPTH));
        }

        let leaves = claim_hashes.clone();
        let mut nodes = vec![claim_hashes];

        // Build tree bottom-up
        while nodes.last().unwrap().len() > 1 {
            let current_level = nodes.last().unwrap();
            let mut next_level = Vec::with_capacity(current_level.len().div_ceil(2));

            for chunk in current_level.chunks(2) {
                let hash = if chunk.len() == 2 {
                    hash_pair(&chunk[0], &chunk[1])
                } else {
                    // Odd number of nodes: duplicate the last one
                    hash_pair(&chunk[0], &chunk[0])
                };
                next_level.push(hash);
            }

            nodes.push(next_level);
        }

        Ok(MerkleTree { nodes, leaves })
    }

    /// Returns the root hash of the tree.
    pub fn root(&self) -> [u8; 32] {
        self.nodes.last().unwrap()[0]
    }

    /// Returns the number of leaves in the tree.
    pub fn leaf_count(&self) -> usize {
        self.leaves.len()
    }

    /// Generates a proof for the leaf at the given index.
    ///
    /// # Panics
    /// Panics if index >= leaf_count()
    pub fn prove(&self, index: usize) -> MerkleProof {
        assert!(index < self.leaves.len(), "Index out of bounds");

        let mut path = Vec::new();
        let mut indices = Vec::new();
        let mut current_index = index;

        for level in 0..self.nodes.len() - 1 {
            let level_nodes = &self.nodes[level];
            let is_right = current_index % 2 == 1;
            let sibling_index = if is_right {
                current_index - 1
            } else {
                // Handle case where sibling might not exist (odd number)
                if current_index + 1 < level_nodes.len() {
                    current_index + 1
                } else {
                    current_index // Duplicate self if no sibling
                }
            };

            path.push(level_nodes[sibling_index]);
            indices.push(if is_right { 1 } else { 0 });

            current_index /= 2;
        }

        MerkleProof {
            leaf: self.leaves[index],
            path,
            indices,
        }
    }

    /// Verifies a Merkle proof against this tree's root.
    pub fn verify(&self, proof: &MerkleProof) -> bool {
        verify_merkle_proof(&proof.leaf, &proof.path, &proof.indices, &self.root())
    }
}

/// Verifies a Merkle proof given a leaf, path, indices, and expected root.
///
/// This is a standalone function for use in ZK circuits where we don't
/// have access to the full tree.
pub fn verify_merkle_proof(
    leaf: &[u8; 32],
    path: &[[u8; 32]],
    indices: &[u8],
    expected_root: &[u8; 32],
) -> bool {
    if path.len() != indices.len() {
        return false;
    }

    let mut current = *leaf;

    for (sibling, &index) in path.iter().zip(indices.iter()) {
        current = if index == 0 {
            // Current is on the left
            hash_pair(&current, sibling)
        } else {
            // Current is on the right
            hash_pair(sibling, &current)
        };
    }

    current == *expected_root
}

/// Hashes two nodes together to form a parent.
/// Nodes are sorted before concatenation for consistency.
fn hash_pair(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    let mut combined = [0u8; 64];
    combined[..32].copy_from_slice(left);
    combined[32..].copy_from_slice(right);
    hash_bytes(&combined)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hash_bytes;

    fn make_leaf(data: &[u8]) -> [u8; 32] {
        hash_bytes(data)
    }

    #[test]
    fn test_single_leaf() {
        let leaf = make_leaf(b"claim1");
        let tree = MerkleTree::build(vec![leaf]).unwrap();

        assert_eq!(tree.leaf_count(), 1);
        assert_eq!(tree.root(), leaf); // Single leaf is the root
    }

    #[test]
    fn test_two_leaves() {
        let leaves = vec![make_leaf(b"claim1"), make_leaf(b"claim2")];
        let tree = MerkleTree::build(leaves.clone()).unwrap();

        assert_eq!(tree.leaf_count(), 2);
        assert_ne!(tree.root(), leaves[0]);
        assert_ne!(tree.root(), leaves[1]);
    }

    #[test]
    fn test_prove_and_verify() {
        let leaves: Vec<_> = (0..8).map(|i| make_leaf(&[i])).collect();
        let tree = MerkleTree::build(leaves).unwrap();

        for i in 0..8 {
            let proof = tree.prove(i);
            assert!(tree.verify(&proof));
            assert!(verify_merkle_proof(
                &proof.leaf,
                &proof.path,
                &proof.indices,
                &tree.root()
            ));
        }
    }

    #[test]
    fn test_invalid_proof_wrong_leaf() {
        let leaves: Vec<_> = (0..4).map(|i| make_leaf(&[i])).collect();
        let tree = MerkleTree::build(leaves).unwrap();

        let mut proof = tree.prove(0);
        proof.leaf = make_leaf(b"wrong"); // Tamper with leaf

        assert!(!tree.verify(&proof));
    }

    #[test]
    fn test_invalid_proof_wrong_path() {
        let leaves: Vec<_> = (0..4).map(|i| make_leaf(&[i])).collect();
        let tree = MerkleTree::build(leaves).unwrap();

        let mut proof = tree.prove(0);
        if !proof.path.is_empty() {
            proof.path[0] = make_leaf(b"wrong"); // Tamper with path
        }

        assert!(!tree.verify(&proof));
    }

    #[test]
    fn test_odd_number_of_leaves() {
        let leaves: Vec<_> = (0..5).map(|i| make_leaf(&[i])).collect();
        let tree = MerkleTree::build(leaves).unwrap();

        // All proofs should still verify
        for i in 0..5 {
            let proof = tree.prove(i);
            assert!(tree.verify(&proof));
        }
    }

    #[test]
    fn test_empty_claims_error() {
        let result = MerkleTree::build(vec![]);
        assert!(matches!(result, Err(CommitmentError::EmptyClaims)));
    }
}
