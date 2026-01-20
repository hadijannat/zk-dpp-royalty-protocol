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

    // Call Ollama for extraction
    let client = OllamaClient::new(&state.ollama_base, None);
    let extraction = match client.extract_claims(&text).await {
        Ok(r) => r,
        Err(e) => return Ok(CommandResponse::err(&format!("AI extraction failed: {}", e))),
    };

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
                "extraction_model": "phi3"
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
            // Decrypt and restore keypair (simplified - in production use proper encryption)
            KeyPair::from_hex(&kp.secret_key_encrypted).map_err(|e| e.to_string())?
        }
        Ok(None) => {
            // Generate new keypair
            let kp = KeyPair::generate();
            let stored = crate::storage::StoredKeypair {
                id: Uuid::new_v4().to_string(),
                public_key: kp.public_key().key.clone(),
                secret_key_encrypted: hex::encode(kp.secret_bytes()),
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
        let hash = hash_claim(&claim).map_err(|e| e.to_string())?;
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
    pub product_binding: String,
    pub requester_binding: String,
}

#[derive(Debug, Serialize)]
pub struct ProofPackage {
    pub predicate_id: String,
    pub proof: String,
    pub public_inputs: serde_json::Value,
    pub nonce: String,
    pub generated_at: i64,
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

    let _claim_id = &commitment.claim_ids[input.claim_index];

    // Generate nonce
    let nonce = hex::encode(uuid::Uuid::new_v4().as_bytes());

    // In production, this would:
    // 1. Load the claim and compute witness
    // 2. Call Noir prover to generate actual ZK proof
    // 3. Package with public inputs
    //
    // For MVP, we return a placeholder proof structure
    let proof_package = ProofPackage {
        predicate_id: input.predicate_id.clone(),
        proof: hex::encode([0u8; 64]), // Placeholder
        public_inputs: serde_json::json!({
            "threshold": input.threshold,
            "commitment_root": commitment.root,
            "product_binding": input.product_binding,
            "requester_binding": input.requester_binding
        }),
        nonce,
        generated_at: Utc::now().timestamp(),
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
        secret_key_encrypted: hex::encode(kp.secret_bytes()),
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
