[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repoSlug = 'avihaymenahem/velo'
$apiUrl = "https://api.github.com/repos/$repoSlug/releases/latest"
$headers = @{
  Accept = 'application/vnd.github+json'
  'User-Agent' = 'velo-install-script'
}

# Prefer the MSI because msiexec has predictable unattended install flags.
Write-Host 'Fetching latest Velo release metadata...'
$release = Invoke-RestMethod -Uri $apiUrl -Headers $headers
$asset = $release.assets | Where-Object { $_.name -like '*_x64_en-US.msi' } | Select-Object -First 1
$fallback = $release.assets | Where-Object { $_.name -like '*_x64-setup.exe' } | Select-Object -First 1

if (-not $asset -and -not $fallback) {
  throw 'Could not find a Windows MSI or setup.exe asset in the latest release.'
}

$selectedAsset = if ($asset) { $asset } else { $fallback }
$tempDir = if ($env:TEMP) { $env:TEMP } else { [System.IO.Path]::GetTempPath() }
$tempInstaller = Join-Path $tempDir $selectedAsset.name

try {
  Write-Host 'Downloading Windows installer...'
  Invoke-WebRequest -Uri $selectedAsset.browser_download_url -OutFile $tempInstaller

  if ($selectedAsset.name -like '*.msi') {
    Write-Host 'Running MSI installer...'
    $process = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i', $tempInstaller, '/passive', '/norestart') -PassThru -Wait
    if ($process.ExitCode -ne 0) {
      throw "MSI install failed with exit code $($process.ExitCode)."
    }
  }
  else {
    Write-Host 'Running setup.exe installer...'
    $process = Start-Process -FilePath $tempInstaller -ArgumentList '/S' -PassThru -Wait
    if ($process.ExitCode -ne 0) {
      Write-Warning "Silent install exited with code $($process.ExitCode). Falling back to interactive installer."
      $interactive = Start-Process -FilePath $tempInstaller -PassThru -Wait
      if ($interactive.ExitCode -ne 0) {
        throw "Interactive install failed with exit code $($interactive.ExitCode)."
      }
    }
  }

  Write-Host 'Velo installation completed.'
}
finally {
  if (Test-Path $tempInstaller) {
    Remove-Item $tempInstaller -Force -ErrorAction SilentlyContinue
  }
}
