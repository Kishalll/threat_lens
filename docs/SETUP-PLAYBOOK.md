# ThreatLens Setup Playbook

This playbook gives a low-friction setup path with no secrets committed.

## Roles

- Maintainer: provisions/updates backend infra
- Contributor: runs app locally using existing backend

## A. One-time Maintainer Setup (or when rotating/redeploying)

Run from repo root:

```powershell
npm run setup:cloud -- -ProjectId YOUR_GCP_PROJECT_ID -WriteEnv
```

If you want a shared dev backend with no API key requirement:

```powershell
npm run setup:cloud -- -ProjectId YOUR_GCP_PROJECT_ID -DisableApiKeyAuth -WriteEnv
```

### Optional flags

- `-Region us-central1`
- `-FirestoreLocation nam5`
- `-RegistryCollection trust_registry`
- `-MasterPrivateKeyPath ./master_private.pem`
- `-MasterPublicKeyPath ./master_public.pem`

### Outputs produced locally

- `.env` (if `-WriteEnv` is used)
- `.setup/generated/trust-config.json`

These are git-ignored.

## B. Fast Contributor Setup (new machine)

Run from repo root:

```powershell
npm run setup:local
```

Then:

```powershell
npx expo run:android
npx expo start --dev-client
```

## C. What must never be committed

- `.env`
- `master_private.pem`
- any API key files
- `.setup/` generated outputs

## D. Secret handling model

- Master private key is stored in Google Secret Manager
- App only gets public key and endpoint URL via `.env`
- `.env.example` is safe template only

## E. New install next time

For next install on same project:

1. Clone repo
2. `npm run setup:local`
3. Fill missing `.env` values (if any)
4. Run app

No manual cloud provisioning steps are needed unless backend changes.
