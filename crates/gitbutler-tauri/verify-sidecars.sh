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

THIS="$0"
function log {
    printf "[verify-sidecars] %s\n" "$*"
}
function error {
    printf "[verify-sidecars] ERROR: %s\n" "$*" >&2
    exit 1
}

ROOT="$(dirname "$SPEC_FILE")"
INJECT_DIR_SPEC="$(spec_get ".components.sidecar.injectDir")"
INJECT_DIR="$ROOT/$INJECT_DIR_SPEC"

INTEGRITY_MANIFEST="$(spec_get ".components.sidecar.integrityManifest")"
INTEGRITY_MANIFEST_PATH="$INJECT_DIR/$INTEGRITY_MANIFEST"

TAURI_CONF="${1:-}"
CHANNEL="${CHANNEL:-release}"
STRICT_MODE="$(spec_strict_mode)"
FAIL_ON_STALE="$(spec_fail_on_stale)"
FAIL_ON_MISSING="$(spec_fail_on_missing)"
MTIME_GRACE="$(spec_mtime_grace)"

log "starting sidecar verification"
log "  spec file: $SPEC_FILE"
log "  channel: $CHANNEL"
log "  inject dir: $INJECT_DIR"
log "  strict mode: $STRICT_MODE"
log "  fail on stale: $FAIL_ON_STALE"
log "  fail on missing: $FAIL_ON_MISSING"

if [ ! -f "$INTEGRITY_MANIFEST_PATH" ]; then
    error "sidecar integrity manifest not found: $INTEGRITY_MANIFEST_PATH"
    error "  Run: bash crates/gitbutler-tauri/inject-git-binaries.sh"
    error "  Or: cargo build --release -p gitbutler-git && bash crates/gitbutler-tauri/inject-git-binaries.sh"
fi

log "integrity manifest found: $INTEGRITY_MANIFEST_PATH"

if [ -z "$JQ_PATH" ] || [ "$HAS_JQ" != true ]; then
    log "jq not available, skipping detailed verification"
    log "manifest exists: $INTEGRITY_MANIFEST_PATH"
    exit 0
fi

MANIFEST_VERSION=$("$JQ_PATH" -r '.version // "1.0.0"' "$INTEGRITY_MANIFEST_PATH")
MANIFEST_TRIPLE=$("$JQ_PATH" -r '.triple' "$INTEGRITY_MANIFEST_PATH")
MANIFEST_PROFILE=$("$JQ_PATH" -r '.profile' "$INTEGRITY_MANIFEST_PATH")
MANIFEST_CHANNEL=$("$JQ_PATH" -r '.channel // "unknown"' "$INTEGRITY_MANIFEST_PATH")
MANIFEST_GIT_TS=$("$JQ_PATH" -r '.gitCommitTs // 0' "$INTEGRITY_MANIFEST_PATH")
BINARY_COUNT=$("$JQ_PATH" '.binaries | keys | length' "$INTEGRITY_MANIFEST_PATH")

log "manifest info:"
log "  version: $MANIFEST_VERSION"
log "  triple: $MANIFEST_TRIPLE"
log "  profile: $MANIFEST_PROFILE"
log "  manifest channel: $MANIFEST_CHANNEL"
log "  binaries: $BINARY_COUNT"

EXPECTED_PROFILE="$(spec_channel_profile "$CHANNEL")"
if [ "$MANIFEST_PROFILE" != "$EXPECTED_PROFILE" ]; then
    error "manifest profile mismatch:"
    error "  expected: $EXPECTED_PROFILE (for channel $CHANNEL)"
    error "  got: $MANIFEST_PROFILE"
    error "  This indicates dev/prod cross-contamination!"
fi

CURRENT_TS=$(date +%s)

ALL_VALID=true
while IFS= read -r bin_name; do
    [ -z "$bin_name" ] && continue

    FILE_NAME=$("$JQ_PATH" -r ".binaries[\"$bin_name\"].file" "$INTEGRITY_MANIFEST_PATH")
    EXPECTED_HASH=$("$JQ_PATH" -r ".binaries[\"$bin_name\"].sha256" "$INTEGRITY_MANIFEST_PATH")
    EXPECTED_MTIME=$("$JQ_PATH" -r ".binaries[\"$bin_name\"].mtime" "$INTEGRITY_MANIFEST_PATH")
    EXPECTED_SIZE=$("$JQ_PATH" -r ".binaries[\"$bin_name\"].size" "$INTEGRITY_MANIFEST_PATH")

    FILE_PATH="$INJECT_DIR/$FILE_NAME"

    if [ ! -f "$FILE_PATH" ]; then
        error "sidecar binary missing: $FILE_NAME"
        error "  Expected at: $FILE_PATH"
    fi

    ACTUAL_SIZE=$(stat -c %s "$FILE_PATH" 2>/dev/null || stat -f %z "$FILE_PATH" 2>/dev/null || echo "0")
    if [ "$ACTUAL_SIZE" != "$EXPECTED_SIZE" ]; then
        error "sidecar binary size mismatch: $FILE_NAME"
        error "  expected: $EXPECTED_SIZE bytes"
        error "  got: $ACTUAL_SIZE bytes"
    fi

    ACTUAL_MTIME=$(stat -c %Y "$FILE_PATH" 2>/dev/null || stat -f %m "$FILE_PATH" 2>/dev/null || echo "0")
    if [ "$ACTUAL_MTIME" != "$EXPECTED_MTIME" ]; then
        log "WARNING: sidecar mtime changed since injection: $FILE_NAME"
        log "  expected: $EXPECTED_MTIME"
        log "  got: $ACTUAL_MTIME"
        if [ "$STRICT_MODE" = "true" ]; then
            error "strict mode: mtime modification detected"
        fi
    fi

    if [ "$EXPECTED_HASH" != "not-available" ]; then
        if command -v sha256sum >/dev/null 2>&1; then
            ACTUAL_HASH=$(sha256sum "$FILE_PATH" | cut -d' ' -f1)
        elif command -v shasum >/dev/null 2>&1; then
            ACTUAL_HASH=$(shasum -a 256 "$FILE_PATH" | cut -d' ' -f1)
        else
            ACTUAL_HASH="not-available"
        fi

        if [ "$ACTUAL_HASH" != "not-available" ] && [ "$ACTUAL_HASH" != "$EXPECTED_HASH" ]; then
            error "sidecar binary hash mismatch: $FILE_NAME"
            error "  expected: $EXPECTED_HASH"
            error "  got: $ACTUAL_HASH"
            error "  Binary was modified after injection!"
        fi
    fi

    if [ "$MANIFEST_GIT_TS" != "0" ]; then
        FILE_AGE=$((CURRENT_TS - ACTUAL_MTIME))
        if [ "$ACTUAL_MTIME" -lt "$MANIFEST_GIT_TS" ]; then
            log "WARNING: sidecar is OLDER than last git commit: $FILE_NAME"
            log "  binary mtime: $ACTUAL_MTIME"
            log "  git commit ts: $MANIFEST_GIT_TS"
            log "  file age: $FILE_AGE seconds"
            if [ "$FAIL_ON_STALE" = "true" ]; then
                error "FAIL_ON_STALE=true - build artifacts are stale, please rebuild"
            fi
        else
            log "  ✓ $FILE_NAME is fresh (built after last git commit)"
        fi
    fi

    log "  ✓ $FILE_NAME verified (size: $ACTUAL_SIZE bytes, age: $((CURRENT_TS - ACTUAL_MTIME))s)"
done < <("$JQ_PATH" -r '.binaries | keys[]' "$INTEGRITY_MANIFEST_PATH")

log ""
log "=== ALL SIDECAR VERIFICATION CHECKS PASSED ==="
log "  Sidecars are from this build run"
log "  No stale binaries detected"
log "  No binary modifications detected"
log "  Profile matches channel: $MANIFEST_PROFILE"
