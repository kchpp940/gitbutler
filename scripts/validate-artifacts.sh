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

source "$SCRIPT_DIR/../build-artifacts-lib.sh"
spec_load

THIS="$0"
function log {
    printf "[validate-artifacts] %s\n" "$*"
}
function error {
    printf "[validate-artifacts] ERROR: %s\n" "$*" >&2
    exit 1
}

CHANNEL="${CHANNEL:-release}"
if [ -z "${PROFILE:-}" ]; then
    PROFILE="$(spec_channel_profile "$CHANNEL")"
fi
TRIPLE="${TRIPLE_OVERRIDE:-$(rustc --print host-tuple 2>/dev/null || echo "unknown")}"

spec_init_from_channel "$CHANNEL"

ROOT="$(dirname "$SPEC_FILE")"

log "starting artifact validation"
log "  spec file: $SPEC_FILE"
log "  channel: $CHANNEL"
log "  profile: $PROFILE"
log "  triple: $TRIPLE"
log "  spec version: $(spec_get ".version")"

log ""
log "=== CARGO TARGET DIR CHECK ==="
spec_check_cargo_target_dir || {
    if [ "$(spec_fail_on_cache_mismatch)" = "true" ]; then
        error "Cargo target-dir inconsistent with spec"
    else
        log "WARNING: Cargo target-dir inconsistent with spec (non-strict mode)"
    fi
}

log ""
log "=== REQUIRED BINARIES ==="
spec_validate_artifacts || {
    if [ "$(spec_fail_on_missing)" = "true" ]; then
        error "required artifacts missing for channel=$CHANNEL profile=$PROFILE"
    else
        log "WARNING: some artifacts missing (strict mode disabled)"
    fi
}

log ""
log "=== SIDECAR INTEGRITY MANIFEST ==="
SIDECAR_MANIFEST_SPEC="$(spec_get ".components.sidecar.injectDir")/$(spec_get ".components.sidecar.integrityManifest")"
SIDECAR_MANIFEST="$ROOT/$(spec_substitute "$SIDECAR_MANIFEST_SPEC")"

if [ -f "$SIDECAR_MANIFEST" ]; then
    log "  ✓ sidecar manifest: $(spec_substitute "$SIDECAR_MANIFEST_SPEC")"
    if [ "$HAS_JQ" = true ] && [ -n "$JQ_PATH" ]; then
        SC_TRIPLE=$("$JQ_PATH" -r '.triple // "unknown"' "$SIDECAR_MANIFEST" 2>/dev/null) || SC_TRIPLE="unknown"
        SC_PROFILE=$("$JQ_PATH" -r '.profile // "unknown"' "$SIDECAR_MANIFEST" 2>/dev/null) || SC_PROFILE="unknown"
        SC_CHANNEL=$("$JQ_PATH" -r '.channel // "unknown"' "$SIDECAR_MANIFEST" 2>/dev/null) || SC_CHANNEL="unknown"
        log "    triple: $SC_TRIPLE, profile: $SC_PROFILE, channel: $SC_CHANNEL"

        if [ "$SC_CHANNEL" != "$CHANNEL" ]; then
            log "    ⚠ WARNING: sidecar channel ($SC_CHANNEL) != current channel ($CHANNEL)"
            if [ "$(spec_fail_on_cache_mismatch)" = "true" ]; then
                error "sidecar manifest channel mismatch - stale cache"
            fi
        fi
        if [ "$SC_PROFILE" != "$PROFILE" ]; then
            log "    ⚠ WARNING: sidecar profile ($SC_PROFILE) != current profile ($PROFILE)"
            if [ "$(spec_fail_on_cache_mismatch)" = "true" ]; then
                error "sidecar manifest profile mismatch - stale cache"
            fi
        fi
        if [ "$SC_TRIPLE" != "$TRIPLE" ]; then
            log "    ⚠ WARNING: sidecar triple ($SC_TRIPLE) != current triple ($TRIPLE)"
            if [ "$(spec_fail_on_cache_mismatch)" = "true" ]; then
                error "sidecar manifest triple mismatch - wrong platform binaries"
            fi
        fi
    fi
else
    log "  ✗ sidecar manifest: NOT FOUND"
    BUNDLE_ENABLED="$(spec_channel_bundle "$CHANNEL")"
    if [ "$BUNDLE_ENABLED" = true ]; then
        if [ "$(spec_fail_on_missing)" = "true" ]; then
            error "sidecar manifest missing but required for bundle channel=$CHANNEL"
        fi
    fi
fi

log ""
log "=== FRONTEND BUILD MANIFEST ==="
FE_MANIFEST_SPEC="$(spec_get ".components.frontend.outputDir")/$(spec_get ".components.frontend.buildManifest")"
FE_MANIFEST="$ROOT/$(spec_substitute "$FE_MANIFEST_SPEC")"

if [ -f "$FE_MANIFEST" ]; then
    log "  ✓ frontend manifest: $(spec_substitute "$FE_MANIFEST_SPEC")"
    if [ "$HAS_JQ" = true ] && [ -n "$JQ_PATH" ]; then
        FE_CHANNEL=$("$JQ_PATH" -r '.channel // "unknown"' "$FE_MANIFEST" 2>/dev/null) || FE_CHANNEL="unknown"
        FE_PROFILE=$("$JQ_PATH" -r '.profile // "unknown"' "$FE_MANIFEST" 2>/dev/null) || FE_PROFILE="unknown"
        FE_CARGO_DIR=$("$JQ_PATH" -r '.cargoTargetDir // "unknown"' "$FE_MANIFEST" 2>/dev/null) || FE_CARGO_DIR="unknown"
        log "    channel: $FE_CHANNEL, profile: $FE_PROFILE, cargoTargetDir: $FE_CARGO_DIR"

        if [ "$FE_CHANNEL" != "$CHANNEL" ]; then
            log "    ⚠ WARNING: frontend channel ($FE_CHANNEL) != current channel ($CHANNEL)"
            if [ "$(spec_fail_on_cache_mismatch)" = "true" ]; then
                error "frontend manifest channel mismatch - dev/prod cross-contamination"
            fi
        fi
        if [ "$FE_PROFILE" != "$PROFILE" ]; then
            log "    ⚠ WARNING: frontend profile ($FE_PROFILE) != current profile ($PROFILE)"
            if [ "$(spec_fail_on_cache_mismatch)" = "true" ]; then
                error "frontend manifest profile mismatch - stale cache"
            fi
        fi

        CARGO_TARGET_DIR=$(spec_cargo_target_dir)
        if [ "$FE_CARGO_DIR" != "unknown" ] && [ "$FE_CARGO_DIR" != "$CARGO_TARGET_DIR" ]; then
            log "    ⚠ WARNING: frontend cargoTargetDir ($FE_CARGO_DIR) != spec ($CARGO_TARGET_DIR)"
            if [ "$(spec_fail_on_cache_mismatch)" = "true" ]; then
                error "frontend was built with different CARGO_TARGET_DIR - rebuild required"
            fi
        fi
    fi
else
    log "  ✗ frontend manifest: NOT FOUND"
    if [ "$(spec_fail_on_missing)" = "true" ]; then
        error "frontend build manifest missing"
    fi
fi

log ""
log "=== STALE CACHE CHECK ==="
spec_check_stale_cache || {
    if [ "$(spec_fail_on_cache_mismatch)" = "true" ]; then
        error "stale cache detected - clean and rebuild"
    else
        log "WARNING: stale cache detected (non-strict mode)"
    fi
}

log ""
log "=== PATH CONSISTENCY CHECK ==="
COMPONENTS="desktop but butServer gitbutlerGit"
for comp in $COMPONENTS; do
    for prof in debug release; do
        raw_path=$(spec_resolve_binary "$comp" "$prof" 2>/dev/null) || continue
        abs_path="$ROOT/$raw_path"

        if [ -f "$abs_path" ]; then
            SIZE=$(stat -c %s "$abs_path" 2>/dev/null || stat -f %z "$abs_path" 2>/dev/null || echo "0")
            log "  ✓ $comp ($prof): $raw_path ($SIZE bytes)"
        else
            if [ "$prof" = "$PROFILE" ]; then
                log "  ✗ $comp ($prof): NOT FOUND at $raw_path"
            fi
        fi
    done
done

log ""
log "artifact validation complete"
