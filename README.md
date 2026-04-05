## ⚙️ Environment Setup

This project requires environment variables for both frontend (Expo) and backend.

### 📱 Frontend (.env in root)

Create a `.env` file in the root directory:

EXPO_PUBLIC_BACKEND_URL=http://YOUR_LOCAL_IP:3000
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key_here

Example:
EXPO_PUBLIC_BACKEND_URL=http://192.168.29.182:3000

Notes:
- Must start with EXPO_PUBLIC_
- Use local IP (not localhost)
- Phone and laptop must be on same WiFi

---

### 🖥️ Backend (/backend/.env)

Create a `.env` file inside the backend folder:

GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000

LeakCheck public API is used for username/email leak lookups and does not require a key.

---

### 🚀 Run the project

1. Start backend:
cd backend
npm install
npm start

2. Start frontend:
npx expo start

---

### ⚠️ Important

- Do NOT commit .env files
- Restart Expo after changing env:
npx expo start -c
- Backend must be running before using the app
