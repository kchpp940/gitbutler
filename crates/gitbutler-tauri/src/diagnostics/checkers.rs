use super::*;
use std::time::Duration;
use tracing::instrument;

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(5);
const LONG_TIMEOUT: Duration = Duration::from_secs(10);

pub mod node {
    use super::*;

    #[instrument]
    pub async fn check_node_version(required_major: u64) -> DiagnosticCheck {
        let start = std::time::Instant::now();
        let id = "node-version";
        let name = "Node.js Runtime";
        let category = DiagnosticCategory::Environment;
        let environment = DiagnosticEnvironment::Development;
        let severity = DiagnosticSeverity::Blocking;

        let cmd_path = match locate_command("node") {
            Some(path) => path,
            None => {
                let duration = start.elapsed();
                return DiagnosticCheck::failed(
                    id,
                    name,
                    category,
                    environment,
                    severity,
                    "Node.js executable not found in PATH",
                    DiagnosticErrorDetail {
                        message: "node command not found in system PATH".to_string(),
                        raw_output: None,
                        exit_code: None,
                        location: Some("PATH environment variable".to_string()),
                    },
                    Some(DiagnosticFix::Link {
                        label: "Install Node.js".to_string(),
                        url: "https://nodejs.org/".to_string(),
                    }),
                    duration,
                );
            }
        };

        let result = match run_command_check("node", &["--version"], DEFAULT_TIMEOUT).await {
            Ok(r) => r,
            Err(e) => {
                let duration = start.elapsed();
                return DiagnosticCheck::failed(
                    id,
                    name,
                    category,
                    environment,
                    severity,
                    "Failed to execute node command",
                    DiagnosticErrorDetail {
                        message: e.to_string(),
                        raw_output: None,
                        exit_code: None,
                        location: Some(cmd_path.to_string_lossy().to_string()),
                    },
                    Some(DiagnosticFix::Link {
                        label: "Install Node.js".to_string(),
                        url: "https://nodejs.org/".to_string(),
                    }),
                    duration,
                );
            }
        };

        let duration = result.duration;

        if !result.success {
            return DiagnosticCheck::failed(
                id,
                name,
                category,
                environment,
                severity,
                "Node.js version check failed",
                DiagnosticErrorDetail {
                    message: result.stderr.clone(),
                    raw_output: Some(format!("stdout: {}\nstderr: {}", result.stdout, result.stderr)),
                    exit_code: result.exit_code,
                    location: Some(cmd_path.to_string_lossy().to_string()),
                },
                Some(DiagnosticFix::Link {
                    label: "Install Node.js".to_string(),
                    url: "https://nodejs.org/".to_string(),
                }),
                duration,
            );
        }

        let version_str = result.stdout.trim_start_matches('v').trim();
        let version_parts: Vec<&str> = version_str.split('.').collect();
        let major = version_parts.first().and_then(|s| s.parse::<u64>().ok());

        match major {
            Some(v) if v >= required_major => DiagnosticCheck::passed(
                id,
                name,
                category,
                environment,
                severity,
                format!(
                    "Node.js v{} is installed (required: >= v{}.0.0)",
                    version_str, required_major
                ),
                duration,
            ),
            Some(v) => {
                let duration = start.elapsed();
                DiagnosticCheck::failed(
                    id,
                    name,
                    category,
                    environment,
                    severity,
                    format!("Node.js version is too old: v{}", version_str),
                    DiagnosticErrorDetail {
                        message: format!(
                            "Found Node.js v{}, but require v{}.0.0 or newer",
                            v, required_major
                        ),
                        raw_output: Some(result.stdout),
                        exit_code: None,
                        location: Some(cmd_path.to_string_lossy().to_string()),
                    },
                    Some(DiagnosticFix::Link {
                        label: "Upgrade Node.js".to_string(),
                        url: "https://nodejs.org/".to_string(),
                    }),
                    duration,
                )
            }
            None => {
                let duration = start.elapsed();
                DiagnosticCheck::warning(
                    id,
                    name,
                    category,
                    environment,
                    severity,
                    format!("Could not parse Node.js version: {}", result.stdout),
                    Some(DiagnosticFix::Link {
                        label: "Check Node.js version".to_string(),
                        url: "https://nodejs.org/".to_string(),
                    }),
                    duration,
                )
            }
        }
    }
}

pub mod pnpm {
    use super::*;

    #[instrument]
    pub async fn check_pnpm_version(required_major: u64) -> DiagnosticCheck {
        let start = std::time::Instant::now();
        let id = "pnpm-version";
        let name = "pnpm Package Manager";
        let category = DiagnosticCategory::Toolchain;
        let environment = DiagnosticEnvironment::Development;
        let severity = DiagnosticSeverity::Blocking;

        let cmd_path = match locate_command("pnpm") {
            Some(path) => path,
            None => {
                let duration = start.elapsed();
                return DiagnosticCheck::failed(
                    id,
                    name,
                    category,
                    environment,
                    severity,
                    "pnpm executable not found in PATH",
                    DiagnosticErrorDetail {
                        message: "pnpm command not found in system PATH".to_string(),
                        raw_output: None,
                        exit_code: None,
                        location: Some("PATH environment variable".to_string()),
                    },
                    Some(DiagnosticFix::Command {
                        label: "Install pnpm".to_string(),
                        command: "npm install -g pnpm".to_string(),
                    }),
                    duration,
                );
            }
        };

        let result = match run_command_check("pnpm", &["--version"], DEFAULT_TIMEOUT).await {
            Ok(r) => r,
            Err(e) => {
                let duration = start.elapsed();
                return DiagnosticCheck::failed(
                    id,
                    name,
                    category,
                    environment,
                    severity,
                    "Failed to execute pnpm command",
                    DiagnosticErrorDetail {
                        message: e.to_string(),
                        raw_output: None,
                        exit_code: None,
                        location: Some(cmd_path.to_string_lossy().to_string()),
                    },
                    Some(DiagnosticFix::Command {
                        label: "Install pnpm".to_string(),
                        command: "npm install -g pnpm".to_string(),
                    }),
                    duration,
                );
            }
        };

        let duration = result.duration;

        if !result.success {
            return DiagnosticCheck::failed(
                id,
                name,
                category,
                environment,
                severity,
                "pnpm version check failed",
                DiagnosticErrorDetail {
                    message: result.stderr.clone(),
                    raw_output: Some(format!("stdout: {}\nstderr: {}", result.stdout, result.stderr)),
                    exit_code: result.exit_code,
                    location: Some(cmd_path.to_string_lossy().to_string()),
                },
                Some(DiagnosticFix::Command {
                    label: "Reinstall pnpm".to_string(),
                    command: "npm install -g pnpm".to_string(),
                }),
                duration,
            );
        }

        let version_str = result.stdout.trim();
        let version_parts: Vec<&str> = version_str.split('.').collect();
        let major = version_parts.first().and_then(|s| s.parse::<u64>().ok());

        match major {
            Some(v) if v >= required_major => DiagnosticCheck::passed(
                id,
                name,
                category,
                environment,
                severity,
                format!(
                    "pnpm v{} is installed (required: >= v{}.0.0)",
                    version_str, required_major
                ),
                duration,
            ),
            Some(v) => {
                let duration = start.elapsed();
                DiagnosticCheck::failed(
                    id,
                    name,
                    category,
                    environment,
                    severity,
                    format!("pnpm version is too old: v{}", version_str),
                    DiagnosticErrorDetail {
                        message: format!(
                            "Found pnpm v{}, but require v{}.0.0 or newer",
                            v, required_major
                        ),
                        raw_output: Some(result.stdout),
                        exit_code: None,
                        location: Some(cmd_path.to_string_lossy().to_string()),
                    },
                    Some(DiagnosticFix::Command {
                        label: "Upgrade pnpm".to_string(),
                        command: "pnpm install -g pnpm@latest".to_string(),
                    }),
                    duration,
                )
            }
            None => {
                let duration = start.elapsed();
                DiagnosticCheck::warning(
                    id,
                    name,
                    category,
                    environment,
                    severity,
                    format!("Could not parse pnpm version: {}", result.stdout),
                    Some(DiagnosticFix::Command {
                        label: "Check pnpm version".to_string(),
                        command: "pnpm --version".to_string(),
                    }),
                    duration,
                )
            }
        }
    }
}

pub mod rust {
    use super::*;

    #[instrument]
    pub async fn check_rust_toolchain() -> DiagnosticCheck {
        let start = std::time::Instant::now();
        let id = "rust-toolchain";
        let name = "Rust Toolchain";
        let category = DiagnosticCategory::Toolchain;
        let environment = DiagnosticEnvironment::Development;
        let severity = DiagnosticSeverity::Blocking;

        let cmd_path = match locate_command("rustc") {
            Some(path) => path,
            None => {
                let duration = start.elapsed();
                return DiagnosticCheck::failed(
                    id,
                    name,
                    category,
                    environment,
                    severity,
                    "Rust compiler (rustc) not found in PATH",
                    DiagnosticErrorDetail {
                        message: "rustc command not found in system PATH".to_string(),
                        raw_output: None,
                        exit_code: None,
                        location: Some("PATH environment variable".to_string()),
                    },
                    Some(DiagnosticFix::Link {
                        label: "Install Rust".to_string(),
                        url: "https://www.rust-lang.org/tools/install".to_string(),
                    }),
                    duration,
                );
            }
        };

        let result = match run_command_check("rustc", &["--version"], DEFAULT_TIMEOUT).await {
            Ok(r) => r,
            Err(e) => {
                let duration = start.elapsed();
                return DiagnosticCheck::failed(
                    id,
                    name,
                    category,
                    environment,
                    severity,
                    "Failed to execute rustc command",
                    DiagnosticErrorDetail {
                        message: e.to_string(),
                        raw_output: None,
                        exit_code: None,
                        location: Some(cmd_path.to_string_lossy().to_string()),
                    },
                    Some(DiagnosticFix::Link {
                        label: "Install Rust".to_string(),
                        url: "https://www.rust-lang.org/tools/install".to_string(),
                    }),
                    duration,
                );
            }
        };

        let duration = result.duration;

        if !result.success {
            return DiagnosticCheck::failed(
                id,
                name,
                category,
                environment,
                severity,
                "Rust toolchain check failed",
                DiagnosticErrorDetail {
                    message: result.stderr.clone(),
                    raw_output: Some(format!("stdout: {}\nstderr: {}", result.stdout, result.stderr)),
                    exit_code: result.exit_code,
                    location: Some(cmd_path.to_string_lossy().to_string()),
                },
                Some(DiagnosticFix::Link {
                    label: "Reinstall Rust".to_string(),
                    url: "https://www.rust-lang.org/tools/install".to_string(),
                }),
                duration,
            );
        }

        let cargo_path = locate_command("cargo");
        let rustup_path = locate_command("rustup");

        if cargo_path.is_none() {
            let duration = start.elapsed();
            return DiagnosticCheck::warning(
                id,
                name,
                category,
                environment,
                severity,
                "Rust compiler found but cargo is missing",
                Some(DiagnosticFix::Link {
                    label: "Install Rust with cargo".to_string(),
                    url: "https://www.rust-lang.org/tools/install".to_string(),
                }),
                duration,
            );
        }

        let version_str = result.stdout.trim();
        let mut message = format!("Rust toolchain is installed: {}", version_str);
        if rustup_path.is_some() {
            message.push_str(" (with rustup)");
        }

        DiagnosticCheck::passed(id, name, category, environment, severity, message, duration)
    }
}

pub mod tauri {
    use super::*;

    #[instrument]
    pub async fn check_tauri_cli() -> DiagnosticCheck {
        let start = std::time::Instant::now();
        let id = "tauri-cli";
        let name = "Tauri CLI";
        let category = DiagnosticCategory::Toolchain;
        let environment = DiagnosticEnvironment::Development;
        let severity = DiagnosticSeverity::Blocking;

        let cmd_path = match locate_command("tauri") {
            Some(path) => path,
            None => {
                let duration = start.elapsed();
                return DiagnosticCheck::failed(
                    id,
                    name,
                    category,
                    environment,
                    severity,
                    "Tauri CLI not found in PATH",
                    DiagnosticErrorDetail {
                        message: "tauri command not found in system PATH".to_string(),
                        raw_output: None,
                        exit_code: None,
                        location: Some("PATH environment variable".to_string()),
                    },
                    Some(DiagnosticFix::Command {
                        label: "Install Tauri CLI".to_string(),
                        command: "cargo install tauri-cli".to_string(),
                    }),
                    duration,
                );
            }
        };

        let result = match run_command_check("tauri", &["--version"], DEFAULT_TIMEOUT).await {
            Ok(r) => r,
            Err(e) => {
                let duration = start.elapsed();
                return DiagnosticCheck::failed(
                    id,
                    name,
                    category,
                    environment,
                    severity,
                    "Failed to execute tauri command",
                    DiagnosticErrorDetail {
                        message: e.to_string(),
                        raw_output: None,
                        exit_code: None,
                        location: Some(cmd_path.to_string_lossy().to_string()),
                    },
                    Some(DiagnosticFix::Command {
                        label: "Reinstall Tauri CLI".to_string(),
                        command: "cargo install tauri-cli".to_string(),
                    }),
                    duration,
                );
            }
        };

        let duration = result.duration;

        if !result.success {
            return DiagnosticCheck::failed(
                id,
                name,
                category,
                environment,
                severity,
                "Tauri CLI version check failed",
                DiagnosticErrorDetail {
                    message: result.stderr.clone(),
                    raw_output: Some(format!("stdout: {}\nstderr: {}", result.stdout, result.stderr)),
                    exit_code: result.exit_code,
                    location: Some(cmd_path.to_string_lossy().to_string()),
                },
                Some(DiagnosticFix::Command {
                    label: "Reinstall Tauri CLI".to_string(),
                    command: "cargo install tauri-cli".to_string(),
                }),
                duration,
            );
        }

        DiagnosticCheck::passed(
            id,
            name,
            category,
            environment,
            severity,
            format!("Tauri CLI is installed: {}", result.stdout.trim()),
            duration,
        )
    }
}

pub mod backend {
    use super::*;

    #[instrument]
    pub async fn check_backend_command() -> DiagnosticCheck {
        let start = std::time::Instant::now();
        let id = "backend-command";
        let name = "Backend Command";
        let category = DiagnosticCategory::Backend;
        let environment = DiagnosticEnvironment::Runtime;
        let severity = DiagnosticSeverity::Blocking;

        let exe_path = std::env::current_exe().ok();
        let exe_dir = exe_path.as_ref().and_then(|p| p.parent());

        let candidates = [
            Some("but".to_string()),
            exe_dir.map(|d| d.join("but").to_string_lossy().to_string()),
            exe_dir.and_then(|d| d.parent().map(|p| p.join("but").to_string_lossy().to_string())),
        ];

        let mut found_path: Option<String> = None;

        for candidate in candidates.iter().flatten() {
            let path = std::path::Path::new(candidate);
            if path.exists() {
                found_path = Some(candidate.clone());
                break;
            }
            if which::which(candidate).is_ok() {
                found_path = Some(candidate.clone());
                break;
            }
        }

        let cmd = match found_path {
            Some(c) => c,
            None => {
                let duration = start.elapsed();
                return DiagnosticCheck::failed(
                    id,
                    name,
                    category,
                    environment,
                    severity,
                    "Backend binary (but) not found",
                    DiagnosticErrorDetail {
                        message: format!(
                            "Could not locate 'but' binary. Searched PATH and: {}",
                            candidates
                                .iter()
                                .flatten()
                                .cloned()
                                .collect::<Vec<_>>()
                                .join(", ")
                        ),
                        raw_output: None,
                        exit_code: None,
                        location: exe_path.map(|p| p.to_string_lossy().to_string()),
                    },
                    Some(DiagnosticFix::Instructions {
                        label: "Rebuild backend".to_string(),
                        instructions:
                            "Run 'cargo build --release' to build the backend binary, or 'cargo run' for development mode."
                                .to_string(),
                    }),
                    duration,
                );
            }
        };

        let result = match run_command_check(&cmd, &["--version"], DEFAULT_TIMEOUT).await {
            Ok(r) => r,
            Err(e) => {
                let duration = start.elapsed();
                return DiagnosticCheck::failed(
                    id,
                    name,
                    category,
                    environment,
                    severity,
                    "Failed to execute backend command",
                    DiagnosticErrorDetail {
                        message: e.to_string(),
                        raw_output: None,
                        exit_code: None,
                        location: Some(cmd.clone()),
                    },
                    Some(DiagnosticFix::Instructions {
                        label: "Check backend binary".to_string(),
                        instructions: format!("Verify that '{}' exists and is executable.", cmd),
                    }),
                    duration,
                );
            }
        };

        let duration = result.duration;

        if !result.success {
            return DiagnosticCheck::failed(
                id,
                name,
                category,
                environment,
                severity,
                "Backend command execution failed",
                DiagnosticErrorDetail {
                    message: result.stderr.clone(),
                    raw_output: Some(format!("stdout: {}\nstderr: {}", result.stdout, result.stderr)),
                    exit_code: result.exit_code,
                    location: Some(cmd),
                },
                Some(DiagnosticFix::Instructions {
                    label: "Rebuild backend".to_string(),
                    instructions: "Run 'cargo build --release' to rebuild the backend binary."
                        .to_string(),
                }),
                duration,
            );
        }

        DiagnosticCheck::passed(
            id,
            name,
            category,
            environment,
            severity,
            format!("Backend command is available: {}", result.stdout.trim()),
            duration,
        )
    }
}

pub mod dependencies {
    use super::*;

    #[instrument]
    pub async fn check_frontend_dependencies(project_root: Option<PathBuf>) -> DiagnosticCheck {
        let start = std::time::Instant::now();
        let id = "frontend-deps";
        let name = "Frontend Dependencies";
        let category = DiagnosticCategory::Dependencies;
        let environment = DiagnosticEnvironment::Development;
        let severity = DiagnosticSeverity::Warning;

        let root = project_root
            .or_else(|| {
                std::env::var_os("CARGO_MANIFEST_DIR")
                    .map(PathBuf::from)
                    .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            })
            .or_else(|| std::env::current_dir().ok());

        let root = match root {
            Some(r) => r,
            None => {
                let duration = start.elapsed();
                return DiagnosticCheck::warning(
                    id,
                    name,
                    category,
                    environment,
                    severity,
                    "Could not determine project root directory",
                    Some(DiagnosticFix::Command {
                        label: "Install dependencies manually".to_string(),
                        command: "pnpm install".to_string(),
                    }),
                    duration,
                );
            }
        };

        let package_json = root.join("package.json");
        let node_modules = root.join("node_modules");

        if !package_json.exists() {
            let duration = start.elapsed();
            return DiagnosticCheck::warning(
                id,
                name,
                category,
                environment,
                severity,
                format!("package.json not found at {}", package_json.display()),
                Some(DiagnosticFix::Instructions {
                    label: "Check project structure".to_string(),
                    instructions:
                        "Ensure you are running from the correct project directory with package.json."
                            .to_string(),
                }),
                duration,
            );
        }

        if !node_modules.exists() {
            let duration = start.elapsed();
            return DiagnosticCheck::failed(
                id,
                name,
                category,
                environment,
                severity,
                "node_modules directory not found - dependencies not installed",
                DiagnosticErrorDetail {
                    message: format!("node_modules not found at {}", node_modules.display()),
                    raw_output: None,
                    exit_code: None,
                    location: Some(node_modules.to_string_lossy().to_string()),
                },
                Some(DiagnosticFix::Command {
                    label: "Install dependencies".to_string(),
                    command: "pnpm install".to_string(),
                }),
                duration,
            );
        }

        let pnpm_lock = root.join("pnpm-lock.yaml");
        if !pnpm_lock.exists() {
            let duration = start.elapsed();
            return DiagnosticCheck::warning(
                id,
                name,
                category,
                environment,
                severity,
                "pnpm-lock.yaml not found - dependencies may be inconsistent",
                Some(DiagnosticFix::Command {
                    label: "Install dependencies with lockfile".to_string(),
                    command: "pnpm install --frozen-lockfile".to_string(),
                }),
                duration,
            );
        }

        match run_command_check(
            "pnpm",
            &["--filter", "@gitbutler/desktop", "run", "check-deps"],
            LONG_TIMEOUT,
        )
        .await
        {
            Ok(r) if r.success => {
                let duration = r.duration;
                return DiagnosticCheck::passed(
                    id,
                    name,
                    category,
                    environment,
                    severity,
                    "Frontend dependencies are installed and up to date",
                    duration,
                );
            }
            _ => {
                let duration = start.elapsed();
                return DiagnosticCheck::passed(
                    id,
                    name,
                    category,
                    environment,
                    severity,
                    format!("Frontend dependencies found at {}", node_modules.display()),
                    duration,
                );
            }
        }
    }
}

pub mod config {
    use super::*;
    use std::fs;

    #[instrument]
    pub async fn check_local_config() -> DiagnosticCheck {
        let start = std::time::Instant::now();
        let id = "local-config";
        let name = "Local Configuration";
        let category = DiagnosticCategory::Configuration;
        let environment = DiagnosticEnvironment::Runtime;
        let severity = DiagnosticSeverity::Blocking;

        let home = std::env::var_os("HOME")
            .or_else(|| std::env::var_os("USERPROFILE"))
            .map(PathBuf::from);

        match home {
            None => {
                let duration = start.elapsed();
                return DiagnosticCheck::failed(
                    id,
                    name,
                    category,
                    environment,
                    severity,
                    "Could not determine home directory",
                    DiagnosticErrorDetail {
                        message: "HOME environment variable not set".to_string(),
                        raw_output: None,
                        exit_code: None,
                        location: Some("environment variables".to_string()),
                    },
                    Some(DiagnosticFix::Instructions {
                        label: "Set HOME environment variable".to_string(),
                        instructions:
                            "Ensure your HOME environment variable is properly set before launching the application."
                                .to_string(),
                    }),
                    duration,
                );
            }
            Some(home_dir) => {
                if !home_dir.exists() {
                    let duration = start.elapsed();
                    return DiagnosticCheck::failed(
                        id,
                        name,
                        category,
                        environment,
                        severity,
                        format!("Home directory does not exist: {}", home_dir.display()),
                        DiagnosticErrorDetail {
                            message: "Home directory path is invalid".to_string(),
                            raw_output: None,
                            exit_code: None,
                            location: Some(home_dir.to_string_lossy().to_string()),
                        },
                        None,
                        duration,
                    );
                }

                let config_dir = home_dir.join(".gitbutler");
                let mut warnings: Vec<String> = Vec::new();

                if !config_dir.exists() {
                    if let Err(e) = fs::create_dir_all(&config_dir) {
                        let duration = start.elapsed();
                        return DiagnosticCheck::failed(
                            id,
                            name,
                            category,
                            environment,
                            severity,
                            format!("Could not create config directory: {}", e),
                            DiagnosticErrorDetail {
                                message: e.to_string(),
                                raw_output: None,
                                exit_code: None,
                                location: Some(config_dir.to_string_lossy().to_string()),
                            },
                            Some(DiagnosticFix::Instructions {
                                label: "Check permissions".to_string(),
                                instructions: format!(
                                    "Ensure the application has write access to {}",
                                    home_dir.display()
                                ),
                            }),
                            duration,
                        );
                    }
                    warnings.push(format!(
                        "Created new config directory at {}",
                        config_dir.display()
                    ));
                }

                let test_file = config_dir.join(".write_test");
                match fs::write(&test_file, b"test") {
                    Ok(_) => {
                        let _ = fs::remove_file(&test_file);
                    }
                    Err(e) => {
                        let duration = start.elapsed();
                        return DiagnosticCheck::failed(
                            id,
                            name,
                            category,
                            environment,
                            severity,
                            format!("Config directory is not writable: {}", e),
                            DiagnosticErrorDetail {
                                message: e.to_string(),
                                raw_output: None,
                                exit_code: None,
                                location: Some(config_dir.to_string_lossy().to_string()),
                            },
                            Some(DiagnosticFix::Instructions {
                                label: "Fix directory permissions".to_string(),
                                instructions: format!(
                                    "Run 'chmod u+w {}' to fix write permissions.",
                                    config_dir.display()
                                ),
                            }),
                            duration,
                        );
                    }
                }

                let duration = start.elapsed();
                let mut message =
                    format!("Configuration directory is accessible: {}", config_dir.display());
                if !warnings.is_empty() {
                    message.push_str(&format!(" ({})", warnings.join(", ")));
                }

                DiagnosticCheck::passed(id, name, category, environment, severity, message, duration)
            }
        }
    }
}

#[instrument]
pub async fn run_all_checks(
    node_required_major: u64,
    pnpm_required_major: u64,
    project_root: Option<PathBuf>,
    skip_development_checks: bool,
) -> DiagnosticResult {
    let total_start = std::time::Instant::now();
    let mut checks: Vec<DiagnosticCheck> = Vec::new();

    if skip_development_checks {
        checks.push(backend::check_backend_command().await);
        checks.push(config::check_local_config().await);
    } else {
        checks.push(node::check_node_version(node_required_major).await);
        checks.push(pnpm::check_pnpm_version(pnpm_required_major).await);
        checks.push(rust::check_rust_toolchain().await);
        checks.push(tauri::check_tauri_cli().await);
        checks.push(backend::check_backend_command().await);
        checks.push(dependencies::check_frontend_dependencies(project_root).await);
        checks.push(config::check_local_config().await);
    }

    let total_duration = total_start.elapsed();
    let mut summary: BTreeMap<String, u32> = BTreeMap::new();

    for check in &checks {
        let status_key = match check.status {
            DiagnosticStatus::Pending => "pending",
            DiagnosticStatus::Running => "running",
            DiagnosticStatus::Passed => "passed",
            DiagnosticStatus::Failed => "failed",
            DiagnosticStatus::Warning => "warning",
        };
        *summary.entry(status_key.to_string()).or_insert(0) += 1;
    }

    let has_failed = checks
        .iter()
        .any(|c| matches!(c.status, DiagnosticStatus::Failed));
    let has_warnings = checks
        .iter()
        .any(|c| matches!(c.status, DiagnosticStatus::Warning));
    let has_blocking_failures = checks
        .iter()
        .any(|c| matches!(c.status, DiagnosticStatus::Failed) && matches!(c.severity, DiagnosticSeverity::Blocking));

    DiagnosticResult {
        checks,
        total_duration_ms: total_duration.as_millis() as u64,
        has_failed,
        has_warnings,
        has_blocking_failures,
        summary,
    }
}
