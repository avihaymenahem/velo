#!/usr/bin/env bash
#
# patch-appimage.sh — make the Linux AppImage work on modern hosts.
#
# The AppImage is assembled by tauri-action on ubuntu-22.04 using
# linuxdeploy-plugin-gtk. Two problems ship in that bundle, both caused by the
# AppImage's own libraries/environment leaking onto the host:
#
# 1. EGL_BAD_PARAMETER hang on launch
#    -------------------------------
#    The plugin bundles the build host's libwayland-client.so.0 (Ubuntu 22.04
#    ships wayland 1.20). That library is on the official AppImage excludelist
#    because it must come from the host — the host's Mesa libEGL dlopen()s it to
#    set up the Wayland/GBM EGL platform. On a newer host the AppImage's
#    LD_LIBRARY_PATH forces the stale bundled copy onto the host libEGL,
#    eglGetPlatformDisplay() fails with EGL_BAD_PARAMETER, WebKitGTK's render
#    process aborts, and no window ever appears:
#
#        Could not create default EGL display: EGL_BAD_PARAMETER. Aborting...
#
#    Fix: drop the excludelisted Wayland libraries so the host copies are used.
#
# 2. External browser (OAuth sign-in) fails to open
#    ----------------------------------------------
#    When the app opens a URL it spawns xdg-open, which inherits the AppImage's
#    LD_LIBRARY_PATH and other GTK/GIO env vars. The browser (or a helper such
#    as kde-open) then loads the AppImage's older bundled libraries — e.g.
#    libssl.so.3 — instead of the host's, fails a symbol-version check, and
#    exits without opening anything. OAuth "opens a browser" but nothing shows.
#
#    Fix: ship an xdg-open wrapper (first on the AppImage's PATH) that unsets the
#    AppImage-injected env vars before handing off to the real system xdg-open.
#
# Both fixes were verified on an AMD Radeon 880M / Mesa / Wayland / KDE host.
#
# Usage: scripts/patch-appimage.sh <path-to-AppImage>
#
set -euo pipefail

APPIMAGE="${1:?usage: patch-appimage.sh <path-to-AppImage>}"
APPIMAGE="$(readlink -f "$APPIMAGE")"

# Libraries that must always be provided by the host (AppImage excludelist).
# The wayland client/egl/cursor libs are a matched set and are removed together.
EXCLUDE=(
  libwayland-client.so.0
  libwayland-egl.so.1
  libwayland-cursor.so.0
  libwayland-server.so.0
)

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "==> Patching $(basename "$APPIMAGE")"
cp "$APPIMAGE" "$WORKDIR/in.AppImage"
chmod +x "$WORKDIR/in.AppImage"

# --appimage-extract does not require FUSE (works on CI runners).
( cd "$WORKDIR" && ./in.AppImage --appimage-extract >/dev/null )
APPDIR="$WORKDIR/squashfs-root"

# --- Fix 1: remove host-incompatible Wayland libraries -----------------------
for lib in "${EXCLUDE[@]}"; do
  while IFS= read -r -d '' path; do
    echo "    removing bundled $lib"
    rm -f "$path"
  done < <(find "$APPDIR" -name "$lib" -print0)
done

# --- Fix 2: install an env-sanitizing xdg-open wrapper -----------------------
# The AppImage prepends usr/bin to PATH, so this wrapper is what the app runs.
XDG_OPEN="$APPDIR/usr/bin/xdg-open"
echo "    installing env-sanitizing xdg-open wrapper"
mkdir -p "$(dirname "$XDG_OPEN")"
cat > "$XDG_OPEN" <<'WRAP'
#!/bin/sh
# Strip AppImage-injected environment before launching the external handler, so
# the spawned browser does not inherit the AppImage's bundled libraries (which
# break it on hosts with newer system libs). Installed by patch-appimage.sh.
unset LD_LIBRARY_PATH LD_PRELOAD
unset GTK_PATH GTK_EXE_PREFIX GTK_DATA_PREFIX
unset GDK_PIXBUF_MODULE_FILE GDK_PIXBUF_MODULEDIR
unset GSETTINGS_SCHEMA_DIR GIO_MODULE_DIR GIO_EXTRA_MODULES
unset GTK_IM_MODULE_FILE
for real in /usr/bin/xdg-open /bin/xdg-open /usr/local/bin/xdg-open; do
  [ -x "$real" ] && exec "$real" "$@"
done
echo "xdg-open: no system handler found" >&2
exit 3
WRAP
chmod +x "$XDG_OPEN"

# --- Repack ------------------------------------------------------------------
# APPIMAGE_EXTRACT_AND_RUN avoids the FUSE requirement on CI runners.
echo "==> Repacking AppImage"
curl -fsSL -o "$WORKDIR/appimagetool" \
  "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage"
chmod +x "$WORKDIR/appimagetool"

ARCH="${ARCH:-x86_64}" APPIMAGE_EXTRACT_AND_RUN=1 \
  "$WORKDIR/appimagetool" "$APPDIR" "$APPIMAGE"

echo "==> Done: $(basename "$APPIMAGE") — Wayland libs stripped, xdg-open wrapper installed."
