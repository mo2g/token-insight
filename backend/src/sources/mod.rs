use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use rusqlite::{Connection, OpenFlags, types::ValueRef};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use walkdir::WalkDir;

use crate::{
    domain::{ArtifactFingerprint, InteractionMode, SourceDefinition, SourceKind, UsageEvent},
    pricing::{derive_model_family, normalize_model},
};

#[derive(Debug, Clone)]
struct ParsedContext {
    source: SourceKind,
    mode: InteractionMode,
    path: String,
    session_id: Option<String>,
    timestamp: Option<DateTime<Utc>>,
    project: Option<String>,
    cwd: Option<String>,
    provider: Option<String>,
    model: Option<String>,
    role: Option<String>,
    raw_kind: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq)]
struct TokenBundle {
    prompt_tokens: i64,
    completion_tokens: i64,
    cache_read_tokens: i64,
    cache_write_tokens: i64,
    reasoning_tokens: i64,
    tool_tokens: i64,
    total_tokens: i64,
    explicit_cost_usd: Option<f64>,
}

pub fn default_source_definitions() -> Vec<SourceDefinition> {
    let home = home_dir();
    vec![
        definition(
            SourceKind::OpenCode,
            InteractionMode::Interactive,
            &[
                home.join(".local/share/opencode/opencode.db"),
                home.join(".local/share/opencode/storage/message"),
            ],
        ),
        definition(
            SourceKind::Claude,
            InteractionMode::Interactive,
            &[home.join(".claude/projects")],
        ),
        definition(
            SourceKind::OpenClaw,
            InteractionMode::Interactive,
            &[
                home.join(".openclaw/agents"),
                home.join(".clawdbot"),
                home.join(".moltbot"),
                home.join(".moldbot"),
            ],
        ),
        definition(
            SourceKind::Codex,
            InteractionMode::Interactive,
            &[home.join(".codex/sessions")],
        ),
        definition(
            SourceKind::CodexArchived,
            InteractionMode::Interactive,
            &[home.join(".codex/archived_sessions")],
        ),
        definition(
            SourceKind::CodexHeadless,
            InteractionMode::Headless,
            &[
                home.join(".config/tokscale/headless/codex"),
                home.join("Library/Application Support/tokscale/headless/codex"),
            ],
        ),
        definition(
            SourceKind::Gemini,
            InteractionMode::Interactive,
            &[home.join(".gemini")],
        ),
        definition(
            SourceKind::Cursor,
            InteractionMode::Interactive,
            &[home.join(".config/tokscale/cursor-cache")],
        ),
        definition(
            SourceKind::Amp,
            InteractionMode::Interactive,
            &[home.join(".local/share/amp/threads")],
        ),
        definition(
            SourceKind::Droid,
            InteractionMode::Interactive,
            &[home.join(".factory/sessions")],
        ),
        definition(
            SourceKind::Pi,
            InteractionMode::Interactive,
            &[home.join(".pi/agent/sessions")],
        ),
        definition(
            SourceKind::Kimi,
            InteractionMode::Interactive,
            &[home.join(".kimi/sessions")],
        ),
        definition(
            SourceKind::Qwen,
            InteractionMode::Interactive,
            &[home.join(".qwen/projects")],
        ),
        definition(
            SourceKind::RooCode,
            InteractionMode::Interactive,
            &[
                home.join(".config/Code/User/globalStorage/rooveterinaryinc.roo-cline/tasks"),
                home.join(
                    ".vscode-server/data/User/globalStorage/rooveterinaryinc.roo-cline/tasks",
                ),
            ],
        ),
        definition(
            SourceKind::Kilo,
            InteractionMode::Interactive,
            &[
                home.join(".config/Code/User/globalStorage/kilocode.kilo-code/tasks"),
                home.join(".vscode-server/data/User/globalStorage/kilocode.kilo-code/tasks"),
            ],
        ),
        definition(
            SourceKind::Mux,
            InteractionMode::Interactive,
            &[home.join(".mux/sessions")],
        ),
        definition(
            SourceKind::Synthetic,
            InteractionMode::Interactive,
            &[home.join(".local/share/synthetic")],
        ),
        definition(
            SourceKind::Octofriend,
            InteractionMode::Interactive,
            &[home.join(".local/share/octofriend/sqlite.db")],
        ),
    ]
}

pub fn discover_artifacts(definition: &SourceDefinition) -> Vec<PathBuf> {
    let mut artifacts = Vec::new();
    for root in &definition.roots {
        if !root.exists() {
            continue;
        }
        if root.is_file() {
            if matches_source_file(definition.kind, root) {
                artifacts.push(root.clone());
            }
            continue;
        }
        for entry in WalkDir::new(root)
            .follow_links(true)
            .into_iter()
            .filter_map(Result::ok)
        {
            let path = entry.path();
            if entry.file_type().is_file() && matches_source_file(definition.kind, path) {
                artifacts.push(path.to_path_buf());
            }
        }
    }
    artifacts.sort();
    artifacts.dedup();
    artifacts
}

pub fn path_matches_source(definition: &SourceDefinition, path: &Path) -> bool {
    definition
        .watch_roots
        .iter()
        .any(|root| path.starts_with(root) || root.starts_with(path))
}

pub async fn fingerprint_for(source: SourceKind, path: &Path) -> Result<ArtifactFingerprint> {
    let metadata = tokio::fs::metadata(path).await?;
    let modified_at = metadata.modified().ok().map(DateTime::<Utc>::from);
    let bytes = tokio::fs::read(path).await.unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let digest = hex::encode(hasher.finalize());
    Ok(ArtifactFingerprint {
        source,
        path: path.display().to_string(),
        fingerprint: digest,
        modified_at,
        size_bytes: metadata.len(),
    })
}

pub fn parse_artifact(definition: &SourceDefinition, path: &Path) -> Result<Vec<UsageEvent>> {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "jsonl" => parse_jsonl(definition, path),
        "json" => parse_json(definition, path),
        "csv" => parse_csv(definition, path),
        "db" | "sqlite" => parse_sqlite(definition, path),
        _ => Ok(Vec::new()),
    }
}

fn definition(kind: SourceKind, mode: InteractionMode, roots: &[PathBuf]) -> SourceDefinition {
    SourceDefinition {
        kind,
        label: kind.label().to_string(),
        mode,
        roots: roots.to_vec(),
        watch_roots: roots.to_vec(),
    }
}

fn home_dir() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/"))
}

fn matches_source_file(source: SourceKind, path: &Path) -> bool {
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match source {
        SourceKind::Claude
        | SourceKind::Codex
        | SourceKind::CodexArchived
        | SourceKind::CodexHeadless => ext == "jsonl",
        SourceKind::Gemini => ext == "json" && path.to_string_lossy().contains("/chats/"),
        SourceKind::Cursor => ext == "csv",
        SourceKind::OpenCode => matches!(ext.as_str(), "db" | "json" | "jsonl"),
        SourceKind::Octofriend => {
            filename == "sqlite.db" || matches!(ext.as_str(), "db" | "sqlite")
        }
        _ => matches!(ext.as_str(), "json" | "jsonl" | "csv" | "db" | "sqlite"),
    }
}

fn parse_jsonl(definition: &SourceDefinition, path: &Path) -> Result<Vec<UsageEvent>> {
    let text = std::fs::read_to_string(path)?;
    match definition.kind {
        SourceKind::Claude => parse_claude_jsonl(definition, path, &text),
        SourceKind::Codex | SourceKind::CodexArchived | SourceKind::CodexHeadless => {
            parse_codex_jsonl(definition, path, &text)
        }
        _ => parse_generic_jsonl(definition, path, &text),
    }
}

fn parse_json(definition: &SourceDefinition, path: &Path) -> Result<Vec<UsageEvent>> {
    let text = std::fs::read_to_string(path)?;
    let value: Value = serde_json::from_str(&text)?;
    match definition.kind {
        SourceKind::Gemini => parse_gemini_json(definition, path, &value),
        _ => {
            let base = base_context(definition, path, &value);
            let mut events = Vec::new();
            collect_events_from_json(&value, &base, "$", &mut events);
            Ok(events)
        }
    }
}

fn parse_csv(definition: &SourceDefinition, path: &Path) -> Result<Vec<UsageEvent>> {
    let mut reader = csv::Reader::from_path(path)?;
    let headers = reader
        .headers()?
        .iter()
        .map(|value| value.to_ascii_lowercase())
        .collect::<Vec<_>>();
    let mut events = Vec::new();
    for (index, row) in reader.records().enumerate() {
        let row = row?;
        let mut values = HashMap::new();
        for (header, value) in headers.iter().zip(row.iter()) {
            values.insert(header.as_str(), value.to_string());
        }
        let tokens = TokenBundle {
            prompt_tokens: parse_i64_alias(&values, &["input_tokens", "prompt_tokens", "input"]),
            completion_tokens: parse_i64_alias(
                &values,
                &["output_tokens", "completion_tokens", "output"],
            ),
            cache_read_tokens: parse_i64_alias(
                &values,
                &["cache_read_tokens", "cache_read", "cached"],
            ),
            cache_write_tokens: parse_i64_alias(&values, &["cache_write_tokens", "cache_write"]),
            reasoning_tokens: parse_i64_alias(&values, &["reasoning_tokens", "thoughts"]),
            tool_tokens: parse_i64_alias(&values, &["tool_tokens"]),
            total_tokens: parse_i64_alias(&values, &["total_tokens", "total"]),
            explicit_cost_usd: parse_f64_alias(&values, &["cost", "estimated_cost_usd"]),
        }
        .with_total();

        if tokens.total_tokens <= 0 {
            continue;
        }

        let timestamp = values
            .get("timestamp")
            .or_else(|| values.get("date"))
            .or_else(|| values.get("created_at"))
            .and_then(|value| parse_datetime_str(value))
            .unwrap_or_else(Utc::now);
        let model = values
            .get("model")
            .cloned()
            .or_else(|| values.get("model_name").cloned());
        let provider = values
            .get("provider")
            .cloned()
            .or_else(|| values.get("vendor").cloned());
        let project = values
            .get("project")
            .cloned()
            .or_else(|| values.get("cwd").cloned());

        let mut event = event_from_context(
            ParsedContext {
                source: definition.kind,
                mode: definition.mode,
                path: path.display().to_string(),
                session_id: values.get("session_id").cloned(),
                timestamp: Some(timestamp),
                project: project.clone(),
                cwd: values.get("cwd").cloned().or(project),
                provider,
                model,
                role: None,
                raw_kind: Some("csv-row".into()),
            },
            tokens,
            &format!("csv:{index}"),
        );
        if event.model_family.is_none() {
            event.model_family = event.model.as_deref().map(derive_model_family);
        }
        events.push(event);
    }
    Ok(events)
}

fn parse_sqlite(definition: &SourceDefinition, path: &Path) -> Result<Vec<UsageEvent>> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let mut stmt = conn.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )?;
    let tables = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    let mut events = Vec::new();
    for table in tables {
        let query = format!("SELECT * FROM \"{table}\"");
        let mut statement = match conn.prepare(&query) {
            Ok(statement) => statement,
            Err(_) => continue,
        };
        let columns = statement
            .column_names()
            .iter()
            .map(|value| value.to_string())
            .collect::<Vec<_>>();
        let mut rows = statement.query([])?;
        let mut index = 0usize;
        while let Some(row) = rows.next()? {
            let mut object = Map::new();
            for (column_index, column_name) in columns.iter().enumerate() {
                object.insert(
                    column_name.clone(),
                    sqlite_value_to_json(row.get_ref(column_index)?),
                );
            }
            let value = Value::Object(object);
            let base = base_context(definition, path, &value);
            collect_events_from_json(
                &value,
                &base,
                &format!("sqlite:{table}:{index}"),
                &mut events,
            );
            index += 1;
        }
    }
    Ok(events)
}

fn parse_claude_jsonl(
    definition: &SourceDefinition,
    path: &Path,
    text: &str,
) -> Result<Vec<UsageEvent>> {
    let mut events = Vec::new();
    for (index, line) in text.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        let value: Value = match serde_json::from_str(line) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let Some(object) = value.as_object() else {
            continue;
        };
        let usage = object
            .get("message")
            .and_then(|value| value.get("usage"))
            .or_else(|| object.get("usage"));
        let Some(usage) = usage else {
            continue;
        };
        let Some(tokens) = token_bundle_from_value(usage).map(TokenBundle::with_total) else {
            continue;
        };
        if tokens.total_tokens <= 0 {
            continue;
        }
        let message = object.get("message").and_then(Value::as_object);
        let timestamp = extract_datetime(object, &["timestamp"]).unwrap_or_else(Utc::now);
        let model = message
            .and_then(|message| extract_string(message, &["model"]))
            .or_else(|| extract_string(object, &["model"]));
        let provider = infer_provider(model.as_deref());
        let mut event = event_from_context(
            ParsedContext {
                source: definition.kind,
                mode: definition.mode,
                path: path.display().to_string(),
                session_id: extract_string(object, &["sessionId", "session_id"]),
                timestamp: Some(timestamp),
                project: extract_string(object, &["cwd", "project"])
                    .or_else(|| infer_project_from_path(path)),
                cwd: extract_string(object, &["cwd"]),
                provider,
                model,
                role: extract_string(object, &["type", "userType"]),
                raw_kind: Some("claude-message".into()),
            },
            tokens,
            &format!("jsonl:{index}"),
        );
        if event.model_family.is_none() {
            event.model_family = event.model.as_deref().map(derive_model_family);
        }
        events.push(event);
    }
    Ok(events)
}

fn parse_codex_jsonl(
    definition: &SourceDefinition,
    path: &Path,
    text: &str,
) -> Result<Vec<UsageEvent>> {
    let mut events = Vec::new();
    let mut session_context = base_context(definition, path, &Value::Null);
    let mut previous_totals: Option<TokenBundle> = None;

    for (index, line) in text.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        let value: Value = match serde_json::from_str(line) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if let Some(object) = value.as_object() {
            if object.get("type").and_then(Value::as_str) == Some("session_meta") {
                if let Some(payload) = object.get("payload").and_then(Value::as_object) {
                    session_context.session_id = extract_string(payload, &["id", "sessionId"]);
                    session_context.cwd = extract_string(payload, &["cwd"]);
                    session_context.project = session_context
                        .cwd
                        .clone()
                        .or_else(|| infer_project_from_path(path));
                    session_context.provider = extract_string(payload, &["model_provider"]);
                    session_context.model = extract_model_from_object(payload);
                }
            }

            if object.get("type").and_then(Value::as_str) == Some("turn_context") {
                if let Some(payload) = object.get("payload").and_then(Value::as_object) {
                    session_context.cwd =
                        extract_string(payload, &["cwd"]).or_else(|| session_context.cwd.clone());
                    session_context.project = session_context
                        .cwd
                        .clone()
                        .or_else(|| session_context.project.clone())
                        .or_else(|| infer_project_from_path(path));
                    session_context.model = extract_model_from_object(payload)
                        .or_else(|| session_context.model.clone());
                    session_context.provider =
                        extract_string(payload, &["model_provider", "provider"])
                            .or_else(|| infer_provider(session_context.model.as_deref()))
                            .or_else(|| session_context.provider.clone());
                }
            }

            if object.get("type").and_then(Value::as_str) == Some("event_msg") {
                let payload = object.get("payload").and_then(Value::as_object);
                if payload
                    .and_then(|payload| payload.get("type"))
                    .and_then(Value::as_str)
                    == Some("token_count")
                {
                    let info = payload
                        .and_then(|payload| payload.get("info"))
                        .and_then(Value::as_object);
                    let last_usage = info
                        .and_then(|info| info.get("last_token_usage"))
                        .and_then(token_bundle_from_value)
                        .map(TokenBundle::with_total);
                    let total_usage = info
                        .and_then(|info| info.get("total_token_usage"))
                        .and_then(token_bundle_from_value)
                        .map(TokenBundle::with_total);
                    let tokens = if let Some(last) = last_usage {
                        last
                    } else if let Some(total) = total_usage.clone() {
                        subtract_token_bundle(&total, previous_totals.as_ref()).with_total()
                    } else {
                        continue;
                    };

                    if let Some(total) = total_usage {
                        previous_totals = Some(total);
                    }

                    if tokens.total_tokens <= 0 {
                        continue;
                    }
                    let timestamp =
                        extract_datetime(object, &["timestamp"]).unwrap_or_else(Utc::now);
                    let info_model = info.and_then(extract_model_from_object);
                    let model = info_model
                        .or_else(|| session_context.model.clone())
                        .or_else(|| Some("gpt-5".into()));
                    let mut event = event_from_context(
                        ParsedContext {
                            source: definition.kind,
                            mode: definition.mode,
                            path: path.display().to_string(),
                            session_id: session_context.session_id.clone(),
                            timestamp: Some(timestamp),
                            project: session_context.project.clone(),
                            cwd: session_context.cwd.clone(),
                            provider: session_context
                                .provider
                                .clone()
                                .or_else(|| infer_provider(model.as_deref()))
                                .or_else(|| Some("openai".into())),
                            model,
                            role: Some("assistant".into()),
                            raw_kind: Some("codex-token-count".into()),
                        },
                        tokens,
                        &format!("jsonl:{index}"),
                    );
                    if event.model_family.is_none() {
                        event.model_family = event.model.as_deref().map(derive_model_family);
                    }
                    events.push(event);
                }
            }
        }
    }

    Ok(events)
}

fn extract_model_from_object(object: &Map<String, Value>) -> Option<String> {
    extract_string(object, &["model", "model_name"])
        .or_else(|| object.get("metadata").and_then(extract_model_from_value))
        .or_else(|| object.get("output").and_then(extract_model_from_value))
        .or_else(|| object.get("settings").and_then(extract_model_from_value))
        .or_else(|| {
            object
                .get("collaboration_mode")
                .and_then(Value::as_object)
                .and_then(|mode| mode.get("settings"))
                .and_then(extract_model_from_value)
        })
}

fn extract_model_from_value(value: &Value) -> Option<String> {
    match value {
        Value::Object(object) => extract_string(object, &["model", "model_name"])
            .or_else(|| {
                object
                    .get("output")
                    .and_then(Value::as_object)
                    .and_then(|output| extract_string(output, &["model", "model_name"]))
            })
            .or_else(|| {
                object
                    .get("metadata")
                    .and_then(Value::as_object)
                    .and_then(|metadata| extract_string(metadata, &["model", "model_name"]))
            }),
        Value::String(raw) => serde_json::from_str::<Value>(raw)
            .ok()
            .and_then(|parsed| extract_model_from_value(&parsed)),
        _ => None,
    }
}

fn parse_generic_jsonl(
    definition: &SourceDefinition,
    path: &Path,
    text: &str,
) -> Result<Vec<UsageEvent>> {
    let mut events = Vec::new();
    for (index, line) in text.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        let value: Value = match serde_json::from_str(line) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let base = base_context(definition, path, &value);
        collect_events_from_json(&value, &base, &format!("jsonl:{index}"), &mut events);
    }
    Ok(events)
}

fn parse_gemini_json(
    definition: &SourceDefinition,
    path: &Path,
    value: &Value,
) -> Result<Vec<UsageEvent>> {
    let root = value
        .as_object()
        .context("expected gemini session object")?;
    let mut events = Vec::new();
    let session_id = extract_string(root, &["sessionId", "session_id"]);
    let project = extract_string(root, &["projectHash", "project"]);

    if let Some(messages) = root.get("messages").and_then(Value::as_array) {
        for (index, message) in messages.iter().enumerate() {
            let Some(tokens) = message
                .get("tokens")
                .and_then(token_bundle_from_value)
                .map(TokenBundle::with_total)
            else {
                continue;
            };
            if tokens.total_tokens <= 0 {
                continue;
            }
            let message_object = message.as_object().cloned().unwrap_or_default();
            let timestamp =
                extract_datetime(&message_object, &["timestamp"]).unwrap_or_else(|| {
                    extract_datetime(root, &["lastUpdated", "startTime"]).unwrap_or_else(Utc::now)
                });
            let model = extract_string(&message_object, &["model"]);
            let mut event = event_from_context(
                ParsedContext {
                    source: definition.kind,
                    mode: definition.mode,
                    path: path.display().to_string(),
                    session_id: session_id.clone(),
                    timestamp: Some(timestamp),
                    project: project.clone(),
                    cwd: project.clone(),
                    provider: infer_provider(model.as_deref()),
                    model,
                    role: extract_string(&message_object, &["type"]),
                    raw_kind: Some("gemini-message".into()),
                },
                tokens,
                &format!("json:{index}"),
            );
            if event.model_family.is_none() {
                event.model_family = event.model.as_deref().map(derive_model_family);
            }
            events.push(event);
        }
    }
    Ok(events)
}

fn base_context(definition: &SourceDefinition, path: &Path, value: &Value) -> ParsedContext {
    let object = value.as_object().cloned().unwrap_or_default();
    let model = extract_string(&object, &["model", "model_name"]);
    ParsedContext {
        source: definition.kind,
        mode: definition.mode,
        path: path.display().to_string(),
        session_id: extract_string(&object, &["sessionId", "session_id", "threadId", "id"]),
        timestamp: extract_datetime(
            &object,
            &["timestamp", "created_at", "updated_at", "startTime"],
        ),
        project: extract_string(&object, &["project", "projectHash", "workspace", "repo"])
            .or_else(|| infer_project_from_path(path)),
        cwd: extract_string(&object, &["cwd"]),
        provider: extract_string(&object, &["provider", "vendor"])
            .or_else(|| infer_provider(model.as_deref())),
        model,
        role: extract_string(&object, &["role", "type"]),
        raw_kind: extract_string(&object, &["type"]),
    }
}

fn collect_events_from_json(
    value: &Value,
    context: &ParsedContext,
    breadcrumb: &str,
    events: &mut Vec<UsageEvent>,
) {
    match value {
        Value::Object(object) => {
            let merged = merge_context(context, object);
            let mut produced_here = false;
            if let Some(tokens) = token_bundle_from_value(value).map(TokenBundle::with_total) {
                if tokens.total_tokens > 0 {
                    let mut event = event_from_context(merged.clone(), tokens, breadcrumb);
                    if event.model_family.is_none() {
                        event.model_family = event.model.as_deref().map(derive_model_family);
                    }
                    events.push(event);
                    produced_here = true;
                }
            }

            for (key, child) in object {
                if produced_here && matches!(key.as_str(), "usage" | "tokens") {
                    continue;
                }
                let next = format!("{breadcrumb}.{key}");
                collect_events_from_json(child, &merged, &next, events);
            }
        }
        Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                let next = format!("{breadcrumb}[{index}]");
                collect_events_from_json(item, context, &next, events);
            }
        }
        _ => {}
    }
}

fn merge_context(context: &ParsedContext, object: &Map<String, Value>) -> ParsedContext {
    let model = extract_string(object, &["model", "model_name"]).or_else(|| context.model.clone());
    ParsedContext {
        source: context.source,
        mode: context.mode,
        path: context.path.clone(),
        session_id: extract_string(object, &["sessionId", "session_id", "threadId", "id"])
            .or_else(|| context.session_id.clone()),
        timestamp: extract_datetime(
            object,
            &[
                "timestamp",
                "created_at",
                "updated_at",
                "date",
                "startTime",
                "lastUpdated",
            ],
        )
        .or(context.timestamp),
        project: extract_string(object, &["project", "workspace", "repo", "projectHash"])
            .or_else(|| context.project.clone()),
        cwd: extract_string(object, &["cwd"]).or_else(|| context.cwd.clone()),
        provider: extract_string(object, &["provider", "vendor"])
            .or_else(|| infer_provider(model.as_deref()))
            .or_else(|| context.provider.clone()),
        model,
        role: extract_string(object, &["role", "type"]).or_else(|| context.role.clone()),
        raw_kind: extract_string(object, &["type"]).or_else(|| context.raw_kind.clone()),
    }
}

fn event_from_context(context: ParsedContext, tokens: TokenBundle, local_id: &str) -> UsageEvent {
    let model_family = context.model.as_deref().map(derive_model_family);
    let timestamp = context.timestamp.unwrap_or_else(Utc::now);
    let event_id = event_id(
        context.source,
        &context.path,
        local_id,
        timestamp,
        tokens.total_tokens,
    );
    let mut event = UsageEvent {
        event_id,
        source: context.source,
        source_path: context.path,
        session_id: context.session_id,
        timestamp,
        project: context.project,
        cwd: context.cwd,
        provider: context.provider,
        model: context.model.clone(),
        model_family,
        prompt_tokens: tokens.prompt_tokens,
        completion_tokens: tokens.completion_tokens,
        cache_read_tokens: tokens.cache_read_tokens,
        cache_write_tokens: tokens.cache_write_tokens,
        reasoning_tokens: tokens.reasoning_tokens,
        tool_tokens: tokens.tool_tokens,
        total_tokens: tokens.total_tokens,
        estimated_cost_usd: tokens.explicit_cost_usd,
        mode: context.mode,
        message_role: context.role,
        raw_kind: context.raw_kind,
        search_text: String::new(),
    };
    event.search_text = event.build_search_text();
    event
}

fn token_bundle_from_value(value: &Value) -> Option<TokenBundle> {
    let object = value.as_object()?;
    let nested = object
        .get("usage")
        .or_else(|| object.get("tokens"))
        .and_then(token_bundle_from_value);
    if let Some(bundle) = nested {
        return Some(bundle);
    }

    let prompt = extract_number(object, &["input_tokens", "prompt_tokens", "input"]);
    let completion = extract_number(object, &["output_tokens", "completion_tokens", "output"]);
    let cache_read = extract_number(
        object,
        &[
            "cache_read_tokens",
            "cached_input_tokens",
            "cache_read",
            "cached",
        ],
    );
    let cache_write = extract_number(object, &["cache_write_tokens", "cache_write"]);
    let reasoning = extract_number(
        object,
        &["reasoning_tokens", "reasoning_output_tokens", "thoughts"],
    );
    let tool = extract_number(object, &["tool_tokens", "tool"]);
    let total = extract_number(object, &["total_tokens", "total"]);
    let cost = extract_float(object, &["estimated_cost_usd", "cost"]);

    if [
        prompt,
        completion,
        cache_read,
        cache_write,
        reasoning,
        tool,
        total,
    ]
    .into_iter()
    .all(|value| value == 0)
    {
        return None;
    }

    Some(TokenBundle {
        prompt_tokens: prompt,
        completion_tokens: completion,
        cache_read_tokens: cache_read,
        cache_write_tokens: cache_write,
        reasoning_tokens: reasoning,
        tool_tokens: tool,
        total_tokens: total,
        explicit_cost_usd: cost,
    })
}

impl TokenBundle {
    fn with_total(mut self) -> Self {
        if self.total_tokens == 0 {
            self.total_tokens = self.prompt_tokens
                + self.completion_tokens
                + self.cache_read_tokens
                + self.cache_write_tokens
                + self.reasoning_tokens
                + self.tool_tokens;
        }
        self
    }
}

fn subtract_token_bundle(current: &TokenBundle, previous: Option<&TokenBundle>) -> TokenBundle {
    let subtract = |value: i64, previous_value: i64| (value - previous_value).max(0);
    let previous = previous.cloned().unwrap_or_default();
    TokenBundle {
        prompt_tokens: subtract(current.prompt_tokens, previous.prompt_tokens),
        completion_tokens: subtract(current.completion_tokens, previous.completion_tokens),
        cache_read_tokens: subtract(current.cache_read_tokens, previous.cache_read_tokens),
        cache_write_tokens: subtract(current.cache_write_tokens, previous.cache_write_tokens),
        reasoning_tokens: subtract(current.reasoning_tokens, previous.reasoning_tokens),
        tool_tokens: subtract(current.tool_tokens, previous.tool_tokens),
        total_tokens: subtract(current.total_tokens, previous.total_tokens),
        explicit_cost_usd: None,
    }
}

fn extract_datetime(object: &Map<String, Value>, keys: &[&str]) -> Option<DateTime<Utc>> {
    keys.iter()
        .find_map(|key| object.get(*key).and_then(parse_datetime_value))
}

fn parse_datetime_value(value: &Value) -> Option<DateTime<Utc>> {
    match value {
        Value::String(value) => parse_datetime_str(value),
        Value::Number(value) => {
            let value = value.as_i64()?;
            if value > 10_000_000_000 {
                Utc.timestamp_millis_opt(value).single()
            } else {
                Utc.timestamp_opt(value, 0).single()
            }
        }
        _ => None,
    }
}

fn parse_datetime_str(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|value| value.with_timezone(&Utc))
        .ok()
        .or_else(|| {
            NaiveDate::parse_from_str(value, "%Y-%m-%d")
                .ok()
                .and_then(|value| value.and_hms_opt(0, 0, 0))
                .map(|value| Utc.from_utc_datetime(&value))
        })
}

fn extract_string(object: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| match object.get(*key) {
        Some(Value::String(value)) if !value.trim().is_empty() => Some(value.trim().to_string()),
        Some(Value::Number(value)) => Some(value.to_string()),
        _ => None,
    })
}

fn extract_number(object: &Map<String, Value>, keys: &[&str]) -> i64 {
    keys.iter()
        .find_map(|key| match object.get(*key) {
            Some(Value::Number(value)) => value.as_i64(),
            Some(Value::String(value)) => value.parse().ok(),
            _ => None,
        })
        .unwrap_or_default()
}

fn extract_float(object: &Map<String, Value>, keys: &[&str]) -> Option<f64> {
    keys.iter().find_map(|key| match object.get(*key) {
        Some(Value::Number(value)) => value.as_f64(),
        Some(Value::String(value)) => value.parse().ok(),
        _ => None,
    })
}

fn parse_i64_alias(values: &HashMap<&str, String>, aliases: &[&str]) -> i64 {
    aliases
        .iter()
        .find_map(|alias| values.get(alias).and_then(|value| value.parse().ok()))
        .unwrap_or_default()
}

fn parse_f64_alias(values: &HashMap<&str, String>, aliases: &[&str]) -> Option<f64> {
    aliases
        .iter()
        .find_map(|alias| values.get(alias).and_then(|value| value.parse().ok()))
}

fn infer_provider(model: Option<&str>) -> Option<String> {
    let normalized = normalize_model(model.unwrap_or_default());
    if normalized.starts_with("claude") {
        Some("anthropic".into())
    } else if normalized.starts_with("gpt")
        || normalized.starts_with("o1")
        || normalized.starts_with("o3")
    {
        Some("openai".into())
    } else if normalized.starts_with("gemini") {
        Some("google".into())
    } else if normalized.starts_with("grok") {
        Some("xai".into())
    } else if normalized.starts_with("qwen") {
        Some("alibaba".into())
    } else {
        None
    }
}

fn infer_project_from_path(path: &Path) -> Option<String> {
    path.parent().map(|parent| parent.display().to_string())
}

fn event_id(
    source: SourceKind,
    path: &str,
    local_id: &str,
    timestamp: DateTime<Utc>,
    total_tokens: i64,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(source.as_str().as_bytes());
    hasher.update(path.as_bytes());
    hasher.update(local_id.as_bytes());
    hasher.update(timestamp.to_rfc3339().as_bytes());
    hasher.update(total_tokens.to_string().as_bytes());
    hex::encode(hasher.finalize())
}

fn sqlite_value_to_json(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(value) => Value::from(value),
        ValueRef::Real(value) => Value::from(value),
        ValueRef::Text(bytes) => {
            let text = String::from_utf8_lossy(bytes).to_string();
            serde_json::from_str(&text).unwrap_or(Value::String(text))
        }
        ValueRef::Blob(bytes) => Value::String(hex::encode(bytes)),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{TokenBundle, token_bundle_from_value};

    #[test]
    fn extracts_nested_usage_tokens() {
        let value = json!({"usage": {"input_tokens": 10, "output_tokens": 5}});
        assert_eq!(
            token_bundle_from_value(&value),
            Some(TokenBundle {
                prompt_tokens: 10,
                completion_tokens: 5,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                reasoning_tokens: 0,
                tool_tokens: 0,
                total_tokens: 0,
                explicit_cost_usd: None,
            })
        );
    }
}
