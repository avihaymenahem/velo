#!/usr/bin/env bash
#
# patch-appimage.sh — strip host-incompatible libraries from a built AppImage.
#
# Why this exists
# ---------------
# The Linux AppImage is assembled by tauri-action on ubuntu-22.04, which uses
# linuxdeploy-plugin-gtk. That plugin bundles the *build host's* copy of
# libwayland-client.so.0 (Ubuntu 22.04 ships wayland 1.20). These libraries are
# on the official AppImage excludelist precisely because they must come from the
# host at runtime — the host's Mesa libEGL dlopen()s libwayland-client to set up
# the Wayland/GBM EGL platform.
#
# When the app runs on a newer distro, the AppImage's LD_LIBRARY_PATH forces the
# stale bundled libwayland-client onto the host libEGL, eglGetPlatformDisplay()
# fails with EGL_BAD_PARAMETER, and WebKitGTK's rendering process aborts:
#
#     Could not create default EGL display: EGL_BAD_PARAMETER. Aborting...
#
# No window ever appears, but the main process stays alive holding the
# single-instance D-Bus lock, so the app looks like it "hangs on launch".
# (Verified: replacing only the bundled libwayland-client with the host copy
# resolves the failure completely.)
#
# The fix is to not ship these libraries so the host copies are used.
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

removed=0
for lib in "${EXCLUDE[@]}"; do
  while IFS= read -r -d '' path; do
    echo "    removing bundled $lib"
    rm -f "$path"
    removed=1
  done < <(find "$WORKDIR/squashfs-root" -name "$lib" -print0)
done

if [ "$removed" -eq 0 ]; then
  echo "==> No excludelisted libraries were bundled; leaving AppImage unchanged."
  exit 0
fi

# Fetch appimagetool and repack. APPIMAGE_EXTRACT_AND_RUN avoids the FUSE
# requirement on CI runners.
echo "==> Repacking AppImage"
curl -fsSL -o "$WORKDIR/appimagetool" \
  "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage"
chmod +x "$WORKDIR/appimagetool"

ARCH="${ARCH:-x86_64}" APPIMAGE_EXTRACT_AND_RUN=1 \
  "$WORKDIR/appimagetool" "$WORKDIR/squashfs-root" "$APPIMAGE"

echo "==> Done: $(basename "$APPIMAGE") no longer bundles host-incompatible Wayland libraries."
