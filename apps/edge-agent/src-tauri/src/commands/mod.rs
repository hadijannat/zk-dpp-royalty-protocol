//! Tauri IPC commands for the Edge Agent
//!
//! These commands are called from the frontend via Tauri's invoke API.

use crate::ollama::OllamaClient;
use crate::storage::{Claim, Commitment, Evidence};
use crate::AppState;
use chrono::Utc;
use commitments::{hash_claim, MerkleTree};
use crypto::KeyPair;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

// ============================================================================
// Response types
// ============================================================================

#[derive(Debug, Serialize)]
pub struct CommandResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> CommandResponse<T> {
    pub fn ok(data: T) -> Self {
        CommandResponse {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(error: &str) -> Self {
        CommandResponse {
            success: false,
            data: None,
            error: Some(error.to_string()),
        }
    }
}

// ============================================================================
// Evidence commands
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct IngestDocumentInput {
    pub path: String,
    pub evidence_type: String,
}

#[tauri::command]
pub async fn ingest_document(
    input: IngestDocumentInput,
    state: State<'_, AppState>,
) -> Result<CommandResponse<Evidence>, String> {
    // Read file
    let content = match std::fs::read(&input.path) {
        Ok(c) => c,
        Err(e) => return Ok(CommandResponse::err(&format!("Failed to read file: {}", e))),
    };

    // Calculate content hash
    let content_hash = commitments::to_hex(&commitments::hash_bytes(&content));

    // Extract text (basic implementation - would use OCR for PDFs in production)
    let extracted_text = if input.path.ends_with(".txt") {
        String::from_utf8_lossy(&content).to_string()
    } else if input.path.ends_with(".pdf") {
        // Try to extract text from PDF
        match pdf_extract::extract_text(&input.path) {
            Ok(text) => text,
            Err(_) => String::new(),
        }
    } else {
        String::new()
    };

    // Get filename
    let filename = std::path::Path::new(&input.path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string());

    // Determine MIME type
    let mime_type = match input.path.split('.').last() {
        Some("pdf") => Some("application/pdf".to_string()),
        Some("txt") => Some("text/plain".to_string()),
        Some("json") => Some("application/json".to_string()),
        _ => None,
    };

    let evidence = Evidence {
        id: Uuid::new_v4().to_string(),
        evidence_type: input.evidence_type,
        original_filename: filename,
        mime_type,
        content_hash,
        extracted_text: if extracted_text.is_empty() {
            None
        } else {
            Some(extracted_text)
        },
        issuer_name: None,
        issuer_type: None,
        valid_from: None,
        valid_until: None,
        created_at: Utc::now(),
    };

    // Store in database
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.insert_evidence(&evidence, Some(&content))
        .map_err(|e| e.to_string())?;

    Ok(CommandResponse::ok(evidence))
}

#[tauri::command]
pub async fn list_evidence(
    state: State<'_, AppState>,
) -> Result<CommandResponse<Vec<Evidence>>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    match db.list_evidence() {
        Ok(evidence) => Ok(CommandResponse::ok(evidence)),
        Err(e) => Ok(CommandResponse::err(&e.to_string())),
    }
}

#[tauri::command]
pub async fn get_evidence(
    id: String,
    state: State<'_, AppState>,
) -> Result<CommandResponse<Option<Evidence>>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    match db.get_evidence(&id) {
        Ok(evidence) => Ok(CommandResponse::ok(evidence)),
        Err(e) => Ok(CommandResponse::err(&e.to_string())),
    }
}

#[tauri::command]
pub async fn delete_evidence(
    id: String,
    state: State<'_, AppState>,
) -> Result<CommandResponse<bool>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    match db.delete_evidence(&id) {
        Ok(deleted) => Ok(CommandResponse::ok(deleted)),
        Err(e) => Ok(CommandResponse::err(&e.to_string())),
    }
}

// ============================================================================
// Claim commands
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct ExtractClaimsInput {
    pub evidence_id: String,
    pub product_id: String,
}

#[tauri::command]
pub async fn extract_claims(
    input: ExtractClaimsInput,
    state: State<'_, AppState>,
) -> Result<CommandResponse<Vec<Claim>>, String> {
    // Get evidence
    let evidence = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        match db.get_evidence(&input.evidence_id) {
            Ok(Some(e)) => e,
            Ok(None) => return Ok(CommandResponse::err("Evidence not found")),
            Err(e) => return Ok(CommandResponse::err(&e.to_string())),
        }
    };

    let text = match &evidence.extracted_text {
        Some(t) if !t.is_empty() => t.clone(),
        _ => return Ok(CommandResponse::err("No text content in evidence")),
    };

    // Call Ollama for extraction (settings override env default)
    let (ollama_url, ollama_model) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let url = db.get_setting("ollama_url").ok().flatten().unwrap_or_else(|| state.ollama_base.clone());
        let model = db.get_setting("ollama_model").ok().flatten();
        (url, model)
    };

    let client = OllamaClient::new(&ollama_url, ollama_model.as_deref());
    let extraction = match client.extract_claims(&text).await {
        Ok(r) => r,
        Err(e) => return Ok(CommandResponse::err(&format!("AI extraction failed: {}", e))),
    };
    let model_name = ollama_model.unwrap_or_else(|| "phi3".to_string());

    // Convert to Claims
    let now = Utc::now();
    let claims: Vec<Claim> = extraction
        .claims
        .into_iter()
        .map(|ec| Claim {
            id: Uuid::new_v4().to_string(),
            claim_type: ec.claim_type,
            value: ec.value,
            unit: ec.unit,
            product_id: input.product_id.clone(),
            evidence_ids: vec![input.evidence_id.clone()],
            confidence: Some(ec.confidence),
            verified: false,
            metadata: serde_json::json!({
                "source_text": ec.source_text,
                "extraction_model": model_name
            }),
            created_at: now,
            updated_at: now,
        })
        .collect();

    // Store claims
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        for claim in &claims {
            if let Err(e) = db.insert_claim(claim) {
                return Ok(CommandResponse::err(&e.to_string()));
            }
        }
    }

    Ok(CommandResponse::ok(claims))
}

#[tauri::command]
pub async fn list_claims(
    product_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<CommandResponse<Vec<Claim>>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    match db.list_claims(product_id.as_deref()) {
        Ok(claims) => Ok(CommandResponse::ok(claims)),
        Err(e) => Ok(CommandResponse::err(&e.to_string())),
    }
}

#[tauri::command]
pub async fn get_claim(
    id: String,
    state: State<'_, AppState>,
) -> Result<CommandResponse<Option<Claim>>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    match db.get_claim(&id) {
        Ok(claim) => Ok(CommandResponse::ok(claim)),
        Err(e) => Ok(CommandResponse::err(&e.to_string())),
    }
}

#[tauri::command]
pub async fn update_claim(
    claim: Claim,
    state: State<'_, AppState>,
) -> Result<CommandResponse<bool>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    match db.update_claim(&claim) {
        Ok(updated) => Ok(CommandResponse::ok(updated)),
        Err(e) => Ok(CommandResponse::err(&e.to_string())),
    }
}

#[tauri::command]
pub async fn delete_claim(
    id: String,
    state: State<'_, AppState>,
) -> Result<CommandResponse<bool>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    match db.delete_claim(&id) {
        Ok(deleted) => Ok(CommandResponse::ok(deleted)),
        Err(e) => Ok(CommandResponse::err(&e.to_string())),
    }
}

#[tauri::command]
pub async fn verify_claim(
    id: String,
    verified: bool,
    state: State<'_, AppState>,
) -> Result<CommandResponse<bool>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Get existing claim
    let mut claim = match db.get_claim(&id) {
        Ok(Some(c)) => c,
        Ok(None) => return Ok(CommandResponse::err("Claim not found")),
        Err(e) => return Ok(CommandResponse::err(&e.to_string())),
    };

    claim.verified = verified;
    claim.updated_at = Utc::now();

    match db.update_claim(&claim) {
        Ok(updated) => Ok(CommandResponse::ok(updated)),
        Err(e) => Ok(CommandResponse::err(&e.to_string())),
    }
}

// ============================================================================
// Commitment commands
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct CreateCommitmentInput {
    pub claim_ids: Vec<String>,
    pub valid_days: Option<i64>,
}

#[tauri::command]
pub async fn create_commitment(
    input: CreateCommitmentInput,
    state: State<'_, AppState>,
) -> Result<CommandResponse<Commitment>, String> {
    if input.claim_ids.is_empty() {
        return Ok(CommandResponse::err("No claims specified"));
    }

    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Get keypair (or create one if none exists)
    let keypair = match db.get_active_keypair() {
        Ok(Some(kp)) => {
            let secret = crate::storage::decode_secret_key(&kp.secret_key_encrypted)
                .map_err(|e| e.to_string())?;
            KeyPair::from_bytes(&secret).map_err(|e| e.to_string())?
        }
        Ok(None) => {
            // Generate new keypair
            let kp = KeyPair::generate();
            let stored = crate::storage::StoredKeypair {
                id: Uuid::new_v4().to_string(),
                public_key: kp.public_key().key.clone(),
                secret_key_encrypted: crate::storage::encode_secret_key(&kp.secret_bytes())
                    .map_err(|e| e.to_string())?,
                created_at: Utc::now(),
                is_active: true,
            };
            db.insert_keypair(&stored).map_err(|e| e.to_string())?;
            kp
        }
        Err(e) => return Ok(CommandResponse::err(&e.to_string())),
    };

    // Load claims and compute hashes
    let mut claim_hashes = Vec::new();
    for claim_id in &input.claim_ids {
        let claim = match db.get_claim(claim_id) {
            Ok(Some(c)) => c,
            Ok(None) => return Ok(CommandResponse::err(&format!("Claim {} not found", claim_id))),
            Err(e) => return Ok(CommandResponse::err(&e.to_string())),
        };

        // Hash the claim
        let hash = compute_claim_hash(&claim)?;
        claim_hashes.push(hash);
    }

    // Build Merkle tree
    let tree = MerkleTree::build(claim_hashes).map_err(|e| e.to_string())?;
    let root = commitments::to_hex(&tree.root());

    // Sign the root
    let signature = keypair.sign_hex(tree.root().as_slice());

    let now = Utc::now();
    let valid_until = input
        .valid_days
        .map(|days| now + chrono::Duration::days(days));

    let commitment = Commitment {
        id: Uuid::new_v4().to_string(),
        root,
        claim_count: input.claim_ids.len(),
        claim_ids: input.claim_ids,
        public_key: keypair.public_key().key,
        signature,
        valid_from: Some(now),
        valid_until,
        revoked: false,
        revoked_at: None,
        revoked_reason: None,
        created_at: now,
    };

    db.insert_commitment(&commitment).map_err(|e| e.to_string())?;

    Ok(CommandResponse::ok(commitment))
}

#[tauri::command]
pub async fn list_commitments(
    state: State<'_, AppState>,
) -> Result<CommandResponse<Vec<Commitment>>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    match db.list_commitments() {
        Ok(commitments) => Ok(CommandResponse::ok(commitments)),
        Err(e) => Ok(CommandResponse::err(&e.to_string())),
    }
}

#[tauri::command]
pub async fn get_commitment(
    id: String,
    state: State<'_, AppState>,
) -> Result<CommandResponse<Option<Commitment>>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    match db.get_commitment(&id) {
        Ok(commitment) => Ok(CommandResponse::ok(commitment)),
        Err(e) => Ok(CommandResponse::err(&e.to_string())),
    }
}

#[tauri::command]
pub async fn revoke_commitment(
    id: String,
    reason: String,
    state: State<'_, AppState>,
) -> Result<CommandResponse<bool>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    match db.revoke_commitment(&id, &reason) {
        Ok(revoked) => Ok(CommandResponse::ok(revoked)),
        Err(e) => Ok(CommandResponse::err(&e.to_string())),
    }
}

// ============================================================================
// Proof commands
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct GenerateProofInput {
    pub commitment_id: String,
    pub predicate_id: String,
    pub claim_index: usize,
    pub threshold: Option<u32>,
    pub timestamp: Option<u64>,
    pub extra: Option<serde_json::Value>,
    #[serde(alias = "product_binding", alias = "productBinding")]
    pub product_id: String,
    #[serde(alias = "requester_binding", alias = "requesterBinding")]
    pub requester_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PredicateId {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicInputs {
    pub threshold: Option<u32>,
    pub commitment_root: String,
    pub product_binding: String,
    pub requester_binding: String,
    pub timestamp: Option<u64>,
    pub extra: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProofContext {
    pub supplier_id: Option<String>,
    pub requester_id: Option<String>,
    pub product_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProofPackage {
    pub predicate_id: PredicateId,
    pub proof: String,
    pub public_inputs: PublicInputs,
    pub nonce: String,
    pub generated_at: i64,
    pub context: ProofContext,
}

fn is_hex_32(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|c| matches!(c, '0'..='9' | 'a'..='f' | 'A'..='F'))
}

fn hash_binding(prefix: &str, value: &str) -> String {
    let payload = format!("{}:{}", prefix, value);
    commitments::to_hex(&commitments::hash_bytes(payload.as_bytes()))
}

fn normalize_binding(prefix: &str, value: &str) -> String {
    if is_hex_32(value) {
        value.to_lowercase()
    } else {
        hash_binding(prefix, value)
    }
}

fn hex_to_bytes32(value: &str) -> Result<[u8; 32], String> {
    commitments::from_hex(value).map_err(|e| format!("Invalid hex: {}", e))
}

fn parse_u32_value(value: &serde_json::Value) -> Result<u32, String> {
    if let Some(n) = value.as_u64() {
        return u32::try_from(n).map_err(|_| "Value out of range".to_string());
    }
    if let Some(n) = value.as_f64() {
        if n.fract() == 0.0 {
            return u32::try_from(n as u64).map_err(|_| "Value out of range".to_string());
        }
    }
    if let Some(s) = value.as_str() {
        return s.parse::<u32>().map_err(|_| "Invalid numeric string".to_string());
    }
    Err("Claim value is not a number".to_string())
}

fn parse_scaled_u32_value(value: &serde_json::Value, scale: u32) -> Result<u32, String> {
    if let Some(n) = value.as_f64() {
        let scaled = n * scale as f64;
        if scaled.is_finite() && scaled >= 0.0 {
            let rounded = scaled.round();
            if (scaled - rounded).abs() <= 1e-6 {
                return u32::try_from(rounded as u64).map_err(|_| "Value out of range".to_string());
            }
        }
        return Err("Value has too many decimals".to_string());
    }

    parse_u32_value(value).map(|v| v * scale)
}

fn parse_u64_timestamp(value: &serde_json::Value) -> Result<u64, String> {
    if let Some(n) = value.as_u64() {
        return Ok(n);
    }
    if let Some(s) = value.as_str() {
        if let Ok(ts) = s.parse::<u64>() {
            return Ok(ts);
        }
        if let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(s) {
            return Ok(parsed.timestamp() as u64);
        }
    }
    Err("Invalid timestamp value".to_string())
}

fn extract_cert_window(value: &serde_json::Value) -> Result<(u64, u64), String> {
    let obj = value.as_object().ok_or_else(|| "Certificate claim must be an object".to_string())?;

    let valid_from = obj.get("valid_from")
        .or_else(|| obj.get("validFrom"))
        .or_else(|| obj.get("not_before"))
        .or_else(|| obj.get("notBefore"))
        .ok_or_else(|| "Missing valid_from".to_string())?;

    let valid_until = obj.get("valid_until")
        .or_else(|| obj.get("validUntil"))
        .or_else(|| obj.get("expires_at"))
        .or_else(|| obj.get("expiresAt"))
        .or_else(|| obj.get("not_after"))
        .or_else(|| obj.get("notAfter"))
        .ok_or_else(|| "Missing valid_until".to_string())?;

    Ok((parse_u64_timestamp(valid_from)?, parse_u64_timestamp(valid_until)?))
}

fn parse_string_list(value: &serde_json::Value) -> Result<Vec<String>, String> {
    let arr = value.as_array().ok_or_else(|| "Expected array".to_string())?;
    let mut out = Vec::new();
    for item in arr {
        if let Some(s) = item.as_str() {
            out.push(s.to_string());
        } else {
            return Err("Array items must be strings".to_string());
        }
    }
    Ok(out)
}

fn substance_id_from_str(value: &str) -> [u8; 32] {
    if value.len() == 64 && value.chars().all(|c| matches!(c, '0'..='9' | 'a'..='f' | 'A'..='F')) {
        return commitments::from_hex(&value.to_lowercase()).unwrap_or([0u8; 32]);
    }

    commitments::hash_bytes(value.as_bytes())
}

const DOMAIN_SUBSTANCE_PRODUCT: [u8; 4] = *b"SUBP";
const DOMAIN_SUBSTANCE_FORBIDDEN: [u8; 4] = *b"SUBF";
const CARBON_FOOTPRINT_SCALE: u32 = 100;

fn hash_claim_type(claim_type: &str) -> [u8; 32] {
    commitments::hash_bytes(claim_type.as_bytes())
}

fn hash_unit(unit: &str) -> [u8; 32] {
    commitments::hash_bytes(unit.as_bytes())
}

fn hash_claim_value(claim_type_hash: [u8; 32], value: u64, unit_hash: [u8; 32]) -> [u8; 32] {
    let mut data = [0u8; 72];
    data[..32].copy_from_slice(&claim_type_hash);
    data[32..40].copy_from_slice(&value.to_be_bytes());
    data[40..72].copy_from_slice(&unit_hash);

    commitments::hash_bytes(&data)
}

fn hash_claim_bytes(claim_type_hash: [u8; 32], value_hash: [u8; 32]) -> [u8; 32] {
    let mut data = [0u8; 64];
    data[..32].copy_from_slice(&claim_type_hash);
    data[32..64].copy_from_slice(&value_hash);
    commitments::hash_bytes(&data)
}

fn hash_cert_window(claim_type_hash: [u8; 32], valid_from: u64, valid_until: u64) -> [u8; 32] {
    let mut data = [0u8; 48];
    data[..32].copy_from_slice(&claim_type_hash);
    data[32..40].copy_from_slice(&valid_from.to_be_bytes());
    data[40..48].copy_from_slice(&valid_until.to_be_bytes());

    commitments::hash_bytes(&data)
}

fn hash_substance_list(
    domain: [u8; 4],
    claim_type_hash: [u8; 32],
    substances: &Vec<[u8; 32]>,
    count: u32,
) -> [u8; 32] {
    let mut seed = [0u8; 36];
    seed[..4].copy_from_slice(&domain);
    seed[4..36].copy_from_slice(&claim_type_hash);

    let mut current_hash: [u8; 32] = commitments::hash_bytes(&seed);
    let mut combined = [0u8; 64];

    for i in 0..substances.len() {
        if (i as u32) < count {
            combined[..32].copy_from_slice(&current_hash);
            combined[32..64].copy_from_slice(&substances[i]);
            current_hash = commitments::hash_bytes(&combined);
        }
    }

    current_hash
}

fn compute_claim_hash(claim: &Claim) -> Result<[u8; 32], String> {
    match claim.claim_type.as_str() {
        "recycled_content" => {
            let actual_value = parse_u32_value(&claim.value)?;
            let claim_type_hash = hash_claim_type(&claim.claim_type);
            let unit_hash = hash_unit(&claim.unit);
            Ok(hash_claim_value(claim_type_hash, actual_value as u64, unit_hash))
        }
        "carbon_footprint" => {
            let actual_value = parse_scaled_u32_value(&claim.value, CARBON_FOOTPRINT_SCALE)?;
            let claim_type_hash = hash_claim_type(&claim.claim_type);
            let unit_hash = hash_unit(&claim.unit);
            Ok(hash_claim_value(claim_type_hash, actual_value as u64, unit_hash))
        }
        "certification" => {
            let (valid_from, valid_until) = extract_cert_window(&claim.value)?;
            let claim_type_hash = hash_claim_type(&claim.claim_type);
            Ok(hash_cert_window(claim_type_hash, valid_from, valid_until))
        }
        "substance_content" => {
            let claim_obj = claim.value.as_object().ok_or_else(|| "Substance claim must be object".to_string())?;
            let product_substances = claim_obj
                .get("substances")
                .ok_or_else(|| "Missing substances list".to_string())
                .and_then(parse_string_list)?;

            let product_substances_bytes: Vec<[u8; 32]> = product_substances.iter()
                .map(|s| substance_id_from_str(s))
                .collect();
            let count = product_substances_bytes.len() as u32;
            let claim_type_hash = hash_claim_type(&claim.claim_type);
            Ok(hash_substance_list(DOMAIN_SUBSTANCE_PRODUCT, claim_type_hash, &product_substances_bytes, count))
        }
        "battery_chemistry" | "cobalt_origin_country" => {
            let value = claim.value.as_str().ok_or_else(|| "Claim value must be string".to_string())?;
            let value_hash = substance_id_from_str(value);
            let claim_type_hash = hash_claim_type(&claim.claim_type);
            Ok(hash_claim_bytes(claim_type_hash, value_hash))
        }
        _ => hash_claim(claim).map_err(|e| e.to_string()),
    }
}

fn parse_predicate_id(canonical: &str) -> Result<PredicateId, String> {
    if let Some((name, version)) = canonical.split_once('@') {
        return Ok(PredicateId { name: name.to_string(), version: version.to_string() });
    }

    if let Some(idx) = canonical.rfind('_') {
        let name = &canonical[..idx];
        let version = &canonical[idx + 1..];
        if !name.is_empty() && !version.is_empty() {
            return Ok(PredicateId { name: name.to_string(), version: version.to_string() });
        }
    }

    Err("Predicate ID must include version (e.g., RECYCLED_CONTENT_GTE_V1)".to_string())
}

#[tauri::command]
pub async fn generate_proof(
    input: GenerateProofInput,
    state: State<'_, AppState>,
) -> Result<CommandResponse<ProofPackage>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Get commitment
    let commitment = match db.get_commitment(&input.commitment_id) {
        Ok(Some(c)) => c,
        Ok(None) => return Ok(CommandResponse::err("Commitment not found")),
        Err(e) => return Ok(CommandResponse::err(&e.to_string())),
    };

    if commitment.revoked {
        return Ok(CommandResponse::err("Commitment has been revoked"));
    }

    // Check validity period
    if let Some(valid_until) = commitment.valid_until {
        if Utc::now() > valid_until {
            return Ok(CommandResponse::err("Commitment has expired"));
        }
    }

    // Load claim for the proof
    if input.claim_index >= commitment.claim_ids.len() {
        return Ok(CommandResponse::err("Invalid claim index"));
    }

    let claim_id = &commitment.claim_ids[input.claim_index];
    let claim = match db.get_claim(claim_id) {
        Ok(Some(c)) => c,
        Ok(None) => return Ok(CommandResponse::err("Claim not found")),
        Err(e) => return Ok(CommandResponse::err(&e.to_string())),
    };

    // Generate nonce (hex, 16 bytes)
    let nonce = hex::encode(uuid::Uuid::new_v4().as_bytes());

    // Normalize bindings (hash raw IDs if needed)
    let product_binding = normalize_binding("product", &input.product_id);
    let requester_binding = normalize_binding("requester", &input.requester_id);

    let predicate_id = parse_predicate_id(&input.predicate_id)?;
    let supplier_id = db.get_setting("supplier_id").ok().flatten();

    // Build Merkle proof for the selected claim
    let mut claim_hashes = Vec::new();
    for id in &commitment.claim_ids {
        let c = match db.get_claim(id) {
            Ok(Some(claim)) => claim,
            Ok(None) => return Ok(CommandResponse::err("Claim not found in commitment")),
            Err(e) => return Ok(CommandResponse::err(&e.to_string())),
        };
        let hash = compute_claim_hash(&c)?;
        claim_hashes.push(hash);
    }

    let tree = MerkleTree::build(claim_hashes).map_err(|e| e.to_string())?;
    let proof = tree.prove(input.claim_index);

    // Predicate-specific proof generation (Noir CLI)
    let mut timestamp_override: Option<u64> = None;
    let mut extra_override: Option<serde_json::Value> = input.extra.clone();

    let proof_hex = match (predicate_id.name.as_str(), predicate_id.version.as_str()) {
        ("RECYCLED_CONTENT_GTE", "V1") => {
            let threshold = input.threshold.ok_or_else(|| "Threshold required for RECYCLED_CONTENT_GTE_V1")?;
            let actual_value = parse_u32_value(&claim.value)?;
            if claim.claim_type != "recycled_content" {
                return Ok(CommandResponse::err("Claim type mismatch for RECYCLED_CONTENT_GTE_V1"));
            }

            let commitment_root = hex_to_bytes32(&commitment.root)?;
            let product_binding_bytes = hex_to_bytes32(&product_binding)?;
            let requester_binding_bytes = hex_to_bytes32(&requester_binding)?;

            let claim_type_hash = hash_claim_type(&claim.claim_type);
            let unit_hash = hash_unit(&claim.unit);

            let config = crate::zk::NoirCliConfig::from_env()
                .map_err(|e| format!("Noir CLI config error: {}", e))?;

            let tree_depth = proof.path.len() as u32;

            crate::zk::prove_recycled_content_gte(
                &config,
                crate::zk::RecycledContentInputs {
                    threshold,
                    commitment_root,
                    product_binding: product_binding_bytes,
                    requester_binding: requester_binding_bytes,
                    actual_value,
                    claim_type_hash,
                    unit_hash,
                    claim_hash: proof.leaf,
                    merkle_path: proof.path,
                    merkle_indices: proof.indices,
                    tree_depth,
                },
            )
            .map_err(|e| format!("Proof generation failed: {}", e))?
        }
        ("CARBON_FOOTPRINT_LTE", "V1") => {
            let threshold = input.threshold.ok_or_else(|| "Threshold required for CARBON_FOOTPRINT_LTE_V1")?;
            let actual_value = parse_scaled_u32_value(&claim.value, CARBON_FOOTPRINT_SCALE)?;
            if claim.claim_type != "carbon_footprint" {
                return Ok(CommandResponse::err("Claim type mismatch for CARBON_FOOTPRINT_LTE_V1"));
            }

            let commitment_root = hex_to_bytes32(&commitment.root)?;
            let product_binding_bytes = hex_to_bytes32(&product_binding)?;
            let requester_binding_bytes = hex_to_bytes32(&requester_binding)?;

            let claim_type_hash = hash_claim_type(&claim.claim_type);
            let unit_hash = hash_unit(&claim.unit);

            let config = crate::zk::NoirCliConfig::from_env()
                .map_err(|e| format!("Noir CLI config error: {}", e))?;

            let tree_depth = proof.path.len() as u32;

            crate::zk::prove_carbon_footprint_lte(
                &config,
                crate::zk::CarbonFootprintInputs {
                    threshold,
                    commitment_root,
                    product_binding: product_binding_bytes,
                    requester_binding: requester_binding_bytes,
                    actual_value,
                    claim_type_hash,
                    unit_hash,
                    claim_hash: proof.leaf,
                    merkle_path: proof.path,
                    merkle_indices: proof.indices,
                    tree_depth,
                },
            )
            .map_err(|e| format!("Proof generation failed: {}", e))?
        }
        ("CERT_VALID", "V1") => {
            if claim.claim_type != "certification" {
                return Ok(CommandResponse::err("Claim type mismatch for CERT_VALID_V1"));
            }

            let (valid_from, valid_until) = extract_cert_window(&claim.value)?;
            let check_timestamp = input.timestamp
                .or_else(|| {
                    input.extra.as_ref()
                        .and_then(|v| v.get("check_timestamp").or_else(|| v.get("checkTimestamp")))
                        .and_then(|v| parse_u64_timestamp(v).ok())
                })
                .unwrap_or_else(|| Utc::now().timestamp() as u64);
            timestamp_override = Some(check_timestamp);

            let commitment_root = hex_to_bytes32(&commitment.root)?;
            let product_binding_bytes = hex_to_bytes32(&product_binding)?;
            let requester_binding_bytes = hex_to_bytes32(&requester_binding)?;

            let claim_type_hash = hash_claim_type(&claim.claim_type);

            let config = crate::zk::NoirCliConfig::from_env()
                .map_err(|e| format!("Noir CLI config error: {}", e))?;

            let tree_depth = proof.path.len() as u32;

            crate::zk::prove_cert_valid(
                &config,
                crate::zk::CertValidInputs {
                    check_timestamp,
                    commitment_root,
                    product_binding: product_binding_bytes,
                    requester_binding: requester_binding_bytes,
                    valid_from,
                    valid_until,
                    claim_type_hash,
                    claim_hash: proof.leaf,
                    merkle_path: proof.path,
                    merkle_indices: proof.indices,
                    tree_depth,
                },
            )
            .map_err(|e| format!("Proof generation failed: {}", e))?
        }
        ("SUBSTANCE_NOT_IN_LIST", "V1") => {
            if claim.claim_type != "substance_content" {
                return Ok(CommandResponse::err("Claim type mismatch for SUBSTANCE_NOT_IN_LIST_V1"));
            }

            let claim_obj = claim.value.as_object().ok_or_else(|| "Substance claim must be object".to_string())?;
            let product_substances = claim_obj.get("substances")
                .ok_or_else(|| "Missing substances list".to_string())
                .and_then(parse_string_list)?;

            let forbidden_value = input.extra.as_ref()
                .and_then(|v| v.get("forbidden_substances").or_else(|| v.get("forbiddenSubstances")));
            let forbidden_substances_list = forbidden_value
                .ok_or_else(|| "Missing forbidden_substances in extra".to_string())
                .and_then(parse_string_list)?;

            let product_substances_bytes: Vec<[u8; 32]> = product_substances.iter().map(|s| substance_id_from_str(s)).collect();
            let forbidden_substances_bytes: Vec<[u8; 32]> = forbidden_substances_list.iter().map(|s| substance_id_from_str(s)).collect();

            let num_substances = product_substances_bytes.len() as u32;
            let num_forbidden = forbidden_substances_bytes.len() as u32;

            let claim_type_hash = hash_claim_type(&claim.claim_type);
            let forbidden_list_hash = hash_substance_list(DOMAIN_SUBSTANCE_FORBIDDEN, claim_type_hash, &forbidden_substances_bytes, num_forbidden);

            let commitment_root = hex_to_bytes32(&commitment.root)?;
            let product_binding_bytes = hex_to_bytes32(&product_binding)?;
            let requester_binding_bytes = hex_to_bytes32(&requester_binding)?;

            let config = crate::zk::NoirCliConfig::from_env()
                .map_err(|e| format!("Noir CLI config error: {}", e))?;

            let tree_depth = proof.path.len() as u32;

            let proof_hex = crate::zk::prove_substance_not_in_list(
                &config,
                crate::zk::SubstanceNotInListInputs {
                    forbidden_list_hash,
                    commitment_root,
                    product_binding: product_binding_bytes,
                    requester_binding: requester_binding_bytes,
                    product_substances: product_substances_bytes,
                    num_substances,
                    forbidden_substances: forbidden_substances_bytes,
                    num_forbidden,
                    claim_type_hash,
                    claim_hash: proof.leaf,
                    merkle_path: proof.path,
                    merkle_indices: proof.indices,
                    tree_depth,
                },
            )
            .map_err(|e| format!("Proof generation failed: {}", e))?;

            let mut extra = input.extra.clone().unwrap_or_else(|| serde_json::json!({}));
            if let Some(obj) = extra.as_object_mut() {
                obj.insert(
                    "forbiddenListHash".to_string(),
                    serde_json::Value::String(commitments::to_hex(&forbidden_list_hash)),
                );
            }
            // Persist extra update for packaging
            extra_override = Some(extra);
        }
        _ => {
            return Ok(CommandResponse::err("Predicate not supported by prover yet"));
        }
    };

    let proof_package = ProofPackage {
        predicate_id,
        proof: proof_hex,
        public_inputs: PublicInputs {
            threshold: input.threshold,
            commitment_root: commitment.root,
            product_binding: product_binding.clone(),
            requester_binding: requester_binding.clone(),
            timestamp: timestamp_override.or(input.timestamp),
            extra: extra_override,
        },
        nonce,
        generated_at: Utc::now().timestamp_millis(),
        context: ProofContext {
            supplier_id,
            requester_id: Some(input.requester_id),
            product_id: Some(input.product_id),
        },
    };

    Ok(CommandResponse::ok(proof_package))
}

// ============================================================================
// Key management commands
// ============================================================================

#[derive(Debug, Serialize)]
pub struct KeypairInfo {
    pub id: String,
    pub public_key: String,
    pub created_at: String,
}

#[tauri::command]
pub async fn get_keypair(
    state: State<'_, AppState>,
) -> Result<CommandResponse<Option<KeypairInfo>>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    match db.get_active_keypair() {
        Ok(Some(kp)) => Ok(CommandResponse::ok(Some(KeypairInfo {
            id: kp.id,
            public_key: kp.public_key,
            created_at: kp.created_at.to_rfc3339(),
        }))),
        Ok(None) => Ok(CommandResponse::ok(None)),
        Err(e) => Ok(CommandResponse::err(&e.to_string())),
    }
}

#[tauri::command]
pub async fn generate_new_keypair(
    state: State<'_, AppState>,
) -> Result<CommandResponse<KeypairInfo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let kp = KeyPair::generate();
    let now = Utc::now();

    let stored = crate::storage::StoredKeypair {
        id: Uuid::new_v4().to_string(),
        public_key: kp.public_key().key.clone(),
        secret_key_encrypted: crate::storage::encode_secret_key(&kp.secret_bytes())
            .map_err(|e| e.to_string())?,
        created_at: now,
        is_active: true,
    };

    db.insert_keypair(&stored).map_err(|e| e.to_string())?;

    Ok(CommandResponse::ok(KeypairInfo {
        id: stored.id,
        public_key: stored.public_key,
        created_at: now.to_rfc3339(),
    }))
}

// ============================================================================
// Settings commands
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct AppSettings {
    pub supplier_id: Option<String>,
    pub supplier_name: Option<String>,
    pub ollama_url: Option<String>,
    pub ollama_model: Option<String>,
}

#[tauri::command]
pub async fn get_settings(
    state: State<'_, AppState>,
) -> Result<CommandResponse<AppSettings>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let settings = AppSettings {
        supplier_id: db.get_setting("supplier_id").ok().flatten(),
        supplier_name: db.get_setting("supplier_name").ok().flatten(),
        ollama_url: db.get_setting("ollama_url").ok().flatten(),
        ollama_model: db.get_setting("ollama_model").ok().flatten(),
    };

    Ok(CommandResponse::ok(settings))
}

#[tauri::command]
pub async fn update_settings(
    settings: AppSettings,
    state: State<'_, AppState>,
) -> Result<CommandResponse<bool>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    if let Some(v) = settings.supplier_id {
        db.set_setting("supplier_id", &v).map_err(|e| e.to_string())?;
    }
    if let Some(v) = settings.supplier_name {
        db.set_setting("supplier_name", &v).map_err(|e| e.to_string())?;
    }
    if let Some(v) = settings.ollama_url {
        db.set_setting("ollama_url", &v).map_err(|e| e.to_string())?;
    }
    if let Some(v) = settings.ollama_model {
        db.set_setting("ollama_model", &v).map_err(|e| e.to_string())?;
    }

    Ok(CommandResponse::ok(true))
}
