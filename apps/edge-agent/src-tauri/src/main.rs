// ZK-DPP Edge Agent - Main Entry Point
//
// Tauri desktop application for suppliers to:
// - Ingest documents and extract claims using AI
// - Create cryptographic commitments
// - Generate zero-knowledge proofs

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;
mod ollama;
mod storage;

use storage::Database;
use std::sync::Mutex;

/// Application state shared across commands
pub struct AppState {
    db: Mutex<Database>,
    ollama_base: String,
}

fn main() {
    // Initialize database
    let db = Database::new().expect("Failed to initialize database");

    // Get Ollama base URL from environment or default
    let ollama_base = std::env::var("OLLAMA_BASE_URL")
        .unwrap_or_else(|_| "http://localhost:11434".to_string());

    let state = AppState {
        db: Mutex::new(db),
        ollama_base,
    };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            // Evidence commands
            commands::ingest_document,
            commands::list_evidence,
            commands::get_evidence,
            commands::delete_evidence,
            // Claim commands
            commands::extract_claims,
            commands::list_claims,
            commands::get_claim,
            commands::update_claim,
            commands::delete_claim,
            commands::verify_claim,
            // Commitment commands
            commands::create_commitment,
            commands::list_commitments,
            commands::get_commitment,
            commands::revoke_commitment,
            // Proof commands
            commands::generate_proof,
            // Key management
            commands::get_keypair,
            commands::generate_new_keypair,
            // Settings
            commands::get_settings,
            commands::update_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
