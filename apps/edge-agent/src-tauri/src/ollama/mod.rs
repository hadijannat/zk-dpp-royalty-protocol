//! Ollama client for AI-powered claim extraction
//!
//! Uses local Ollama instance with Phi-3 or Llama-3 models
//! to extract structured claim data from document text.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

/// Ollama API client
pub struct OllamaClient {
    base_url: String,
    client: reqwest::Client,
    model: String,
}

#[derive(Debug, Serialize)]
struct GenerateRequest {
    model: String,
    prompt: String,
    stream: bool,
    format: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GenerateResponse {
    response: String,
}

/// Extracted claim from AI
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedClaim {
    pub claim_type: String,
    pub value: serde_json::Value,
    pub unit: String,
    pub confidence: f64,
    pub source_text: Option<String>,
}

/// Extraction result from Ollama
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractionResult {
    pub claims: Vec<ExtractedClaim>,
    pub raw_response: String,
}

impl OllamaClient {
    pub fn new(base_url: &str, model: Option<&str>) -> Self {
        OllamaClient {
            base_url: base_url.trim_end_matches('/').to_string(),
            client: reqwest::Client::new(),
            model: model.unwrap_or("phi3").to_string(),
        }
    }

    /// Extracts claims from document text
    pub async fn extract_claims(&self, document_text: &str) -> Result<ExtractionResult> {
        let prompt = format!(
            r#"You are a data extraction assistant for Digital Product Passports. Extract structured claims from the following document.

For each claim found, extract:
- claim_type: One of: recycled_content, carbon_footprint, certification, substance_content, origin, manufacturing_date, battery_capacity, battery_chemistry
- value: The numeric value or string value
- unit: The unit of measurement (e.g., "percent", "kg_co2e", "date", "kwh")
- confidence: Your confidence in the extraction (0.0 to 1.0)
- source_text: The exact text from the document that supports this claim

Respond ONLY with valid JSON in this format:
{{
  "claims": [
    {{
      "claim_type": "recycled_content",
      "value": 25,
      "unit": "percent",
      "confidence": 0.95,
      "source_text": "Contains 25% recycled materials"
    }}
  ]
}}

Document text:
---
{document_text}
---

Extract all compliance-relevant claims from this document:"#
        );

        let response = self.generate(&prompt).await?;

        // Try to parse the JSON response
        let claims = match serde_json::from_str::<ExtractionResult>(&response) {
            Ok(result) => result.claims,
            Err(_) => {
                // Try to extract JSON from the response
                if let Some(json_start) = response.find('{') {
                    if let Some(json_end) = response.rfind('}') {
                        let json_str = &response[json_start..=json_end];
                        match serde_json::from_str::<ExtractionResult>(json_str) {
                            Ok(result) => result.claims,
                            Err(_) => vec![],
                        }
                    } else {
                        vec![]
                    }
                } else {
                    vec![]
                }
            }
        };

        Ok(ExtractionResult {
            claims,
            raw_response: response,
        })
    }

    /// Sends a generate request to Ollama
    async fn generate(&self, prompt: &str) -> Result<String> {
        let url = format!("{}/api/generate", self.base_url);

        let request = GenerateRequest {
            model: self.model.clone(),
            prompt: prompt.to_string(),
            stream: false,
            format: Some("json".to_string()),
        };

        let response = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await
            .context("Failed to send request to Ollama")?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            anyhow::bail!("Ollama returned error {}: {}", status, text);
        }

        let result: GenerateResponse = response
            .json()
            .await
            .context("Failed to parse Ollama response")?;

        Ok(result.response)
    }

    /// Checks if Ollama is available
    pub async fn health_check(&self) -> Result<bool> {
        let url = format!("{}/api/tags", self.base_url);

        match self.client.get(&url).send().await {
            Ok(response) => Ok(response.status().is_success()),
            Err(_) => Ok(false),
        }
    }

    /// Lists available models
    pub async fn list_models(&self) -> Result<Vec<String>> {
        let url = format!("{}/api/tags", self.base_url);

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .context("Failed to connect to Ollama")?;

        #[derive(Deserialize)]
        struct TagsResponse {
            models: Vec<ModelInfo>,
        }

        #[derive(Deserialize)]
        struct ModelInfo {
            name: String,
        }

        let result: TagsResponse = response
            .json()
            .await
            .context("Failed to parse Ollama models response")?;

        Ok(result.models.into_iter().map(|m| m.name).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extraction_result_parsing() {
        let json = r#"{"claims": [{"claim_type": "recycled_content", "value": 25, "unit": "percent", "confidence": 0.95, "source_text": "25% recycled"}]}"#;
        let result: ExtractionResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.claims.len(), 1);
        assert_eq!(result.claims[0].claim_type, "recycled_content");
    }
}
