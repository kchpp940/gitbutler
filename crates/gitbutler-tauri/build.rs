fn main() {
    let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    assert_eq!(manifest_dir.file_name().unwrap(), "gitbutler-tauri");
    let build_dir = manifest_dir
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("apps")
        .join("desktop")
        .join("build");
    if !build_dir.exists() {
        #[expect(clippy::expect_fun_call, clippy::create_dir)]
        std::fs::create_dir(&build_dir).expect(
            format!("failed to create apps/desktop/build directory: {build_dir:?}").as_str(),
        );
    }

    let current_channel = if let Ok(channel) = std::env::var("CHANNEL") {
        match channel.as_str() {
            "nightly" | "release" => channel,
            _ => "dev".to_string(),
        }
    } else {
        "dev".to_string()
    };

    let manifest_path = build_dir.join(".build-manifest.json");
    if manifest_path.exists()
        && let Ok(content) = std::fs::read_to_string(&manifest_path)
        && let Ok(meta) = serde_json::from_str::<serde_json::Value>(&content)
        && let Some(prev) = meta.get("channel").and_then(|v| v.as_str())
        && prev != current_channel
    {
        println!(
            "cargo:warning=Frontend build manifest channel='{prev}' does not match current channel='{current_channel}' — possible cross-contamination. Consider running a clean build."
        );
    }

    let identifier = match current_channel.as_str() {
        "nightly" => "com.gitbutler.app.nightly",
        "release" => "com.gitbutler.app",
        _ => "com.gitbutler.app.dev",
    };
    println!("cargo:rustc-env=IDENTIFIER={identifier}");

    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new()),
    )
    .expect("failed to run tauri_build");
}
