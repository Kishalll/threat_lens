# ThreatLens

ThreatLens is an Expo React Native app for personal digital safety:
- Message risk classification (safe/spam/scam/phishing)
- Breach lookup for emails and usernames
- Image protection workflow

This guide explains complete setup and run flows for:
- Expo Go (quick start)
- Android Studio (full native flow)

## 1. Prerequisites

Install the following first:
- Node.js 18+ and npm
- Git
- Android Studio (latest stable)
- Android SDK Platform + Build Tools (from SDK Manager)
- JDK 17 (usually bundled with Android Studio)

Optional:
- Physical Android phone with Expo Go app installed

## 2. Install Project Dependencies

From the project root:

```bash
npm install
```

## 3. Environment Variables

Create a file named `.env` in project root.

Add:

```env
EXPO_PUBLIC_GEMINI_API_KEY=your_new_gemini_api_key
EXPO_PUBLIC_CLOUD_FUNCTION_URL=https://asia-south1-threatlens-492816.cloudfunctions.net/protect-image
```

Notes:
- This app reads Gemini key from `EXPO_PUBLIC_GEMINI_API_KEY`.
- Cloud image protection uses `EXPO_PUBLIC_CLOUD_FUNCTION_URL`.
- If you change `.env`, restart Expo with cache clear:

```bash
npx expo start -c
```

## 4. Run With Expo Go (Quick Start)

Use this when you want the fastest preview loop.

1. Start Metro:

```bash
npx expo start
```

2. Open the app:
- Android phone: scan QR from Expo Go
- Android emulator: press `a` in terminal (if Expo Go is installed in emulator)

Expo Go limitations for this project:
- Custom native notification listener integration is not available in Expo Go.
- Features depending on custom native module/service may be limited.

## 5. Run With Android Studio (Full Native)

Use this for full Android-native behavior (recommended for this project).

### 5.1 Create and Start Emulator

1. Open Android Studio.
2. Open Device Manager.
3. Create an AVD (recommended API 34+).
4. Start emulator.

### 5.2 Build and Install Native App

From project root:

```bash
npx expo run:android
```

This builds and installs the app using your local Android toolchain.

### 5.3 Start Metro for Dev Client

After install:

```bash
npx expo start --dev-client
```

Then press `a` to open in the installed app on emulator/device.

## 6. Cloud Function (Image Protection)

Image protection runs through Google Cloud Function.

Deploy command (from `cloud-function` folder):

```bash
gcloud functions deploy protect-image \
	--gen2 \
	--runtime python312 \
	--region asia-south1 \
	--trigger-http \
	--allow-unauthenticated \
	--memory 1Gi \
	--timeout 120 \
	--source ./ \
	--entry-point protect_image_endpoint
```

After deployment, set `EXPO_PUBLIC_CLOUD_FUNCTION_URL` in root `.env`.

## 7. Troubleshooting

### Gemini key errors (403/invalid/leaked)
- Generate a new Gemini API key.
- Update `.env` with `EXPO_PUBLIC_GEMINI_API_KEY`.
- Restart with:

```bash
npx expo start -c
```

### Emulator not detected
- Ensure emulator is running first.
- Retry:

```bash
npx expo run:android
```

### Gradle build issues
- Clean and rebuild:

```bash
cd android
./gradlew clean
cd ..
npx expo run:android
```

On Windows PowerShell use:

```powershell
cd android
.\gradlew.bat clean
cd ..
npx expo run:android
```

### Phone cannot load bundle
- Keep phone and laptop on same Wi-Fi.
- Try tunnel mode:

```bash
npx expo start --tunnel
```

## 8. Security Notes

- Never commit `.env` files.
- `.gitignore` already excludes `.env`.
- Rotate Gemini key immediately if leaked.
