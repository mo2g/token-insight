use std::str::FromStr;

use chrono::{DateTime, Datelike, Duration, NaiveDate, Utc};
use chrono_tz::Tz;
use serde::{Deserialize, Deserializer, Serialize};

use crate::domain::{InteractionMode, SourceKind, UsageEvent};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DatePreset {
    Today,
    Week,
    Month,
    Year,
    All,
}

impl FromStr for DatePreset {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim().to_ascii_lowercase().as_str() {
            "today" => Ok(Self::Today),
            "week" => Ok(Self::Week),
            "month" => Ok(Self::Month),
            "year" => Ok(Self::Year),
            "all" | "" => Ok(Self::All),
            _ => Err(format!("unknown preset: {value}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum GroupBy {
    Day,
    Source,
    Model,
    Provider,
    ModelFamily,
    Project,
}

impl FromStr for GroupBy {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim().to_ascii_lowercase().as_str() {
            "day" => Ok(Self::Day),
            "source" => Ok(Self::Source),
            "model" => Ok(Self::Model),
            "provider" => Ok(Self::Provider),
            "model-family" | "model_family" => Ok(Self::ModelFamily),
            "project" => Ok(Self::Project),
            _ => Err(format!("unknown group_by: {value}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SortField {
    Tokens,
    Cost,
    Name,
    Date,
    Events,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SortDirection {
    Asc,
    Desc,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SortSpec {
    pub field: SortField,
    pub direction: SortDirection,
}

impl Default for SortSpec {
    fn default() -> Self {
        Self {
            field: SortField::Tokens,
            direction: SortDirection::Desc,
        }
    }
}

impl FromStr for SortSpec {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let (field, direction) = value
            .split_once(':')
            .map_or((value, "desc"), |(left, right)| (left, right));
        let field = match field.trim().to_ascii_lowercase().as_str() {
            "tokens" => SortField::Tokens,
            "cost" => SortField::Cost,
            "name" => SortField::Name,
            "date" => SortField::Date,
            "events" => SortField::Events,
            _ => return Err(format!("unknown sort field: {field}")),
        };
        let direction = match direction.trim().to_ascii_lowercase().as_str() {
            "asc" => SortDirection::Asc,
            "desc" | "" => SortDirection::Desc,
            _ => return Err(format!("unknown sort direction: {direction}")),
        };
        Ok(Self { field, direction })
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UsageFilter {
    #[serde(default)]
    pub sources: Vec<SourceKind>,
    #[serde(default)]
    pub providers: Vec<String>,
    #[serde(default)]
    pub models: Vec<String>,
    #[serde(default, alias = "modelFamilies")]
    pub model_families: Vec<String>,
    #[serde(default)]
    pub projects: Vec<String>,
    pub since: Option<NaiveDate>,
    pub until: Option<NaiveDate>,
    pub preset: Option<DatePreset>,
    pub mode: Option<InteractionMode>,
    #[serde(alias = "minTokens")]
    pub min_tokens: Option<i64>,
    #[serde(alias = "maxTokens")]
    pub max_tokens: Option<i64>,
    #[serde(alias = "minCost")]
    pub min_cost: Option<f64>,
    #[serde(alias = "maxCost")]
    pub max_cost: Option<f64>,
    pub search: Option<String>,
    #[serde(alias = "groupBy")]
    pub group_by: Option<GroupBy>,
    #[serde(default, deserialize_with = "deserialize_sort_spec")]
    pub sort: Option<SortSpec>,
    pub timezone: Option<String>,
    #[serde(default, alias = "excludeArchived")]
    pub exclude_archived: bool,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct UsageFilterQuery {
    pub sources: Option<String>,
    pub providers: Option<String>,
    pub models: Option<String>,
    pub model_families: Option<String>,
    pub projects: Option<String>,
    pub since: Option<String>,
    pub until: Option<String>,
    pub preset: Option<String>,
    pub mode: Option<String>,
    pub min_tokens: Option<i64>,
    pub max_tokens: Option<i64>,
    pub min_cost: Option<f64>,
    pub max_cost: Option<f64>,
    pub search: Option<String>,
    pub group_by: Option<String>,
    pub sort: Option<String>,
    pub timezone: Option<String>,
    pub exclude_archived: Option<bool>,
}

impl From<UsageFilterQuery> for UsageFilter {
    fn from(query: UsageFilterQuery) -> Self {
        let preset = query
            .preset
            .as_deref()
            .and_then(|value| DatePreset::from_str(value).ok())
            .filter(|preset| *preset != DatePreset::All);

        let mut filter = UsageFilter {
            sources: split_csv(&query.sources)
                .into_iter()
                .filter_map(|item| SourceKind::from_str(&item).ok())
                .collect(),
            providers: split_csv(&query.providers),
            models: split_csv(&query.models),
            model_families: split_csv(&query.model_families),
            projects: split_csv(&query.projects),
            since: parse_date(query.since.as_deref()),
            until: parse_date(query.until.as_deref()),
            preset,
            mode: query
                .mode
                .as_deref()
                .and_then(|value| InteractionMode::from_str(value).ok())
                .filter(|mode| *mode != InteractionMode::Unknown),
            min_tokens: query.min_tokens,
            max_tokens: query.max_tokens,
            min_cost: query.min_cost,
            max_cost: query.max_cost,
            search: query.search.filter(|value| !value.trim().is_empty()),
            group_by: query
                .group_by
                .as_deref()
                .and_then(|value| GroupBy::from_str(value).ok()),
            sort: query
                .sort
                .as_deref()
                .and_then(|value| SortSpec::from_str(value).ok()),
            timezone: normalize_timezone(query.timezone.as_deref()),
            exclude_archived: query.exclude_archived.unwrap_or(false),
        };
        filter.apply_preset_if_needed();
        filter
    }
}

impl UsageFilter {
    pub fn apply_preset_if_needed(&mut self) {
        if self.since.is_some() || self.until.is_some() {
            return;
        }

        let today = today_in_timezone(self.parsed_timezone());
        match self.preset.unwrap_or(DatePreset::All) {
            DatePreset::Today => {
                self.since = Some(today);
                self.until = Some(today);
            }
            DatePreset::Week => {
                self.since = Some(today - Duration::days(6));
                self.until = Some(today);
            }
            DatePreset::Month => {
                self.since = NaiveDate::from_ymd_opt(today.year(), today.month(), 1);
                self.until = Some(today);
            }
            DatePreset::Year => {
                self.since = NaiveDate::from_ymd_opt(today.year(), 1, 1);
                self.until = Some(today);
            }
            DatePreset::All => {}
        }
    }

    pub fn matches_event(&self, event: &UsageEvent) -> bool {
        if self.exclude_archived && event.source == SourceKind::CodexArchived {
            return false;
        }
        let timezone = self.parsed_timezone();
        let day = day_for_timestamp(event.timestamp, timezone);

        if !self.sources.is_empty() && !self.sources.contains(&event.source) {
            return false;
        }
        if !self.providers.is_empty()
            && !contains_ci(
                &self.providers,
                event.provider.as_deref().unwrap_or_default(),
            )
        {
            return false;
        }
        if !self.models.is_empty()
            && !contains_ci(&self.models, event.model.as_deref().unwrap_or_default())
        {
            return false;
        }
        if !self.model_families.is_empty()
            && !contains_ci(
                &self.model_families,
                event.model_family.as_deref().unwrap_or_default(),
            )
        {
            return false;
        }
        if !self.projects.is_empty()
            && !contains_ci(
                &self.projects,
                event
                    .project
                    .as_deref()
                    .or(event.cwd.as_deref())
                    .unwrap_or_default(),
            )
        {
            return false;
        }
        if let Some(mode) = self.mode {
            if event.mode != mode {
                return false;
            }
        }
        if let Some(since) = self.since {
            if day < since {
                return false;
            }
        }
        if let Some(until) = self.until {
            if day > until {
                return false;
            }
        }
        if let Some(min_tokens) = self.min_tokens {
            if event.total_tokens < min_tokens {
                return false;
            }
        }
        if let Some(max_tokens) = self.max_tokens {
            if event.total_tokens > max_tokens {
                return false;
            }
        }
        if let Some(min_cost) = self.min_cost {
            if event.estimated_cost_usd.unwrap_or_default() < min_cost {
                return false;
            }
        }
        if let Some(max_cost) = self.max_cost {
            if event.estimated_cost_usd.unwrap_or_default() > max_cost {
                return false;
            }
        }
        if let Some(search) = &self.search {
            if !event
                .search_text
                .contains(&search.trim().to_ascii_lowercase())
            {
                return false;
            }
        }

        true
    }

    pub fn parsed_timezone(&self) -> Option<Tz> {
        self.timezone.as_deref().and_then(parse_timezone)
    }
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum SortSpecInput {
    Text(String),
    Spec(SortSpec),
}

fn deserialize_sort_spec<'de, D>(deserializer: D) -> Result<Option<SortSpec>, D::Error>
where
    D: Deserializer<'de>,
{
    let raw = Option::<SortSpecInput>::deserialize(deserializer)?;
    match raw {
        None => Ok(None),
        Some(SortSpecInput::Spec(spec)) => Ok(Some(spec)),
        Some(SortSpecInput::Text(value)) => SortSpec::from_str(&value)
            .map(Some)
            .map_err(serde::de::Error::custom),
    }
}

fn split_csv(value: &Option<String>) -> Vec<String> {
    value
        .as_deref()
        .unwrap_or_default()
        .split(',')
        .filter_map(|item| {
            let item = item.trim();
            (!item.is_empty()).then(|| item.to_string())
        })
        .collect()
}

fn parse_timezone(value: &str) -> Option<Tz> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    trimmed.parse::<Tz>().ok()
}

fn normalize_timezone(value: Option<&str>) -> Option<String> {
    value
        .and_then(parse_timezone)
        .map(|timezone| timezone.name().to_string())
}

fn today_in_timezone(timezone: Option<Tz>) -> NaiveDate {
    day_for_timestamp(Utc::now(), timezone)
}

fn day_for_timestamp(timestamp: DateTime<Utc>, timezone: Option<Tz>) -> NaiveDate {
    timezone
        .map(|timezone| timestamp.with_timezone(&timezone).date_naive())
        .unwrap_or_else(|| timestamp.date_naive())
}

fn parse_date(value: Option<&str>) -> Option<NaiveDate> {
    value.and_then(|value| NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d").ok())
}

fn contains_ci(haystack: &[String], needle: &str) -> bool {
    haystack
        .iter()
        .any(|candidate| candidate.eq_ignore_ascii_case(needle))
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;
    use serde_json::json;

    use super::{DatePreset, SortDirection, SortField, SortSpec, UsageFilter, UsageFilterQuery};

    #[test]
    fn parses_sort_spec() {
        let sort = "cost:asc".parse::<SortSpec>().expect("sort");
        assert_eq!(sort.field, SortField::Cost);
        assert_eq!(sort.direction, SortDirection::Asc);
    }

    #[test]
    fn applies_preset_when_dates_missing() {
        let filter = UsageFilter::from(UsageFilterQuery {
            preset: Some("month".into()),
            ..UsageFilterQuery::default()
        });
        assert_eq!(filter.preset, Some(DatePreset::Month));
        assert!(filter.since.is_some());
        assert!(filter.until.is_some());
    }

    #[test]
    fn does_not_override_explicit_dates() {
        let filter = UsageFilter::from(UsageFilterQuery {
            preset: Some("today".into()),
            since: Some("2026-01-01".into()),
            until: Some("2026-01-03".into()),
            ..UsageFilterQuery::default()
        });
        assert_eq!(filter.since, NaiveDate::from_ymd_opt(2026, 1, 1));
        assert_eq!(filter.until, NaiveDate::from_ymd_opt(2026, 1, 3));
    }

    #[test]
    fn parses_timezone_and_archive_toggle() {
        let filter = UsageFilter::from(UsageFilterQuery {
            timezone: Some("Asia/Shanghai".into()),
            exclude_archived: Some(true),
            ..UsageFilterQuery::default()
        });
        assert_eq!(filter.timezone.as_deref(), Some("Asia/Shanghai"));
        assert!(filter.exclude_archived);
    }

    #[test]
    fn deserializes_sort_string_in_usage_filter_json() {
        let filter: UsageFilter =
            serde_json::from_value(json!({ "sort": "tokens:desc", "exclude_archived": false }))
                .expect("filter");
        let sort = filter.sort.expect("sort");
        assert_eq!(sort.field, SortField::Tokens);
        assert_eq!(sort.direction, SortDirection::Desc);
    }

    #[test]
    fn deserializes_camel_case_usage_filter_json() {
        let filter: UsageFilter = serde_json::from_value(json!({
            "modelFamilies": ["gpt-5"],
            "minTokens": 10,
            "maxTokens": 100,
            "minCost": 0.1,
            "maxCost": 2.0,
            "groupBy": "model",
            "excludeArchived": true
        }))
        .expect("filter");
        assert_eq!(filter.model_families, vec!["gpt-5"]);
        assert_eq!(filter.min_tokens, Some(10));
        assert_eq!(filter.max_tokens, Some(100));
        assert_eq!(filter.min_cost, Some(0.1));
        assert_eq!(filter.max_cost, Some(2.0));
        assert!(filter.group_by.is_some());
        assert!(filter.exclude_archived);
    }

    #[test]
    fn defaults_exclude_archived_to_false_for_json_body() {
        let filter: UsageFilter = serde_json::from_value(json!({})).expect("filter");
        assert!(!filter.exclude_archived);
    }
}
