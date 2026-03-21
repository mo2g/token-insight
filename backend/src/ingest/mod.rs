use std::{
    collections::HashSet,
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::Result;
use chrono::Utc;
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use tokio::{
    sync::{broadcast, mpsc},
    time::{MissedTickBehavior, interval},
};

use crate::{
    domain::{RefreshEvent, ScanSummary, SourceDefinition, SourceKind},
    pricing::PricingService,
    sources::{
        default_source_definitions, discover_artifacts, fingerprint_for, parse_artifact,
        path_matches_source,
    },
    storage::Database,
};

#[derive(Clone)]
pub struct IngestService {
    database: Database,
    pricing: PricingService,
    definitions: Vec<SourceDefinition>,
    refresh_tx: broadcast::Sender<RefreshEvent>,
}

#[derive(Default)]
struct SourceCounters {
    discovered_artifacts: usize,
    imported_events: usize,
    skipped_artifacts: usize,
}

impl IngestService {
    pub async fn new(database: Database) -> Result<Self> {
        let pricing = PricingService::new().await?;
        let (refresh_tx, _) = broadcast::channel(128);
        Ok(Self {
            database,
            pricing,
            definitions: default_source_definitions(),
            refresh_tx,
        })
    }

    pub fn definitions(&self) -> Vec<SourceDefinition> {
        self.definitions.clone()
    }

    pub fn subscribe(&self) -> broadcast::Receiver<RefreshEvent> {
        self.refresh_tx.subscribe()
    }

    pub async fn refresh_all(&self) -> Result<ScanSummary> {
        self.refresh_selected(SourceKind::ALL.to_vec(), "full")
            .await
    }

    pub async fn refresh_selected(
        &self,
        selected: Vec<SourceKind>,
        mode: &str,
    ) -> Result<ScanSummary> {
        let pricing_updated = self.pricing.maybe_refresh_remote().await;
        let force_reparse = pricing_updated || mode == "full";
        let started = Utc::now();
        let started_instant = Instant::now();
        let mut totals = SourceCounters::default();

        for definition in self
            .definitions
            .iter()
            .filter(|definition| selected.contains(&definition.kind))
        {
            let counters = self.refresh_one(definition, force_reparse).await?;
            totals.discovered_artifacts += counters.discovered_artifacts;
            totals.imported_events += counters.imported_events;
            totals.skipped_artifacts += counters.skipped_artifacts;
        }

        let completed = Utc::now();
        let summary = ScanSummary {
            mode: mode.to_string(),
            scanned_sources: selected.len(),
            discovered_artifacts: totals.discovered_artifacts,
            imported_events: totals.imported_events,
            skipped_artifacts: totals.skipped_artifacts,
            started_at: started,
            completed_at: completed,
            duration_ms: started_instant.elapsed().as_millis() as i64,
        };
        let _ = self.refresh_tx.send(RefreshEvent {
            kind: mode.to_string(),
            summary: summary.clone(),
        });
        Ok(summary)
    }

    async fn refresh_one(
        &self,
        definition: &SourceDefinition,
        force_reparse: bool,
    ) -> Result<SourceCounters> {
        let started = Utc::now();
        let started_instant = Instant::now();
        let artifacts = discover_artifacts(definition);
        let known_paths: HashSet<_> = artifacts
            .iter()
            .map(|path| path.display().to_string())
            .collect();
        self.database
            .remove_missing_artifacts(definition.kind, &known_paths)
            .await?;

        let mut counters = SourceCounters {
            discovered_artifacts: artifacts.len(),
            imported_events: 0,
            skipped_artifacts: 0,
        };
        let mut errors = Vec::new();

        for path in artifacts {
            let artifact = fingerprint_for(definition.kind, &path).await?;
            let unchanged = self
                .database
                .artifact_fingerprint(definition.kind, &path)
                .await?
                .map(|fingerprint| fingerprint == artifact.fingerprint)
                .unwrap_or(false);
            let needs_model_backfill = unchanged
                && should_backfill_missing_model(definition.kind)
                && self
                    .database
                    .artifact_has_missing_model_events(definition.kind, &path)
                    .await?;

            if unchanged && !force_reparse && !needs_model_backfill {
                counters.skipped_artifacts += 1;
                continue;
            }

            match parse_artifact(definition, &path) {
                Ok(mut events) => {
                    for event in &mut events {
                        self.pricing.apply_pricing(event).await;
                        event.search_text = event.build_search_text();
                    }
                    counters.imported_events += events.len();
                    self.database
                        .replace_artifact_events(&artifact, &events)
                        .await?;
                }
                Err(error) => {
                    errors.push(format!("{}: {error}", path.display()));
                    self.database
                        .mark_artifact_error(&artifact, &error.to_string())
                        .await?;
                }
            }
        }

        let joined_errors = if errors.is_empty() {
            None
        } else {
            Some(errors.join("; "))
        };

        self.database
            .update_scan_status(
                definition.kind,
                started,
                Utc::now(),
                started_instant.elapsed().as_millis() as i64,
                joined_errors.as_deref(),
            )
            .await?;
        Ok(counters)
    }

    pub async fn watch_forever(self: Arc<Self>) -> Result<()> {
        let (event_tx, mut event_rx) = mpsc::unbounded_channel::<notify::Result<Event>>();
        let mut watcher = RecommendedWatcher::new(
            move |result| {
                let _ = event_tx.send(result);
            },
            Config::default(),
        )?;

        for definition in &self.definitions {
            for root in &definition.watch_roots {
                if root.exists() {
                    watcher.watch(root, RecursiveMode::Recursive)?;
                }
            }
        }

        let mut periodic = interval(Duration::from_secs(300));
        periodic.set_missed_tick_behavior(MissedTickBehavior::Delay);

        let mut dirty_sources = HashSet::new();
        let mut deadline = None;

        loop {
            tokio::select! {
                biased;
                _ = tokio::signal::ctrl_c() => break,
                _ = async {
                    if let Some(deadline) = deadline {
                        tokio::time::sleep_until(deadline).await;
                    } else {
                        std::future::pending::<()>().await;
                    }
                }, if deadline.is_some() => {
                    if !dirty_sources.is_empty() {
                        let sources = dirty_sources.drain().collect::<Vec<_>>();
                        let _ = self.refresh_selected(sources, "delta").await;
                    }
                    deadline = None;
                }
                Some(result) = event_rx.recv() => {
                    if let Ok(event) = result {
                        for path in event.paths {
                            for definition in &self.definitions {
                                if path_matches_source(definition, &path) {
                                    dirty_sources.insert(definition.kind);
                                }
                            }
                        }
                        if !dirty_sources.is_empty() {
                            deadline = Some(tokio::time::Instant::now() + Duration::from_millis(1200));
                        }
                    }
                }
                _ = periodic.tick() => {
                    let _ = self.refresh_all().await;
                }
            }
        }

        Ok(())
    }
}

fn should_backfill_missing_model(source: SourceKind) -> bool {
    matches!(
        source,
        SourceKind::Codex | SourceKind::CodexArchived | SourceKind::CodexHeadless
    )
}
