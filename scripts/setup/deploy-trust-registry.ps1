param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [string]$Region = "us-central1",
  [string]$FirestoreLocation = "nam5",
  [string]$RegistryCollection = "trust_registry",
  [string]$MasterSecretName = "threatlens-master-private-key",
  [string]$ApiSecretName = "threatlens-registry-api-key",
  [string]$MasterPrivateKeyPath = "./master_private.pem",
  [string]$MasterPublicKeyPath = "./master_public.pem",
  [string]$EnvFilePath = "./.env",
  [string]$GeneratedConfigPath = "./.setup/generated/trust-config.json",
  [string]$RegistryApiKey,
  [switch]$DisableApiKeyAuth,
  [switch]$WriteEnv
)

$ErrorActionPreference = "Stop"

function Require-Command {
  param([Parameter(Mandatory = $true)][string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' is not installed or not available in PATH."
  }
}

function Ensure-Secret {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Project
  )

  try {
    gcloud secrets describe $Name --project $Project | Out-Null
  }
  catch {
    gcloud secrets create $Name --replication-policy=automatic --project $Project | Out-Null
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

Write-Host "== ThreatLens trust registry bootstrap ==" -ForegroundColor Cyan

Require-Command -Name "gcloud"

if (-not $DisableApiKeyAuth) {
  if (-not $RegistryApiKey -or $RegistryApiKey.Trim().Length -eq 0) {
    $RegistryApiKey = Read-Host "Enter REGISTRY API key for backend auth"
  }

  if (-not $RegistryApiKey -or $RegistryApiKey.Trim().Length -eq 0) {
    throw "Registry API key cannot be empty unless -DisableApiKeyAuth is used."
  }
}

if ((-not (Test-Path $MasterPrivateKeyPath)) -or (-not (Test-Path $MasterPublicKeyPath))) {
  Require-Command -Name "openssl"

  Write-Host "Generating master key pair (missing PEM files detected)..." -ForegroundColor Yellow
  openssl ecparam -name prime256v1 -genkey -noout -out $MasterPrivateKeyPath
  openssl ec -in $MasterPrivateKeyPath -pubout -out $MasterPublicKeyPath
}

gcloud config set project $ProjectId | Out-Null

Write-Host "Enabling required Google Cloud APIs..." -ForegroundColor Yellow
gcloud services enable cloudfunctions.googleapis.com run.googleapis.com firestore.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project $ProjectId | Out-Null

Write-Host "Ensuring Firestore exists..." -ForegroundColor Yellow
$firestoreDatabasesJson = gcloud firestore databases list --project $ProjectId --format=json 2>$null
$firestoreDatabases = @()
if ($firestoreDatabasesJson) {
  $parsed = $firestoreDatabasesJson | ConvertFrom-Json
  if ($parsed) {
    if ($parsed -is [System.Array]) {
      $firestoreDatabases = $parsed
    }
    else {
      $firestoreDatabases = @($parsed)
    }
  }
}

if ($firestoreDatabases.Count -eq 0) {
  gcloud firestore databases create --project $ProjectId --location=$FirestoreLocation --type=firestore-native | Out-Null
}

Write-Host "Ensuring secrets exist..." -ForegroundColor Yellow
Ensure-Secret -Name $MasterSecretName -Project $ProjectId
gcloud secrets versions add $MasterSecretName --data-file=$MasterPrivateKeyPath --project $ProjectId | Out-Null

if (-not $DisableApiKeyAuth) {
  Ensure-Secret -Name $ApiSecretName -Project $ProjectId

  $tmpApiKeyFile = [System.IO.Path]::GetTempFileName()
  try {
    Set-Content -Path $tmpApiKeyFile -Value $RegistryApiKey -NoNewline -Encoding ascii
    gcloud secrets versions add $ApiSecretName --data-file=$tmpApiKeyFile --project $ProjectId | Out-Null
  }
  finally {
    if (Test-Path $tmpApiKeyFile) {
      Remove-Item $tmpApiKeyFile -Force
    }
  }
}

Write-Host "Deploying register function..." -ForegroundColor Yellow
$registerArgs = @(
  "functions", "deploy", "register",
  "--gen2",
  "--runtime=python311",
  "--region=$Region",
  "--source=cloud-function",
  "--entry-point=register",
  "--trigger-http",
  "--allow-unauthenticated",
  "--project=$ProjectId",
  "--set-env-vars=REGISTRY_COLLECTION=$RegistryCollection"
)

if ($DisableApiKeyAuth) {
  $registerArgs += "--set-secrets=MASTER_PRIVATE_KEY_PEM=$MasterSecretName`:latest"
}
else {
  $registerArgs += "--set-secrets=MASTER_PRIVATE_KEY_PEM=$MasterSecretName`:latest,TRUST_REGISTRY_API_KEY=$ApiSecretName`:latest"
}

gcloud @registerArgs | Out-Null

Write-Host "Deploying verify function..." -ForegroundColor Yellow
$verifyArgs = @(
  "functions", "deploy", "verify",
  "--gen2",
  "--runtime=python311",
  "--region=$Region",
  "--source=cloud-function",
  "--entry-point=verify",
  "--trigger-http",
  "--allow-unauthenticated",
  "--project=$ProjectId",
  "--set-env-vars=REGISTRY_COLLECTION=$RegistryCollection"
)

if (-not $DisableApiKeyAuth) {
  $verifyArgs += "--set-secrets=TRUST_REGISTRY_API_KEY=$ApiSecretName`:latest"
}

gcloud @verifyArgs | Out-Null

$registerUrl = (gcloud functions describe register --gen2 --region=$Region --project=$ProjectId --format="value(serviceConfig.uri)").Trim()
$verifyUrl = (gcloud functions describe verify --gen2 --region=$Region --project=$ProjectId --format="value(serviceConfig.uri)").Trim()
$baseUrl = $registerUrl -replace "/register$", ""

$masterPublicKeyOneLine = ((Get-Content $MasterPublicKeyPath -Raw).Trim() -replace "`r?`n", "\\n")

$generatedDir = Split-Path $GeneratedConfigPath -Parent
if ($generatedDir -and -not (Test-Path $generatedDir)) {
  New-Item -Path $generatedDir -ItemType Directory -Force | Out-Null
}

$configObj = [ordered]@{
  projectId = $ProjectId
  region = $Region
  firestoreLocation = $FirestoreLocation
  registryCollection = $RegistryCollection
  registerUrl = $registerUrl
  verifyUrl = $verifyUrl
  baseUrl = $baseUrl
  apiKeyAuthEnabled = (-not $DisableApiKeyAuth)
}

$configObj | ConvertTo-Json -Depth 5 | Set-Content -Path $GeneratedConfigPath -Encoding UTF8

if ($WriteEnv) {
  $lines = @()
  if (Test-Path $EnvFilePath) {
    $lines = Get-Content $EnvFilePath
  }
  elseif (Test-Path "./.env.example") {
    $lines = Get-Content "./.env.example"
  }
  else {
    $lines = @("EXPO_PUBLIC_GEMINI_API_KEY=")
  }

  $lines = Set-Or-Add-EnvLine -Lines $lines -Key "EXPO_PUBLIC_TRUST_REGISTRY_BASE_URL" -Value $baseUrl
  $lines = Set-Or-Add-EnvLine -Lines $lines -Key "EXPO_PUBLIC_TRUST_REGISTRY_API_KEY" -Value ($(if ($DisableApiKeyAuth) { "" } else { $RegistryApiKey }))
  $lines = Set-Or-Add-EnvLine -Lines $lines -Key "EXPO_PUBLIC_MASTER_PUBLIC_KEY_PEM" -Value $masterPublicKeyOneLine

  Set-Content -Path $EnvFilePath -Value $lines -Encoding UTF8
}

Write-Host "" 
Write-Host "Bootstrap complete." -ForegroundColor Green
Write-Host "Project:    $ProjectId"
Write-Host "Register:   $registerUrl"
Write-Host "Verify:     $verifyUrl"
Write-Host "Base URL:   $baseUrl"
Write-Host "Config JSON: $GeneratedConfigPath"
if ($WriteEnv) {
  Write-Host "Updated env: $EnvFilePath"
}

Write-Host "" 
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1) npm install"
Write-Host "2) npx expo run:android"
Write-Host "3) npx expo start --dev-client"
