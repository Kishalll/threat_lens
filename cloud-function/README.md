# ThreatLens Trust Registry Cloud Functions

This backend replaces the old image perturbation function with two trust-registry endpoints:

- `register` (HTTP): registers `installID -> publicKey`, signs the device certificate
- `verify` (HTTP): checks registration status and revocation state

## 1. Prerequisites

- Google Cloud project with billing enabled
- `gcloud` CLI installed and authenticated
- Firestore API enabled
- Cloud Functions (Gen2) enabled
- Secret Manager enabled

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable cloudfunctions.googleapis.com run.googleapis.com firestore.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com
```

## 2. Create Firestore Database (one-time)

If Firestore is not initialized yet:

```bash
gcloud firestore databases create --location=nam5 --type=firestore-native
```

Choose the location that matches your compliance and latency requirements.

## 3. Generate Master Certificate Keys (one-time)

Run locally:

```bash
openssl ecparam -name prime256v1 -genkey -noout -out master_private.pem
openssl ec -in master_private.pem -pubout -out master_public.pem
```

- Keep `master_private.pem` private (never commit).
- Embed `master_public.pem` in app settings/environment.

## 4. Store Master Private Key in Secret Manager

```bash
gcloud secrets create threatlens-master-private-key --replication-policy=automatic

gcloud secrets versions add threatlens-master-private-key --data-file=master_private.pem
```

Optional API key for backend auth:

```bash
gcloud secrets create threatlens-registry-api-key --replication-policy=automatic
printf "%s" "YOUR_RANDOM_API_KEY" | gcloud secrets versions add threatlens-registry-api-key --data-file=-
```

## 5. Deploy Register and Verify Functions

From repo root:

```bash
gcloud functions deploy register \
  --gen2 \
  --runtime=python311 \
  --region=us-central1 \
  --source=cloud-function \
  --entry-point=register \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars=REGISTRY_COLLECTION=trust_registry \
  --set-secrets=MASTER_PRIVATE_KEY_PEM=threatlens-master-private-key:latest


gcloud functions deploy verify \
  --gen2 \
  --runtime=python311 \
  --region=us-central1 \
  --source=cloud-function \
  --entry-point=verify \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars=REGISTRY_COLLECTION=trust_registry
```

If you require API-key auth for both endpoints, redeploy with:

```bash
--set-secrets=TRUST_REGISTRY_API_KEY=threatlens-registry-api-key:latest
```

Use the same auth setting on both `register` and `verify`.

## 6. Configure App Environment

In app `.env`:

```dotenv
EXPO_PUBLIC_TRUST_REGISTRY_BASE_URL=https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net
EXPO_PUBLIC_TRUST_REGISTRY_API_KEY=YOUR_RANDOM_API_KEY
EXPO_PUBLIC_MASTER_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```

## 7. First Run Validation

1. Open Shield -> Settings.
2. Confirm register/verify URLs are visible.
3. Protect an image.
4. Verify the same image on the same or another device.
5. Status should become `AUTHENTIC`.

## 8. Revocation Workflow

To revoke a device manually:

```bash
# Use Firestore console OR update via SDK/admin tooling
# Collection: trust_registry
# Document ID: installID
# Field: revoked = true
```

Once revoked, cloud verify returns `REVOKED`.

## 9. Security Checklist

- Never commit `master_private.pem`
- Rotate API key if leaked
- Keep `MASTER_PRIVATE_KEY_PEM` only in Secret Manager
- Restrict function invoker IAM when not using public endpoints
