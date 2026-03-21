use std::{path::PathBuf, str::FromStr, sync::Arc};

use anyhow::Result;
use clap::{Args, Parser, Subcommand, ValueEnum};
use token_insight::{
    api, build_state,
    domain::{ExportDataset, SocialCardRequest, SocialPreset, UsageFilter, UsageFilterQuery},
    init_tracing,
};

#[derive(Debug, Parser)]
#[command(
    name = "token-insight",
    version,
    about = "Local multi-source token usage dashboard"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    Sources(OutputArgs),
    Watch,
    Refresh,
    Serve(ServeArgs),
    Export(ExportArgs),
    SocialImage(SocialImageArgs),
}

#[derive(Debug, Args, Default)]
struct OutputArgs {
    #[arg(long)]
    json: bool,
}

#[derive(Debug, Args)]
struct ServeArgs {
    #[arg(long, default_value_t = 8787)]
    port: u16,
    #[arg(long)]
    static_dir: Option<PathBuf>,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum FormatArg {
    Json,
    Csv,
}

#[derive(Debug, Args)]
struct ExportArgs {
    #[arg(long, default_value = "events")]
    dataset: String,
    #[arg(long, value_enum, default_value_t = FormatArg::Json)]
    format: FormatArg,
    #[arg(long)]
    output: Option<PathBuf>,
    #[command(flatten)]
    filter: FilterArgs,
}

#[derive(Debug, Args)]
struct SocialImageArgs {
    #[arg(long, default_value = "summary")]
    preset: String,
    #[arg(long)]
    output: PathBuf,
    #[arg(long)]
    width: Option<u32>,
    #[arg(long)]
    height: Option<u32>,
    #[command(flatten)]
    filter: FilterArgsWithoutPreset,
}

#[derive(Debug, Args, Default)]
struct FilterArgs {
    #[arg(long)]
    sources: Option<String>,
    #[arg(long)]
    providers: Option<String>,
    #[arg(long)]
    models: Option<String>,
    #[arg(long)]
    model_families: Option<String>,
    #[arg(long)]
    projects: Option<String>,
    #[arg(long)]
    since: Option<String>,
    #[arg(long)]
    until: Option<String>,
    #[arg(long)]
    preset: Option<String>,
    #[arg(long)]
    mode: Option<String>,
    #[arg(long)]
    min_tokens: Option<i64>,
    #[arg(long)]
    max_tokens: Option<i64>,
    #[arg(long)]
    min_cost: Option<f64>,
    #[arg(long)]
    max_cost: Option<f64>,
    #[arg(long)]
    search: Option<String>,
    #[arg(long)]
    group_by: Option<String>,
    #[arg(long)]
    sort: Option<String>,
    #[arg(long)]
    timezone: Option<String>,
    #[arg(long, default_value_t = false)]
    exclude_archived: bool,
}

impl FilterArgs {
    fn into_filter(self) -> UsageFilter {
        UsageFilter::from(UsageFilterQuery {
            sources: self.sources,
            providers: self.providers,
            models: self.models,
            model_families: self.model_families,
            projects: self.projects,
            since: self.since,
            until: self.until,
            preset: self.preset,
            mode: self.mode,
            min_tokens: self.min_tokens,
            max_tokens: self.max_tokens,
            min_cost: self.min_cost,
            max_cost: self.max_cost,
            search: self.search,
            group_by: self.group_by,
            sort: self.sort,
            timezone: self.timezone,
            exclude_archived: Some(self.exclude_archived),
        })
    }
}

#[derive(Debug, Args, Default)]
struct FilterArgsWithoutPreset {
    #[arg(long)]
    sources: Option<String>,
    #[arg(long)]
    providers: Option<String>,
    #[arg(long)]
    models: Option<String>,
    #[arg(long)]
    model_families: Option<String>,
    #[arg(long)]
    projects: Option<String>,
    #[arg(long)]
    since: Option<String>,
    #[arg(long)]
    until: Option<String>,
    #[arg(long)]
    mode: Option<String>,
    #[arg(long)]
    min_tokens: Option<i64>,
    #[arg(long)]
    max_tokens: Option<i64>,
    #[arg(long)]
    min_cost: Option<f64>,
    #[arg(long)]
    max_cost: Option<f64>,
    #[arg(long)]
    search: Option<String>,
    #[arg(long)]
    group_by: Option<String>,
    #[arg(long)]
    sort: Option<String>,
    #[arg(long)]
    timezone: Option<String>,
    #[arg(long, default_value_t = false)]
    exclude_archived: bool,
}

impl FilterArgsWithoutPreset {
    fn into_filter(self) -> UsageFilter {
        UsageFilter::from(UsageFilterQuery {
            sources: self.sources,
            providers: self.providers,
            models: self.models,
            model_families: self.model_families,
            projects: self.projects,
            since: self.since,
            until: self.until,
            preset: None,
            mode: self.mode,
            min_tokens: self.min_tokens,
            max_tokens: self.max_tokens,
            min_cost: self.min_cost,
            max_cost: self.max_cost,
            search: self.search,
            group_by: self.group_by,
            sort: self.sort,
            timezone: self.timezone,
            exclude_archived: Some(self.exclude_archived),
        })
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    init_tracing();
    let cli = Cli::parse();
    let state = build_state().await?;

    match cli.command {
        Command::Sources(args) => {
            let sources = state
                .database
                .source_statuses(&state.ingest.definitions())
                .await?;
            if args.json {
                println!("{}", serde_json::to_string_pretty(&sources)?);
            } else {
                for item in sources {
                    println!(
                        "{} [{}] roots={} artifacts={} events={} last_scan={}",
                        item.label,
                        item.mode.as_str(),
                        item.watched_paths.join(", "),
                        item.discovered_artifacts,
                        item.imported_events,
                        item.last_scan_completed_at
                            .map(|ts| ts.to_rfc3339())
                            .unwrap_or_else(|| "-".into())
                    );
                }
            }
        }
        Command::Refresh => {
            let summary = state.ingest.refresh_all().await?;
            println!("{}", serde_json::to_string_pretty(&summary)?);
        }
        Command::Watch => {
            state.ingest.refresh_all().await?;
            Arc::clone(&state.ingest).watch_forever().await?;
        }
        Command::Serve(args) => {
            state.ingest.refresh_all().await?;
            let ingest = Arc::clone(&state.ingest);
            tokio::spawn(async move {
                if let Err(error) = ingest.watch_forever().await {
                    tracing::error!(%error, "watcher stopped");
                }
            });
            api::serve(state, args.port, args.static_dir).await?;
        }
        Command::Export(args) => {
            let dataset = ExportDataset::from_str(&args.dataset).map_err(anyhow::Error::msg)?;
            let filter = args.filter.into_filter();
            let bytes = state
                .database
                .export_dataset(dataset, matches!(args.format, FormatArg::Csv), &filter)
                .await?;
            if let Some(path) = args.output {
                tokio::fs::write(path, bytes).await?;
            } else {
                print!("{}", String::from_utf8_lossy(&bytes));
            }
        }
        Command::SocialImage(args) => {
            let preset = SocialPreset::from_str(&args.preset).map_err(anyhow::Error::msg)?;
            let request = SocialCardRequest {
                preset,
                filter: args.filter.into_filter(),
                width: args.width,
                height: args.height,
            };
            let png = token_insight::social::render_card(&state.database, request).await?;
            tokio::fs::write(args.output, png).await?;
        }
    }

    Ok(())
}
