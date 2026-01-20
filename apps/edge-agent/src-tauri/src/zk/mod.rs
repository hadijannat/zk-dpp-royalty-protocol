//! Noir CLI integration for proof generation (edge agent)
//!
//! This module uses the `nargo` CLI to compile and prove Noir circuits.
//! It expects the Noir toolchain to be installed locally and accessible
//! via the `NARGO_BIN` environment variable (defaults to `nargo`).

use anyhow::{anyhow, Context, Result};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone)]
pub struct NoirCliConfig {
    pub nargo_bin: String,
    pub circuits_dir: PathBuf,
}

impl NoirCliConfig {
    pub fn from_env() -> Result<Self> {
        let nargo_bin = std::env::var("NARGO_BIN").unwrap_or_else(|_| "nargo".to_string());
        let circuits_dir = resolve_circuits_dir()
            .context("Unable to locate Noir circuits directory. Set NOIR_CIRCUITS_DIR.")?;

        Ok(Self { nargo_bin, circuits_dir })
    }
}

#[derive(Debug, Clone)]
pub struct RecycledContentInputs {
    pub threshold: u32,
    pub commitment_root: [u8; 32],
    pub product_binding: [u8; 32],
    pub requester_binding: [u8; 32],
    pub actual_value: u32,
    pub claim_type_hash: [u8; 32],
    pub unit_hash: [u8; 32],
    pub claim_hash: [u8; 32],
    pub merkle_path: Vec<[u8; 32]>,
    pub merkle_indices: Vec<u8>,
    pub tree_depth: u32,
}

#[derive(Debug, Clone)]
pub struct CarbonFootprintInputs {
    pub threshold: u32,
    pub commitment_root: [u8; 32],
    pub product_binding: [u8; 32],
    pub requester_binding: [u8; 32],
    pub actual_value: u32,
    pub claim_type_hash: [u8; 32],
    pub unit_hash: [u8; 32],
    pub claim_hash: [u8; 32],
    pub merkle_path: Vec<[u8; 32]>,
    pub merkle_indices: Vec<u8>,
    pub tree_depth: u32,
}

#[derive(Debug, Clone)]
pub struct CertValidInputs {
    pub check_timestamp: u64,
    pub commitment_root: [u8; 32],
    pub product_binding: [u8; 32],
    pub requester_binding: [u8; 32],
    pub valid_from: u64,
    pub valid_until: u64,
    pub claim_type_hash: [u8; 32],
    pub claim_hash: [u8; 32],
    pub merkle_path: Vec<[u8; 32]>,
    pub merkle_indices: Vec<u8>,
    pub tree_depth: u32,
}

#[derive(Debug, Clone)]
pub struct SubstanceNotInListInputs {
    pub forbidden_list_hash: [u8; 32],
    pub commitment_root: [u8; 32],
    pub product_binding: [u8; 32],
    pub requester_binding: [u8; 32],
    pub product_substances: Vec<[u8; 32]>,
    pub num_substances: u32,
    pub forbidden_substances: Vec<[u8; 32]>,
    pub num_forbidden: u32,
    pub claim_type_hash: [u8; 32],
    pub claim_hash: [u8; 32],
    pub merkle_path: Vec<[u8; 32]>,
    pub merkle_indices: Vec<u8>,
    pub tree_depth: u32,
}

pub fn prove_recycled_content_gte(config: &NoirCliConfig, inputs: RecycledContentInputs) -> Result<String> {
    let circuit_dir = config.circuits_dir.join("recycled_content_gte_v1");
    ensure_compiled(&config.nargo_bin, &circuit_dir)?;

    // Write Prover.toml into circuit dir (nargo default)
    let prover_toml = build_recycled_content_prover_toml(&inputs)?;
    fs::write(circuit_dir.join("Prover.toml"), prover_toml)
        .context("Failed to write Prover.toml")?;

    // Execute and prove
    run_nargo(&config.nargo_bin, &circuit_dir, &["execute"])?;
    run_nargo(&config.nargo_bin, &circuit_dir, &["prove"])?;

    // Read proof output
    let proof_path = circuit_dir
        .join("proofs")
        .join("recycled_content_gte_v1.proof");

    let proof_bytes = fs::read(&proof_path)
        .with_context(|| format!("Proof file not found at {}", proof_path.display()))?;

    Ok(hex::encode(proof_bytes))
}

pub fn prove_carbon_footprint_lte(config: &NoirCliConfig, inputs: CarbonFootprintInputs) -> Result<String> {
    let circuit_dir = config.circuits_dir.join("carbon_footprint_lte_v1");
    ensure_compiled(&config.nargo_bin, &circuit_dir)?;

    let prover_toml = build_carbon_footprint_prover_toml(&inputs)?;
    fs::write(circuit_dir.join("Prover.toml"), prover_toml)
        .context("Failed to write Prover.toml")?;

    run_nargo(&config.nargo_bin, &circuit_dir, &["execute"])?;
    run_nargo(&config.nargo_bin, &circuit_dir, &["prove"])?;

    let proof_path = circuit_dir
        .join("proofs")
        .join("carbon_footprint_lte_v1.proof");

    let proof_bytes = fs::read(&proof_path)
        .with_context(|| format!("Proof file not found at {}", proof_path.display()))?;

    Ok(hex::encode(proof_bytes))
}

pub fn prove_cert_valid(config: &NoirCliConfig, inputs: CertValidInputs) -> Result<String> {
    let circuit_dir = config.circuits_dir.join("cert_valid_v1");
    ensure_compiled(&config.nargo_bin, &circuit_dir)?;

    let prover_toml = build_cert_valid_prover_toml(&inputs)?;
    fs::write(circuit_dir.join("Prover.toml"), prover_toml)
        .context("Failed to write Prover.toml")?;

    run_nargo(&config.nargo_bin, &circuit_dir, &["execute"])?;
    run_nargo(&config.nargo_bin, &circuit_dir, &["prove"])?;

    let proof_path = circuit_dir
        .join("proofs")
        .join("cert_valid_v1.proof");

    let proof_bytes = fs::read(&proof_path)
        .with_context(|| format!("Proof file not found at {}", proof_path.display()))?;

    Ok(hex::encode(proof_bytes))
}

pub fn prove_substance_not_in_list(
    config: &NoirCliConfig,
    inputs: SubstanceNotInListInputs,
) -> Result<String> {
    let circuit_dir = config.circuits_dir.join("substance_not_in_list_v1");
    ensure_compiled(&config.nargo_bin, &circuit_dir)?;

    let prover_toml = build_substance_not_in_list_prover_toml(&inputs)?;
    fs::write(circuit_dir.join("Prover.toml"), prover_toml)
        .context("Failed to write Prover.toml")?;

    run_nargo(&config.nargo_bin, &circuit_dir, &["execute"])?;
    run_nargo(&config.nargo_bin, &circuit_dir, &["prove"])?;

    let proof_path = circuit_dir
        .join("proofs")
        .join("substance_not_in_list_v1.proof");

    let proof_bytes = fs::read(&proof_path)
        .with_context(|| format!("Proof file not found at {}", proof_path.display()))?;

    Ok(hex::encode(proof_bytes))
}

fn build_recycled_content_prover_toml(inputs: &RecycledContentInputs) -> Result<String> {
    let path = pad_merkle_path(&inputs.merkle_path, 8)?;
    let indices = pad_merkle_indices(&inputs.merkle_indices, 8)?;

    Ok(format!(
        "threshold = \"{threshold}\"\n\
commitment_root = {commitment_root}\n\
product_binding = {product_binding}\n\
requester_binding = {requester_binding}\n\
actual_value = \"{actual_value}\"\n\
claim_type_hash = {claim_type_hash}\n\
unit_hash = {unit_hash}\n\
claim_hash = {claim_hash}\n\
merkle_path = {merkle_path}\n\
merkle_indices = {merkle_indices}\n\
tree_depth = \"{tree_depth}\"\n",
        threshold = inputs.threshold,
        commitment_root = bytes_to_toml_array(&inputs.commitment_root),
        product_binding = bytes_to_toml_array(&inputs.product_binding),
        requester_binding = bytes_to_toml_array(&inputs.requester_binding),
        actual_value = inputs.actual_value,
        claim_type_hash = bytes_to_toml_array(&inputs.claim_type_hash),
        unit_hash = bytes_to_toml_array(&inputs.unit_hash),
        claim_hash = bytes_to_toml_array(&inputs.claim_hash),
        merkle_path = path,
        merkle_indices = indices,
        tree_depth = inputs.tree_depth
    ))
}

fn build_carbon_footprint_prover_toml(inputs: &CarbonFootprintInputs) -> Result<String> {
    let path = pad_merkle_path(&inputs.merkle_path, 8)?;
    let indices = pad_merkle_indices(&inputs.merkle_indices, 8)?;

    Ok(format!(
        "threshold = \"{threshold}\"\n\
commitment_root = {commitment_root}\n\
product_binding = {product_binding}\n\
requester_binding = {requester_binding}\n\
actual_value = \"{actual_value}\"\n\
claim_type_hash = {claim_type_hash}\n\
unit_hash = {unit_hash}\n\
claim_hash = {claim_hash}\n\
merkle_path = {merkle_path}\n\
merkle_indices = {merkle_indices}\n\
tree_depth = \"{tree_depth}\"\n",
        threshold = inputs.threshold,
        commitment_root = bytes_to_toml_array(&inputs.commitment_root),
        product_binding = bytes_to_toml_array(&inputs.product_binding),
        requester_binding = bytes_to_toml_array(&inputs.requester_binding),
        actual_value = inputs.actual_value,
        claim_type_hash = bytes_to_toml_array(&inputs.claim_type_hash),
        unit_hash = bytes_to_toml_array(&inputs.unit_hash),
        claim_hash = bytes_to_toml_array(&inputs.claim_hash),
        merkle_path = path,
        merkle_indices = indices,
        tree_depth = inputs.tree_depth
    ))
}

fn build_cert_valid_prover_toml(inputs: &CertValidInputs) -> Result<String> {
    let path = pad_merkle_path(&inputs.merkle_path, 8)?;
    let indices = pad_merkle_indices(&inputs.merkle_indices, 8)?;

    Ok(format!(
        "check_timestamp = \"{check_timestamp}\"\n\
commitment_root = {commitment_root}\n\
product_binding = {product_binding}\n\
requester_binding = {requester_binding}\n\
valid_from = \"{valid_from}\"\n\
valid_until = \"{valid_until}\"\n\
claim_type_hash = {claim_type_hash}\n\
claim_hash = {claim_hash}\n\
merkle_path = {merkle_path}\n\
merkle_indices = {merkle_indices}\n\
tree_depth = \"{tree_depth}\"\n",
        check_timestamp = inputs.check_timestamp,
        commitment_root = bytes_to_toml_array(&inputs.commitment_root),
        product_binding = bytes_to_toml_array(&inputs.product_binding),
        requester_binding = bytes_to_toml_array(&inputs.requester_binding),
        valid_from = inputs.valid_from,
        valid_until = inputs.valid_until,
        claim_type_hash = bytes_to_toml_array(&inputs.claim_type_hash),
        claim_hash = bytes_to_toml_array(&inputs.claim_hash),
        merkle_path = path,
        merkle_indices = indices,
        tree_depth = inputs.tree_depth
    ))
}

fn build_substance_not_in_list_prover_toml(inputs: &SubstanceNotInListInputs) -> Result<String> {
    let path = pad_merkle_path(&inputs.merkle_path, 8)?;
    let indices = pad_merkle_indices(&inputs.merkle_indices, 8)?;

    let product_substances = pad_substances(&inputs.product_substances, 32)?;
    let forbidden_substances = pad_substances(&inputs.forbidden_substances, 64)?;

    Ok(format!(
        "forbidden_list_hash = {forbidden_list_hash}\n\
commitment_root = {commitment_root}\n\
product_binding = {product_binding}\n\
requester_binding = {requester_binding}\n\
product_substances = {product_substances}\n\
num_substances = \"{num_substances}\"\n\
forbidden_substances = {forbidden_substances}\n\
num_forbidden = \"{num_forbidden}\"\n\
claim_type_hash = {claim_type_hash}\n\
claim_hash = {claim_hash}\n\
merkle_path = {merkle_path}\n\
merkle_indices = {merkle_indices}\n\
tree_depth = \"{tree_depth}\"\n",
        forbidden_list_hash = bytes_to_toml_array(&inputs.forbidden_list_hash),
        commitment_root = bytes_to_toml_array(&inputs.commitment_root),
        product_binding = bytes_to_toml_array(&inputs.product_binding),
        requester_binding = bytes_to_toml_array(&inputs.requester_binding),
        product_substances = nested_bytes_to_toml_array(&product_substances),
        num_substances = inputs.num_substances,
        forbidden_substances = nested_bytes_to_toml_array(&forbidden_substances),
        num_forbidden = inputs.num_forbidden,
        claim_type_hash = bytes_to_toml_array(&inputs.claim_type_hash),
        claim_hash = bytes_to_toml_array(&inputs.claim_hash),
        merkle_path = path,
        merkle_indices = indices,
        tree_depth = inputs.tree_depth
    ))
}

fn bytes_to_toml_array(bytes: &[u8; 32]) -> String {
    let values = bytes.iter().map(|b| b.to_string()).collect::<Vec<_>>().join(", ");
    format!("[{}]", values)
}

fn nested_bytes_to_toml_array(values: &Vec<[u8; 32]>) -> String {
    let inner = values
        .iter()
        .map(|v| bytes_to_toml_array(v))
        .collect::<Vec<_>>()
        .join(", ");
    format!("[{}]", inner)
}

fn u1_array_to_toml(values: &Vec<u8>) -> String {
    let inner = values.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(", ");
    format!("[{}]", inner)
}

fn pad_merkle_path(path: &Vec<[u8; 32]>, depth: usize) -> Result<String> {
    if path.len() > depth {
        return Err(anyhow!("Merkle path length {} exceeds depth {}", path.len(), depth));
    }
    let mut padded = path.clone();
    while padded.len() < depth {
        padded.push([0u8; 32]);
    }
    Ok(nested_bytes_to_toml_array(&padded))
}

fn pad_merkle_indices(indices: &Vec<u8>, depth: usize) -> Result<String> {
    if indices.len() > depth {
        return Err(anyhow!("Merkle indices length {} exceeds depth {}", indices.len(), depth));
    }
    let mut padded = indices.clone();
    while padded.len() < depth {
        padded.push(0);
    }
    Ok(u1_array_to_toml(&padded))
}

fn pad_substances(values: &Vec<[u8; 32]>, max: usize) -> Result<Vec<[u8; 32]>> {
    if values.len() > max {
        return Err(anyhow!("Substance list length {} exceeds {}", values.len(), max));
    }
    let mut padded = values.clone();
    while padded.len() < max {
        padded.push([0u8; 32]);
    }
    Ok(padded)
}

fn ensure_compiled(nargo_bin: &str, circuit_dir: &Path) -> Result<()> {
    let package_name = circuit_dir.file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| anyhow!("Invalid circuit directory name"))?;
    let artifact = circuit_dir.join("target").join(format!("{}.json", package_name));
    if artifact.exists() {
        return Ok(());
    }
    run_nargo(nargo_bin, circuit_dir, &["compile"]).context("Failed to compile Noir circuit")?;
    Ok(())
}

fn run_nargo(nargo_bin: &str, dir: &Path, args: &[&str]) -> Result<()> {
    let output = Command::new(nargo_bin)
        .current_dir(dir)
        .args(args)
        .output()
        .with_context(|| format!("Failed to run {} {:?}", nargo_bin, args))?;

    if !output.status.success() {
        return Err(anyhow!(
            "nargo {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}

fn resolve_circuits_dir() -> Result<PathBuf> {
    if let Ok(dir) = std::env::var("NOIR_CIRCUITS_DIR") {
        return Ok(PathBuf::from(dir));
    }

    let mut current = std::env::current_dir().context("Failed to get current dir")?;
    for _ in 0..6 {
        let candidate = current.join("circuits/noir/predicates");
        if candidate.exists() {
            return Ok(candidate);
        }
        if !current.pop() {
            break;
        }
    }

    Err(anyhow!("Noir circuits directory not found"))
}
