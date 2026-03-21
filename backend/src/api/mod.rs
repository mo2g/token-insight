use std::{net::SocketAddr, path::PathBuf};

use anyhow::Result;
use axum::{
    Json, Router,
    body::Body,
    extract::{Path, Query, State},
    http::{HeaderValue, StatusCode, header},
    response::{
        Html, IntoResponse, Response,
        sse::{Event, KeepAlive, Sse},
    },
    routing::{get, post},
};
use futures::Stream;
use serde::Deserialize;
use tokio_stream::{StreamExt, wrappers::BroadcastStream};
use tower_http::{
    cors::CorsLayer,
    services::{ServeDir, ServeFile},
};

use crate::{
    AppState,
    domain::{ExportDataset, SocialCardRequest, TimelineBucket, UsageFilter, UsageFilterQuery},
    social,
};

#[derive(Debug, Deserialize)]
struct ExportQuery {
    dataset: Option<String>,
    #[serde(flatten)]
    filter: UsageFilterQuery,
}

pub async fn serve(state: AppState, port: u16, static_dir: Option<PathBuf>) -> Result<()> {
    let router = router(state.clone(), static_dir);
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(address).await?;
    tracing::info!(%address, "token insight server listening");
    axum::serve(listener, router).await?;
    Ok(())
}

pub fn router(state: AppState, static_dir: Option<PathBuf>) -> Router {
    let mut router = Router::new()
        .route("/api/health", get(health))
        .route("/api/sources", get(list_sources))
        .route("/api/refresh", post(refresh))
        .route("/api/export/events.:format", get(export))
        .route("/api/overview", get(overview))
        .route("/api/breakdowns/models", get(models_breakdown))
        .route("/api/breakdowns/sources", get(sources_breakdown))
        .route("/api/timeline/daily", get(timeline_daily))
        .route("/api/timeline/hourly", get(timeline_hourly))
        .route("/api/timeline/minutely", get(timeline_minutely))
        .route("/api/contributions", get(contributions))
        .route("/api/filters/options", get(filter_options))
        .route("/api/events/stream", get(event_stream))
        .route("/api/social-images/render", post(render_social_image))
        .with_state(state)
        .layer(CorsLayer::permissive());

    if let Some(static_dir) = static_dir.or_else(default_static_dir) {
        if static_dir.exists() {
            router = router.fallback_service(
                ServeDir::new(&static_dir).fallback(ServeFile::new(static_dir.join("index.html"))),
            );
        } else {
            router = router.fallback(get(index_help));
        }
    } else {
        router = router.fallback(get(index_help));
    }

    router
}

async fn health(State(state): State<AppState>) -> impl IntoResponse {
    let last_refresh_at = state.database.last_refresh_at().await.ok().flatten();
    Json(serde_json::json!({
        "status": "ok",
        "db_path": state.database.path().display().to_string(),
        "last_refresh_at": last_refresh_at,
    }))
}

async fn list_sources(State(state): State<AppState>) -> Result<Json<serde_json::Value>, AppError> {
    let sources = state
        .database
        .source_statuses(&state.ingest.definitions())
        .await?;
    Ok(Json(serde_json::json!(sources)))
}

async fn refresh(State(state): State<AppState>) -> Result<Json<serde_json::Value>, AppError> {
    let summary = state.ingest.refresh_all().await?;
    Ok(Json(serde_json::json!(summary)))
}

async fn overview(
    State(state): State<AppState>,
    Query(filter): Query<UsageFilterQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let snapshot = state.database.snapshot(&UsageFilter::from(filter)).await?;
    Ok(Json(serde_json::json!(snapshot.overview)))
}

async fn models_breakdown(
    State(state): State<AppState>,
    Query(filter): Query<UsageFilterQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let snapshot = state.database.snapshot(&UsageFilter::from(filter)).await?;
    Ok(Json(serde_json::json!(snapshot.top_models)))
}

async fn sources_breakdown(
    State(state): State<AppState>,
    Query(filter): Query<UsageFilterQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let snapshot = state.database.snapshot(&UsageFilter::from(filter)).await?;
    Ok(Json(serde_json::json!(snapshot.top_sources)))
}

async fn timeline_daily(
    State(state): State<AppState>,
    Query(filter): Query<UsageFilterQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    timeline_by_bucket(state, filter, TimelineBucket::Day).await
}

async fn timeline_hourly(
    State(state): State<AppState>,
    Query(filter): Query<UsageFilterQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    timeline_by_bucket(state, filter, TimelineBucket::Hour).await
}

async fn timeline_minutely(
    State(state): State<AppState>,
    Query(filter): Query<UsageFilterQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    timeline_by_bucket(state, filter, TimelineBucket::Minute).await
}

async fn timeline_by_bucket(
    state: AppState,
    filter: UsageFilterQuery,
    bucket: TimelineBucket,
) -> Result<Json<serde_json::Value>, AppError> {
    let timeline = state
        .database
        .timeline(&UsageFilter::from(filter), bucket)
        .await?;
    Ok(Json(serde_json::json!(timeline)))
}

async fn contributions(
    State(state): State<AppState>,
    Query(filter): Query<UsageFilterQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let snapshot = state.database.snapshot(&UsageFilter::from(filter)).await?;
    Ok(Json(serde_json::json!(snapshot.contributions)))
}

async fn filter_options(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let options = state.database.filter_options().await?;
    Ok(Json(serde_json::json!(options)))
}

async fn export(
    Path(format): Path<String>,
    State(state): State<AppState>,
    Query(query): Query<ExportQuery>,
) -> Result<Response, AppError> {
    let dataset = query
        .dataset
        .as_deref()
        .unwrap_or("events")
        .parse::<ExportDataset>()
        .map_err(anyhow::Error::msg)?;
    let is_csv = format.eq_ignore_ascii_case("csv");
    let bytes = state
        .database
        .export_dataset(dataset, is_csv, &UsageFilter::from(query.filter))
        .await?;
    let content_type = if is_csv {
        "text/csv; charset=utf-8"
    } else {
        "application/json; charset=utf-8"
    };
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, HeaderValue::from_static(content_type))
        .body(Body::from(bytes))
        .expect("response"))
}

async fn render_social_image(
    State(state): State<AppState>,
    Json(request): Json<SocialCardRequest>,
) -> Result<Response, AppError> {
    let bytes = social::render_card(&state.database, request).await?;
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, HeaderValue::from_static("image/png"))
        .body(Body::from(bytes))
        .expect("png response"))
}

async fn event_stream(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>> {
    let stream =
        BroadcastStream::new(state.ingest.subscribe()).filter_map(|message| match message {
            Ok(message) => Some(Ok(Event::default()
                .event("refresh")
                .json_data(message)
                .ok()?)),
            Err(_) => None,
        });
    Sse::new(stream).keep_alive(KeepAlive::new().text("keep-alive"))
}

async fn index_help() -> Html<&'static str> {
    Html(
        "<h1>Token Insight backend is running</h1><p>Build the frontend and start with token-insight serve --static-dir ./frontend/dist</p>",
    )
}

fn default_static_dir() -> Option<PathBuf> {
    let cwd = std::env::current_dir().ok()?;
    let candidate = cwd.join("frontend/dist");
    if candidate.exists() {
        return Some(candidate);
    }
    Some(cwd.join("../frontend/dist"))
}

struct AppError(anyhow::Error);

impl<E> From<E> for AppError
where
    E: Into<anyhow::Error>,
{
    fn from(error: E) -> Self {
        Self(error.into())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "error": self.0.to_string()
            })),
        )
            .into_response()
    }
}
