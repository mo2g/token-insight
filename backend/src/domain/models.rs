use std::{fmt, path::PathBuf, str::FromStr};

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};

use crate::domain::UsageFilter;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SourceKind {
    OpenCode,
    Claude,
    OpenClaw,
    LiteLLM,
    Codex,
    CodexArchived,
    CodexHeadless,
    Gemini,
    Cursor,
    Amp,
    Droid,
    Pi,
    Kimi,
    Qwen,
    RooCode,
    Kilo,
    Mux,
    Synthetic,
    Octofriend,
}

impl SourceKind {
    pub const ALL: [SourceKind; 19] = [
        SourceKind::OpenCode,
        SourceKind::Claude,
        SourceKind::OpenClaw,
        SourceKind::LiteLLM,
        SourceKind::Codex,
        SourceKind::CodexArchived,
        SourceKind::CodexHeadless,
        SourceKind::Gemini,
        SourceKind::Cursor,
        SourceKind::Amp,
        SourceKind::Droid,
        SourceKind::Pi,
        SourceKind::Kimi,
        SourceKind::Qwen,
        SourceKind::RooCode,
        SourceKind::Kilo,
        SourceKind::Mux,
        SourceKind::Synthetic,
        SourceKind::Octofriend,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            SourceKind::OpenCode => "opencode",
            SourceKind::Claude => "claude",
            SourceKind::OpenClaw => "openclaw",
            SourceKind::LiteLLM => "litellm",
            SourceKind::Codex => "codex",
            SourceKind::CodexArchived => "codex-archived",
            SourceKind::CodexHeadless => "codex-headless",
            SourceKind::Gemini => "gemini",
            SourceKind::Cursor => "cursor",
            SourceKind::Amp => "amp",
            SourceKind::Droid => "droid",
            SourceKind::Pi => "pi",
            SourceKind::Kimi => "kimi",
            SourceKind::Qwen => "qwen",
            SourceKind::RooCode => "roo-code",
            SourceKind::Kilo => "kilo",
            SourceKind::Mux => "mux",
            SourceKind::Synthetic => "synthetic",
            SourceKind::Octofriend => "octofriend",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            SourceKind::OpenCode => "OpenCode",
            SourceKind::Claude => "Claude",
            SourceKind::OpenClaw => "OpenClaw",
            SourceKind::LiteLLM => "LiteLLM",
            SourceKind::Codex => "Codex",
            SourceKind::CodexArchived => "Codex Archived",
            SourceKind::CodexHeadless => "Codex Headless",
            SourceKind::Gemini => "Gemini",
            SourceKind::Cursor => "Cursor",
            SourceKind::Amp => "Amp",
            SourceKind::Droid => "Droid",
            SourceKind::Pi => "Pi",
            SourceKind::Kimi => "Kimi",
            SourceKind::Qwen => "Qwen",
            SourceKind::RooCode => "Roo Code",
            SourceKind::Kilo => "Kilo",
            SourceKind::Mux => "Mux",
            SourceKind::Synthetic => "Synthetic",
            SourceKind::Octofriend => "Octofriend",
        }
    }
}

impl fmt::Display for SourceKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for SourceKind {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let normalized = value.trim().to_ascii_lowercase();
        SourceKind::ALL
            .into_iter()
            .find(|item| item.as_str() == normalized)
            .ok_or_else(|| format!("unknown source kind: {value}"))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum InteractionMode {
    Interactive,
    Headless,
    Unknown,
}

impl InteractionMode {
    pub fn as_str(self) -> &'static str {
        match self {
            InteractionMode::Interactive => "interactive",
            InteractionMode::Headless => "headless",
            InteractionMode::Unknown => "unknown",
        }
    }
}

impl Default for InteractionMode {
    fn default() -> Self {
        Self::Unknown
    }
}

impl fmt::Display for InteractionMode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for InteractionMode {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim().to_ascii_lowercase().as_str() {
            "interactive" => Ok(Self::Interactive),
            "headless" => Ok(Self::Headless),
            "unknown" | "" => Ok(Self::Unknown),
            _ => Err(format!("unknown interaction mode: {value}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageEvent {
    pub event_id: String,
    pub source: SourceKind,
    pub source_path: String,
    pub session_id: Option<String>,
    pub timestamp: DateTime<Utc>,
    pub project: Option<String>,
    pub cwd: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub model_family: Option<String>,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub cache_read_tokens: i64,
    pub cache_write_tokens: i64,
    pub reasoning_tokens: i64,
    pub tool_tokens: i64,
    pub total_tokens: i64,
    pub estimated_cost_usd: Option<f64>,
    pub mode: InteractionMode,
    pub message_role: Option<String>,
    pub raw_kind: Option<String>,
    pub search_text: String,
}

impl UsageEvent {
    pub fn build_search_text(&self) -> String {
        [
            Some(self.source.as_str().to_string()),
            self.project.clone(),
            self.cwd.clone(),
            self.provider.clone(),
            self.model.clone(),
            self.model_family.clone(),
            self.session_id.clone(),
            self.message_role.clone(),
            self.raw_kind.clone(),
        ]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRecord {
    pub source: SourceKind,
    pub session_id: String,
    pub path: String,
    pub project: Option<String>,
    pub cwd: Option<String>,
    pub first_seen_at: Option<DateTime<Utc>>,
    pub last_seen_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactFingerprint {
    pub source: SourceKind,
    pub path: String,
    pub fingerprint: String,
    pub modified_at: Option<DateTime<Utc>>,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceDefinition {
    pub kind: SourceKind,
    pub label: String,
    pub mode: InteractionMode,
    pub roots: Vec<PathBuf>,
    pub watch_roots: Vec<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceStatus {
    pub source: SourceKind,
    pub label: String,
    pub mode: InteractionMode,
    pub watched_paths: Vec<String>,
    pub discovered_artifacts: usize,
    pub imported_events: usize,
    pub last_scan_started_at: Option<DateTime<Utc>>,
    pub last_scan_completed_at: Option<DateTime<Utc>>,
    pub last_duration_ms: Option<i64>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverviewStats {
    pub total_tokens: i64,
    pub total_cost_usd: f64,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub cache_read_tokens: i64,
    pub cache_write_tokens: i64,
    pub reasoning_tokens: i64,
    pub tool_tokens: i64,
    pub event_count: usize,
    pub active_days: usize,
    pub streak_days: usize,
    pub top_source: Option<String>,
    pub top_model: Option<String>,
    pub last_event_at: Option<DateTime<Utc>>,
    pub last_refresh_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreakdownRow {
    pub key: String,
    pub label: String,
    pub source: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub model_family: Option<String>,
    pub project: Option<String>,
    pub event_count: usize,
    pub total_tokens: i64,
    pub total_cost_usd: f64,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub cache_read_tokens: i64,
    pub cache_write_tokens: i64,
    pub reasoning_tokens: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyPoint {
    pub day: NaiveDate,
    pub total_tokens: i64,
    pub total_cost_usd: f64,
    pub event_count: usize,
    pub unique_models: usize,
    pub unique_sources: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TimelineBucket {
    Day,
    Hour,
    Minute,
}

impl TimelineBucket {
    pub fn as_path(self) -> &'static str {
        match self {
            TimelineBucket::Day => "daily",
            TimelineBucket::Hour => "hourly",
            TimelineBucket::Minute => "minutely",
        }
    }
}

impl fmt::Display for TimelineBucket {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_path())
    }
}

impl FromStr for TimelineBucket {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim().to_ascii_lowercase().as_str() {
            "daily" | "day" => Ok(Self::Day),
            "hourly" | "hour" => Ok(Self::Hour),
            "minutely" | "minute" | "min" => Ok(Self::Minute),
            _ => Err(format!("unknown timeline bucket: {value}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelinePoint {
    pub bucket_start: DateTime<Utc>,
    pub bucket: TimelineBucket,
    pub total_tokens: i64,
    pub total_cost_usd: f64,
    pub event_count: usize,
    pub unique_models: usize,
    pub unique_sources: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContributionCell {
    pub day: NaiveDate,
    pub week_index: usize,
    pub weekday: u32,
    pub total_tokens: i64,
    pub total_cost_usd: f64,
    pub intensity: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterOptions {
    pub sources: Vec<String>,
    pub providers: Vec<String>,
    pub models: Vec<String>,
    pub model_families: Vec<String>,
    pub projects: Vec<String>,
    pub min_day: Option<NaiveDate>,
    pub max_day: Option<NaiveDate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AggregateSnapshot {
    pub filter: UsageFilter,
    pub overview: OverviewStats,
    pub top_models: Vec<BreakdownRow>,
    pub top_sources: Vec<BreakdownRow>,
    pub daily: Vec<DailyPoint>,
    pub contributions: Vec<ContributionCell>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanSummary {
    pub mode: String,
    pub scanned_sources: usize,
    pub discovered_artifacts: usize,
    pub imported_events: usize,
    pub skipped_artifacts: usize,
    pub started_at: DateTime<Utc>,
    pub completed_at: DateTime<Utc>,
    pub duration_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefreshEvent {
    pub kind: String,
    pub summary: ScanSummary,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SocialPreset {
    Summary,
    Wrapped,
    CommandDeck,
    SignalGrid,
}

impl fmt::Display for SocialPreset {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SocialPreset::Summary => f.write_str("summary"),
            SocialPreset::Wrapped => f.write_str("wrapped"),
            SocialPreset::CommandDeck => f.write_str("command-deck"),
            SocialPreset::SignalGrid => f.write_str("signal-grid"),
        }
    }
}

impl FromStr for SocialPreset {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim().to_ascii_lowercase().as_str() {
            "summary" => Ok(Self::Summary),
            "wrapped" => Ok(Self::Wrapped),
            "command-deck" | "command_deck" => Ok(Self::CommandDeck),
            "signal-grid" | "signal_grid" => Ok(Self::SignalGrid),
            _ => Err(format!("unknown social preset: {value}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SocialCardRequest {
    pub preset: SocialPreset,
    #[serde(default)]
    pub filter: UsageFilter,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[derive(Debug, Clone, Copy)]
pub enum ExportDataset {
    Events,
    Daily,
    Models,
    Sources,
}

impl fmt::Display for ExportDataset {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ExportDataset::Events => f.write_str("events"),
            ExportDataset::Daily => f.write_str("daily"),
            ExportDataset::Models => f.write_str("models"),
            ExportDataset::Sources => f.write_str("sources"),
        }
    }
}

impl FromStr for ExportDataset {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim().to_ascii_lowercase().as_str() {
            "events" => Ok(Self::Events),
            "daily" => Ok(Self::Daily),
            "models" => Ok(Self::Models),
            "sources" => Ok(Self::Sources),
            _ => Err(format!("unknown dataset: {value}")),
        }
    }
}
