use anyhow::Result;
use resvg::{tiny_skia, usvg};

use crate::{
    domain::{AggregateSnapshot, SocialCardRequest, SocialPreset},
    storage::Database,
};

pub async fn render_card(database: &Database, request: SocialCardRequest) -> Result<Vec<u8>> {
    let snapshot = database.snapshot(&request.filter).await?;
    let (width, height) = default_dimensions(request.preset, request.width, request.height);
    let svg = match request.preset {
        SocialPreset::Summary => summary_svg(&snapshot, width, height),
        SocialPreset::Wrapped => wrapped_svg(&snapshot, width, height),
        SocialPreset::CommandDeck => command_deck_svg(&snapshot, width, height),
        SocialPreset::SignalGrid => signal_grid_svg(&snapshot, width, height),
    };

    let mut options = usvg::Options::default();
    options.fontdb_mut().load_system_fonts();
    let tree = usvg::Tree::from_str(&svg, &options)?;
    let mut pixmap = tiny_skia::Pixmap::new(width, height)
        .ok_or_else(|| anyhow::anyhow!("pixmap allocation failed"))?;
    resvg::render(&tree, tiny_skia::Transform::default(), &mut pixmap.as_mut());
    Ok(pixmap.encode_png()?)
}

fn default_dimensions(preset: SocialPreset, width: Option<u32>, height: Option<u32>) -> (u32, u32) {
    match preset {
        SocialPreset::Summary => (width.unwrap_or(1200), height.unwrap_or(630)),
        SocialPreset::Wrapped => (width.unwrap_or(1080), height.unwrap_or(1350)),
        SocialPreset::CommandDeck => (width.unwrap_or(1200), height.unwrap_or(630)),
        SocialPreset::SignalGrid => (width.unwrap_or(1080), height.unwrap_or(1350)),
    }
}

fn summary_svg(snapshot: &AggregateSnapshot, width: u32, height: u32) -> String {
    let overview = &snapshot.overview;
    let heatmap = heatmap_svg(snapshot, 620, 210, 24);
    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f4efe7" />
      <stop offset="100%" stop-color="#e2ddd6" />
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1ba784" />
      <stop offset="100%" stop-color="#ff8c42" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)" rx="28" />
  <rect x="28" y="28" width="{inner_w}" height="{inner_h}" fill="#101417" rx="24" />
  <text x="60" y="96" fill="#f4efe7" font-size="42" font-family="Space Grotesk, Arial" font-weight="700">Token Insight</text>
  <text x="60" y="134" fill="#bdcdd8" font-size="20" font-family="IBM Plex Mono, monospace">Mission control for local AI token telemetry</text>
  <rect x="60" y="170" width="240" height="120" fill="#162026" rx="20" />
  <rect x="320" y="170" width="240" height="120" fill="#162026" rx="20" />
  <rect x="60" y="310" width="240" height="120" fill="#162026" rx="20" />
  <rect x="320" y="310" width="240" height="120" fill="#162026" rx="20" />
  <text x="84" y="210" fill="#7bd5bb" font-size="16" font-family="IBM Plex Mono, monospace">TOTAL TOKENS</text>
  <text x="84" y="258" fill="#ffffff" font-size="38" font-family="Space Grotesk, Arial" font-weight="700">{tokens}</text>
  <text x="344" y="210" fill="#ffb07a" font-size="16" font-family="IBM Plex Mono, monospace">EST. COST</text>
  <text x="344" y="258" fill="#ffffff" font-size="38" font-family="Space Grotesk, Arial" font-weight="700">${cost}</text>
  <text x="84" y="350" fill="#7bd5bb" font-size="16" font-family="IBM Plex Mono, monospace">ACTIVE DAYS</text>
  <text x="84" y="398" fill="#ffffff" font-size="38" font-family="Space Grotesk, Arial" font-weight="700">{active_days}</text>
  <text x="344" y="350" fill="#ffb07a" font-size="16" font-family="IBM Plex Mono, monospace">LONGEST STREAK</text>
  <text x="344" y="398" fill="#ffffff" font-size="38" font-family="Space Grotesk, Arial" font-weight="700">{streak}</text>
  <text x="620" y="180" fill="#bdcdd8" font-size="18" font-family="IBM Plex Mono, monospace">RECENT INTENSITY</text>
  {heatmap}
  <text x="620" y="452" fill="#f4efe7" font-size="28" font-family="Space Grotesk, Arial" font-weight="700">Top model: {top_model}</text>
  <text x="620" y="490" fill="#f4efe7" font-size="28" font-family="Space Grotesk, Arial" font-weight="700">Top source: {top_source}</text>
  <text x="620" y="526" fill="#bdcdd8" font-size="18" font-family="IBM Plex Mono, monospace">Generated from local multi-source data.</text>
  <text x="620" y="548" fill="#bdcdd8" font-size="18" font-family="IBM Plex Mono, monospace">No cloud upload required.</text>
  <rect x="620" y="568" width="280" height="14" rx="7" fill="#1d2730" />
  <rect x="620" y="568" width="{progress}" height="14" rx="7" fill="url(#accent)" />
</svg>"##,
        inner_w = width - 56,
        inner_h = height - 56,
        tokens = format_number(overview.total_tokens),
        cost = format!("{:.2}", overview.total_cost_usd),
        active_days = overview.active_days,
        streak = overview.streak_days,
        top_model = escape_xml(&truncate_text_display_width(
            overview.top_model.as_deref().unwrap_or("n/a"),
            26,
        )),
        top_source = escape_xml(&truncate_text_display_width(
            overview.top_source.as_deref().unwrap_or("n/a"),
            22,
        )),
        progress = ((overview.reasoning_tokens + overview.cache_read_tokens).max(1) as f64
            / overview.total_tokens.max(1) as f64
            * 280.0)
            .clamp(24.0, 280.0)
    )
}

fn wrapped_svg(snapshot: &AggregateSnapshot, width: u32, height: u32) -> String {
    let overview = &snapshot.overview;
    let top_models = snapshot
        .top_models
        .iter()
        .take(3)
        .enumerate()
        .map(|(index, row)| {
            format!(
                r##"<text x="80" y="{}" fill="#111111" font-size="28" font-family="Space Grotesk, Arial" font-weight="700">{}. {}</text>"##,
                720 + index as i32 * 52,
                index + 1,
                escape_xml(&truncate_text_display_width(&row.label, 26))
            )
        })
        .collect::<Vec<_>>()
        .join("");
    let heatmap = heatmap_svg(snapshot, 620, 648, 18);
    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <defs>
    <linearGradient id="wrapped-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#14212b" />
      <stop offset="55%" stop-color="#1ba784" />
      <stop offset="100%" stop-color="#ff8c42" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#wrapped-bg)" rx="32" />
  <rect x="48" y="48" width="{inner_w}" height="{inner_h}" fill="#f4efe7" rx="30" />
  <text x="80" y="140" fill="#111111" font-size="64" font-family="Space Grotesk, Arial" font-weight="700">Your Token Wrapped</text>
  <text x="80" y="190" fill="#4b5563" font-size="24" font-family="IBM Plex Mono, monospace">A local-first year in AI usage, across every supported source.</text>
  <text x="80" y="300" fill="#111111" font-size="24" font-family="IBM Plex Mono, monospace">TOTAL TOKENS</text>
  <text x="80" y="370" fill="#111111" font-size="82" font-family="Space Grotesk, Arial" font-weight="700">{tokens}</text>
  <text x="80" y="450" fill="#111111" font-size="24" font-family="IBM Plex Mono, monospace">ESTIMATED COST</text>
  <text x="80" y="510" fill="#111111" font-size="56" font-family="Space Grotesk, Arial" font-weight="700">${cost}</text>
  <text x="80" y="620" fill="#111111" font-size="24" font-family="IBM Plex Mono, monospace">TOP MODELS</text>
  {top_models}
  <text x="620" y="620" fill="#111111" font-size="24" font-family="IBM Plex Mono, monospace">ACTIVITY MAP</text>
  {heatmap}
  <text x="620" y="960" fill="#111111" font-size="32" font-family="Space Grotesk, Arial" font-weight="700">Active days: {active_days}</text>
  <text x="620" y="1008" fill="#111111" font-size="32" font-family="Space Grotesk, Arial" font-weight="700">Longest streak: {streak}</text>
  <text x="620" y="1056" fill="#111111" font-size="32" font-family="Space Grotesk, Arial" font-weight="700">Top source: {top_source}</text>
  <text x="80" y="1230" fill="#4b5563" font-size="22" font-family="IBM Plex Mono, monospace">Generated by Token Insight with local Rust rendering.</text>
</svg>"##,
        inner_w = width - 96,
        inner_h = height - 96,
        tokens = format_number(overview.total_tokens),
        cost = format!("{:.2}", overview.total_cost_usd),
        active_days = overview.active_days,
        streak = overview.streak_days,
        top_source = escape_xml(&truncate_text_display_width(
            overview.top_source.as_deref().unwrap_or("n/a"),
            24,
        )),
        top_models = top_models,
        heatmap = heatmap
    )
}

fn command_deck_svg(snapshot: &AggregateSnapshot, width: u32, height: u32) -> String {
    let overview = &snapshot.overview;
    let heatmap = heatmap_svg(snapshot, 760, 186, 16);
    let prompt_bar = scale_bar_width(overview.prompt_tokens, overview.total_tokens, 320);
    let completion_bar = scale_bar_width(overview.completion_tokens, overview.total_tokens, 320);
    let reasoning_bar = scale_bar_width(overview.reasoning_tokens, overview.total_tokens, 320);
    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <defs>
    <linearGradient id="deck-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#050a13" />
      <stop offset="100%" stop-color="#0d1f35" />
    </linearGradient>
    <linearGradient id="deck-neon" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1de6d2" />
      <stop offset="100%" stop-color="#45a8ff" />
    </linearGradient>
    <linearGradient id="deck-amber" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffd166" />
      <stop offset="100%" stop-color="#ff7b54" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#deck-bg)" rx="26" />
  <rect x="24" y="24" width="{inner_w}" height="{inner_h}" rx="22" fill="rgba(11,20,35,0.92)" stroke="rgba(117,244,255,0.26)" stroke-width="1.5" />
  <text x="56" y="88" fill="#d9f7ff" font-size="44" font-family="Space Grotesk, Arial" font-weight="700">Token Command Deck</text>
  <text x="56" y="124" fill="#87a8bf" font-size="19" font-family="IBM Plex Mono, monospace">Live telemetry report generated from local traces</text>

  <rect x="56" y="156" width="206" height="118" rx="16" fill="#0f2236" stroke="rgba(29,230,210,0.22)" />
  <text x="76" y="188" fill="#8cc8df" font-size="14" font-family="IBM Plex Mono, monospace">TOTAL TOKENS</text>
  <text x="76" y="238" fill="#d9f7ff" font-size="42" font-family="Space Grotesk, Arial" font-weight="700">{tokens}</text>

  <rect x="280" y="156" width="206" height="118" rx="16" fill="#0f2236" stroke="rgba(255,209,102,0.22)" />
  <text x="300" y="188" fill="#dfbe8c" font-size="14" font-family="IBM Plex Mono, monospace">ESTIMATED COST</text>
  <text x="300" y="238" fill="#fff0d1" font-size="42" font-family="Space Grotesk, Arial" font-weight="700">${cost}</text>

  <rect x="504" y="156" width="206" height="118" rx="16" fill="#0f2236" stroke="rgba(117,244,255,0.2)" />
  <text x="524" y="188" fill="#8cc8df" font-size="14" font-family="IBM Plex Mono, monospace">ACTIVE DAYS</text>
  <text x="524" y="238" fill="#d9f7ff" font-size="42" font-family="Space Grotesk, Arial" font-weight="700">{active_days}</text>

  <text x="760" y="168" fill="#d9f7ff" font-size="20" font-family="IBM Plex Mono, monospace">SIGNAL HEATMAP</text>
  {heatmap}

  <text x="56" y="332" fill="#9db9cd" font-size="15" font-family="IBM Plex Mono, monospace">PROMPT TOKENS</text>
  <rect x="56" y="344" width="320" height="10" rx="5" fill="#173049" />
  <rect x="56" y="344" width="{prompt_bar}" height="10" rx="5" fill="url(#deck-neon)" />

  <text x="56" y="384" fill="#9db9cd" font-size="15" font-family="IBM Plex Mono, monospace">COMPLETION TOKENS</text>
  <rect x="56" y="396" width="320" height="10" rx="5" fill="#173049" />
  <rect x="56" y="396" width="{completion_bar}" height="10" rx="5" fill="url(#deck-neon)" />

  <text x="56" y="436" fill="#9db9cd" font-size="15" font-family="IBM Plex Mono, monospace">REASONING TOKENS</text>
  <rect x="56" y="448" width="320" height="10" rx="5" fill="#173049" />
  <rect x="56" y="448" width="{reasoning_bar}" height="10" rx="5" fill="url(#deck-amber)" />

  <text x="430" y="344" fill="#d9f7ff" font-size="30" font-family="Space Grotesk, Arial" font-weight="700">Top model: {top_model}</text>
  <text x="430" y="384" fill="#d9f7ff" font-size="30" font-family="Space Grotesk, Arial" font-weight="700">Top source: {top_source}</text>
  <text x="430" y="434" fill="#9db9cd" font-size="18" font-family="IBM Plex Mono, monospace">Longest streak: {streak} days</text>
  <text x="430" y="466" fill="#9db9cd" font-size="18" font-family="IBM Plex Mono, monospace">Events tracked: {events}</text>

  <text x="56" y="552" fill="#6f8ca5" font-size="16" font-family="IBM Plex Mono, monospace">Rendered by Token Insight / command-deck preset</text>
</svg>"##,
        inner_w = width - 48,
        inner_h = height - 48,
        tokens = format_number(overview.total_tokens),
        cost = format!("{:.2}", overview.total_cost_usd),
        active_days = overview.active_days,
        heatmap = heatmap,
        prompt_bar = prompt_bar,
        completion_bar = completion_bar,
        reasoning_bar = reasoning_bar,
        top_model = escape_xml(&truncate_text_display_width(
            overview.top_model.as_deref().unwrap_or("n/a"),
            24,
        )),
        top_source = escape_xml(&truncate_text_display_width(
            overview.top_source.as_deref().unwrap_or("n/a"),
            20,
        )),
        streak = overview.streak_days,
        events = overview.event_count
    )
}

fn signal_grid_svg(snapshot: &AggregateSnapshot, width: u32, height: u32) -> String {
    let overview = &snapshot.overview;
    let top_models = snapshot
        .top_models
        .iter()
        .take(4)
        .enumerate()
        .map(|(index, row)| {
            format!(
                r##"<text x="142" y="{}" fill="#d7ebff" font-size="30" font-family="Space Grotesk, Arial" font-weight="700">{}. {}</text>"##,
                498 + index as i32 * 54,
                index + 1,
                escape_xml(&truncate_text_display_width(&row.label, 22))
            )
        })
        .collect::<Vec<_>>()
        .join("");
    let heatmap = heatmap_svg(snapshot, 140, 782, 18);
    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <defs>
    <linearGradient id="signal-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#040712" />
      <stop offset="100%" stop-color="#0a1730" />
    </linearGradient>
    <linearGradient id="signal-core" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#14f1cc" />
      <stop offset="100%" stop-color="#4b8dff" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#signal-bg)" rx="30" />
  <rect x="44" y="44" width="{inner_w}" height="{inner_h}" rx="28" fill="rgba(8,16,30,0.92)" stroke="rgba(85,132,255,0.35)" stroke-width="1.5" />
  <path d="M110 84 H970 M110 126 H970 M110 168 H970 M110 210 H970" stroke="rgba(83,138,255,0.12)" />
  <text x="110" y="138" fill="#ddf0ff" font-size="64" font-family="Space Grotesk, Arial" font-weight="700">Signal Grid</text>
  <text x="110" y="182" fill="#8aa7c2" font-size="24" font-family="IBM Plex Mono, monospace">High-contrast social card for AI usage telemetry</text>

  <rect x="110" y="230" width="390" height="178" rx="20" fill="#0e1b33" stroke="rgba(20,241,204,0.28)" />
  <text x="142" y="274" fill="#8db4d4" font-size="18" font-family="IBM Plex Mono, monospace">TOTAL TOKENS</text>
  <text x="142" y="348" fill="#ddf0ff" font-size="76" font-family="Space Grotesk, Arial" font-weight="700">{tokens}</text>

  <rect x="536" y="230" width="390" height="178" rx="20" fill="#0e1b33" stroke="rgba(75,141,255,0.34)" />
  <text x="568" y="274" fill="#8db4d4" font-size="18" font-family="IBM Plex Mono, monospace">ESTIMATED COST</text>
  <text x="568" y="348" fill="#f4fbff" font-size="64" font-family="Space Grotesk, Arial" font-weight="700">${cost}</text>

  <text x="142" y="454" fill="#8db4d4" font-size="22" font-family="IBM Plex Mono, monospace">TOP MODELS</text>
  {top_models}

  <text x="142" y="742" fill="#8db4d4" font-size="22" font-family="IBM Plex Mono, monospace">ACTIVITY HEATMAP</text>
  {heatmap}

  <rect x="620" y="782" width="306" height="242" rx="18" fill="#0e1b33" stroke="rgba(20,241,204,0.2)" />
  <text x="648" y="836" fill="#ddf0ff" font-size="42" font-family="Space Grotesk, Arial" font-weight="700">Active {active_days}</text>
  <text x="648" y="892" fill="#ddf0ff" font-size="42" font-family="Space Grotesk, Arial" font-weight="700">Streak {streak}</text>
  <text x="648" y="944" fill="#9eb9d3" font-size="22" font-family="IBM Plex Mono, monospace">Top source</text>
  <text x="648" y="980" fill="#ddf0ff" font-size="34" font-family="Space Grotesk, Arial" font-weight="700">{top_source}</text>

  <rect x="110" y="1086" width="816" height="44" rx="22" fill="#14243f" />
  <rect x="110" y="1086" width="{util_bar}" height="44" rx="22" fill="url(#signal-core)" />
  <text x="110" y="1176" fill="#6f8ca5" font-size="20" font-family="IBM Plex Mono, monospace">Rendered by Token Insight / signal-grid preset</text>
</svg>"##,
        inner_w = width - 88,
        inner_h = height - 88,
        tokens = format_number(overview.total_tokens),
        cost = format!("{:.2}", overview.total_cost_usd),
        top_models = top_models,
        heatmap = heatmap,
        active_days = overview.active_days,
        streak = overview.streak_days,
        top_source = escape_xml(&truncate_text_display_width(
            overview.top_source.as_deref().unwrap_or("n/a"),
            14,
        )),
        util_bar = scale_bar_width(
            overview.reasoning_tokens + overview.cache_read_tokens,
            overview.total_tokens,
            816,
        )
    )
}

fn heatmap_svg(snapshot: &AggregateSnapshot, start_x: i32, start_y: i32, cell_size: i32) -> String {
    snapshot
        .contributions
        .iter()
        .rev()
        .take(84)
        .enumerate()
        .map(|(index, cell)| {
            let x = start_x + (index as i32 % 12) * (cell_size + 6);
            let y = start_y + (index as i32 / 12) * (cell_size + 6);
            format!(
                r#"<rect x="{x}" y="{y}" width="{cell_size}" height="{cell_size}" rx="6" fill="{fill}" />"#,
                fill = heat_color(cell.intensity)
            )
        })
        .collect::<Vec<_>>()
        .join("")
}

fn heat_color(intensity: f64) -> &'static str {
    match intensity {
        value if value <= 0.05 => "#1b2328",
        value if value <= 0.25 => "#14453d",
        value if value <= 0.5 => "#1ba784",
        value if value <= 0.75 => "#4fd1a5",
        _ => "#ff8c42",
    }
}

fn scale_bar_width(part: i64, total: i64, max_width: i32) -> i32 {
    if part <= 0 || max_width <= 0 {
        return 0;
    }
    let safe_total = total.max(1) as f64;
    let ratio = (part as f64 / safe_total).clamp(0.0, 1.0);
    let width = (ratio * f64::from(max_width)).round() as i32;
    width.clamp(10, max_width)
}

fn format_number(value: i64) -> String {
    if value >= 1_000_000 {
        format!("{:.1}M", value as f64 / 1_000_000.0)
    } else if value >= 1_000 {
        format!("{:.1}K", value as f64 / 1_000.0)
    } else {
        value.to_string()
    }
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn truncate_text_display_width(value: &str, max_width: usize) -> String {
    if display_width(value) <= max_width {
        return value.to_string();
    }
    let mut current_width = 0usize;
    let mut output = String::new();
    let allowance = max_width.saturating_sub(3);
    for ch in value.chars() {
        let width = char_display_width(ch);
        if current_width + width > allowance {
            break;
        }
        output.push(ch);
        current_width += width;
    }
    output.push_str("...");
    output
}

fn char_display_width(ch: char) -> usize {
    if ch.is_ascii() {
        1
    } else {
        2
    }
}

fn display_width(value: &str) -> usize {
    value.chars().map(char_display_width).sum()
}
