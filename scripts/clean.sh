#!/usr/bin/env bash
set -euo pipefail

if [ -n "${BASH_SOURCE:-}" ]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
elif [ -n "${ZSH_VERSION:-}" ]; then
    SCRIPT_DIR="$(cd "$(dirname "${(%):-%x}")" && pwd)"
else
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
fi

source "$SCRIPT_DIR/../build-artifacts-lib.sh"
spec_load

FORCE=""
SCOPE="all"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --yes|-y)
            FORCE="yes"
            shift
            ;;
        --scope)
            SCOPE="$2"
            shift 2
            ;;
        --triple)
            TRIPLE="$2"
            shift 2
            ;;
        --channel)
            CHANNEL="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [--yes] [--scope <scope>] [--triple <triple>] [--channel <channel>]"
            echo ""
            echo "Scopes (from build-artifacts.spec.json):"
            spec_get_array ".cleanScopes | keys[]" | while IFS= read -r key; do
                desc=$(spec_get ".cleanScopes.\"$key\"") || desc=""
                printf "  %-12s %s\n" "$key" "$desc"
            done
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

SPEC_ROOT="$(dirname "$SPEC_FILE")"
cd "$SPEC_ROOT"

echo "=== GitButler Build Artifact Cleanup ==="
echo "Spec: $SPEC_FILE"
echo "Scope: $SCOPE"
if [ -n "${CHANNEL:-}" ]; then echo "Channel: $CHANNEL"; fi
if [ -n "${TRIPLE:-}" ]; then echo "Triple: $TRIPLE"; fi
echo ""
echo "WARNING: This script removes build artifacts according to the spec."
echo "WARNING: All paths are derived from build-artifacts.spec.json - no hardcoded paths."

if [ "$FORCE" != "yes" ]; then
    printf "Are you sure you want to delete artifacts for scope '$SCOPE'? (y/n) "
    read confirmed

    if [ "$confirmed" = "${confirmed#[yY]}" ]; then
        echo "Aborting"
        exit 1
    fi
fi

echo ""
echo "Resolving clean patterns from spec..."

SPEC_ROOT="$(dirname "$SPEC_FILE")"
PATTERNS_FILE=$(mktemp)
spec_get_clean_patterns "$SCOPE" > "$PATTERNS_FILE"

TOTAL_REMOVED=0
while IFS= read -r pattern; do
    if [ -z "$pattern" ]; then
        continue
    fi

    expanded_pattern=$(spec_substitute "$pattern")

    if [[ "$expanded_pattern" == *"**"* ]]; then
        echo "  Removing: $expanded_pattern"
        removed_count=$(find . -path "$expanded_pattern" -print 2>/dev/null | wc -l | tr -d ' ')
        find . -path "$expanded_pattern" -exec rm -rf {} + 2>/dev/null || true
    else
        abs_path="$SPEC_ROOT/$expanded_pattern"
        if [ -e "$abs_path" ] || [ -L "$abs_path" ]; then
            echo "  Removing: $expanded_pattern"
            rm -rf "$abs_path"
            removed_count=1
        else
            removed_count=0
        fi
    fi
    TOTAL_REMOVED=$((TOTAL_REMOVED + removed_count))
done < "$PATTERNS_FILE"

rm -f "$PATTERNS_FILE"

echo ""
echo "Done. Cleaned artifacts for scope '$SCOPE'."
