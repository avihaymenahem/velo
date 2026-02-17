# Homebrew Distribution Plan for Velo

## Research Summary

### Cask vs Formula

Velo is a GUI desktop app (Tauri), so it requires a **Homebrew Cask** (not a Formula). Casks are for pre-built desktop applications distributed as DMG/ZIP/PKG files, installed to `/Applications`.

| Aspect | Formula | Cask |
|--------|---------|------|
| Target | CLI tools, libraries | GUI desktop apps (.app) |
| Build | Compiled from source | Pre-built binaries (DMG) |
| Install location | `/usr/local/Cellar` | `/Applications` |
| Install command | `brew install <name>` | `brew install --cask <name>` |

### Distribution Strategy: Self-Hosted Tap

**Recommended approach**: Create a self-hosted tap (`avihaymenahem/homebrew-velo`) rather than submitting to the official `Homebrew/homebrew-cask` repository.

**Reasons:**
- Full control over updates and release timing
- No notability requirements (official homebrew-cask requires 75+ GitHub stars)
- No review process or PR approvals needed
- Can iterate quickly

**User install experience:**
```bash
brew tap avihaymenahem/velo
brew install --cask velo

# Or in one command:
brew install --cask avihaymenahem/velo/velo
```

Later, once Velo reaches the notability threshold (75+ stars), it can be submitted to the official `Homebrew/homebrew-cask` for `brew install --cask velo` without tapping.

---

## Current State Analysis

### Build Artifacts

The current release workflow (`.github/workflows/release.yml`) builds:
- **macOS**: Universal binary (`--target universal-apple-darwin`) → produces a DMG
- **Windows**: Standard build → produces `.exe` / `.msi`
- **Linux**: Standard build → produces `.deb` / `.AppImage`

The macOS build produces a **universal DMG** (both ARM64 and x86_64 in one file), which simplifies the Homebrew cask since we only need one URL and one SHA256.

### Tauri DMG Naming Convention

Tauri's default DMG naming pattern for universal builds:
```
Velo_<version>_universal.dmg
```

For example: `Velo_0.3.12_universal.dmg`

### Code Signing Status

The release workflow has **conditional code signing**:
- If `APPLE_CERTIFICATE` secret is configured → signed + notarized build
- Otherwise → unsigned build with `xattr -cr` instructions

**Important**: As of Homebrew 5.0.0 (November 2025), new casks submitted to the official `homebrew-cask` must be codesigned and notarized. All unsigned casks will be removed by September 2026. For a self-hosted tap, signing is not enforced but strongly recommended (Apple Silicon Macs block unsigned native arm64 code).

---

## Implementation Plan

### Step 1: Create the Tap Repository

Create a new GitHub repository: `avihaymenahem/homebrew-velo`

Repository structure:
```
homebrew-velo/
├── Casks/
│   └── velo.rb
├── .github/
│   └── workflows/
│       └── audit.yml
└── README.md
```

### Step 2: Write the Cask Definition

File: `Casks/velo.rb`

```ruby
cask "velo" do
  version "0.3.12"
  sha256 "COMPUTE_FROM_RELEASE_ASSET"

  url "https://github.com/avihaymenahem/velo/releases/download/v#{version}/Velo_#{version}_universal.dmg",
      verified: "github.com/avihaymenahem/velo/"

  name "Velo"
  desc "Fast desktop email client"
  homepage "https://github.com/avihaymenahem/velo"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: ">= :high_sierra"

  app "Velo.app"

  zap trash: [
    "~/Library/Application Support/com.velomail.app",
    "~/Library/Caches/com.velomail.app",
    "~/Library/Preferences/com.velomail.app.plist",
    "~/Library/Saved Application State/com.velomail.app.savedState",
    "~/Library/WebKit/com.velomail.app",
  ]
end
```

**Notes:**
- Uses single `sha256` (not per-arch) since Tauri builds a universal DMG
- `depends_on macos: ">= :high_sierra"` matches the `minimumSystemVersion: "10.13"` in tauri.conf.json
- `auto_updates true` tells Homebrew the app manages its own updates (if Tauri updater is enabled)
- `livecheck` with `:github_latest` strategy auto-detects new releases
- `zap` lists all app data directories for complete uninstallation

### Step 3: Add CI Audit Workflow

File: `.github/workflows/audit.yml`

```yaml
name: Audit Casks

on:
  push:
    paths: ['Casks/**']
  pull_request:
    paths: ['Casks/**']

jobs:
  audit:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure tap
        run: |
          mkdir -p "$(brew --repository)/Library/Taps/avihaymenahem/homebrew-velo/Casks"
          cp Casks/*.rb "$(brew --repository)/Library/Taps/avihaymenahem/homebrew-velo/Casks/"

      - name: Audit cask
        run: brew audit --cask avihaymenahem/velo/velo
```

### Step 4: Add Auto-Update Workflow to Main Repo

Add a workflow to the Velo repository that updates the tap when a release is published.

File: `.github/workflows/update-homebrew.yml`

```yaml
name: Update Homebrew Cask

on:
  release:
    types: [published]

jobs:
  update-cask:
    runs-on: macos-latest
    # Only run after macOS build artifacts are available
    steps:
      - name: Wait for release assets
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          DMG="Velo_${VERSION}_universal.dmg"
          for i in $(seq 1 30); do
            if gh release view "v${VERSION}" --repo avihaymenahem/velo --json assets -q ".assets[].name" | grep -q "$DMG"; then
              echo "Found $DMG"
              exit 0
            fi
            echo "Waiting for $DMG (attempt $i/30)..."
            sleep 60
          done
          echo "Timed out waiting for $DMG"
          exit 1

      - name: Checkout tap repository
        uses: actions/checkout@v4
        with:
          repository: avihaymenahem/homebrew-velo
          token: ${{ secrets.HOMEBREW_TAP_TOKEN }}

      - name: Update cask version and SHA
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          DMG_URL="https://github.com/avihaymenahem/velo/releases/download/v${VERSION}/Velo_${VERSION}_universal.dmg"

          SHA256=$(curl -sL "$DMG_URL" | shasum -a 256 | awk '{print $1}')

          cat > Casks/velo.rb << 'CASK_EOF'
          cask "velo" do
            version "VERSION_PLACEHOLDER"
            sha256 "SHA_PLACEHOLDER"

            url "https://github.com/avihaymenahem/velo/releases/download/v#{version}/Velo_#{version}_universal.dmg",
                verified: "github.com/avihaymenahem/velo/"

            name "Velo"
            desc "Fast desktop email client"
            homepage "https://github.com/avihaymenahem/velo"

            livecheck do
              url :url
              strategy :github_latest
            end

            auto_updates true
            depends_on macos: ">= :high_sierra"

            app "Velo.app"

            zap trash: [
              "~/Library/Application Support/com.velomail.app",
              "~/Library/Caches/com.velomail.app",
              "~/Library/Preferences/com.velomail.app.plist",
              "~/Library/Saved Application State/com.velomail.app.savedState",
              "~/Library/WebKit/com.velomail.app",
            ]
          end
          CASK_EOF

          sed -i '' "s/VERSION_PLACEHOLDER/${VERSION}/" Casks/velo.rb
          sed -i '' "s/SHA_PLACEHOLDER/${SHA256}/" Casks/velo.rb

      - name: Commit and push
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add Casks/velo.rb
          git commit -m "Update velo to ${VERSION}"
          git push
```

**Required secret**: `HOMEBREW_TAP_TOKEN` — a Personal Access Token (classic) with `repo` scope, or a fine-grained token with `contents:write` on the `homebrew-velo` repository.

### Step 5: Verify DMG Naming

Before setting this up, verify the actual DMG filename produced by Tauri for universal builds. Check a recent release or build locally:

```bash
npm run tauri build -- --target universal-apple-darwin
ls src-tauri/target/universal-apple-darwin/release/bundle/dmg/
```

Expected output: `Velo_0.3.12_universal.dmg`

If the naming differs, update the `url` in the cask accordingly.

---

## Prerequisites / Blocklist

| Item | Status | Notes |
|------|--------|-------|
| Apple Developer Account ($99/yr) | Required for signing | Needed for official homebrew-cask; recommended for self-hosted tap |
| Code signing secrets in CI | Conditional | Already set up in release.yml, just needs the secrets configured |
| `HOMEBREW_TAP_TOKEN` secret | Required | PAT with write access to the tap repo |
| At least one published GitHub Release | Required | Need a release with DMG assets to compute SHA256 |
| Verify DMG filename convention | Required | Must match what Tauri actually produces |

---

## Future: Official homebrew-cask Submission

When Velo reaches 75+ GitHub stars, submit to `Homebrew/homebrew-cask`:

1. Fork `Homebrew/homebrew-cask`
2. Create `Casks/v/velo.rb` with the same cask definition
3. Open a PR following their [contribution guidelines](https://github.com/Homebrew/homebrew-cask/blob/master/CONTRIBUTING.md)
4. App **must** be codesigned and notarized by that point
5. Set up `eugenesvk/action-homebrew-bump-cask` GitHub Action for auto-updates

---

## Quick Reference: Key Commands

```bash
# User installs Velo
brew tap avihaymenahem/velo
brew install --cask velo

# User upgrades
brew upgrade --cask velo

# User uninstalls
brew uninstall --cask velo

# Full cleanup (removes app data too)
brew uninstall --cask --zap velo

# Developer: compute SHA256 for a release
curl -sL "https://github.com/avihaymenahem/velo/releases/download/v0.3.12/Velo_0.3.12_universal.dmg" | shasum -a 256

# Developer: test cask locally
brew tap avihaymenahem/velo
brew audit --cask avihaymenahem/velo/velo
brew install --cask avihaymenahem/velo/velo
```
