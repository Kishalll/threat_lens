import "react-native-get-random-values";

import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { v4 as uuidv4 } from "uuid";
import { p256 } from "@noble/curves/nist.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { fromByteArray, toByteArray } from "base64-js";
import jpeg from "jpeg-js";
import piexif from "piexifjs";

import type {
  ProtectResult,
  SignedImagePayload,
  VerificationChecks,
  VerificationResult,
} from "../types/imageTrust";
import {
  getMasterPublicKeyPem,
  getRegisterEndpointUrl,
  getTrustRegistryApiKey,
  getVerifyEndpointUrl,
} from "./secureKeyService";

const DEVICE_INSTALL_ID_KEY = "THREATLENS_INSTALL_ID";
const DEVICE_PRIVATE_KEY_KEY = "THREATLENS_DEVICE_PRIVATE_KEY_HEX";
const DEVICE_PUBLIC_KEY_KEY = "THREATLENS_DEVICE_PUBLIC_KEY_B64";
const DEVICE_MASTER_CERT_KEY = "THREATLENS_DEVICE_MASTER_CERT";
const DEVICE_VERIFY_URL_KEY = "THREATLENS_DEVICE_VERIFY_URL";

const EXIF_DESCRIPTION_PREFIX = "THREATLENS_SIG_V1:";
const PHASH_TAMPER_THRESHOLD = 8;

interface DeviceIdentity {
  installID: string;
  privateKeyHex: string;
  publicKeyBase64: string;
  masterCert: string | null;
  cloudVerifyURL: string | null;
}

interface CloudVerifyOutcome {
  cloudCheck: VerificationChecks["cloudCheck"];
  revoked: boolean;
  details: string[];
}

interface SignedMasterCert {
  cert: {
    v: number;
    issuer: string;
    issuedAt: string;
    installID: string;
    publicKey: string;
  };
  sig: string;
}

function sortRecursively(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortRecursively);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );

    const sorted: Record<string, unknown> = {};
    for (const [key, entryValue] of entries) {
      sorted[key] = sortRecursively(entryValue);
    }
    return sorted;
  }

  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortRecursively(value));
}

function bytesToBase64(value: Uint8Array): string {
  return fromByteArray(value);
}

function base64ToBytes(value: string): Uint8Array {
  return toByteArray(value);
}

function decodeUtf8(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function parseJsonSafe<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getUnsignedPayload(payload: SignedImagePayload): Omit<SignedImagePayload, "signature"> {
  return {
    v: payload.v,
    installID: payload.installID,
    deviceModel: payload.deviceModel,
    appVersion: payload.appVersion,
    appBuildNumber: payload.appBuildNumber,
    timestamp: payload.timestamp,
    sha256: payload.sha256,
    phash: payload.phash,
    publicKey: payload.publicKey,
    masterCert: payload.masterCert,
    cloudVerifyURL: payload.cloudVerifyURL,
  };
}

function ensureP256PublicKeyBytes(input: string): Uint8Array {
  const normalized = input.trim();
  const base64Body = normalized
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s+/g, "");

  const decoded = base64ToBytes(base64Body);

  if (decoded.length === 65 && decoded[0] === 0x04) {
    return decoded;
  }

  for (let i = 0; i <= decoded.length - 68; i += 1) {
    if (
      decoded[i] === 0x03 &&
      decoded[i + 1] === 0x42 &&
      decoded[i + 2] === 0x00 &&
      decoded[i + 3] === 0x04
    ) {
      return decoded.slice(i + 3, i + 3 + 65);
    }
  }

  throw new Error("Master public key is not a supported P-256 key format.");
}

function extractPixelDigestAndPHash(imageBytes: Uint8Array): { sha256Hex: string; pHash: string } {
  try {
    const decoded = jpeg.decode(imageBytes, { useTArray: true, formatAsRGBA: true });
    const rgba = decoded.data;
    const sha256Hex = bytesToHex(sha256(rgba));
    const pHash = computeDHash(rgba, decoded.width, decoded.height);
    return { sha256Hex, pHash };
  } catch {
    const sha256Hex = bytesToHex(sha256(imageBytes));
    return { sha256Hex, pHash: sha256Hex.slice(0, 16) };
  }
}

function computeDHash(rgba: Uint8Array, width: number, height: number): string {
  const cols = 9;
  const rows = 8;
  const sampled: number[][] = [];

  for (let y = 0; y < rows; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < cols; x += 1) {
      const srcX = Math.min(width - 1, Math.floor((x / (cols - 1)) * (width - 1)));
      const srcY = Math.min(height - 1, Math.floor((y / (rows - 1)) * (height - 1)));
      const idx = (srcY * width + srcX) * 4;
      const r = rgba[idx] ?? 0;
      const g = rgba[idx + 1] ?? 0;
      const b = rgba[idx + 2] ?? 0;
      row.push(0.299 * r + 0.587 * g + 0.114 * b);
    }
    sampled.push(row);
  }

  const bits: number[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols - 1; x += 1) {
      bits.push(sampled[y][x] > sampled[y][x + 1] ? 1 : 0);
    }
  }

  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    hex += nibble.toString(16);
  }

  return hex;
}

function hammingDistanceHex(a: string, b: string): number {
  const minLength = Math.min(a.length, b.length);
  const lookup = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
  let distance = 0;

  for (let i = 0; i < minLength; i += 1) {
    const xor = (parseInt(a[i], 16) ^ parseInt(b[i], 16)) & 0x0f;
    distance += lookup[xor];
  }

  distance += Math.abs(a.length - b.length) * 4;
  return distance;
}

function derEcdsaToCompactSignature(der: Uint8Array): Uint8Array | null {
  const readLength = (input: Uint8Array, offset: number): { length: number; nextOffset: number } | null => {
    if (offset >= input.length) {
      return null;
    }

    const first = input[offset];
    if ((first & 0x80) === 0) {
      return { length: first, nextOffset: offset + 1 };
    }

    const byteCount = first & 0x7f;
    if (byteCount === 0 || byteCount > 4 || offset + 1 + byteCount > input.length) {
      return null;
    }

    let length = 0;
    for (let i = 0; i < byteCount; i += 1) {
      length = (length << 8) | input[offset + 1 + i];
    }

    return { length, nextOffset: offset + 1 + byteCount };
  };

  const normalizeInt32 = (bytes: Uint8Array): Uint8Array | null => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0x00) {
      start += 1;
    }

    const trimmed = bytes.slice(start);
    if (trimmed.length > 32) {
      return null;
    }

    const out = new Uint8Array(32);
    out.set(trimmed, 32 - trimmed.length);
    return out;
  };

  if (der.length < 8 || der[0] !== 0x30) {
    return null;
  }

  const seqLenInfo = readLength(der, 1);
  if (!seqLenInfo) {
    return null;
  }

  const seqEnd = seqLenInfo.nextOffset + seqLenInfo.length;
  if (seqEnd !== der.length) {
    return null;
  }

  let offset = seqLenInfo.nextOffset;

  if (offset >= der.length || der[offset] !== 0x02) {
    return null;
  }
  const rLenInfo = readLength(der, offset + 1);
  if (!rLenInfo) {
    return null;
  }
  const rEnd = rLenInfo.nextOffset + rLenInfo.length;
  if (rEnd > der.length) {
    return null;
  }
  const r = der.slice(rLenInfo.nextOffset, rEnd);
  offset = rEnd;

  if (offset >= der.length || der[offset] !== 0x02) {
    return null;
  }
  const sLenInfo = readLength(der, offset + 1);
  if (!sLenInfo) {
    return null;
  }
  const sEnd = sLenInfo.nextOffset + sLenInfo.length;
  if (sEnd !== der.length) {
    return null;
  }
  const s = der.slice(sLenInfo.nextOffset, sEnd);

  const normalizedR = normalizeInt32(r);
  const normalizedS = normalizeInt32(s);
  if (!normalizedR || !normalizedS) {
    return null;
  }

  const compact = new Uint8Array(64);
  compact.set(normalizedR, 0);
  compact.set(normalizedS, 32);
  return compact;
}

async function getSecureItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function setSecureItem(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

async function deleteSecureItem(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Ignore cleanup failures.
  }
}

async function getOrCreateIdentity(): Promise<DeviceIdentity> {
  let installID = await getSecureItem(DEVICE_INSTALL_ID_KEY);
  let privateKeyHex = await getSecureItem(DEVICE_PRIVATE_KEY_KEY);
  let publicKeyBase64 = await getSecureItem(DEVICE_PUBLIC_KEY_KEY);

  if (!installID) {
    installID = uuidv4();
    await setSecureItem(DEVICE_INSTALL_ID_KEY, installID);
  }

  if (!privateKeyHex || !publicKeyBase64) {
    const privateKeyBytes = p256.utils.randomSecretKey();
    const publicKeyBytes = p256.getPublicKey(privateKeyBytes, false);

    privateKeyHex = bytesToHex(privateKeyBytes);
    publicKeyBase64 = bytesToBase64(publicKeyBytes);

    await setSecureItem(DEVICE_PRIVATE_KEY_KEY, privateKeyHex);
    await setSecureItem(DEVICE_PUBLIC_KEY_KEY, publicKeyBase64);
  }

  if (!privateKeyHex || !publicKeyBase64) {
    throw new Error("Failed to initialize device key material.");
  }

  const masterCert = await getSecureItem(DEVICE_MASTER_CERT_KEY);
  const cloudVerifyURL = await getSecureItem(DEVICE_VERIFY_URL_KEY);

  return {
    installID,
    privateKeyHex,
    publicKeyBase64,
    masterCert,
    cloudVerifyURL,
  };
}

async function isMasterCertValidForIdentity(
  masterCert: string,
  installID: string,
  publicKey: string
): Promise<boolean> {
  try {
    const masterPublicKeyPemOrB64 = await getMasterPublicKeyPem();
    if (!masterPublicKeyPemOrB64) {
      return false;
    }

    const masterPublicKeyBytes = ensureP256PublicKeyBytes(masterPublicKeyPemOrB64);
    const certBlobRaw = decodeUtf8(base64ToBytes(masterCert));
    const certBlob = parseJsonSafe<SignedMasterCert>(certBlobRaw);
    if (!certBlob) {
      return false;
    }

    if (certBlob.cert.installID !== installID) {
      return false;
    }

    if (certBlob.cert.publicKey !== publicKey) {
      return false;
    }

    const certHash = sha256(utf8ToBytes(canonicalJson(certBlob.cert)));
    const certSigBytes = base64ToBytes(certBlob.sig);

    // Backend signs certificates using Python cryptography, which returns DER-encoded ECDSA.
    // Noble verifies compact signatures directly, so normalize DER when needed.
    try {
      if (p256.verify(certSigBytes, certHash, masterPublicKeyBytes)) {
        return true;
      }
    } catch {
      // Fall through to DER normalization path.
    }

    const compactSig = derEcdsaToCompactSignature(certSigBytes);
    if (!compactSig) {
      return false;
    }

    return p256.verify(compactSig, certHash, masterPublicKeyBytes);
  } catch {
    return false;
  }
}

async function ensureDeviceRegistration(identity: DeviceIdentity): Promise<DeviceIdentity> {
  if (identity.masterCert && identity.cloudVerifyURL) {
    const cachedCertIsValid = await isMasterCertValidForIdentity(
      identity.masterCert,
      identity.installID,
      identity.publicKeyBase64
    );

    if (cachedCertIsValid) {
      return identity;
    }

    await deleteSecureItem(DEVICE_MASTER_CERT_KEY);
    await deleteSecureItem(DEVICE_VERIFY_URL_KEY);
  }

  const registerUrl = await getRegisterEndpointUrl();
  if (!registerUrl) {
    throw new Error("Trust registry register URL is not configured.");
  }

  const apiKey = await getTrustRegistryApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const appVersion = Constants.expoConfig?.version ?? "0.0.0";
  const appBuildNumber = Number(Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode ?? 0);
  const deviceModel =
    (Platform.constants && (Platform.constants as { Model?: string }).Model) ||
    `${Platform.OS}-${String(Platform.Version)}`;

  const response = await fetch(registerUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      installID: identity.installID,
      publicKey: identity.publicKeyBase64,
      deviceModel,
      appVersion,
      appBuildNumber,
    }),
  });

  const parsed = (await response.json().catch(() => ({}))) as {
    masterCert?: unknown;
    cloudVerifyURL?: unknown;
    error?: unknown;
  };

  if (!response.ok) {
    const message =
      typeof parsed.error === "string" && parsed.error.trim().length > 0
        ? parsed.error
        : `Register failed (${response.status})`;
    throw new Error(message);
  }

  const masterCert = typeof parsed.masterCert === "string" ? parsed.masterCert : "";
  const cloudVerifyURL =
    typeof parsed.cloudVerifyURL === "string" && parsed.cloudVerifyURL.trim().length > 0
      ? parsed.cloudVerifyURL.trim()
      : await getVerifyEndpointUrl();

  if (!masterCert) {
    throw new Error("Registration succeeded but master certificate is missing.");
  }

  await setSecureItem(DEVICE_MASTER_CERT_KEY, masterCert);
  if (cloudVerifyURL) {
    await setSecureItem(DEVICE_VERIFY_URL_KEY, cloudVerifyURL);
  }

  return {
    ...identity,
    masterCert,
    cloudVerifyURL: cloudVerifyURL ?? null,
  };
}

async function normalizeToJpegBase64(imageUri: string): Promise<{ base64: string; uri: string }> {
  const manipulated = await manipulateAsync(
    imageUri,
    [],
    {
      compress: 1,
      format: SaveFormat.JPEG,
      base64: true,
    }
  );

  if (typeof manipulated.base64 !== "string" || manipulated.base64.length === 0) {
    throw new Error("Could not convert image to JPEG for signing.");
  }

  return {
    base64: manipulated.base64,
    uri: manipulated.uri,
  };
}

function payloadToExifField(payload: SignedImagePayload): string {
  const encoded = bytesToBase64(encodeUtf8(canonicalJson(payload)));
  return `${EXIF_DESCRIPTION_PREFIX}${encoded}`;
}

function parsePayloadField(description: string): SignedImagePayload | null {
  if (!description.startsWith(EXIF_DESCRIPTION_PREFIX)) {
    return null;
  }

  const encoded = description.slice(EXIF_DESCRIPTION_PREFIX.length);
  if (!encoded) {
    return null;
  }

  const decoded = decodeUtf8(base64ToBytes(encoded));
  const parsed = parseJsonSafe<SignedImagePayload>(decoded);
  if (!parsed) {
    return null;
  }

  const requiredKeys: Array<keyof SignedImagePayload> = [
    "v",
    "installID",
    "deviceModel",
    "appVersion",
    "appBuildNumber",
    "timestamp",
    "sha256",
    "phash",
    "publicKey",
    "masterCert",
    "signature",
    "cloudVerifyURL",
  ];

  for (const key of requiredKeys) {
    if (!(key in parsed)) {
      return null;
    }
  }

  return parsed;
}

function extractDescriptionTag(exifLoaded: Record<string, unknown>): string | null {
  const zeroth = exifLoaded["0th"] as Record<string, unknown> | undefined;
  if (!zeroth) {
    return null;
  }

  const descriptionTag = (piexif as { ImageIFD: { ImageDescription: number } }).ImageIFD.ImageDescription;
  const rawDescription = zeroth[descriptionTag as unknown as string] ?? zeroth[String(descriptionTag)];

  if (typeof rawDescription === "string") {
    return rawDescription;
  }

  if (Array.isArray(rawDescription)) {
    return String.fromCharCode(...rawDescription.filter((v): v is number => typeof v === "number"));
  }

  return null;
}

async function embedSignedPayload(base64Jpeg: string, payload: SignedImagePayload): Promise<string> {
  const exifField = payloadToExifField(payload);
  const piexifAny = piexif as {
    dump: (value: unknown) => string;
    insert: (exifBytes: string, jpegData: string) => string;
    ImageIFD: { ImageDescription: number };
  };

  const exifObject = {
    "0th": {
      [piexifAny.ImageIFD.ImageDescription]: exifField,
    },
    Exif: {},
    GPS: {},
    Interop: {},
    "1st": {},
    thumbnail: null,
  };

  const exifBytes = piexifAny.dump(exifObject);
  const dataUrl = `data:image/jpeg;base64,${base64Jpeg}`;
  const resultDataUrl = piexifAny.insert(exifBytes, dataUrl);
  const rawBase64 = resultDataUrl.includes(",")
    ? resultDataUrl.split(",", 2)[1]
    : resultDataUrl;

  const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!cacheDir) {
    throw new Error("No writable cache directory for signed image.");
  }

  const outputUri = `${cacheDir}signed_${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(outputUri, rawBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return outputUri;
}

async function readSignedPayloadFromImage(imageUri: string): Promise<{ payload: SignedImagePayload | null; base64: string }> {
  const base64Image = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const piexifAny = piexif as {
    load: (jpegData: string) => Record<string, unknown>;
  };

  try {
    const exifLoaded = piexifAny.load(`data:image/jpeg;base64,${base64Image}`);
    const description = extractDescriptionTag(exifLoaded);
    if (!description) {
      return { payload: null, base64: base64Image };
    }

    return {
      payload: parsePayloadField(description),
      base64: base64Image,
    };
  } catch {
    return { payload: null, base64: base64Image };
  }
}

function verifyPayloadSignature(payload: SignedImagePayload): boolean {
  try {
    const unsignedPayload = getUnsignedPayload(payload);
    const messageHash = sha256(utf8ToBytes(canonicalJson(unsignedPayload)));
    const signatureBytes = base64ToBytes(payload.signature);
    const publicKeyBytes = base64ToBytes(payload.publicKey);
    return p256.verify(signatureBytes, messageHash, publicKeyBytes);
  } catch {
    return false;
  }
}

async function verifyMasterCertificate(payload: SignedImagePayload): Promise<boolean> {
  return isMasterCertValidForIdentity(payload.masterCert, payload.installID, payload.publicKey);
}

async function cloudVerify(payload: SignedImagePayload, shouldCheckCloud: boolean): Promise<CloudVerifyOutcome> {
  if (!shouldCheckCloud) {
    return {
      cloudCheck: "skipped",
      revoked: false,
      details: ["Cloud check skipped by user setting."],
    };
  }

  const verifyUrl = payload.cloudVerifyURL?.trim();
  if (!verifyUrl) {
    return {
      cloudCheck: "failed",
      revoked: false,
      details: ["Cloud verify URL is missing in payload."],
    };
  }

  const apiKey = await getTrustRegistryApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetch(verifyUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        installID: payload.installID,
        publicKey: payload.publicKey,
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      status?: unknown;
      publicKeyMatch?: unknown;
      error?: unknown;
    };

    if (!response.ok) {
      const serverError = typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
      return {
        cloudCheck: "failed",
        revoked: false,
        details: [`Cloud verify request failed: ${serverError}`],
      };
    }

    const status = typeof body.status === "string" ? body.status.toUpperCase() : "UNKNOWN";
    const publicKeyMatch = body.publicKeyMatch;

    if (status === "REVOKED") {
      return {
        cloudCheck: "failed",
        revoked: true,
        details: ["Cloud registry reports this installID as revoked."],
      };
    }

    if (status === "ACTIVE") {
      if (publicKeyMatch === false) {
        return {
          cloudCheck: "failed",
          revoked: false,
          details: ["Cloud registry public key mismatch detected."],
        };
      }

      return {
        cloudCheck: "passed",
        revoked: false,
        details: ["Cloud registry confirms active trusted device registration."],
      };
    }

    return {
      cloudCheck: "failed",
      revoked: false,
      details: [`Cloud registry status is ${status}.`],
    };
  } catch {
    return {
      cloudCheck: "offline",
      revoked: false,
      details: ["Cloud verification unavailable (offline or network error)."],
    };
  }
}

export async function getImageTrustSettingsSnapshot(): Promise<{
  installID: string | null;
  hasDeviceKey: boolean;
  hasMasterCert: boolean;
  registerUrl: string | null;
  verifyUrl: string | null;
}> {
  const installID = await getSecureItem(DEVICE_INSTALL_ID_KEY);
  const hasDeviceKey = Boolean(await getSecureItem(DEVICE_PRIVATE_KEY_KEY));
  const hasMasterCert = Boolean(await getSecureItem(DEVICE_MASTER_CERT_KEY));
  const registerUrl = await getRegisterEndpointUrl();
  const verifyUrl = await getVerifyEndpointUrl();

  return {
    installID,
    hasDeviceKey,
    hasMasterCert,
    registerUrl,
    verifyUrl,
  };
}

export async function protectImageWithSignature(imageUri: string): Promise<ProtectResult> {
  const identity = await ensureDeviceRegistration(await getOrCreateIdentity());
  const jpeg = await normalizeToJpegBase64(imageUri);
  const imageBytes = base64ToBytes(jpeg.base64);
  const hashes = extractPixelDigestAndPHash(imageBytes);

  const appVersion = Constants.expoConfig?.version ?? "0.0.0";
  const appBuildNumber = Number(Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode ?? 0);
  const deviceModel =
    (Platform.constants && (Platform.constants as { Model?: string }).Model) ||
    `${Platform.OS}-${String(Platform.Version)}`;

  const unsignedPayload: Omit<SignedImagePayload, "signature"> = {
    v: 1,
    installID: identity.installID,
    deviceModel,
    appVersion,
    appBuildNumber,
    timestamp: new Date().toISOString(),
    sha256: hashes.sha256Hex,
    phash: hashes.pHash,
    publicKey: identity.publicKeyBase64,
    masterCert: identity.masterCert ?? "",
    cloudVerifyURL: identity.cloudVerifyURL ?? (await getVerifyEndpointUrl()) ?? "",
  };

  if (!unsignedPayload.masterCert) {
    throw new Error("Master certificate is missing after registration.");
  }

  const messageHash = sha256(utf8ToBytes(canonicalJson(unsignedPayload)));
  const privateKeyBytes = hexToBytes(identity.privateKeyHex);
  const signature = p256.sign(messageHash, privateKeyBytes);

  const payload: SignedImagePayload = {
    ...unsignedPayload,
    signature: bytesToBase64(signature),
  };

  const protectedUri = await embedSignedPayload(jpeg.base64, payload);
  return { protectedUri, payload };
}

export async function verifySignedImage(
  imageUri: string,
  options?: { cloudCheck?: boolean }
): Promise<VerificationResult> {
  const checks: VerificationChecks = {
    hashCheck: false,
    signatureCheck: false,
    masterCertCheck: false,
    cloudCheck: options?.cloudCheck === false ? "skipped" : "offline",
  };

  const extracted = await readSignedPayloadFromImage(imageUri);
  if (!extracted.payload) {
    return {
      status: "NO_PROTECTION",
      summary: "No ThreatLens protection payload was found in this image.",
      checks,
      details: ["No signed EXIF payload detected."],
    };
  }

  const payload = extracted.payload;

  const imageBytes = base64ToBytes(extracted.base64);
  const recomputed = extractPixelDigestAndPHash(imageBytes);
  const shaMatch = recomputed.sha256Hex === payload.sha256;
  const pHashDistance = hammingDistanceHex(recomputed.pHash, payload.phash);
  checks.hashCheck = shaMatch;

  const signatureCheck = verifyPayloadSignature(payload);
  checks.signatureCheck = signatureCheck;

  const masterCertCheck = await verifyMasterCertificate(payload);
  checks.masterCertCheck = masterCertCheck;

  if (!masterCertCheck) {
    return {
      status: "CLONE_APP",
      summary: "Master certificate check failed. This image was not signed by an official app trust chain.",
      checks,
      payload,
      shaMatch,
      pHashDistance,
      details: ["Master certificate does not validate against embedded master public key."],
    };
  }

  if (!signatureCheck) {
    return {
      status: "INVALID_SIGNATURE",
      summary: "Signature validation failed. The signed payload was altered or forged.",
      checks,
      payload,
      shaMatch,
      pHashDistance,
      details: ["ECDSA signature check failed for payload."],
    };
  }

  if (!shaMatch) {
    const details = ["SHA-256 hash mismatch detected."];
    if (pHashDistance <= PHASH_TAMPER_THRESHOLD) {
      details.push("Perceptual hash is close to original, indicating possible duplicate/re-encode.");
    } else {
      details.push("Perceptual hash is far from original, indicating strong content changes.");
    }

    return {
      status: "TAMPERED",
      summary: "Image content was modified after signing.",
      checks,
      payload,
      shaMatch,
      pHashDistance,
      details,
    };
  }

  const cloud = await cloudVerify(payload, options?.cloudCheck !== false);
  checks.cloudCheck = cloud.cloudCheck;

  if (cloud.revoked) {
    return {
      status: "REVOKED",
      summary: "Cloud registry reports this signing device as revoked.",
      checks,
      payload,
      shaMatch,
      pHashDistance,
      details: cloud.details,
    };
  }

  if (cloud.cloudCheck === "offline") {
    return {
      status: "OFFLINE",
      summary: "Local cryptographic checks passed, but cloud status could not be confirmed.",
      checks,
      payload,
      shaMatch,
      pHashDistance,
      details: cloud.details,
    };
  }

  if (cloud.cloudCheck === "failed") {
    return {
      status: "CORRUPT",
      summary: "Payload is valid locally, but cloud registry validation failed.",
      checks,
      payload,
      shaMatch,
      pHashDistance,
      details: cloud.details,
    };
  }

  return {
    status: "AUTHENTIC",
    summary: "All local and cloud checks passed. Image is authentic.",
    checks,
    payload,
    shaMatch,
    pHashDistance,
    details: ["SHA-256 check passed.", "ECDSA signature check passed.", "Master certificate check passed.", ...cloud.details],
  };
}
