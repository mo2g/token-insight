use std::{
    collections::HashMap,
    path::PathBuf,
    sync::Arc,
    time::{Duration, SystemTime},
};

use anyhow::{Context, Result};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use tokio::{fs, sync::RwLock};

use crate::domain::UsageEvent;

const BUILTIN_PRICING: &str = include_str!("../assets/pricing-snapshot.json");
const REMOTE_LITELLM_URL: &str =
    "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const CRITICAL_CACHE_MODELS: [&str; 4] = ["gpt-5", "gpt-5.2-codex", "gpt-5.3-codex", "gpt-5.4"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PricingRecord {
    pub model: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    pub provider: Option<String>,
    pub input_per_million: f64,
    pub output_per_million: f64,
    pub cache_read_per_million: Option<f64>,
    pub cache_write_per_million: Option<f64>,
    pub reasoning_per_million: Option<f64>,
    #[serde(default)]
    pub input_per_million_above_200k: Option<f64>,
    #[serde(default)]
    pub output_per_million_above_200k: Option<f64>,
    #[serde(default)]
    pub cache_read_per_million_above_200k: Option<f64>,
    #[serde(default)]
    pub cache_write_per_million_above_200k: Option<f64>,
}

#[derive(Debug, Clone)]
pub struct PricingService {
    inner: Arc<RwLock<HashMap<String, PricingRecord>>>,
    cache_path: PathBuf,
    client: reqwest::Client,
}

impl PricingService {
    pub async fn new() -> Result<Self> {
        let cache_dir = cache_dir()?;
        fs::create_dir_all(&cache_dir).await?;
        let service = Self {
            inner: Arc::new(RwLock::new(load_builtins()?)),
            cache_path: cache_dir.join("pricing-cache.json"),
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(8))
                .build()?,
        };
        service.load_cached().await?;
        Ok(service)
    }

    async fn load_cached(&self) -> Result<()> {
        let cache = match fs::read(&self.cache_path).await {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(error.into()),
        };
        let records: Vec<PricingRecord> = serde_json::from_slice(&cache)?;
        let mut inner = self.inner.write().await;
        for record in records {
            insert_record(&mut inner, record);
        }
        Ok(())
    }

    pub async fn maybe_refresh_remote(&self) -> bool {
        let ttl_expired = match fs::metadata(&self.cache_path).await {
            Ok(metadata) => metadata
                .modified()
                .ok()
                .and_then(|value| SystemTime::now().duration_since(value).ok())
                .map(|age| age > Duration::from_secs(3600))
                .unwrap_or(true),
            Err(_) => true,
        };
        let integrity_refresh_needed = self.integrity_refresh_needed().await;
        let should_refresh = ttl_expired || integrity_refresh_needed;

        if !should_refresh {
            return false;
        }

        if let Ok(records) = self.fetch_remote().await {
            let mut inner = self.inner.write().await;
            for record in &records {
                insert_record(&mut inner, record.clone());
            }
            let _ = fs::write(
                &self.cache_path,
                serde_json::to_vec_pretty(&records).unwrap_or_default(),
            )
            .await;
            return true;
        }
        false
    }

    async fn integrity_refresh_needed(&self) -> bool {
        let inner = self.inner.read().await;
        for model in CRITICAL_CACHE_MODELS {
            let key = normalize_model(model);
            match inner.get(&key) {
                Some(record) if record.cache_read_per_million.is_some() => {}
                _ => return true,
            }
        }
        false
    }

    async fn fetch_remote(&self) -> Result<Vec<PricingRecord>> {
        let payload = self
            .client
            .get(REMOTE_LITELLM_URL)
            .send()
            .await?
            .error_for_status()?
            .json::<serde_json::Value>()
            .await?;

        let mut records = Vec::new();
        if let Some(map) = payload.as_object() {
            for (model, value) in map {
                if model.contains('/') {
                    continue;
                }
                let input = value
                    .get("input_cost_per_token")
                    .and_then(|value| value.as_f64())
                    .unwrap_or_default()
                    * 1_000_000.0;
                let output = value
                    .get("output_cost_per_token")
                    .and_then(|value| value.as_f64())
                    .unwrap_or_default()
                    * 1_000_000.0;
                if input <= 0.0 && output <= 0.0 {
                    continue;
                }
                records.push(PricingRecord {
                    model: model.clone(),
                    aliases: vec![normalize_model(model)],
                    provider: value
                        .get("litellm_provider")
                        .and_then(|value| value.as_str())
                        .map(str::to_string),
                    input_per_million: input,
                    output_per_million: output,
                    cache_read_per_million: value
                        .get("cache_read_input_token_cost")
                        .and_then(|value| value.as_f64())
                        .map(|value| value * 1_000_000.0),
                    cache_write_per_million: value
                        .get("cache_creation_input_token_cost")
                        .and_then(|value| value.as_f64())
                        .map(|value| value * 1_000_000.0),
                    reasoning_per_million: None,
                    input_per_million_above_200k: value
                        .get("input_cost_per_token_above_200k_tokens")
                        .and_then(|value| value.as_f64())
                        .map(|value| value * 1_000_000.0),
                    output_per_million_above_200k: value
                        .get("output_cost_per_token_above_200k_tokens")
                        .and_then(|value| value.as_f64())
                        .map(|value| value * 1_000_000.0),
                    cache_read_per_million_above_200k: value
                        .get("cache_read_input_token_cost_above_200k_tokens")
                        .or_else(|| value.get("cache_read_input_token_cost_above_272k_tokens"))
                        .and_then(|value| value.as_f64())
                        .map(|value| value * 1_000_000.0),
                    cache_write_per_million_above_200k: value
                        .get("cache_creation_input_token_cost_above_200k_tokens")
                        .or_else(|| value.get("cache_creation_input_token_cost_above_272k_tokens"))
                        .and_then(|value| value.as_f64())
                        .map(|value| value * 1_000_000.0),
                });
            }
        }
        Ok(records)
    }

    pub async fn apply_pricing(&self, event: &mut UsageEvent) {
        let lookup_keys = build_lookup_keys(event.model.as_deref().unwrap_or_default());
        let inner = self.inner.read().await;
        for key in lookup_keys {
            if let Some(record) = inner.get(&key) {
                event.estimated_cost_usd = Some(compute_cost(event, record));
                if event.provider.is_none() {
                    event.provider = record.provider.clone();
                }
                if event.model_family.is_none() {
                    event.model_family = Some(derive_model_family(
                        event.model.as_deref().unwrap_or_default(),
                    ));
                }
                return;
            }
        }
        if event.model_family.is_none() {
            event.model_family = event
                .model
                .as_deref()
                .filter(|value| !value.is_empty())
                .map(derive_model_family);
        }
    }
}

pub fn derive_model_family(model: &str) -> String {
    let normalized = normalize_model(model);
    let parts: Vec<_> = normalized.split('-').collect();
    parts.into_iter().take(2).collect::<Vec<_>>().join("-")
}

pub fn normalize_model(model: &str) -> String {
    let mut normalized = model
        .trim()
        .split('/')
        .next_back()
        .unwrap_or_default()
        .replace(':', "-")
        .to_ascii_lowercase();
    for suffix in ["-xhigh", "-high", "-medium", "-low", "-latest"] {
        if let Some(stripped) = normalized.strip_suffix(suffix) {
            normalized = stripped.to_string();
        }
    }
    normalized
}

fn cache_dir() -> Result<PathBuf> {
    if let Ok(path) = std::env::var("TOKEN_INSIGHT_CACHE_DIR") {
        return Ok(PathBuf::from(path));
    }
    let dirs = ProjectDirs::from("dev", "mo2g", "token-insight")
        .context("unable to resolve cache directory")?;
    Ok(dirs.cache_dir().to_path_buf())
}

fn load_builtins() -> Result<HashMap<String, PricingRecord>> {
    let records: Vec<PricingRecord> = serde_json::from_str(BUILTIN_PRICING)?;
    let mut map = HashMap::new();
    for record in records {
        insert_record(&mut map, record);
    }
    Ok(map)
}

fn insert_record(map: &mut HashMap<String, PricingRecord>, record: PricingRecord) {
    let keys = std::iter::once(normalize_model(&record.model))
        .chain(record.aliases.iter().map(|item| normalize_model(item)));
    for key in keys {
        if key.is_empty() {
            continue;
        }
        if let Some(existing) = map.get(&key) {
            map.insert(key, merge_records(existing, &record));
        } else {
            map.insert(key, record.clone());
        }
    }
}

fn merge_records(existing: &PricingRecord, incoming: &PricingRecord) -> PricingRecord {
    let mut merged = incoming.clone();
    if merged.model.trim().is_empty() {
        merged.model = existing.model.clone();
    }
    if merged.aliases.is_empty() {
        merged.aliases = existing.aliases.clone();
    } else {
        for alias in &existing.aliases {
            if !merged.aliases.contains(alias) {
                merged.aliases.push(alias.clone());
            }
        }
    }
    if merged.provider.is_none() {
        merged.provider = existing.provider.clone();
    }
    if merged.input_per_million <= 0.0 {
        merged.input_per_million = existing.input_per_million;
    }
    if merged.output_per_million <= 0.0 {
        merged.output_per_million = existing.output_per_million;
    }
    if merged.cache_read_per_million.is_none() {
        merged.cache_read_per_million = existing.cache_read_per_million;
    }
    if merged.cache_write_per_million.is_none() {
        merged.cache_write_per_million = existing.cache_write_per_million;
    }
    if merged.reasoning_per_million.is_none() {
        merged.reasoning_per_million = existing.reasoning_per_million;
    }
    if merged.input_per_million_above_200k.is_none() {
        merged.input_per_million_above_200k = existing.input_per_million_above_200k;
    }
    if merged.output_per_million_above_200k.is_none() {
        merged.output_per_million_above_200k = existing.output_per_million_above_200k;
    }
    if merged.cache_read_per_million_above_200k.is_none() {
        merged.cache_read_per_million_above_200k = existing.cache_read_per_million_above_200k;
    }
    if merged.cache_write_per_million_above_200k.is_none() {
        merged.cache_write_per_million_above_200k = existing.cache_write_per_million_above_200k;
    }
    merged
}

fn build_lookup_keys(model: &str) -> Vec<String> {
    let mut keys = Vec::new();
    let mut queue = vec![normalize_model(model)];

    while let Some(candidate) = queue.pop() {
        if candidate.is_empty() || keys.contains(&candidate) {
            continue;
        }
        keys.push(candidate.clone());

        if let Some(alias) = codex_alias(&candidate) {
            queue.push(alias.to_string());
        }
        if let Some(base) = strip_codex_suffix(&candidate) {
            queue.push(base);
        }
        if let Some(base) = strip_dotted_generation(&candidate) {
            queue.push(base);
        }
        if let Some(index) = candidate.rfind('-') {
            queue.push(candidate[..index].to_string());
        }
    }

    keys
}

fn compute_cost(event: &UsageEvent, record: &PricingRecord) -> f64 {
    let cached_input = event.cache_read_tokens.min(event.prompt_tokens).max(0);
    let non_cached_input = (event.prompt_tokens - cached_input).max(0);

    let prompt = tiered_cost(
        non_cached_input,
        record.input_per_million,
        record.input_per_million_above_200k,
    );
    let completion = tiered_cost(
        event.completion_tokens,
        record.output_per_million,
        record.output_per_million_above_200k,
    );
    let cache_read = tiered_cost(
        cached_input,
        record
            .cache_read_per_million
            .unwrap_or(record.input_per_million),
        record.cache_read_per_million_above_200k,
    );
    let cache_write = tiered_cost(
        event.cache_write_tokens,
        record
            .cache_write_per_million
            .unwrap_or(record.input_per_million),
        record.cache_write_per_million_above_200k,
    );
    let reasoning = tiered_cost(
        event.reasoning_tokens,
        record.reasoning_per_million.unwrap_or(0.0),
        None,
    );
    prompt + completion + cache_read + cache_write + reasoning
}

fn tiered_cost(tokens: i64, base_per_million: f64, above_200k_per_million: Option<f64>) -> f64 {
    if tokens <= 0 {
        return 0.0;
    }
    let tokens = tokens as f64;
    let threshold = 200_000.0;
    if let Some(above_rate) = above_200k_per_million {
        if tokens > threshold {
            return (threshold * base_per_million + (tokens - threshold) * above_rate)
                / 1_000_000.0;
        }
    }
    tokens * base_per_million / 1_000_000.0
}

fn codex_alias(model: &str) -> Option<&'static str> {
    match model {
        "gpt-5-codex" => Some("gpt-5"),
        "gpt-5.3-codex" => Some("gpt-5.2-codex"),
        _ => None,
    }
}

fn strip_codex_suffix(model: &str) -> Option<String> {
    model.strip_suffix("-codex").map(str::to_string)
}

fn strip_dotted_generation(model: &str) -> Option<String> {
    let (family, version) = model.split_once('-')?;
    let major = version.split('.').next()?;
    if major.is_empty() || !major.chars().all(|char| char.is_ascii_digit()) {
        return None;
    }
    if !version.starts_with(&format!("{major}.")) {
        return None;
    }
    Some(format!("{family}-{major}"))
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::{
        PricingRecord, build_lookup_keys, derive_model_family, insert_record, normalize_model,
    };

    #[test]
    fn normalizes_suffixes() {
        assert_eq!(normalize_model("openai/gpt-5-xhigh"), "gpt-5");
    }

    #[test]
    fn derives_model_family_from_model() {
        assert_eq!(derive_model_family("claude-sonnet-4-5"), "claude-sonnet");
    }

    #[test]
    fn lookup_keys_fallback_from_versioned_codex_models() {
        let keys = build_lookup_keys("gpt-5.4");
        assert!(keys.iter().any(|key| key == "gpt-5"));

        let codex_keys = build_lookup_keys("gpt-5.3-codex");
        assert!(codex_keys.iter().any(|key| key == "gpt-5.2-codex"));
        assert!(codex_keys.iter().any(|key| key == "gpt-5"));
    }

    #[test]
    fn insert_record_keeps_existing_cache_read_when_incoming_missing() {
        let mut map = HashMap::new();
        insert_record(
            &mut map,
            PricingRecord {
                model: "gpt-5.4".into(),
                aliases: vec![],
                provider: Some("openai".into()),
                input_per_million: 2.5,
                output_per_million: 15.0,
                cache_read_per_million: Some(0.25),
                cache_write_per_million: None,
                reasoning_per_million: None,
                input_per_million_above_200k: None,
                output_per_million_above_200k: None,
                cache_read_per_million_above_200k: None,
                cache_write_per_million_above_200k: None,
            },
        );
        insert_record(
            &mut map,
            PricingRecord {
                model: "gpt-5.4".into(),
                aliases: vec![],
                provider: Some("openai".into()),
                input_per_million: 2.5,
                output_per_million: 15.0,
                cache_read_per_million: None,
                cache_write_per_million: None,
                reasoning_per_million: None,
                input_per_million_above_200k: None,
                output_per_million_above_200k: None,
                cache_read_per_million_above_200k: None,
                cache_write_per_million_above_200k: None,
            },
        );

        let record = map.get(&normalize_model("gpt-5.4")).expect("record");
        assert_eq!(record.cache_read_per_million, Some(0.25));
    }
}
