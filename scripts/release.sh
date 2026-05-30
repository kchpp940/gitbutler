#!/bin/bash

set -o errexit
set -o nounset
set -o pipefail

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

PWD="$SCRIPT_DIR"

source "$SCRIPT_DIR/../build-artifacts-lib.sh"
spec_load

CHANNEL=""
DO_SIGN="false"
VERSION=""
TARGET="${CARGO_BUILD_TARGET:-}"

function help() {
	local to
	to="$1"

	echo "Usage: $0 <flags>" 1>&"$to"
	echo 1>&"$to"
	echo "flags:" 1>&"$to"
	echo "	--version											release version." 1>&"$to"
	echo "	--dist												path to store artifacts in." 1>&"$to"
	echo "	--sign												if set, will sign the app." 1>&"$to"
	echo "	--channel											the channel to use for the release (release | nightly)." 1>&"$to"
	echo "	--help												display this message." 1>&"$to"
}

function error() {
	echo "error: $*" 1>&2
	echo 1>&2
	help 2
	exit 1
}

function info() {
	echo "$@"
}

function os() {
	local os
	os="$(uname -s)"
	case "$os" in
	Darwin)
		echo "macos"
		;;
	Linux)
		echo "linux"
		;;
	Windows | MSYS* | MINGW*)
		echo "windows"
		;;
	*)
		error "$os: unsupported"
		;;
	esac
}

function arch() {
	local arch

	# If TARGET is specified, extract architecture from it
	if [ -n "${TARGET:-}" ]; then
		case "$TARGET" in
		*aarch64* | *arm64*)
			echo "aarch64"
			return
			;;
		*x86_64* | *amd64*)
			echo "x86_64"
			return
			;;
		esac
	fi

	# Otherwise, detect from system
	arch="$(uname -m)"
	case "$arch" in
	arm64 | aarch64)
		echo "aarch64"
		;;
	x86_64)
		echo "x86_64"
		;;
	*)
		error "$arch: unsupported architecture"
		;;
	esac
}

ARCH="$(arch)"
OS="$(os)"
DIST="release"

# the OS is used for certain build decisions and signing
export OS

function tauri() {
	(cd "$PWD/.." && pnpm tauri-for-release "$@")
}

while [[ $# -gt 0 ]]; do
	case "$1" in
	--help)
		help 1
		exit 1
		;;
	--version)
		VERSION="$2"
		shift
		shift
		;;
	--dist)
		DIST="$2"
		shift
		shift
		;;
	--sign)
		DO_SIGN="true"
		shift
		;;
	--channel)
		CHANNEL="$2"
		shift
		shift
		;;
	*)
		error "unknown flag $1"
		;;
	esac
done

# Recalculate ARCH after TARGET is set
ARCH="$(arch)"

[ -z "${VERSION-}" ] && error "--version is not set"

[ -z "${TAURI_SIGNING_PRIVATE_KEY-}" ] && error "$TAURI_SIGNING_PRIVATE_KEY is not set"
[ -z "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD-}" ] && error "$TAURI_SIGNING_PRIVATE_KEY_PASSWORD is not set"

if [ "$CHANNEL" != "release" ] && [ "$CHANNEL" != "nightly" ]; then
	error "--channel must be either 'release' or 'nightly'"
fi

spec_init_from_channel "$CHANNEL"

CARGO_TARGET_DIR=$(spec_cargo_target_dir)
info "spec: CARGO_TARGET_DIR=$CARGO_TARGET_DIR (from spec channel=$CHANNEL)"
export CARGO_TARGET_DIR

spec_check_cargo_target_dir || error "Cargo target-dir inconsistent with spec - update .cargo/config.toml"

info "validating artifacts against spec (channel=$CHANNEL profile=$PROFILE)"
bash "$SCRIPT_DIR/validate-artifacts.sh" || error "artifact validation failed - missing or stale artifacts"

spec_check_stale_cache || error "stale cache detected - clean and rebuild"

if [ "$DO_SIGN" = "true" ]; then
	if [ "$OS" = "macos" ]; then
		[ -z "${APPLE_CERTIFICATE-}" ] && error "$APPLE_CERTIFICATE is not set"
		[ -z "${APPLE_CERTIFICATE_PASSWORD-}" ] && error "$APPLE_CERTIFICATE_PASSWORD is not set"
		[ -z "${APPLE_ID-}" ] && error "$APPLE_ID is not set"
		[ -z "${APPLE_TEAM_ID-}" ] && error "$APPLE_TEAM_ID is not set"
		[ -z "${APPLE_PASSWORD-}" ] && error "$APPLE_PASSWORD is not set"
		export APPLE_CERTIFICATE="$APPLE_CERTIFICATE"
		export APPLE_CERTIFICATE_PASSWORD="$APPLE_CERTIFICATE_PASSWORD"
		export APPLE_ID="$APPLE_ID"
		export APPLE_TEAM_ID="$APPLE_TEAM_ID"
		export APPLE_PASSWORD="$APPLE_PASSWORD"
	elif [ "$OS" == "linux" ]; then
		[ -z "${APPIMAGE_KEY_ID-}" ] && error "$APPIMAGE_KEY_ID is not set"
		[ -z "${APPIMAGE_KEY_PASSPHRASE-}" ] && error "$APPIMAGE_KEY_PASSPHRASE is not set"
		export SIGN=1
		export SIGN_KEY="$APPIMAGE_KEY_ID"
		export APPIMAGETOOL_SIGN_PASSPHRASE="$APPIMAGE_KEY_PASSPHRASE"
	elif [ "$OS" == "windows" ]; then
		: # nothing to do on windows
	else
		error "signing is not supported on $(uname -s)"
	fi
fi

info "building:"
info "	channel: $CHANNEL"
info "	version: $VERSION"
info "	os: $OS"
info "	arch: $ARCH"
info "	dist: $DIST"
info "	sign: $DO_SIGN"
info "	target: ${TARGET:-default}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' exit

CONFIG_PATH=$(readlink -f "$PWD/../crates/gitbutler-tauri/tauri.conf.$CHANNEL.json")

if [ "$OS" = "windows" ]; then
	# WARNING: `builtin-but` doesn't work on Windows, see https://github.com/gitbutlerapp/gitbutler/issues/11461.
	#          Should it be re-added, please ensure that `but` is built
	#          as part of the 'beforeBuildCommand' in tauri.conf AND it must be injected
	#          via 'inject-git-binaries.sh'.
	EXTERNAL_BIN='["gitbutler-git-askpass", "but"]'
	FEATURES="windows"
elif [ "$OS" = "linux" ]; then
	EXTERNAL_BIN='["gitbutler-git-askpass"]'
	FEATURES="builtin-but packaged-but-distribution"
elif [ "$OS" = "macos" ]; then
	EXTERNAL_BIN='["gitbutler-git-askpass"]'
	FEATURES="builtin-but"
else
	echo "Unsupported OS: $OS"
	exit 1
fi

# Enable IRC collaboration for dev and nightly, but not release.
if [ "$CHANNEL" != "release" ]; then
	FEATURES="$FEATURES irc"
fi

# update the version in the tauri release config
jq  --arg version "$VERSION"\
    --argjson externalBin "$EXTERNAL_BIN"\
  '.version = $version | .bundle.externalBin = $externalBin' "$CONFIG_PATH" >"$TMP_DIR/tauri.conf.json"

# Useful for understanding exactly what goes into the tauri build/bundle.
cat "$TMP_DIR/tauri.conf.json"

# set the VERSION and CHANNEL as an environment variables so that they available in the but CLI
export VERSION
export CHANNEL

# Verify sidecar binaries before bundling - ensures they were built in this run
info "verifying sidecar binary integrity"
bash "$PWD/../crates/gitbutler-tauri/verify-sidecars.sh" "$TMP_DIR/tauri.conf.json"

# Build the app with release config
if [ -n "$TARGET" ]; then
	export CARGO_BUILD_TARGET="$TARGET"

	tauri build \
		--verbose \
		--features "$FEATURES" \
		--config "$TMP_DIR/tauri.conf.json" \
		--target "$TARGET"

	BUNDLE_DIR_SPEC=$(spec_substitute "$(spec_get ".components.desktop.bundleOutput")")
	BUNDLE_DIR=$(readlink -f "$PWD/../$BUNDLE_DIR_SPEC")
	BUILD_DIR_SPEC=$(spec_substitute "$(spec_get ".paths.targetRelease")")
	BUILD_DIR=$(readlink -f "$PWD/../$BUILD_DIR_SPEC")
else
	tauri build \
		--verbose \
		--features "$FEATURES" \
		--config "$TMP_DIR/tauri.conf.json"

	BUNDLE_DIR_SPEC=$(spec_substitute "$(spec_get ".components.desktop.bundleOutput")")
	BUNDLE_DIR=$(readlink -f "$PWD/../$BUNDLE_DIR_SPEC")
	BUILD_DIR_SPEC=$(spec_substitute "$(spec_get ".paths.targetRelease")")
	BUILD_DIR=$(readlink -f "$PWD/../$BUILD_DIR_SPEC")
fi

info "spec: BUNDLE_DIR=$BUNDLE_DIR (from $BUNDLE_DIR_SPEC)"
info "spec: BUILD_DIR=$BUILD_DIR (from $BUILD_DIR_SPEC)"

RELEASE_DIR="$DIST/$OS/$ARCH"
mkdir -p "$RELEASE_DIR"

if [ "$OS" = "macos" ]; then
	MACOS_DMG="$(find "$BUNDLE_DIR/dmg" -depth 1 -type f -name "*.dmg")"
	MACOS_UPDATER="$(find "$BUNDLE_DIR/macos" -depth 1 -type f -name "*.tar.gz")"
	MACOS_UPDATER_SIG="$(find "$BUNDLE_DIR/macos" -depth 1 -type f -name "*.tar.gz.sig")"

	cp "$MACOS_DMG" "$RELEASE_DIR"
	cp "$MACOS_UPDATER" "$RELEASE_DIR"
	cp "$MACOS_UPDATER_SIG" "$RELEASE_DIR"

	info "built:"
	info "	- $RELEASE_DIR/$(basename "$MACOS_DMG")"
	info "	- $RELEASE_DIR/$(basename "$MACOS_UPDATER")"
	info "	- $RELEASE_DIR/$(basename "$MACOS_UPDATER_SIG")"
elif [ "$OS" = "linux" ]; then
	APPIMAGE="$(find "$BUNDLE_DIR/appimage" -name \*.AppImage)"
	APPIMAGE_UPDATER="$(find "$BUNDLE_DIR/appimage" -name \*.AppImage.tar.gz)"
	APPIMAGE_UPDATER_SIG="$(find "$BUNDLE_DIR/appimage" -name \*.AppImage.tar.gz.sig)"
	DEB="$(find "$BUNDLE_DIR/deb" -name \*.deb)"
	RPM="$(find "$BUNDLE_DIR/rpm" -name \*.rpm)"
	BUT_CLI_REL=$(spec_resolve_binary "but" "$PROFILE")
	BUT_CLI="$(readlink -f "$PWD/../$BUT_CLI_REL")"

	"$PWD/add-but-symlink-to-deb.sh" "$DEB"

	cp "$APPIMAGE" "$RELEASE_DIR"
	cp "$APPIMAGE_UPDATER" "$RELEASE_DIR"
	cp "$APPIMAGE_UPDATER_SIG" "$RELEASE_DIR"
	cp "$DEB" "$RELEASE_DIR"
	cp "$RPM" "$RELEASE_DIR"
	cp "$BUT_CLI" "$RELEASE_DIR"

	info "built:"
	info "	- $RELEASE_DIR/$(basename "$APPIMAGE")"
	info "	- $RELEASE_DIR/$(basename "$APPIMAGE_UPDATER")"
	info "	- $RELEASE_DIR/$(basename "$APPIMAGE_UPDATER_SIG")"
	info "	- $RELEASE_DIR/$(basename "$DEB")"
	info "	- $RELEASE_DIR/$(basename "$RPM")"
	info "	- $RELEASE_DIR/$(basename "$BUT_CLI")"
elif [ "$OS" = "windows" ]; then
	WINDOWS_INSTALLER="$(find "$BUNDLE_DIR/msi" -name \*.msi)"
	WINDOWS_UPDATER="$(find "$BUNDLE_DIR/msi" -name \*.msi.zip)"
	WINDOWS_UPDATER_SIG="$(find "$BUNDLE_DIR/msi" -name \*.msi.zip.sig)"

	cp "$WINDOWS_INSTALLER" "$RELEASE_DIR"
	cp "$WINDOWS_UPDATER" "$RELEASE_DIR"
	cp "$WINDOWS_UPDATER_SIG" "$RELEASE_DIR"

	info "built:"
	info "	- $RELEASE_DIR/$(basename "$WINDOWS_INSTALLER")"
	info "	- $RELEASE_DIR/$(basename "$WINDOWS_UPDATER")"
	info "	- $RELEASE_DIR/$(basename "$WINDOWS_UPDATER_SIG")"
else
	error "unsupported os: $OS"
fi

info "done! bye!"
