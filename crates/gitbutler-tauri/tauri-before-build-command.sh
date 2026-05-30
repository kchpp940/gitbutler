#!/usr/bin/env bash
set -euo pipefail

if [ -n "${BASH_SOURCE:-}" ]; then
    SOURCE="${BASH_SOURCE[0]}"
    while [ -h "$SOURCE" ]; do
      DIR="$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )"
      SOURCE="$(readlink "$SOURCE")"
      [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
    done
    SCRIPT_DIR="$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )"
elif [ -n "${ZSH_VERSION:-}" ]; then
    SCRIPT_DIR="$(cd "$(dirname "${(%):-%x}")" && pwd)"
else
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
fi

source "$SCRIPT_DIR/../../build-artifacts-lib.sh"
spec_load

CHANNEL="${1:?First argument must be the channel: development|nightly|release|test}"

function log {
    printf "[tauri-prebuild] %s\n" "$*"
}
function error {
    printf "[tauri-prebuild] ERROR: %s\n" "$*" >&2
    exit 1
}

ROOT="$(dirname "$SPEC_FILE")"

case "$CHANNEL" in
  development|dev)   BUILD_MODE="development" ;;
  nightly)           BUILD_MODE="nightly" ;;
  production|release)  BUILD_MODE="production" ;;
  test)              BUILD_MODE="development" ;;
  *)                 BUILD_MODE="$CHANNEL" ;;
esac

spec_init_from_channel "$CHANNEL"

CARGO_TARGET_DIR=$(spec_cargo_target_dir)
log "setting CARGO_TARGET_DIR=$CARGO_TARGET_DIR (from spec channel=$CHANNEL)"
export CARGO_TARGET_DIR

log "=== STEP 0: PRE-BUILD VALIDATION ==="
spec_check_cargo_target_dir || error "Cargo target-dir is inconsistent with spec"
spec_check_stale_cache || error "stale cache detected - clean and rebuild"

FE_DIR_SPEC="$(spec_get ".components.frontend.outputDir")"
FE_DIR="$ROOT/$FE_DIR_SPEC"
FE_MANIFEST_SPEC="$(spec_get ".components.frontend.buildManifest")"
FE_MANIFEST="$FE_DIR/$FE_MANIFEST_SPEC"

SIDECAR_INJECT_DIR_SPEC="$(spec_get ".components.sidecar.injectDir")"
SIDECAR_INJECT_DIR="$ROOT/$SIDECAR_INJECT_DIR_SPEC"

log "starting Tauri pre-build"
log "  spec file: $SPEC_FILE"
log "  channel: $CHANNEL"
log "  build mode: $BUILD_MODE"
log "  profile: $PROFILE"
log "  triple: $TRIPLE"
log "  CARGO_TARGET_DIR: $CARGO_TARGET_DIR"
log "  frontend dir: $FE_DIR"
log "  sidecar inject dir: $SIDECAR_INJECT_DIR"

if [ "${CI:-}" = "true" ]; then
    log "CI environment detected, expecting frontend build to be downloaded"
else
    log ""
    log "=== STEP 1: FRONTEND BUILD ==="

    if [ -f "$FE_MANIFEST" ]; then
        PREV_CHANNEL=""
        if [ -n "$JQ_PATH" ] && [ "$HAS_JQ" = true ]; then
            PREV_CHANNEL=$("$JQ_PATH" -r '.channel' "$FE_MANIFEST" 2>/dev/null) || PREV_CHANNEL=""
        fi

        if [ -n "$PREV_CHANNEL" ] && [ "$PREV_CHANNEL" != "$CHANNEL" ]; then
            log "channel mismatch detected: previous='$PREV_CHANNEL', current='$CHANNEL'"
            log "cleaning frontend output to prevent cross-contamination"
            rm -rf "$FE_DIR"
        fi
    fi

    log "building frontend: pnpm build:desktop --mode $BUILD_MODE"
    pnpm build:desktop -- --mode "$BUILD_MODE"

    if [ ! -f "$FE_MANIFEST" ]; then
        log "WARNING: Vite build did not write .build-manifest.json - writing manually"
        mkdir -p "$FE_DIR"
        GIT_COMMIT_TS=$(git -C "$ROOT" log -1 --pretty=format:%ct 2>/dev/null || echo "0")
        cat > "$FE_MANIFEST" <<EOF
{
  "version": "3.0.0",
  "channel": "$CHANNEL",
  "mode": "$BUILD_MODE",
  "profile": "$PROFILE",
  "cargoTargetDir": "$CARGO_TARGET_DIR",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "specVersion": "$(spec_get ".version")",
  "gitCommitTs": $GIT_COMMIT_TS
}
EOF
    fi

    log "validating frontend build manifest"
    if [ -n "$JQ_PATH" ] && [ "$HAS_JQ" = true ]; then
        FE_MAN_CHANNEL=$("$JQ_PATH" -r '.channel // "unknown"' "$FE_MANIFEST" 2>/dev/null) || FE_MAN_CHANNEL="unknown"
        FE_MAN_PROFILE=$("$JQ_PATH" -r '.profile // "unknown"' "$FE_MANIFEST" 2>/dev/null) || FE_MAN_PROFILE="unknown"

        if [ "$FE_MAN_CHANNEL" != "$CHANNEL" ]; then
            error "frontend manifest channel mismatch: manifest=$FE_MAN_CHANNEL current=$CHANNEL"
        fi
        if [ "$FE_MAN_PROFILE" != "$PROFILE" ]; then
            error "frontend manifest profile mismatch: manifest=$FE_MAN_PROFILE current=$PROFILE"
        fi
        log "  ✓ frontend manifest: channel=$FE_MAN_CHANNEL profile=$FE_MAN_PROFILE"
    fi
fi

log ""
log "=== STEP 2: RUST BINARIES BUILD ==="
BUNDLE_ENABLED="$(spec_channel_bundle "$CHANNEL")"

case "$CHANNEL" in
  development|dev|test)
    log "dev/test channel - building required binaries (debug profile)"
    log "  building gitbutler-git"
    cargo build -p gitbutler-git

    log "  building but"
    cargo build -p but
    ;;
  *)
    log "release channel - building release artifacts"
    log "  building gitbutler-git (release)"
    export CHANNEL
    cargo build --release -p gitbutler-git

    if [ "${OS:-}" == "windows" ] || [ "${OS:-}" == "linux" ]; then
      log "  building but (release)"
      cargo build --release -p but
    fi
    ;;
esac

log ""
log "=== STEP 3: RUST BINARY MANIFEST ==="
spec_write_rust_manifest || error "failed to write Rust binary manifest"

log "validating Rust binary manifest"
spec_validate_rust_manifest || error "Rust binary manifest validation failed"

log "validating all required artifacts exist"
spec_validate_artifacts || error "required artifacts missing for channel=$CHANNEL profile=$PROFILE"

if [ "$BUNDLE_ENABLED" = true ]; then
    log ""
    log "=== STEP 4: SIDECAR INJECTION ==="
    log "injecting sidecar binaries"
    bash "$SIDECAR_INJECT_DIR/inject-git-binaries.sh"

    log ""
    log "=== STEP 5: SIDECAR INTEGRITY VERIFICATION ==="
    bash "$SIDECAR_INJECT_DIR/verify-sidecars.sh"

    SIDECAR_MANIFEST="$SIDECAR_INJECT_DIR/$(spec_get ".components.sidecar.integrityManifest")"
    if [ -f "$SIDECAR_MANIFEST" ] && [ -n "$JQ_PATH" ] && [ "$HAS_JQ" = true ]; then
        SC_CHANNEL=$("$JQ_PATH" -r '.channel // "unknown"' "$SIDECAR_MANIFEST" 2>/dev/null) || SC_CHANNEL="unknown"
        SC_PROFILE=$("$JQ_PATH" -r '.profile // "unknown"' "$SIDECAR_MANIFEST" 2>/dev/null) || SC_PROFILE="unknown"

        if [ "$SC_CHANNEL" != "$CHANNEL" ]; then
            error "sidecar manifest channel mismatch: manifest=$SC_CHANNEL current=$CHANNEL"
        fi
        if [ "$SC_PROFILE" != "$PROFILE" ]; then
            error "sidecar manifest profile mismatch: manifest=$SC_PROFILE current=$PROFILE"
        fi
        log "  ✓ sidecar manifest: channel=$SC_CHANNEL profile=$SC_PROFILE"
    fi
fi

log ""
log "=== STEP 6: FINAL VALIDATION ==="
log "running validate-artifacts.sh"
bash "$ROOT/scripts/validate-artifacts.sh" || error "artifact validation failed"

log ""
log "Tauri pre-build complete - all manifests verified"
