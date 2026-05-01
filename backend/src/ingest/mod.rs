use std::{
    collections::HashSet,
    sync::Arc,
    time::{Duration, Instant},
};
use anyhow::Result;
use chrono::{DateTime, Utc};
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

        // Process artifacts with limited concurrency to reduce CPU spikes
        let semaphore = Arc::new(tokio::sync::Semaphore::new(4));
        let mut tasks = Vec::new();

        for path in artifacts {
            let permit = semaphore.clone().acquire_owned().await?;
            let database = self.database.clone();
            let pricing = self.pricing.clone();
            let definition = definition.clone();
            let force_reparse = force_reparse;

            let task = tokio::spawn(async move {
                let _permit = permit; // Keep permit alive for the duration of the task

                // Check file metadata first (fast) before reading content
                let metadata = match tokio::fs::metadata(&path).await {
                    Ok(m) => m,
                    Err(e) => return Err((path.clone(), anyhow::Error::from(e))),
                };

                let modified_at = metadata.modified().ok().map(DateTime::<Utc>::from);
                let size_bytes = metadata.len();

                // Check if file has changed using metadata only (fast path)
                let needs_parsing = if !force_reparse {
                    match database.artifact_metadata(definition.kind, &path).await {
                        Ok(Some((last_size, last_modified))) => {
                            let size_changed = last_size != size_bytes as i64;
                            let time_changed = match (last_modified, modified_at) {
                                (Some(last), Some(current)) => last != current,
                                _ => true,
                            };
                            size_changed || time_changed
                        }
                        _ => true,
                    }
                } else {
                    true
                };

                if !needs_parsing {
                    return Ok((path, true, 0usize)); // skipped, 0 events
                }

                // Read and fingerprint file only if needed
                let artifact = match fingerprint_for(definition.kind, &path).await {
                    Ok(a) => a,
                    Err(e) => return Err((path.clone(), e)),
                };

                let unchanged = database
                    .artifact_fingerprint(definition.kind, &path)
                    .await
                    .ok()
                    .flatten()
                    .map(|fingerprint| fingerprint == artifact.fingerprint)
                    .unwrap_or(false);

                let needs_model_backfill = unchanged
                    && should_backfill_missing_model(definition.kind)
                    && database
                        .artifact_has_missing_model_events(definition.kind, &path)
                        .await
                        .unwrap_or(false);

                if unchanged && !needs_model_backfill {
                    return Ok((path, true, 0usize)); // skipped
                }

                match parse_artifact(&definition, &path) {
                    Ok(mut events) => {
                        for event in &mut events {
                            pricing.apply_pricing(event).await;
                            event.search_text = event.build_search_text();
                        }
                        let count = events.len();
                        if let Err(e) = database.replace_artifact_events(&artifact, &events).await {
                            return Err((path.clone(), e));
                        }
                        Ok((path, false, count)) // processed with count
                    }
                    Err(error) => Err((path.clone(), error)),
                }
            });
            tasks.push(task);
        }

        for task in tasks {
            match task.await {
                Ok(Ok((_path, skipped, count))) => {
                    if skipped {
                        counters.skipped_artifacts += 1;
                    } else {
                        counters.imported_events += count;
                    }
                }
                Ok(Err((path, error))) => {
                    errors.push(format!("{}: {error}", path.display()));
                }
                Err(join_error) => {
                    tracing::warn!("Task join error: {}", join_error);
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

        // Increase interval to 10 minutes and track last refresh to avoid overlapping
        let mut periodic = interval(Duration::from_secs(600));
        periodic.set_missed_tick_behavior(MissedTickBehavior::Delay);

        let mut dirty_sources = HashSet::new();
        let mut deadline = None;
        let mut last_full_refresh = Instant::now();
        let min_refresh_interval = Duration::from_secs(300); // Minimum 5 min between full refreshes

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
                        tracing::info!("Processing delta refresh for sources: {:?}", sources);
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
                        if !dirty_sources.is_empty() && deadline.is_none() {
                            deadline = Some(tokio::time::Instant::now() + Duration::from_millis(1200));
                        }
                    }
                }
                _ = periodic.tick() => {
                    // Skip if a full refresh was recently done (avoid overlapping)
                    let elapsed = last_full_refresh.elapsed();
                    if elapsed < min_refresh_interval {
                        tracing::debug!("Skipping periodic refresh, last refresh was {:?} ago", elapsed);
                        continue;
                    }

                    tracing::info!("Starting periodic full refresh");
                    let refresh_start = Instant::now();
                    let result = self.refresh_all().await;
                    last_full_refresh = Instant::now();

                    match result {
                        Ok(summary) => {
                            tracing::info!(
                                "Periodic refresh completed in {:?}: {} events from {} artifacts",
                                refresh_start.elapsed(),
                                summary.imported_events,
                                summary.discovered_artifacts
                            );
                        }
                        Err(e) => {
                            tracing::error!("Periodic refresh failed: {}", e);
                        }
                    }
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
