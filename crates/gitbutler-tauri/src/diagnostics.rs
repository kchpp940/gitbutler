use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::time::Duration;
use tracing::instrument;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiagnosticStatus {
    Pending,
    Running,
    Passed,
    Failed,
    Warning,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiagnosticCategory {
    Environment,
    Toolchain,
    Backend,
    Dependencies,
    Configuration,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiagnosticEnvironment {
    Development,
    Runtime,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiagnosticSeverity {
    Blocking,
    Warning,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum DiagnosticFix {
    Link {
        label: String,
        url: String,
    },
    Command {
        label: String,
        command: String,
    },
    Instructions {
        label: String,
        instructions: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticErrorDetail {
    pub message: String,
    pub raw_output: Option<String>,
    pub exit_code: Option<i32>,
    pub location: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticCheck {
    pub id: String,
    pub name: String,
    pub category: DiagnosticCategory,
    pub environment: DiagnosticEnvironment,
    pub severity: DiagnosticSeverity,
    pub status: DiagnosticStatus,
    pub message: String,
    pub details: Option<String>,
    pub error: Option<DiagnosticErrorDetail>,
    pub fix: Option<DiagnosticFix>,
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticResult {
    pub checks: Vec<DiagnosticCheck>,
    pub total_duration_ms: u64,
    pub has_failed: bool,
    pub has_warnings: bool,
    pub has_blocking_failures: bool,
    pub summary: BTreeMap<String, u32>,
}

impl DiagnosticCheck {
    pub fn passed(
        id: impl Into<String>,
        name: impl Into<String>,
        category: DiagnosticCategory,
        environment: DiagnosticEnvironment,
        severity: DiagnosticSeverity,
        message: impl Into<String>,
        duration: Duration,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            category,
            environment,
            severity,
            status: DiagnosticStatus::Passed,
            message: message.into(),
            details: None,
            error: None,
            fix: None,
            duration_ms: Some(duration.as_millis() as u64),
        }
    }

    pub fn warning(
        id: impl Into<String>,
        name: impl Into<String>,
        category: DiagnosticCategory,
        environment: DiagnosticEnvironment,
        severity: DiagnosticSeverity,
        message: impl Into<String>,
        fix: Option<DiagnosticFix>,
        duration: Duration,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            category,
            environment,
            severity,
            status: DiagnosticStatus::Warning,
            message: message.into(),
            details: None,
            error: None,
            fix,
            duration_ms: Some(duration.as_millis() as u64),
        }
    }

    pub fn failed(
        id: impl Into<String>,
        name: impl Into<String>,
        category: DiagnosticCategory,
        environment: DiagnosticEnvironment,
        severity: DiagnosticSeverity,
        message: impl Into<String>,
        error: DiagnosticErrorDetail,
        fix: Option<DiagnosticFix>,
        duration: Duration,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            category,
            environment,
            severity,
            status: DiagnosticStatus::Failed,
            message: message.into(),
            details: None,
            error: Some(error),
            fix,
            duration_ms: Some(duration.as_millis() as u64),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandCheckResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub duration: Duration,
}

#[instrument(skip(args))]
pub async fn run_command_check(
    cmd: &str,
    args: &[&str],
    time_limit: Duration,
) -> Result<CommandCheckResult, std::io::Error> {
    use tokio::process::Command;
    use tokio::time::timeout;

    let start = std::time::Instant::now();

    match timeout(
        time_limit,
        Command::new(cmd).args(args).output(),
    )
    .await
    {
        Ok(Ok(output)) => {
            let duration = start.elapsed();
            Ok(CommandCheckResult {
                success: output.status.success(),
                stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
                exit_code: output.status.code(),
                duration,
            })
        }
        Ok(Err(e)) => Err(e),
        Err(_) => Err(std::io::Error::new(
            std::io::ErrorKind::TimedOut,
            format!("Command '{}' timed out after {:?}", cmd, time_limit),
        )),
    }
}

pub fn locate_command(cmd: &str) -> Option<PathBuf> {
    which::which(cmd).ok()
}

pub mod checkers;
pub mod commands;
