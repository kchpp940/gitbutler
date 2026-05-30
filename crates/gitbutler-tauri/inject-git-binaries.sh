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
    printf "[inject-sidecars] %s\n" "$*"
}
function error {
    printf "[inject-sidecars] ERROR: %s\n" "$*" >&2
    exit 1
}

ROOT="$(dirname "$SPEC_FILE")"

if [ -n "${CARGO_BUILD_TARGET:-}" ]; then
    TRIPLE="$CARGO_BUILD_TARGET"
else
    TRIPLE=${TRIPLE_OVERRIDE:-$(rustc --print host-tuple)}
fi

PROFILE="${INJECT_PROFILE:-release}"
CHANNEL="${CHANNEL:-release}"

spec_init_from_channel "$CHANNEL"

INJECT_DIR_SPEC="$(spec_get ".components.sidecar.injectDir")"
INJECT_DIR="$ROOT/$INJECT_DIR_SPEC"

ASKPASS_BIN="$(spec_get ".components.sidecar.binaries.askpass")"
BUT_BIN="$(spec_get ".components.sidecar.binaries.but")"

INTEGRITY_MANIFEST="$(spec_get ".components.sidecar.integrityManifest")"
INTEGRITY_MANIFEST_PATH="$INJECT_DIR/$INTEGRITY_MANIFEST"

ASKPASS_REL=$(spec_resolve_binary "gitbutlerGit" "$PROFILE") || error "could not resolve gitbutlerGit binary path from spec"
ASKPASS_SRC="$ROOT/$ASKPASS_REL"
ASKPASS_SRC_EXE="${ASKPASS_SRC}.exe"

BUT_REL=$(spec_resolve_binary "but" "$PROFILE") || error "could not resolve but binary path from spec"
BUT_SRC="$ROOT/$BUT_REL"
BUT_SRC_EXE="${BUT_SRC}.exe"

log "starting sidecar injection"
log "  spec file: $SPEC_FILE"
log "  channel: $CHANNEL"
log "  profile: $PROFILE"
log "  triple: $TRIPLE"
log "  askpass source: $ASKPASS_SRC (from spec components.gitbutlerGit.outputs.$PROFILE)"
log "  but source: $BUT_SRC (from spec components.but.outputs.$PROFILE)"
log "  inject dir: $INJECT_DIR"

log "cleaning stale sidecar binaries (from spec patterns)"
for pattern in $(spec_get_array ".components.sidecar.namingPatterns[]"); do
    pattern=$(spec_substitute "$pattern")
    if [ -e "$INJECT_DIR/$pattern" ]; then
        rm -v "$INJECT_DIR/$pattern"
    fi
done
for pattern in $(spec_get_array ".components.sidecar.windowsNamingPatterns[]"); do
    pattern=$(spec_substitute "$pattern")
    if [ -e "$INJECT_DIR/$pattern" ]; then
        rm -v "$INJECT_DIR/$pattern"
    fi
done
rm -vf "$INTEGRITY_MANIFEST_PATH"

BINARY_MAP_KEYS=()
BINARY_MAP_VALS=()

if [ -f "$ASKPASS_SRC_EXE" ]; then
    log "injecting Windows sidecar binaries"
    DST_NAME="${ASKPASS_BIN}-${TRIPLE}.exe"
    cp -v "$ASKPASS_SRC_EXE" "$INJECT_DIR/$DST_NAME"
    BINARY_MAP_KEYS+=("$ASKPASS_BIN.exe")
    BINARY_MAP_VALS+=("$DST_NAME")

    if [ -f "$BUT_SRC_EXE" ]; then
        DST_NAME="${BUT_BIN}-${TRIPLE}.exe"
        cp -v "$BUT_SRC_EXE" "$INJECT_DIR/$DST_NAME"
        BINARY_MAP_KEYS+=("$BUT_BIN.exe")
        BINARY_MAP_VALS+=("$DST_NAME")
    else
        log "WARNING: but.exe not found at $BUT_SRC_EXE"
    fi
elif [ -f "$ASKPASS_SRC" ]; then
    log "injecting Unix sidecar binaries"
    DST_NAME="${ASKPASS_BIN}-${TRIPLE}"
    cp -v "$ASKPASS_SRC" "$INJECT_DIR/$DST_NAME"
    BINARY_MAP_KEYS+=("$ASKPASS_BIN")
    BINARY_MAP_VALS+=("$DST_NAME")

    if [ -f "$BUT_SRC" ]; then
        DST_NAME="${BUT_BIN}-${TRIPLE}"
        cp -v "$BUT_SRC" "$INJECT_DIR/$DST_NAME"
        BINARY_MAP_KEYS+=("$BUT_BIN")
        BINARY_MAP_VALS+=("$DST_NAME")
    else
        log "WARNING: but not found at $BUT_SRC (not required on this platform)"
    fi
else
    error "sidecar binary not found at $ASKPASS_SRC or $ASKPASS_SRC_EXE"
    error "  spec resolved path: components.gitbutlerGit.outputs.$PROFILE = $ASKPASS_REL"
    error "  Run: cargo build --release -p gitbutler-git"
fi

log "generating integrity manifest"

GIT_COMMIT_TS=$(git -C "$ROOT" log -1 --pretty=format:%ct 2>/dev/null || echo "0")

INTEGRITY_JSON="{"
INTEGRITY_JSON+="\"version\":\"3.0.0\","
INTEGRITY_JSON+="\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
INTEGRITY_JSON+="\"triple\":\"${TRIPLE}\","
INTEGRITY_JSON+="\"profile\":\"${PROFILE}\","
INTEGRITY_JSON+="\"channel\":\"${CHANNEL}\","
INTEGRITY_JSON+="\"specVersion\":\"$(spec_get ".version")\","
INTEGRITY_JSON+="\"gitCommitTs\":${GIT_COMMIT_TS},"
INTEGRITY_JSON+="\"binaries\":{"

FIRST=true
for i in "${!BINARY_MAP_KEYS[@]}"; do
    src_name="${BINARY_MAP_KEYS[$i]}"
    dst_name="${BINARY_MAP_VALS[$i]}"
    dst_path="$INJECT_DIR/$dst_name"

    if command -v sha256sum >/dev/null 2>&1; then
        HASH=$(sha256sum "$dst_path" | cut -d' ' -f1)
    elif command -v shasum >/dev/null 2>&1; then
        HASH=$(shasum -a 256 "$dst_path" | cut -d' ' -f1)
    else
        HASH="not-available"
    fi

    MTIME=$(stat -c %Y "$dst_path" 2>/dev/null || stat -f %m "$dst_path" 2>/dev/null || echo "0")
    SIZE=$(stat -c %s "$dst_path" 2>/dev/null || stat -f %z "$dst_path" 2>/dev/null || echo "0")

    if [ "$FIRST" = false ]; then
        INTEGRITY_JSON+=","
    fi
    FIRST=false

    INTEGRITY_JSON+="\"$src_name\":{"
    INTEGRITY_JSON+="\"file\":\"$dst_name\","
    INTEGRITY_JSON+="\"sha256\":\"$HASH\","
    INTEGRITY_JSON+="\"mtime\":$MTIME,"
    INTEGRITY_JSON+="\"size\":$SIZE"
    INTEGRITY_JSON+="}"

    if [ "$GIT_COMMIT_TS" != "0" ] && [ "$MTIME" -lt "$GIT_COMMIT_TS" ]; then
        log "WARNING: $dst_name mtime is OLDER than last git commit!"
        log "  binary mtime: $MTIME"
        log "  git commit ts: $GIT_COMMIT_TS"
        if [ "$(spec_fail_on_stale)" = "true" ]; then
            error "strict mode enabled - stale artifacts not allowed"
        fi
    fi
done

INTEGRITY_JSON+="}}"

echo "$INTEGRITY_JSON" > "$INTEGRITY_MANIFEST_PATH"
cat "$INTEGRITY_MANIFEST_PATH"

log "sidecar injection complete"
log "  integrity manifest: $INTEGRITY_MANIFEST_PATH"
log "  binaries injected: ${#BINARY_MAP_KEYS[@]}"
