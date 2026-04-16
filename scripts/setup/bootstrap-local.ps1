param(
  [switch]$InstallDependencies,
  [switch]$UseGeneratedConfig,
  [string]$EnvFilePath = "./.env",
  [string]$EnvExamplePath = "./.env.example",
  [string]$GeneratedConfigPath = "./.setup/generated/trust-config.json"
)

$ErrorActionPreference = "Stop"

function Require-Command {
  param([Parameter(Mandatory = $true)][string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' is missing."
  }
}

function Set-Or-Add-EnvLine {
  param(
    [Parameter(Mandatory = $true)][string[]]$Lines,
    [Parameter(Mandatory = $true)][string]$Key,
    [Parameter(Mandatory = $true)][string]$Value
  )

  $prefix = "$Key="
  $updated = $false
  $next = @()

  foreach ($line in $Lines) {
    if ($line.StartsWith($prefix)) {
      $next += "$prefix$Value"
      $updated = $true
    }
    else {
      $next += $line
    }
  }

  if (-not $updated) {
    $next += "$prefix$Value"
  }

  return $next
}

Write-Host "== ThreatLens local bootstrap ==" -ForegroundColor Cyan

Require-Command -Name "npm"

if (-not (Test-Path $EnvFilePath)) {
  if (Test-Path $EnvExamplePath) {
    Copy-Item $EnvExamplePath $EnvFilePath
    Write-Host "Created $EnvFilePath from template."
  }
  else {
    @(
      "EXPO_PUBLIC_GEMINI_API_KEY=",
      "EXPO_PUBLIC_TRUST_REGISTRY_BASE_URL=",
      "EXPO_PUBLIC_TRUST_REGISTRY_API_KEY=",
      "EXPO_PUBLIC_MASTER_PUBLIC_KEY_PEM="
    ) | Set-Content -Path $EnvFilePath -Encoding UTF8
    Write-Host "Created minimal $EnvFilePath."
  }
}

if ($UseGeneratedConfig -and (Test-Path $GeneratedConfigPath)) {
  $cfg = Get-Content $GeneratedConfigPath -Raw | ConvertFrom-Json
  $lines = Get-Content $EnvFilePath

  $lines = Set-Or-Add-EnvLine -Lines $lines -Key "EXPO_PUBLIC_TRUST_REGISTRY_BASE_URL" -Value $cfg.baseUrl

  if ($cfg.apiKeyAuthEnabled -eq $false) {
    $lines = Set-Or-Add-EnvLine -Lines $lines -Key "EXPO_PUBLIC_TRUST_REGISTRY_API_KEY" -Value ""
  }

  Set-Content -Path $EnvFilePath -Value $lines -Encoding UTF8
  Write-Host "Applied generated backend config into $EnvFilePath."
}

if ($InstallDependencies -or -not (Test-Path "./node_modules")) {
  Write-Host "Installing dependencies..." -ForegroundColor Yellow
  npm install
}

Write-Host "" 
Write-Host "Local bootstrap complete." -ForegroundColor Green
Write-Host "1) Fill missing values in $EnvFilePath (Gemini key and any empty trust fields)."
Write-Host "2) Run: npx expo run:android"
Write-Host "3) Run: npx expo start --dev-client"
