use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode, header},
};
use rusqlite::Connection;
use tempfile::tempdir;
use token_insight::{
    AppState, api,
    domain::{InteractionMode, SourceDefinition, SourceKind},
    ingest::IngestService,
    sources::{fingerprint_for, parse_artifact},
    storage::Database,
};
use tower::ServiceExt;

fn fixture_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn definition_for(source: SourceKind, mode: InteractionMode, root: &Path) -> SourceDefinition {
    SourceDefinition {
        kind: source,
        label: source.label().to_string(),
        mode,
        roots: vec![root.to_path_buf()],
        watch_roots: vec![root.to_path_buf()],
    }
}

#[tokio::test]
async fn parses_all_source_fixtures() {
    let root = fixture_root();
    let fixtures = vec![
        (
            SourceKind::Claude,
            InteractionMode::Interactive,
            root.join("claude/sample.jsonl"),
        ),
        (
            SourceKind::Codex,
            InteractionMode::Interactive,
            root.join("codex/sample.jsonl"),
        ),
        (
            SourceKind::CodexArchived,
            InteractionMode::Interactive,
            root.join("codex/sample.jsonl"),
        ),
        (
            SourceKind::CodexHeadless,
            InteractionMode::Headless,
            root.join("codex-headless/sample.jsonl"),
        ),
        (
            SourceKind::Gemini,
            InteractionMode::Interactive,
            root.join("gemini/sample.json"),
        ),
        (
            SourceKind::Cursor,
            InteractionMode::Interactive,
            root.join("cursor/usage.csv"),
        ),
        (
            SourceKind::OpenCode,
            InteractionMode::Interactive,
            root.join("opencode/sample.json"),
        ),
        (
            SourceKind::OpenClaw,
            InteractionMode::Interactive,
            root.join("openclaw/sample.json"),
        ),
        (
            SourceKind::Amp,
            InteractionMode::Interactive,
            root.join("amp/sample.json"),
        ),
        (
            SourceKind::Droid,
            InteractionMode::Interactive,
            root.join("droid/sample.json"),
        ),
        (
            SourceKind::Pi,
            InteractionMode::Interactive,
            root.join("pi/sample.json"),
        ),
        (
            SourceKind::Kimi,
            InteractionMode::Interactive,
            root.join("kimi/sample.json"),
        ),
        (
            SourceKind::Qwen,
            InteractionMode::Interactive,
            root.join("qwen/sample.json"),
        ),
        (
            SourceKind::RooCode,
            InteractionMode::Interactive,
            root.join("roo-code/sample.json"),
        ),
        (
            SourceKind::Kilo,
            InteractionMode::Interactive,
            root.join("kilo/sample.json"),
        ),
        (
            SourceKind::Mux,
            InteractionMode::Interactive,
            root.join("mux/sample.json"),
        ),
        (
            SourceKind::Synthetic,
            InteractionMode::Interactive,
            root.join("synthetic/sample.json"),
        ),
    ];

    for (source, mode, path) in fixtures {
        let definition = definition_for(source, mode, path.parent().expect("parent"));
        let events = parse_artifact(&definition, &path).expect("parse fixture");
        assert!(
            !events.is_empty(),
            "expected parsed events for {} at {}",
            source,
            path.display()
        );
        assert!(events.iter().all(|event| event.total_tokens > 0));
    }

    let temp = tempdir().expect("tempdir");
    let sqlite_path = temp.path().join("sqlite.db");
    let seed = std::fs::read_to_string(root.join("octofriend/seed.sql")).expect("seed");
    let connection = Connection::open(&sqlite_path).expect("sqlite");
    connection.execute_batch(&seed).expect("seed exec");
    let definition = definition_for(
        SourceKind::Octofriend,
        InteractionMode::Interactive,
        temp.path(),
    );
    let events = parse_artifact(&definition, &sqlite_path).expect("parse sqlite fixture");
    assert!(!events.is_empty());
}

#[test]
fn parses_codex_models_from_turn_context() {
    let path = fixture_root().join("codex/sample.jsonl");
    let definition = definition_for(
        SourceKind::Codex,
        InteractionMode::Interactive,
        path.parent().expect("parent"),
    );
    let events = parse_artifact(&definition, &path).expect("parse fixture");
    assert!(
        events.iter().all(|event| event.model.is_some()),
        "expected codex events to carry model names"
    );
    assert!(
        events
            .iter()
            .any(|event| event.model.as_deref() == Some("gpt-5.3-codex"))
    );
    assert!(
        events
            .iter()
            .any(|event| event.model.as_deref() == Some("gpt-5.4"))
    );
}

#[tokio::test]
async fn seeds_database_and_serves_overview_api() {
    let root = fixture_root();
    let db_dir = tempdir().expect("db tempdir");
    let database = Database::new_at(db_dir.path().to_path_buf())
        .await
        .expect("database");

    let seed_paths = vec![
        (
            SourceKind::Claude,
            InteractionMode::Interactive,
            root.join("claude/sample.jsonl"),
        ),
        (
            SourceKind::Codex,
            InteractionMode::Interactive,
            root.join("codex/sample.jsonl"),
        ),
        (
            SourceKind::Gemini,
            InteractionMode::Interactive,
            root.join("gemini/sample.json"),
        ),
        (
            SourceKind::Cursor,
            InteractionMode::Interactive,
            root.join("cursor/usage.csv"),
        ),
    ];

    for (source, mode, path) in seed_paths {
        let definition = definition_for(source, mode, path.parent().expect("parent"));
        let artifact = fingerprint_for(source, &path).await.expect("fingerprint");
        let events = parse_artifact(&definition, &path).expect("parse");
        database
            .replace_artifact_events(&artifact, &events)
            .await
            .expect("insert");
    }

    let ingest = Arc::new(IngestService::new(database.clone()).await.expect("ingest"));
    let state = AppState {
        database: database.clone(),
        ingest,
    };
    let app = api::router(state, None);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/overview")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .expect("overview response");
    assert_eq!(response.status(), 200);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/breakdowns/models")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .expect("models response");
    assert_eq!(response.status(), 200);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/timeline/hourly")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .expect("hourly response");
    assert_eq!(response.status(), 200);
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("hourly body");
    let text = String::from_utf8(body.to_vec()).expect("utf8");
    assert!(text.contains("bucket_start"));

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/timeline/minutely")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .expect("minutely response");
    assert_eq!(response.status(), 200);

    for preset in ["summary", "wrapped", "command-deck", "signal-grid"] {
        let payload = serde_json::json!({
            "preset": preset,
            "filter": {
                "sources": ["codex"],
                "modelFamilies": ["gpt-5"],
                "sort": "tokens:desc",
                "excludeArchived": true
            }
        });
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/social-images/render")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .expect("social response");
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "image/png"
        );
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("social body");
        assert!(body.starts_with(&[0x89, b'P', b'N', b'G']));
    }
}
