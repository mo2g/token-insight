use std::{
    collections::{BTreeMap, BTreeSet, HashMap, HashSet},
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use chrono::{DateTime, Datelike, NaiveDate, TimeZone, Timelike, Utc};
use chrono_tz::Tz;
use csv::WriterBuilder;
use directories::ProjectDirs;
use serde::Serialize;
use sqlx::{
    Row, SqlitePool,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
};
use tokio::fs;

use crate::domain::{
    AggregateSnapshot, ArtifactFingerprint, BreakdownRow, ContributionCell, ExportDataset,
    FilterOptions, OverviewStats, SortDirection, SortField, SortSpec, SourceDefinition, SourceKind,
    SourceStatus, TimelineBucket, TimelinePoint, UsageEvent, UsageFilter,
};

#[derive(Clone)]
pub struct Database {
    pool: SqlitePool,
    db_path: PathBuf,
}

#[derive(Debug, Clone)]
struct ScanRow {
    last_scan_started_at: Option<DateTime<Utc>>,
    last_scan_completed_at: Option<DateTime<Utc>>,
    last_duration_ms: Option<i64>,
    last_error: Option<String>,
}

#[derive(Serialize)]
struct EventCsvRow<'a> {
    event_id: &'a str,
    source: &'a str,
    source_path: &'a str,
    session_id: Option<&'a str>,
    timestamp: &'a DateTime<Utc>,
    project: Option<&'a str>,
    cwd: Option<&'a str>,
    provider: Option<&'a str>,
    model: Option<&'a str>,
    model_family: Option<&'a str>,
    prompt_tokens: i64,
    completion_tokens: i64,
    cache_read_tokens: i64,
    cache_write_tokens: i64,
    reasoning_tokens: i64,
    tool_tokens: i64,
    total_tokens: i64,
    estimated_cost_usd: Option<f64>,
    mode: &'a str,
    message_role: Option<&'a str>,
    raw_kind: Option<&'a str>,
}

impl Database {
    pub async fn new() -> Result<Self> {
        let data_dir = data_dir()?;
        Self::new_at(data_dir).await
    }

    pub async fn new_at(data_dir: PathBuf) -> Result<Self> {
        fs::create_dir_all(&data_dir).await?;
        let db_path = data_dir.join("token-insight.db");
        let options = SqliteConnectOptions::new()
            .filename(&db_path)
            .create_if_missing(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await?;
        let database = Self { pool, db_path };
        database.init().await?;
        Ok(database)
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub fn path(&self) -> &Path {
        &self.db_path
    }

    async fn init(&self) -> Result<()> {
        let schema = r#"
        CREATE TABLE IF NOT EXISTS artifacts (
          source TEXT NOT NULL,
          path TEXT NOT NULL,
          fingerprint TEXT NOT NULL,
          modified_at TEXT,
          size_bytes INTEGER NOT NULL,
          last_error TEXT,
          PRIMARY KEY(source, path)
        );

        CREATE TABLE IF NOT EXISTS events (
          event_id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          source_path TEXT NOT NULL,
          session_id TEXT,
          timestamp TEXT NOT NULL,
          project TEXT,
          cwd TEXT,
          provider TEXT,
          model TEXT,
          model_family TEXT,
          prompt_tokens INTEGER NOT NULL,
          completion_tokens INTEGER NOT NULL,
          cache_read_tokens INTEGER NOT NULL,
          cache_write_tokens INTEGER NOT NULL,
          reasoning_tokens INTEGER NOT NULL,
          tool_tokens INTEGER NOT NULL,
          total_tokens INTEGER NOT NULL,
          estimated_cost_usd REAL,
          mode TEXT NOT NULL,
          message_role TEXT,
          raw_kind TEXT,
          search_text TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS scans (
          source TEXT PRIMARY KEY,
          last_scan_started_at TEXT,
          last_scan_completed_at TEXT,
          last_duration_ms INTEGER,
          last_error TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
        CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
        CREATE INDEX IF NOT EXISTS idx_events_model ON events(model);
        CREATE INDEX IF NOT EXISTS idx_events_provider ON events(provider);
        CREATE INDEX IF NOT EXISTS idx_events_project ON events(project);
        "#;
        sqlx::query(schema).execute(&self.pool).await?;
        Ok(())
    }

    pub async fn artifact_fingerprint(
        &self,
        source: SourceKind,
        path: &Path,
    ) -> Result<Option<String>> {
        let row = sqlx::query("SELECT fingerprint FROM artifacts WHERE source = ? AND path = ?")
            .bind(source.as_str())
            .bind(path.to_string_lossy().to_string())
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.map(|row| row.get::<String, _>("fingerprint")))
    }

    pub async fn artifact_has_missing_model_events(
        &self,
        source: SourceKind,
        path: &Path,
    ) -> Result<bool> {
        let row = sqlx::query(
            r#"
            SELECT 1
            FROM events
            WHERE source = ? AND source_path = ?
              AND (model IS NULL OR TRIM(model) = '')
            LIMIT 1
            "#,
        )
        .bind(source.as_str())
        .bind(path.to_string_lossy().to_string())
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.is_some())
    }

    pub async fn replace_artifact_events(
        &self,
        artifact: &ArtifactFingerprint,
        events: &[UsageEvent],
    ) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("DELETE FROM events WHERE source = ? AND source_path = ?")
            .bind(artifact.source.as_str())
            .bind(&artifact.path)
            .execute(&mut *tx)
            .await?;

        for event in events {
            sqlx::query(
                r#"
                INSERT INTO events (
                  event_id, source, source_path, session_id, timestamp, project, cwd, provider,
                  model, model_family, prompt_tokens, completion_tokens, cache_read_tokens,
                  cache_write_tokens, reasoning_tokens, tool_tokens, total_tokens,
                  estimated_cost_usd, mode, message_role, raw_kind, search_text
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#,
            )
            .bind(&event.event_id)
            .bind(event.source.as_str())
            .bind(&event.source_path)
            .bind(&event.session_id)
            .bind(event.timestamp.to_rfc3339())
            .bind(&event.project)
            .bind(&event.cwd)
            .bind(&event.provider)
            .bind(&event.model)
            .bind(&event.model_family)
            .bind(event.prompt_tokens)
            .bind(event.completion_tokens)
            .bind(event.cache_read_tokens)
            .bind(event.cache_write_tokens)
            .bind(event.reasoning_tokens)
            .bind(event.tool_tokens)
            .bind(event.total_tokens)
            .bind(event.estimated_cost_usd)
            .bind(event.mode.as_str())
            .bind(&event.message_role)
            .bind(&event.raw_kind)
            .bind(&event.search_text)
            .execute(&mut *tx)
            .await?;
        }

        sqlx::query(
            r#"
            INSERT INTO artifacts (source, path, fingerprint, modified_at, size_bytes, last_error)
            VALUES (?, ?, ?, ?, ?, NULL)
            ON CONFLICT(source, path) DO UPDATE SET
              fingerprint = excluded.fingerprint,
              modified_at = excluded.modified_at,
              size_bytes = excluded.size_bytes,
              last_error = NULL
            "#,
        )
        .bind(artifact.source.as_str())
        .bind(&artifact.path)
        .bind(&artifact.fingerprint)
        .bind(artifact.modified_at.map(|value| value.to_rfc3339()))
        .bind(artifact.size_bytes as i64)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn mark_artifact_error(
        &self,
        artifact: &ArtifactFingerprint,
        error: &str,
    ) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO artifacts (source, path, fingerprint, modified_at, size_bytes, last_error)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(source, path) DO UPDATE SET
              fingerprint = excluded.fingerprint,
              modified_at = excluded.modified_at,
              size_bytes = excluded.size_bytes,
              last_error = excluded.last_error
            "#,
        )
        .bind(artifact.source.as_str())
        .bind(&artifact.path)
        .bind(&artifact.fingerprint)
        .bind(artifact.modified_at.map(|value| value.to_rfc3339()))
        .bind(artifact.size_bytes as i64)
        .bind(error)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn remove_missing_artifacts(
        &self,
        source: SourceKind,
        existing_paths: &HashSet<String>,
    ) -> Result<()> {
        let rows = sqlx::query("SELECT path FROM artifacts WHERE source = ?")
            .bind(source.as_str())
            .fetch_all(&self.pool)
            .await?;
        for row in rows {
            let path = row.get::<String, _>("path");
            if !existing_paths.contains(&path) {
                sqlx::query("DELETE FROM events WHERE source = ? AND source_path = ?")
                    .bind(source.as_str())
                    .bind(&path)
                    .execute(&self.pool)
                    .await?;
                sqlx::query("DELETE FROM artifacts WHERE source = ? AND path = ?")
                    .bind(source.as_str())
                    .bind(&path)
                    .execute(&self.pool)
                    .await?;
            }
        }
        Ok(())
    }

    pub async fn update_scan_status(
        &self,
        source: SourceKind,
        started_at: DateTime<Utc>,
        completed_at: DateTime<Utc>,
        duration_ms: i64,
        error: Option<&str>,
    ) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO scans (source, last_scan_started_at, last_scan_completed_at, last_duration_ms, last_error)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(source) DO UPDATE SET
              last_scan_started_at = excluded.last_scan_started_at,
              last_scan_completed_at = excluded.last_scan_completed_at,
              last_duration_ms = excluded.last_duration_ms,
              last_error = excluded.last_error
            "#,
        )
        .bind(source.as_str())
        .bind(started_at.to_rfc3339())
        .bind(completed_at.to_rfc3339())
        .bind(duration_ms)
        .bind(error)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_events(&self) -> Result<Vec<UsageEvent>> {
        let rows = sqlx::query(
            r#"
            SELECT event_id, source, source_path, session_id, timestamp, project, cwd, provider,
                   model, model_family, prompt_tokens, completion_tokens, cache_read_tokens,
                   cache_write_tokens, reasoning_tokens, tool_tokens, total_tokens,
                   estimated_cost_usd, mode, message_role, raw_kind, search_text
            FROM events
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter()
            .map(|row| {
                Ok(UsageEvent {
                    event_id: row.get("event_id"),
                    source: row
                        .get::<String, _>("source")
                        .parse()
                        .map_err(anyhow::Error::msg)?,
                    source_path: row.get("source_path"),
                    session_id: row.get("session_id"),
                    timestamp: DateTime::parse_from_rfc3339(&row.get::<String, _>("timestamp"))
                        .map(|value| value.with_timezone(&Utc))
                        .context("invalid timestamp in database")?,
                    project: row.get("project"),
                    cwd: row.get("cwd"),
                    provider: row.get("provider"),
                    model: row.get("model"),
                    model_family: row.get("model_family"),
                    prompt_tokens: row.get("prompt_tokens"),
                    completion_tokens: row.get("completion_tokens"),
                    cache_read_tokens: row.get("cache_read_tokens"),
                    cache_write_tokens: row.get("cache_write_tokens"),
                    reasoning_tokens: row.get("reasoning_tokens"),
                    tool_tokens: row.get("tool_tokens"),
                    total_tokens: row.get("total_tokens"),
                    estimated_cost_usd: row.get("estimated_cost_usd"),
                    mode: row
                        .get::<String, _>("mode")
                        .parse()
                        .map_err(anyhow::Error::msg)?,
                    message_role: row.get("message_role"),
                    raw_kind: row.get("raw_kind"),
                    search_text: row.get("search_text"),
                })
            })
            .collect()
    }

    pub async fn query_events(&self, filter: &UsageFilter) -> Result<Vec<UsageEvent>> {
        let mut events: Vec<_> = self
            .list_events()
            .await?
            .into_iter()
            .filter(|event| filter.matches_event(event))
            .collect();

        let sort = filter.sort.unwrap_or_default();
        sort_events(&mut events, sort);
        Ok(events)
    }

    pub async fn snapshot(&self, filter: &UsageFilter) -> Result<AggregateSnapshot> {
        let events = self.query_events(filter).await?;
        let timezone = filter.parsed_timezone();
        let overview = build_overview(&events, self.last_refresh_at().await?, timezone);
        let top_models = build_model_breakdown(&events, filter.sort);
        let top_sources = build_source_breakdown(&events, filter.sort);
        let daily = build_daily_points(&events, timezone);
        let contributions = build_contributions(&daily);
        Ok(AggregateSnapshot {
            filter: filter.clone(),
            overview,
            top_models,
            top_sources,
            daily,
            contributions,
        })
    }

    pub async fn timeline(
        &self,
        filter: &UsageFilter,
        bucket: TimelineBucket,
    ) -> Result<Vec<TimelinePoint>> {
        let events = self.query_events(filter).await?;
        Ok(build_timeline_points(
            &events,
            bucket,
            filter.parsed_timezone(),
        ))
    }

    pub async fn filter_options(&self) -> Result<FilterOptions> {
        let events = self.list_events().await?;
        let mut providers = BTreeSet::new();
        let mut models = BTreeSet::new();
        let mut model_families = BTreeSet::new();
        let mut projects = BTreeSet::new();
        let mut days = Vec::new();

        for event in &events {
            if let Some(value) = &event.provider {
                providers.insert(value.clone());
            }
            if let Some(value) = &event.model {
                models.insert(value.clone());
            }
            if let Some(value) = &event.model_family {
                model_families.insert(value.clone());
            }
            if let Some(value) = &event.project {
                projects.insert(value.clone());
            } else if let Some(value) = &event.cwd {
                projects.insert(value.clone());
            }
            days.push(event.timestamp.date_naive());
        }

        Ok(FilterOptions {
            sources: SourceKind::ALL
                .into_iter()
                .map(|item| item.as_str().to_string())
                .collect(),
            providers: providers.into_iter().collect(),
            models: models.into_iter().collect(),
            model_families: model_families.into_iter().collect(),
            projects: projects.into_iter().collect(),
            min_day: days.iter().copied().min(),
            max_day: days.iter().copied().max(),
        })
    }

    pub async fn source_statuses(
        &self,
        definitions: &[SourceDefinition],
    ) -> Result<Vec<SourceStatus>> {
        let scan_rows = sqlx::query(
            "SELECT source, last_scan_started_at, last_scan_completed_at, last_duration_ms, last_error FROM scans",
        )
        .fetch_all(&self.pool)
        .await?;
        let mut scan_map = HashMap::new();
        for row in scan_rows {
            let source: String = row.get("source");
            scan_map.insert(
                source.clone(),
                ScanRow {
                    last_scan_started_at: parse_optional_rfc3339(row.get("last_scan_started_at"))?,
                    last_scan_completed_at: parse_optional_rfc3339(
                        row.get("last_scan_completed_at"),
                    )?,
                    last_duration_ms: row.get("last_duration_ms"),
                    last_error: row.get("last_error"),
                },
            );
        }

        let artifact_counts = grouped_counts(&self.pool, "artifacts").await?;
        let event_counts = grouped_counts(&self.pool, "events").await?;

        let statuses = definitions
            .iter()
            .map(|definition| {
                let key = definition.kind.as_str().to_string();
                let scan = scan_map.get(&key);
                SourceStatus {
                    source: definition.kind,
                    label: definition.label.clone(),
                    mode: definition.mode,
                    watched_paths: definition
                        .watch_roots
                        .iter()
                        .map(|path| path.display().to_string())
                        .collect(),
                    discovered_artifacts: artifact_counts.get(&key).copied().unwrap_or_default(),
                    imported_events: event_counts.get(&key).copied().unwrap_or_default(),
                    last_scan_started_at: scan.and_then(|scan| scan.last_scan_started_at),
                    last_scan_completed_at: scan.and_then(|scan| scan.last_scan_completed_at),
                    last_duration_ms: scan.and_then(|scan| scan.last_duration_ms),
                    last_error: scan.and_then(|scan| scan.last_error.clone()),
                }
            })
            .collect();
        Ok(statuses)
    }

    pub async fn last_refresh_at(&self) -> Result<Option<DateTime<Utc>>> {
        let row = sqlx::query("SELECT MAX(last_scan_completed_at) AS value FROM scans")
            .fetch_one(&self.pool)
            .await?;
        parse_optional_rfc3339(row.get("value"))
    }

    pub async fn export_dataset(
        &self,
        dataset: ExportDataset,
        csv: bool,
        filter: &UsageFilter,
    ) -> Result<Vec<u8>> {
        if !csv {
            return Ok(match dataset {
                ExportDataset::Events => {
                    serde_json::to_vec_pretty(&self.query_events(filter).await?)?
                }
                ExportDataset::Daily | ExportDataset::Models | ExportDataset::Sources => {
                    let snapshot = self.snapshot(filter).await?;
                    match dataset {
                        ExportDataset::Daily => serde_json::to_vec_pretty(&snapshot.daily)?,
                        ExportDataset::Models => serde_json::to_vec_pretty(&snapshot.top_models)?,
                        ExportDataset::Sources => serde_json::to_vec_pretty(&snapshot.top_sources)?,
                        ExportDataset::Events => unreachable!(),
                    }
                }
            });
        }

        let mut writer = WriterBuilder::new().from_writer(vec![]);
        match dataset {
            ExportDataset::Events => {
                for event in self.query_events(filter).await? {
                    writer.serialize(EventCsvRow {
                        event_id: &event.event_id,
                        source: event.source.as_str(),
                        source_path: &event.source_path,
                        session_id: event.session_id.as_deref(),
                        timestamp: &event.timestamp,
                        project: event.project.as_deref(),
                        cwd: event.cwd.as_deref(),
                        provider: event.provider.as_deref(),
                        model: event.model.as_deref(),
                        model_family: event.model_family.as_deref(),
                        prompt_tokens: event.prompt_tokens,
                        completion_tokens: event.completion_tokens,
                        cache_read_tokens: event.cache_read_tokens,
                        cache_write_tokens: event.cache_write_tokens,
                        reasoning_tokens: event.reasoning_tokens,
                        tool_tokens: event.tool_tokens,
                        total_tokens: event.total_tokens,
                        estimated_cost_usd: event.estimated_cost_usd,
                        mode: event.mode.as_str(),
                        message_role: event.message_role.as_deref(),
                        raw_kind: event.raw_kind.as_deref(),
                    })?;
                }
            }
            ExportDataset::Daily => {
                for row in self.snapshot(filter).await?.daily {
                    writer.serialize(row)?;
                }
            }
            ExportDataset::Models => {
                for row in self.snapshot(filter).await?.top_models {
                    writer.serialize(row)?;
                }
            }
            ExportDataset::Sources => {
                for row in self.snapshot(filter).await?.top_sources {
                    writer.serialize(row)?;
                }
            }
        }
        Ok(writer.into_inner()?)
    }
}

fn data_dir() -> Result<PathBuf> {
    if let Ok(path) = std::env::var("TOKEN_INSIGHT_DATA_DIR") {
        return Ok(PathBuf::from(path));
    }

    let dirs = ProjectDirs::from("dev", "mo2g", "token-insight")
        .context("unable to resolve application data directory")?;
    Ok(dirs.data_local_dir().to_path_buf())
}

async fn grouped_counts(pool: &SqlitePool, table: &str) -> Result<HashMap<String, usize>> {
    let query = format!("SELECT source, COUNT(*) AS count FROM {table} GROUP BY source");
    let rows = sqlx::query(&query).fetch_all(pool).await?;
    Ok(rows
        .into_iter()
        .map(|row| {
            (
                row.get::<String, _>("source"),
                row.get::<i64, _>("count") as usize,
            )
        })
        .collect())
}

fn parse_optional_rfc3339(value: Option<String>) -> Result<Option<DateTime<Utc>>> {
    value
        .map(|value| {
            DateTime::parse_from_rfc3339(&value)
                .map(|value| value.with_timezone(&Utc))
                .map_err(Into::into)
        })
        .transpose()
}

fn sort_events(events: &mut [UsageEvent], sort: SortSpec) {
    events.sort_by(|left, right| {
        let ordering = match sort.field {
            SortField::Tokens => left.total_tokens.cmp(&right.total_tokens),
            SortField::Cost => left
                .estimated_cost_usd
                .unwrap_or_default()
                .partial_cmp(&right.estimated_cost_usd.unwrap_or_default())
                .unwrap_or(std::cmp::Ordering::Equal),
            SortField::Name => left.model.cmp(&right.model),
            SortField::Date => left.timestamp.cmp(&right.timestamp),
            SortField::Events => left.event_id.cmp(&right.event_id),
        };
        match sort.direction {
            SortDirection::Asc => ordering,
            SortDirection::Desc => ordering.reverse(),
        }
    });
}

fn build_overview(
    events: &[UsageEvent],
    last_refresh_at: Option<DateTime<Utc>>,
    timezone: Option<Tz>,
) -> OverviewStats {
    let mut active_days = BTreeSet::new();
    let mut totals_by_source: HashMap<String, i64> = HashMap::new();
    let mut totals_by_model: HashMap<String, i64> = HashMap::new();

    let mut total_cost = 0.0;
    let mut prompt = 0;
    let mut completion = 0;
    let mut cache_read = 0;
    let mut cache_write = 0;
    let mut reasoning = 0;
    let mut tool = 0;
    let mut total = 0;
    let mut last_event_at: Option<DateTime<Utc>> = None;

    for event in events {
        active_days.insert(day_for_timestamp(event.timestamp, timezone));
        *totals_by_source
            .entry(event.source.label().to_string())
            .or_default() += event.total_tokens;
        if let Some(model) = &event.model {
            *totals_by_model.entry(model.clone()).or_default() += event.total_tokens;
        }
        total += event.total_tokens;
        prompt += event.prompt_tokens;
        completion += event.completion_tokens;
        cache_read += event.cache_read_tokens;
        cache_write += event.cache_write_tokens;
        reasoning += event.reasoning_tokens;
        tool += event.tool_tokens;
        total_cost += event.estimated_cost_usd.unwrap_or_default();
        last_event_at =
            Some(last_event_at.map_or(event.timestamp, |value| value.max(event.timestamp)));
    }

    OverviewStats {
        total_tokens: total,
        total_cost_usd: total_cost,
        prompt_tokens: prompt,
        completion_tokens: completion,
        cache_read_tokens: cache_read,
        cache_write_tokens: cache_write,
        reasoning_tokens: reasoning,
        tool_tokens: tool,
        event_count: events.len(),
        active_days: active_days.len(),
        streak_days: longest_streak(active_days),
        top_source: totals_by_source
            .into_iter()
            .max_by_key(|(_, tokens)| *tokens)
            .map(|(label, _)| label),
        top_model: totals_by_model
            .into_iter()
            .max_by_key(|(_, tokens)| *tokens)
            .map(|(label, _)| label),
        last_event_at,
        last_refresh_at,
    }
}

fn build_model_breakdown(events: &[UsageEvent], sort: Option<SortSpec>) -> Vec<BreakdownRow> {
    let mut rows: BTreeMap<String, BreakdownRow> = BTreeMap::new();
    for event in events {
        let label = event
            .model
            .clone()
            .unwrap_or_else(|| "Unknown model".to_string());
        let key = format!(
            "{}|{}",
            event.provider.as_deref().unwrap_or("-"),
            event.model.as_deref().unwrap_or("-")
        );
        let row = rows.entry(key.clone()).or_insert(BreakdownRow {
            key,
            label: label.clone(),
            source: None,
            provider: event.provider.clone(),
            model: event.model.clone(),
            model_family: event.model_family.clone(),
            project: None,
            event_count: 0,
            total_tokens: 0,
            total_cost_usd: 0.0,
            prompt_tokens: 0,
            completion_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            reasoning_tokens: 0,
        });
        accumulate_row(row, event);
    }

    sort_breakdown(rows.into_values().collect(), sort)
}

fn build_source_breakdown(events: &[UsageEvent], sort: Option<SortSpec>) -> Vec<BreakdownRow> {
    let mut rows: BTreeMap<String, BreakdownRow> = BTreeMap::new();
    for event in events {
        let key = event.source.as_str().to_string();
        let row = rows.entry(key.clone()).or_insert(BreakdownRow {
            key: key.clone(),
            label: event.source.label().to_string(),
            source: Some(key),
            provider: None,
            model: None,
            model_family: None,
            project: None,
            event_count: 0,
            total_tokens: 0,
            total_cost_usd: 0.0,
            prompt_tokens: 0,
            completion_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            reasoning_tokens: 0,
        });
        accumulate_row(row, event);
    }

    sort_breakdown(rows.into_values().collect(), sort)
}

fn build_daily_points(
    events: &[UsageEvent],
    timezone: Option<Tz>,
) -> Vec<crate::domain::DailyPoint> {
    let mut grouped: BTreeMap<NaiveDate, crate::domain::DailyPoint> = BTreeMap::new();
    let mut model_sets: HashMap<NaiveDate, HashSet<String>> = HashMap::new();
    let mut source_sets: HashMap<NaiveDate, HashSet<String>> = HashMap::new();

    for event in events {
        let day = day_for_timestamp(event.timestamp, timezone);
        let row = grouped.entry(day).or_insert(crate::domain::DailyPoint {
            day,
            total_tokens: 0,
            total_cost_usd: 0.0,
            event_count: 0,
            unique_models: 0,
            unique_sources: 0,
        });
        row.total_tokens += event.total_tokens;
        row.total_cost_usd += event.estimated_cost_usd.unwrap_or_default();
        row.event_count += 1;
        if let Some(model) = &event.model {
            model_sets.entry(day).or_default().insert(model.clone());
        }
        source_sets
            .entry(day)
            .or_default()
            .insert(event.source.as_str().to_string());
    }

    for row in grouped.values_mut() {
        row.unique_models = model_sets
            .get(&row.day)
            .map(|items| items.len())
            .unwrap_or(0);
        row.unique_sources = source_sets
            .get(&row.day)
            .map(|items| items.len())
            .unwrap_or(0);
    }

    grouped.into_values().collect()
}

fn build_timeline_points(
    events: &[UsageEvent],
    bucket: TimelineBucket,
    timezone: Option<Tz>,
) -> Vec<TimelinePoint> {
    let mut grouped: BTreeMap<DateTime<Utc>, TimelinePoint> = BTreeMap::new();
    let mut model_sets: HashMap<DateTime<Utc>, HashSet<String>> = HashMap::new();
    let mut source_sets: HashMap<DateTime<Utc>, HashSet<String>> = HashMap::new();

    for event in events {
        let bucket_start = truncate_timestamp(event.timestamp, bucket, timezone);
        let row = grouped.entry(bucket_start).or_insert(TimelinePoint {
            bucket_start,
            bucket,
            total_tokens: 0,
            total_cost_usd: 0.0,
            event_count: 0,
            unique_models: 0,
            unique_sources: 0,
        });
        row.total_tokens += event.total_tokens;
        row.total_cost_usd += event.estimated_cost_usd.unwrap_or_default();
        row.event_count += 1;
        if let Some(model) = &event.model {
            model_sets
                .entry(bucket_start)
                .or_default()
                .insert(model.clone());
        }
        source_sets
            .entry(bucket_start)
            .or_default()
            .insert(event.source.as_str().to_string());
    }

    for row in grouped.values_mut() {
        row.unique_models = model_sets
            .get(&row.bucket_start)
            .map(|items| items.len())
            .unwrap_or(0);
        row.unique_sources = source_sets
            .get(&row.bucket_start)
            .map(|items| items.len())
            .unwrap_or(0);
    }

    grouped.into_values().collect()
}

fn truncate_timestamp(
    timestamp: DateTime<Utc>,
    bucket: TimelineBucket,
    timezone: Option<Tz>,
) -> DateTime<Utc> {
    if let Some(timezone) = timezone {
        let local = timestamp.with_timezone(&timezone);
        let truncated = match bucket {
            TimelineBucket::Day => timezone
                .with_ymd_and_hms(local.year(), local.month(), local.day(), 0, 0, 0)
                .single()
                .expect("valid midnight"),
            TimelineBucket::Hour => timezone
                .with_ymd_and_hms(local.year(), local.month(), local.day(), local.hour(), 0, 0)
                .single()
                .expect("valid hour"),
            TimelineBucket::Minute => timezone
                .with_ymd_and_hms(
                    local.year(),
                    local.month(),
                    local.day(),
                    local.hour(),
                    local.minute(),
                    0,
                )
                .single()
                .expect("valid minute"),
        };
        return truncated.with_timezone(&Utc);
    }

    match bucket {
        TimelineBucket::Day => timestamp
            .date_naive()
            .and_hms_opt(0, 0, 0)
            .expect("valid midnight")
            .and_utc(),
        TimelineBucket::Hour => timestamp
            .with_minute(0)
            .and_then(|value| value.with_second(0))
            .and_then(|value| value.with_nanosecond(0))
            .expect("valid hour"),
        TimelineBucket::Minute => timestamp
            .with_second(0)
            .and_then(|value| value.with_nanosecond(0))
            .expect("valid minute"),
    }
}

fn day_for_timestamp(timestamp: DateTime<Utc>, timezone: Option<Tz>) -> NaiveDate {
    timezone
        .map(|timezone| timestamp.with_timezone(&timezone).date_naive())
        .unwrap_or_else(|| timestamp.date_naive())
}

fn build_contributions(daily: &[crate::domain::DailyPoint]) -> Vec<ContributionCell> {
    let max_tokens = daily.iter().map(|row| row.total_tokens).max().unwrap_or(1) as f64;
    daily
        .iter()
        .enumerate()
        .map(|(index, row)| ContributionCell {
            day: row.day,
            week_index: index / 7,
            weekday: row.day.weekday().num_days_from_monday(),
            total_tokens: row.total_tokens,
            total_cost_usd: row.total_cost_usd,
            intensity: (row.total_tokens as f64 / max_tokens).clamp(0.0, 1.0),
        })
        .collect()
}

fn accumulate_row(row: &mut BreakdownRow, event: &UsageEvent) {
    row.event_count += 1;
    row.total_tokens += event.total_tokens;
    row.total_cost_usd += event.estimated_cost_usd.unwrap_or_default();
    row.prompt_tokens += event.prompt_tokens;
    row.completion_tokens += event.completion_tokens;
    row.cache_read_tokens += event.cache_read_tokens;
    row.cache_write_tokens += event.cache_write_tokens;
    row.reasoning_tokens += event.reasoning_tokens;
}

fn sort_breakdown(mut rows: Vec<BreakdownRow>, sort: Option<SortSpec>) -> Vec<BreakdownRow> {
    let sort = sort.unwrap_or_default();
    rows.sort_by(|left, right| {
        let ordering = match sort.field {
            SortField::Tokens => left.total_tokens.cmp(&right.total_tokens),
            SortField::Cost => left
                .total_cost_usd
                .partial_cmp(&right.total_cost_usd)
                .unwrap_or(std::cmp::Ordering::Equal),
            SortField::Name => left.label.cmp(&right.label),
            SortField::Date => left.key.cmp(&right.key),
            SortField::Events => left.event_count.cmp(&right.event_count),
        };
        match sort.direction {
            SortDirection::Asc => ordering,
            SortDirection::Desc => ordering.reverse(),
        }
    });
    rows
}

fn longest_streak(days: BTreeSet<NaiveDate>) -> usize {
    let mut best = 0;
    let mut current = 0;
    let mut previous = None;

    for day in days {
        if previous
            .map(|value: NaiveDate| day.signed_duration_since(value).num_days() == 1)
            .unwrap_or(false)
        {
            current += 1;
        } else {
            current = 1;
        }
        best = best.max(current);
        previous = Some(day);
    }

    best
}
