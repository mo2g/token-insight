use std::sync::Arc;

use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode, header},
};
use chrono::{TimeZone, Utc};
use tempfile::tempdir;
use token_insight::{
    AppState, api,
    domain::{ArtifactFingerprint, InteractionMode, SourceKind, UsageEvent},
    ingest::IngestService,
    storage::Database,
};
use tower::ServiceExt;

fn sample_export_event() -> (ArtifactFingerprint, Vec<UsageEvent>) {
    let timestamp = Utc
        .with_ymd_and_hms(2025, 1, 2, 3, 4, 5)
        .single()
        .expect("timestamp");
    let mut event = UsageEvent {
        event_id: "evt-1".into(),
        source: SourceKind::Codex,
        source_path: "/tmp/sample.json".into(),
        session_id: Some("session-1".into()),
        timestamp,
        project: Some("demo".into()),
        cwd: Some("/workspace".into()),
        provider: Some("openai".into()),
        model: Some("gpt-5".into()),
        model_family: Some("gpt-5".into()),
        prompt_tokens: 10,
        completion_tokens: 20,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        reasoning_tokens: 0,
        tool_tokens: 0,
        total_tokens: 30,
        estimated_cost_usd: Some(0.12),
        mode: InteractionMode::Interactive,
        message_role: Some("user".into()),
        raw_kind: Some("message".into()),
        search_text: String::new(),
    };
    event.search_text = event.build_search_text();

    let artifact = ArtifactFingerprint {
        source: SourceKind::Codex,
        path: event.source_path.clone(),
        fingerprint: "abc123".into(),
        modified_at: Some(timestamp),
        size_bytes: 42,
    };

    (artifact, vec![event])
}

async fn test_app() -> (tempfile::TempDir, axum::Router) {
    let tempdir = tempdir().expect("tempdir");
    let database = Database::new_at(tempdir.path().to_path_buf())
        .await
        .expect("database");
    let (artifact, events) = sample_export_event();
    database
        .replace_artifact_events(&artifact, &events)
        .await
        .expect("seed export data");

    let ingest = Arc::new(IngestService::new(database.clone()).await.expect("ingest"));
    let state = AppState { database, ingest };
    let app = api::router(state, None);
    (tempdir, app)
}

#[tokio::test]
async fn export_json_and_csv_are_downloadable() {
    let (_tempdir, app) = test_app().await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/export/events.json")
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("json response");
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(header::CONTENT_TYPE).unwrap(),
        "application/json; charset=utf-8"
    );
    assert_eq!(
        response.headers().get(header::CONTENT_DISPOSITION).unwrap(),
        "attachment; filename=token-insight-events.json"
    );
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("json body");
    let json = String::from_utf8(body.to_vec()).expect("json utf8");
    assert!(json.contains("\"evt-1\""));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/export/events.csv")
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("csv response");
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(header::CONTENT_TYPE).unwrap(),
        "text/csv; charset=utf-8"
    );
    assert_eq!(
        response.headers().get(header::CONTENT_DISPOSITION).unwrap(),
        "attachment; filename=token-insight-events.csv"
    );
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("csv body");
    let csv = String::from_utf8(body.to_vec()).expect("csv utf8");
    assert!(csv.contains("event_id,source,source_path"));
    assert!(csv.contains("evt-1"));
}
