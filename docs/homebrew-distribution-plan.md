# Homebrew Distribution for Velo

## Overview

Velo is distributed via a self-hosted Homebrew tap (`avihaymenahem/homebrew-velo`).
The release workflow in this repo automatically updates the tap when a new GitHub Release is published.

### How users install

```bash
brew tap avihaymenahem/velo
brew install --cask velo
```

### How it works

1. A GitHub Release is published (via release-please or manually)
2. The `Build & Release` workflow builds the macOS universal DMG
3. The `update-homebrew` job (in `.github/workflows/release.yml`) runs after the macOS build
4. It downloads the DMG, computes SHA256, updates `Casks/velo.rb` in the tap repo, and pushes

### Required secrets

| Secret | Where | Purpose |
|--------|-------|---------|
| `HOMEBREW_TAP_TOKEN` | `avihaymenahem/velo` repo | PAT with `contents:write` on the `homebrew-velo` repo |

---

## Setup Guide: Creating the Tap Repository

### Step 1: Create the GitHub repository

Create a **public** repository named `homebrew-velo` under `avihaymenahem`.

> The `homebrew-` prefix is required — Homebrew recognizes `avihaymenahem/homebrew-velo` as tap `avihaymenahem/velo`.

### Step 2: Create the initial cask file

Create `Casks/velo.rb` with a placeholder (the release workflow will overwrite it on next release):

```ruby
cask "velo" do
  version "0.3.12"
  sha256 "PLACEHOLDER"

  url "https://github.com/avihaymenahem/velo/releases/download/v#{version}/Velo_#{version}_universal.dmg",
      verified: "github.com/avihaymenahem/velo/"

  name "Velo"
  desc "Fast, beautiful desktop email client"
  homepage "https://github.com/avihaymenahem/velo"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: ">= :high_sierra"

  app "Velo.app"

  caveats <<~EOS
    If the app is not notarized, macOS may block it on first launch.
    To allow it, right-click Velo.app and select "Open", or run:
      xattr -cr /Applications/Velo.app
  EOS

  zap trash: [
    "~/Library/Application Support/com.velomail.app",
    "~/Library/Caches/com.velomail.app",
    "~/Library/Preferences/com.velomail.app.plist",
    "~/Library/Saved Application State/com.velomail.app.savedState",
    "~/Library/WebKit/com.velomail.app",
  ]
end
```

### Step 3: Create the README

Create a `README.md`:

```markdown
# Homebrew Tap for Velo

## Install

    brew tap avihaymenahem/velo
    brew install --cask velo

## Upgrade

    brew upgrade --cask velo

## Uninstall

    brew uninstall --cask velo

## About

[Velo](https://github.com/avihaymenahem/velo) is a fast, beautiful desktop email client.
```

### Step 4: Final repository structure

```
homebrew-velo/
├── Casks/
│   └── velo.rb
└── README.md
```

### Step 5: Create the `HOMEBREW_TAP_TOKEN` secret

1. Go to https://github.com/settings/tokens → **Generate new token (classic)**
2. Name: `homebrew-tap-update`
3. Scopes: check `repo` (full control of private repositories — needed even for public repos to push)
4. Copy the token
5. Go to `avihaymenahem/velo` → Settings → Secrets and variables → Actions
6. Create secret: Name = `HOMEBREW_TAP_TOKEN`, Value = the token

### Step 6: First-time SHA256 setup

After creating the tap repo, compute the SHA256 from your latest release DMG and update the cask:

```bash
# Replace with your actual latest version
VERSION="0.3.12"
curl -sL "https://github.com/avihaymenahem/velo/releases/download/v${VERSION}/Velo_${VERSION}_universal.dmg" | shasum -a 256
```

Replace `PLACEHOLDER` in `Casks/velo.rb` with the computed hash.

After this one-time setup, all future releases will auto-update the cask via the CI workflow.

### Step 7: Test it

```bash
brew tap avihaymenahem/velo
brew install --cask velo
```

---

## Code Signing Notes

The `caveats` block in the cask warns unsigned users about Gatekeeper. Once Apple signing is configured:

1. Add Apple signing secrets to the `velo` repo (the release workflow already handles conditional signing)
2. Remove the `caveats` block from `Casks/velo.rb`
3. Consider submitting to official `Homebrew/homebrew-cask` (Velo already exceeds the 75-star threshold)

### Official homebrew-cask submission (future)

Once signed + notarized:

1. Fork `Homebrew/homebrew-cask`
2. Create `Casks/v/velo.rb` (same definition, without `caveats`)
3. Open a PR per their [contribution guidelines](https://github.com/Homebrew/homebrew-cask/blob/master/CONTRIBUTING.md)
4. Add `eugenesvk/action-homebrew-bump-cask` GitHub Action for auto-bumping
