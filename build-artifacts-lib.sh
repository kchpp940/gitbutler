#!/usr/bin/env bash
set -euo pipefail

SPEC_FILE=""
SPEC_LOADED=false
HAS_JQ=false
JQ_PATH=""

function spec_find_file {
    local script_dir
    if [ -n "${BASH_SOURCE:-}" ]; then
        script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    elif [ -n "${ZSH_VERSION:-}" ]; then
        script_dir="$(cd "$(dirname "${(%):-%x}")" && pwd)"
    else
        script_dir="$(cd "$(dirname "$0")" && pwd)"
    fi
    local check_dir="$script_dir"

    while [ "$check_dir" != "/" ]; do
        if [ -f "$check_dir/build-artifacts.spec.json" ]; then
            SPEC_FILE="$check_dir/build-artifacts.spec.json"
            return 0
        fi
        check_dir="$(dirname "$check_dir")"
    done

    echo "ERROR: build-artifacts.spec.json not found (searched from $script_dir)" >&2
    return 1
}

function spec_check_jq {
    if command -v jq >/dev/null 2>&1; then
        HAS_JQ=true
        JQ_PATH="$(command -v jq 2>/dev/null)"
        return 0
    fi
    HAS_JQ=false
    JQ_PATH=""
    return 1
}

function spec_load {
    if [ -z "$SPEC_FILE" ]; then
        spec_find_file || return 1
    fi

    if [ ! -f "$SPEC_FILE" ]; then
        echo "ERROR: Spec file not found at $SPEC_FILE" >&2
        return 1
    fi

    spec_check_jq || true
    SPEC_LOADED=true
    return 0
}

function spec_ensure_loaded {
    if [ "$SPEC_LOADED" != true ]; then
        spec_load || return 1
    fi
}

function spec_get {
    spec_ensure_loaded || return 1
    local path="$1"

    if [ "$HAS_JQ" != true ] || [ -z "$JQ_PATH" ]; then
        echo "ERROR: jq is required to read build-artifacts.spec.json" >&2
        return 1
    fi

    local result
    result=$("$JQ_PATH" -r "$path" "$SPEC_FILE" 2>/dev/null) || result=""

    if [ "$result" = "null" ] || [ -z "$result" ]; then
        return 1
    fi

    echo "$result"
}

function spec_get_array {
    spec_ensure_loaded || return 1
    local path="$1"

    if [ "$HAS_JQ" != true ] || [ -z "$JQ_PATH" ]; then
        echo "ERROR: jq is required to read build-artifacts.spec.json" >&2
        return 1
    fi

    local jq_path
    if [[ "$path" == *"[]" ]]; then
        jq_path="$path"
    else
        jq_path="$path | .[]"
    fi

    local output
    output=$("$JQ_PATH" -r "$jq_path" "$SPEC_FILE" 2>/dev/null) || output=""
    echo "$output"
}

function spec_substitute {
    local input="$1"
    local triple="${TRIPLE:-}"
    local channel="${CHANNEL:-}"
    local profile="${PROFILE:-}"

    if [ -n "$triple" ]; then
        input="${input//\$\{TRIPLE\}/$triple}"
    fi
    if [ -n "$channel" ]; then
        input="${input//\$\{CHANNEL\}/$channel}"
    fi
    if [ -n "$profile" ]; then
        input="${input//\$\{PROFILE\}/$profile}"
    fi

    echo "$input"
}

function spec_get_clean_patterns {
    local scope="$1"

    local patterns
    patterns=$(spec_get_array ".cleanRules.\"$scope\"[]") || patterns=""

    local pattern_ref
    echo "$patterns" | while IFS= read -r pattern_ref; do
        if [ -z "$pattern_ref" ]; then
            continue
        fi

        local resolved=""
        if [[ "$pattern_ref" == *" + "* ]]; then
            resolved="$pattern_ref"
        elif [[ "$pattern_ref" == paths.* ]]; then
            resolved=$(spec_get ".$pattern_ref") || resolved=""
            if [ -z "$resolved" ]; then
                continue
            fi
        elif [[ "$pattern_ref" == components.* ]]; then
            resolved=$(spec_get ".$pattern_ref") || resolved=""
            if [ -z "$resolved" ]; then
                continue
            fi
        else
            resolved="$pattern_ref"
        fi

        if [ -n "$resolved" ]; then
            spec_substitute "$resolved"
        fi
    done
}

function spec_channel_profile {
    local channel="$1"
    spec_get ".channels.\"$channel\".profile" || echo "debug"
}

function spec_channel_bundle {
    local channel="$1"
    spec_get ".channels.\"$channel\".bundle" || echo "false"
}

function spec_channel_cargo_target_dir {
    local channel="$1"
    spec_get ".channels.\"$channel\".cargoTargetDir" || spec_get ".cargo.defaultTargetDir" || echo "target"
}

function spec_channel_required_binaries {
    local channel="$1"
    spec_get_array ".channels.\"$channel\".requiredBinaries[]" || true
}

function spec_resolve_binary {
    local component="$1"
    local profile="${PROFILE:-debug}"

    local raw_path
    raw_path=$(spec_get ".components.$component.outputs.$profile" 2>/dev/null) || raw_path=""

    if [ -z "$raw_path" ]; then
        return 1
    fi

    spec_substitute "$raw_path"
}

function spec_resolve_binary_abs {
    local component="$1"
    local profile="${PROFILE:-debug}"

    local rel_path
    rel_path=$(spec_resolve_binary "$component" "$profile") || return 1

    local root
    root="$(dirname "$SPEC_FILE")"
    echo "$root/$rel_path"
}

function spec_cargo_target_dir {
    local channel="${CHANNEL:-}"
    if [ -n "$channel" ]; then
        spec_channel_cargo_target_dir "$channel"
    else
        spec_get ".cargo.targetDir" || echo "target"
    fi
}

function spec_turbo_cache_key {
    local channel="${CHANNEL:-dev}"
    local profile="${PROFILE:-debug}"
    local raw_key
    raw_key=$(spec_get ".paths.turboCacheKey") || raw_key="v3"
    spec_substitute "$raw_key"
}

function spec_strict_mode {
    spec_get ".validation.strictMode" || echo "false"
}

function spec_fail_on_stale {
    spec_get ".validation.failOnStaleArtifacts" || echo "false"
}

function spec_fail_on_missing {
    spec_get ".validation.failOnMissingArtifacts" || echo "false"
}

function spec_fail_on_cache_mismatch {
    spec_get ".validation.failOnCacheMismatch" || echo "false"
}

function spec_mtime_grace {
    spec_get ".validation.mtimeGraceSeconds" || echo "300"
}

function spec_log {
    printf "[spec] %s\n" "$*"
}

function spec_error {
    printf "[spec] ERROR: %s\n" "$*" >&2
}

function spec_init_from_channel {
    local channel="$1"

    CHANNEL="$channel"
    PROFILE="$(spec_channel_profile "$channel")"
    TRIPLE="${TRIPLE_OVERRIDE:-$(rustc --print host-tuple 2>/dev/null || echo "unknown")}"

    export CHANNEL
    export PROFILE
    export TRIPLE

    spec_log "initialized for channel=$channel profile=$PROFILE triple=$TRIPLE"
}

function spec_check_cargo_target_dir {
    local root="$(dirname "$SPEC_FILE")"
    local cargo_config="$root/$(spec_get ".cargo.cargoConfigPath" || echo ".cargo/config.toml")"

    if [ ! -f "$cargo_config" ]; then
        spec_error "Cargo config not found at $cargo_config"
        return 1
    fi

    local expected_dir
    expected_dir=$(spec_get ".cargo.expectedTargetDir") || expected_dir="target"

    local actual_dir
    actual_dir=$(grep -E '^target-dir' "$cargo_config" 2>/dev/null | head -1 | awk -F'"' '{print $2}') || actual_dir=""

    if [ -z "$actual_dir" ]; then
        actual_dir="target"
    fi

    if [ "$actual_dir" != "$expected_dir" ]; then
        spec_error "Cargo target-dir mismatch: .cargo/config.toml says '$actual_dir' but spec expects '$expected_dir'"
        if [ "$(spec_fail_on_cache_mismatch)" = "true" ]; then
            return 1
        fi
    fi

    spec_log "Cargo target-dir consistent: $actual_dir"
}

function spec_validate_artifacts {
    local channel="${CHANNEL:-release}"
    local profile="${PROFILE:-release}"
    local root="$(dirname "$SPEC_FILE")"
    local fail_on_missing="$(spec_fail_on_missing)"
    local all_ok=true

    local required_binaries
    required_binaries=$(spec_channel_required_binaries "$channel") || required_binaries=""

    local bin_name
    echo "$required_binaries" | while IFS= read -r bin_name; do
        if [ -z "$bin_name" ]; then
            continue
        fi

        local component=""
        case "$bin_name" in
            gitbutler-tauri)       component="desktop" ;;
            but)                   component="but" ;;
            but-server)            component="butServer" ;;
            gitbutler-git-askpass) component="gitbutlerGit" ;;
            *)                     component="" ;;
        esac

        if [ -z "$component" ]; then
            spec_error "unknown required binary: $bin_name"
            all_ok=false
            continue
        fi

        local abs_path
        abs_path=$(spec_resolve_binary_abs "$component" "$profile") || {
            spec_error "could not resolve path for $component"
            all_ok=false
            continue
        }

        if [ -f "$abs_path" ]; then
            spec_log "  ✓ $bin_name: $abs_path"
        else
            spec_error "  ✗ $bin_name: NOT FOUND at $abs_path"
            all_ok=false
        fi
    done

    if [ "$all_ok" != true ]; then
        if [ "$fail_on_missing" = "true" ]; then
            spec_error "missing required artifacts for channel=$channel profile=$profile"
            return 1
        else
            spec_log "WARNING: some artifacts missing (strict mode disabled)"
        fi
    fi

    return 0
}

function spec_check_stale_cache {
    local channel="${CHANNEL:-}"
    local profile="${PROFILE:-}"

    if [ -z "$channel" ] || [ -z "$profile" ]; then
        spec_log "skipping stale cache check: CHANNEL or PROFILE not set"
        return 0
    fi

    local root="$(dirname "$SPEC_FILE")"
    local fe_manifest="$root/$(spec_substitute "$(spec_get ".components.frontend.outputDir")")/$(spec_get ".components.frontend.buildManifest")"

    if [ -f "$fe_manifest" ] && [ "$HAS_JQ" = true ] && [ -n "$JQ_PATH" ]; then
        local manifest_channel
        manifest_channel=$("$JQ_PATH" -r '.channel // "unknown"' "$fe_manifest" 2>/dev/null) || manifest_channel="unknown"
        local manifest_profile
        manifest_profile=$("$JQ_PATH" -r '.profile // "unknown"' "$fe_manifest" 2>/dev/null) || manifest_profile="unknown"

        if [ "$manifest_channel" != "$channel" ] || [ "$manifest_profile" != "$profile" ]; then
            spec_error "stale cache detected: frontend manifest channel=$manifest_channel profile=$manifest_profile but current channel=$channel profile=$profile"
            spec_error "this indicates dev/prod cross-contamination"
            if [ "$(spec_fail_on_cache_mismatch)" = "true" ]; then
                spec_error "run: pnpm clean:frontend && rebuild"
                return 1
            fi
        fi
    fi

    local sidecar_manifest_path="$root/$(spec_substitute "$(spec_get ".components.sidecar.injectDir")")/$(spec_get ".components.sidecar.integrityManifest")"
    if [ -f "$sidecar_manifest_path" ] && [ "$HAS_JQ" = true ] && [ -n "$JQ_PATH" ]; then
        local sc_channel
        sc_channel=$("$JQ_PATH" -r '.channel // "unknown"' "$sidecar_manifest_path" 2>/dev/null) || sc_channel="unknown"
        local sc_profile
        sc_profile=$("$JQ_PATH" -r '.profile // "unknown"' "$sidecar_manifest_path" 2>/dev/null) || sc_profile="unknown"

        if [ "$sc_channel" != "$channel" ] || [ "$sc_profile" != "$profile" ]; then
            spec_error "stale sidecar cache: manifest channel=$sc_channel profile=$sc_profile but current channel=$channel profile=$profile"
            if [ "$(spec_fail_on_cache_mismatch)" = "true" ]; then
                spec_error "run: pnpm clean:sidecar && rebuild"
                return 1
            fi
        fi
    fi

    local rust_manifest_path="$root/$(spec_substitute "$(spec_get ".components.rust.manifestPath")")"
    if [ -f "$rust_manifest_path" ] && [ "$HAS_JQ" = true ] && [ -n "$JQ_PATH" ]; then
        local rm_channel
        rm_channel=$("$JQ_PATH" -r '.channel // "unknown"' "$rust_manifest_path" 2>/dev/null) || rm_channel="unknown"
        local rm_profile
        rm_profile=$("$JQ_PATH" -r '.profile // "unknown"' "$rust_manifest_path" 2>/dev/null) || rm_profile="unknown"

        if [ "$rm_channel" != "$channel" ] || [ "$rm_profile" != "$profile" ]; then
            spec_error "stale rust cache: manifest channel=$rm_channel profile=$rm_profile but current channel=$channel profile=$profile"
            if [ "$(spec_fail_on_cache_mismatch)" = "true" ]; then
                spec_error "run: pnpm clean:rust && rebuild"
                return 1
            fi
        fi
    fi

    spec_log "cache consistency check passed for channel=$channel profile=$profile"
}

function spec_write_rust_manifest {
    local channel="${CHANNEL:-}"
    local profile="${PROFILE:-debug}"
    local triple="${TRIPLE:-}"
    local root="$(dirname "$SPEC_FILE")"

    if [ -z "$channel" ]; then
        spec_error "CHANNEL must be set before calling spec_write_rust_manifest"
        return 1
    fi

    local manifest_rel
    manifest_rel=$(spec_get ".components.rust.manifestPath") || manifest_rel="target/.rust-binaries-manifest.json"
    manifest_rel=$(spec_substitute "$manifest_rel")
    local manifest_path="$root/$manifest_rel"

    local manifest_dir
    manifest_dir=$(dirname "$manifest_path")
    mkdir -p "$manifest_dir"

    local required_binaries
    required_binaries=$(spec_channel_required_binaries "$channel") || required_binaries=""

    local binaries_json="{"
    local first=true

    echo "$required_binaries" | while IFS= read -r bin_name; do
        if [ -z "$bin_name" ]; then
            continue
        fi

        local component=""
        case "$bin_name" in
            gitbutler-tauri)       component="desktop" ;;
            but)                   component="but" ;;
            but-server)            component="butServer" ;;
            gitbutler-git-askpass) component="gitbutlerGit" ;;
            *)                     continue ;;
        esac

        local rel_path
        rel_path=$(spec_resolve_binary "$component" "$profile" 2>/dev/null) || rel_path=""
        local abs_path=""
        if [ -n "$rel_path" ]; then
            abs_path="$root/$rel_path"
        fi

        local sha256="absent"
        local mtime=0
        local size=0

        if [ -f "$abs_path" ]; then
            if command -v sha256sum >/dev/null 2>&1; then
                sha256=$(sha256sum "$abs_path" | cut -d' ' -f1)
            elif command -v shasum >/dev/null 2>&1; then
                sha256=$(shasum -a 256 "$abs_path" | cut -d' ' -f1)
            fi
            mtime=$(stat -c %Y "$abs_path" 2>/dev/null || stat -f %m "$abs_path" 2>/dev/null || echo "0")
            size=$(stat -c %s "$abs_path" 2>/dev/null || stat -f %z "$abs_path" 2>/dev/null || echo "0")
        fi

        if [ "$first" = false ]; then
            binaries_json+=","
        fi
        first=false

        binaries_json+="\"$bin_name\":{"
        binaries_json+="\"component\":\"$component\","
        binaries_json+="\"relPath\":\"$rel_path\","
        binaries_json+="\"sha256\":\"$sha256\","
        binaries_json+="\"mtime\":$mtime,"
        binaries_json+="\"size\":$size"
        binaries_json+="}"
    done

    binaries_json+="}"

    local git_commit_ts
    git_commit_ts=$(git -C "$root" log -1 --pretty=format:%ct 2>/dev/null || echo "0")

    cat > "$manifest_path" <<EOF
{
  "version": "3.0.0",
  "channel": "$channel",
  "profile": "$profile",
  "triple": "$triple",
  "cargoTargetDir": "$(spec_cargo_target_dir)",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "gitCommitTs": $git_commit_ts,
  "binaries": $binaries_json
}
EOF

    spec_log "wrote Rust binary manifest: $manifest_path"
}

function spec_validate_rust_manifest {
    local channel="${CHANNEL:-}"
    local profile="${PROFILE:-debug}"
    local root="$(dirname "$SPEC_FILE")"

    if [ -z "$channel" ]; then
        spec_error "CHANNEL must be set before calling spec_validate_rust_manifest"
        return 1
    fi

    local manifest_rel
    manifest_rel=$(spec_get ".components.rust.manifestPath") || manifest_rel="target/.rust-binaries-manifest.json"
    manifest_rel=$(spec_substitute "$manifest_rel")
    local manifest_path="$root/$manifest_rel"

    if [ ! -f "$manifest_path" ]; then
        spec_error "Rust binary manifest not found at $manifest_rel"
        if [ "$(spec_fail_on_missing)" = "true" ]; then
            return 1
        fi
        return 0
    fi

    if [ "$HAS_JQ" != true ] || [ -z "$JQ_PATH" ]; then
        spec_log "jq not available, skipping Rust manifest content validation"
        return 0
    fi

    local rm_channel
    rm_channel=$("$JQ_PATH" -r '.channel // "unknown"' "$manifest_path" 2>/dev/null) || rm_channel="unknown"
    local rm_profile
    rm_profile=$("$JQ_PATH" -r '.profile // "unknown"' "$manifest_path" 2>/dev/null) || rm_profile="unknown"

    if [ "$rm_channel" != "$channel" ]; then
        spec_error "Rust manifest channel mismatch: manifest=$rm_channel current=$channel"
        if [ "$(spec_fail_on_cache_mismatch)" = "true" ]; then
            return 1
        fi
    fi

    if [ "$rm_profile" != "$profile" ]; then
        spec_error "Rust manifest profile mismatch: manifest=$rm_profile current=$profile"
        if [ "$(spec_fail_on_cache_mismatch)" = "true" ]; then
            return 1
        fi
    fi

    local required_binaries
    required_binaries=$(spec_channel_required_binaries "$channel") || required_binaries=""

    local bin_name
    local all_ok=true
    echo "$required_binaries" | while IFS= read -r bin_name; do
        if [ -z "$bin_name" ]; then
            continue
        fi

        local rel_path
        rel_path=$("$JQ_PATH" -r ".binaries.\"$bin_name\".relPath // \"\"" "$manifest_path" 2>/dev/null) || rel_path=""

        if [ -z "$rel_path" ]; then
            spec_error "Rust manifest missing binary: $bin_name"
            all_ok=false
            continue
        fi

        local abs_path="$root/$rel_path"
        if [ ! -f "$abs_path" ]; then
            spec_error "Rust binary missing: $bin_name at $rel_path"
            all_ok=false
        fi
    done

    if [ "$all_ok" != true ]; then
        if [ "$(spec_fail_on_missing)" = "true" ]; then
            return 1
        fi
    fi

    spec_log "Rust binary manifest valid for channel=$channel profile=$profile"
    return 0
}
