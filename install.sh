#!/bin/sh
set -eu

REPO_SLUG="avihaymenahem/velo"
API_URL="https://api.github.com/repos/$REPO_SLUG/releases/latest"
USER_AGENT="velo-install-script"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/velo-install.XXXXXX")"
MOUNT_POINT=""

cleanup() {
  if [ -n "$MOUNT_POINT" ] && command -v hdiutil >/dev/null 2>&1; then
    hdiutil detach "$MOUNT_POINT" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT INT TERM

info() {
  printf '%s\n' "$*"
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

# Route sudo prompts to the terminal even when the script is piped into `sh`.
run_sudo() {
  if [ ! -r /dev/tty ]; then
    fail "sudo access is required, but no interactive TTY is available"
  fi

  sudo "$@" < /dev/tty
}

# Use conservative retry flags that work on older curl builds.
download() {
  url="$1"
  output="$2"
  curl -fsSL --retry 3 --connect-timeout 10 -H "User-Agent: $USER_AGENT" "$url" -o "$output"
}

release_json() {
  curl -fsSL --retry 3 --connect-timeout 10 -H "Accept: application/vnd.github+json" -H "User-Agent: $USER_AGENT" "$API_URL"
}

# Restrict asset matching to browser_download_url entries from the GitHub API.
asset_url_for() {
  pattern="$1"

  printf '%s' "$RELEASE_JSON" \
    | grep -o '"browser_download_url"[[:space:]]*:[[:space:]]*"[^"]*"' \
    | cut -d '"' -f 4 \
    | sed 's#\\/#/#g' \
    | grep -E "$pattern" \
    | head -n 1
}

current_os() {
  uname -s
}

current_arch() {
  case "$(uname -m)" in
    x86_64|amd64)
      printf 'x64\n'
      ;;
    arm64|aarch64)
      printf 'arm64\n'
      ;;
    *)
      printf 'unknown\n'
      ;;
  esac
}

install_macos() {
  need_cmd hdiutil
  need_cmd cp
  need_cmd xattr

  asset_url="$(asset_url_for 'universal\.dmg$')"
  [ -n "$asset_url" ] || fail "Could not find a macOS universal DMG in the latest release"

  dmg_path="$TMP_DIR/velo.dmg"
  info "Downloading macOS installer..."
  download "$asset_url" "$dmg_path"

  info "Mounting disk image..."
  mount_output="$(hdiutil attach -nobrowse "$dmg_path")"
  mount_point="$(printf '%s\n' "$mount_output" | awk -F '\t' '/\/Volumes\// {print $NF; exit}')"
  [ -n "$mount_point" ] || fail "Could not determine mounted volume"
  MOUNT_POINT="$mount_point"

  set -- "$mount_point"/*.app
  [ -e "$1" ] || fail "Could not find Velo.app in the mounted disk image"
  app_path="$1"
  app_name="$(basename "$app_path")"

  target_root="/Applications"
  use_sudo=0
  if [ ! -w "$target_root" ]; then
    if command -v sudo >/dev/null 2>&1; then
      use_sudo=1
    else
      target_root="$HOME/Applications"
      mkdir -p "$target_root"
    fi
  fi
  target_path="$target_root/$app_name"

  info "Installing $app_name to $target_root..."
  if [ "$use_sudo" -eq 1 ]; then
    run_sudo rm -rf "$target_path"
    run_sudo cp -R "$app_path" "$target_root/"
    run_sudo xattr -cr "$target_path"
  else
    rm -rf "$target_path"
    cp -R "$app_path" "$target_root/"
    xattr -cr "$target_path"
  fi

  info "Unmounting disk image..."
  hdiutil detach "$mount_point" >/dev/null
  MOUNT_POINT=""

  info "Velo installed at $target_path"
}

# Prefer the Debian package on Debian-like systems, otherwise fall back to AppImage.
install_linux() {
  arch="$1"
  [ "$arch" = "x64" ] || fail "Linux installs currently support x86_64/amd64 release assets only"

  if command -v apt-get >/dev/null 2>&1 && command -v dpkg >/dev/null 2>&1; then
    asset_url="$(asset_url_for '_amd64\.deb$')"
    [ -n "$asset_url" ] || fail "Could not find a Linux .deb asset in the latest release"
    deb_path="$TMP_DIR/velo.deb"

    info "Downloading Debian package..."
    download "$asset_url" "$deb_path"

    info "Installing Debian package..."
    run_sudo apt-get install -y "$deb_path"
    info "Velo installed from the latest .deb release"
    return
  fi

  asset_url="$(asset_url_for '_amd64\.AppImage$')"
  [ -n "$asset_url" ] || fail "Could not find a Linux AppImage asset in the latest release"

  install_dir="$HOME/.local/bin"
  install_path="$install_dir/velo"
  mkdir -p "$install_dir"

  info "Downloading AppImage fallback..."
  download "$asset_url" "$install_path"
  chmod +x "$install_path"

  info "Velo installed at $install_path"
  case ":$PATH:" in
    *":$install_dir:"*)
      ;;
    *)
      info "Add $install_dir to your PATH if it is not already available in new shells."
      ;;
  esac
}

need_cmd curl
need_cmd grep
need_cmd awk
need_cmd cut
need_cmd sed
need_cmd head
need_cmd basename
need_cmd mktemp

RELEASE_JSON="$(release_json)"
OS_NAME="$(current_os)"
ARCH_NAME="$(current_arch)"

[ "$ARCH_NAME" != "unknown" ] || fail "Unsupported architecture: $(uname -m)"

case "$OS_NAME" in
  Darwin)
    install_macos
    ;;
  Linux)
    install_linux "$ARCH_NAME"
    ;;
  *)
    fail "Unsupported operating system: $OS_NAME"
    ;;
esac
