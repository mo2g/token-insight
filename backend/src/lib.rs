pub mod api;
pub mod domain;
pub mod ingest;
pub mod pricing;
pub mod social;
pub mod sources;
pub mod storage;

use std::sync::Arc;

use anyhow::Result;
use ingest::IngestService;
use storage::Database;
use tracing_subscriber::{EnvFilter, fmt};

#[derive(Clone)]
pub struct AppState {
    pub database: Database,
    pub ingest: Arc<IngestService>,
}

pub fn init_tracing() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("token_insight=info,tower_http=info"));
    let _ = fmt().with_env_filter(filter).with_target(false).try_init();
}

pub async fn build_state() -> Result<AppState> {
    let database = Database::new().await?;
    let ingest = Arc::new(IngestService::new(database.clone()).await?);
    Ok(AppState { database, ingest })
}
