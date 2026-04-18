import base64
import datetime
import hmac
import json
import os
from typing import Any, Dict, Optional

import functions_framework
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature, encode_dss_signature
from google.cloud import firestore

_firestore_client: Optional[firestore.Client] = None

# P-256 curve order — used for low-S normalization
_P256_ORDER = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551


def _cors_headers() -> Dict[str, str]:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "3600",
    }


def _json_response(payload: Dict[str, Any], status_code: int):
    headers = _cors_headers()
    headers["Content-Type"] = "application/json"
    return (json.dumps(payload), status_code, headers)


def _auth_ok(auth_header: str) -> bool:
    expected = os.environ.get("TRUST_REGISTRY_API_KEY", "").strip()
    if not expected:
        return True

    if not auth_header or not auth_header.startswith("Bearer "):
        return False

    token = auth_header[len("Bearer ") :].strip()
    return hmac.compare_digest(token, expected)


def _require_post(request):
    if request.method != "POST":
        return _json_response({"error": "Only POST method is supported."}, 405)
    return None


def _canonical_json(payload: Dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _utc_now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()


def _get_firestore_client() -> firestore.Client:
    global _firestore_client
    if _firestore_client is None:
        _firestore_client = firestore.Client()
    return _firestore_client


def _get_registry_collection_name() -> str:
    name = os.environ.get("REGISTRY_COLLECTION", "trust_registry").strip()
    return name if name else "trust_registry"


def _get_master_private_key():
    private_key_pem = os.environ.get("MASTER_PRIVATE_KEY_PEM", "")
    if not private_key_pem:
        raise RuntimeError(
            "MASTER_PRIVATE_KEY_PEM is not configured. Set it as an environment variable."
        )

    normalized_pem = private_key_pem.replace("\\n", "\n").encode("utf-8")
    return serialization.load_pem_private_key(normalized_pem, password=None)


def _sign_cert_payload(cert_payload: Dict[str, Any]) -> str:
    private_key = _get_master_private_key()
    message = _canonical_json(cert_payload).encode("utf-8")

    # Sign with ECDSA SHA-256 — Python cryptography produces DER-encoded signature
    signature_der = private_key.sign(message, ec.ECDSA(hashes.SHA256()))

    # Normalize to low-S form so that @noble/curves v2 (which enforces low-S) accepts it.
    # Python's cryptography library does not enforce low-S by default, so ~50% of
    # signatures would be rejected by noble without this normalization.
    r, s = decode_dss_signature(signature_der)
    if s > _P256_ORDER // 2:
        s = _P256_ORDER - s
    signature_der = encode_dss_signature(r, s)

    return base64.b64encode(signature_der).decode("utf-8")


def _build_master_cert_blob(cert_payload: Dict[str, Any]) -> str:
    blob = {
        "cert": cert_payload,
        "sig": _sign_cert_payload(cert_payload),
    }
    return base64.b64encode(_canonical_json(blob).encode("utf-8")).decode("utf-8")


def _build_verify_url(request) -> str:
    configured = os.environ.get("VERIFY_ENDPOINT_URL", "").strip()
    if configured:
        return configured

    request_url = request.url.rstrip("/")
    if request_url.startswith("http://"):
        request_url = "https://" + request_url[len("http://") :]

    if request_url.endswith("/register"):
        return f"{request_url[:-len('/register')]}/verify"
    return request_url


def _read_verify_params(request) -> Dict[str, Any]:
    if request.method == "GET":
        return {
            "installID": request.args.get("installID", ""),
            "publicKey": request.args.get("publicKey", ""),
        }

    return request.get_json(silent=True) or {}


@functions_framework.http
def register(request):
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())

    invalid_method = _require_post(request)
    if invalid_method is not None:
        return invalid_method

    auth = request.headers.get("Authorization", "")
    if not _auth_ok(auth):
        return _json_response({"error": "Unauthorized"}, 401)

    data = request.get_json(silent=True) or {}
    install_id = str(data.get("installID", "")).strip()
    public_key = str(data.get("publicKey", "")).strip()
    device_model = str(data.get("deviceModel", "unknown-device")).strip() or "unknown-device"
    app_version = str(data.get("appVersion", "0.0.0")).strip() or "0.0.0"
    app_build_number = int(data.get("appBuildNumber", 0) or 0)

    if not install_id:
        return _json_response({"error": "installID is required"}, 400)
    if not public_key:
        return _json_response({"error": "publicKey is required"}, 400)

    now_iso = _utc_now_iso()
    cert_payload = {
        "v": 1,
        "issuer": "ThreatLens Master CA",
        "issuedAt": now_iso,
        "installID": install_id,
        "publicKey": public_key,
    }

    try:
        master_cert_blob = _build_master_cert_blob(cert_payload)
    except Exception as error:
        return _json_response({"error": f"Failed to sign certificate: {error}"}, 500)

    record = {
        "installID": install_id,
        "publicKey": public_key,
        "deviceModel": device_model,
        "appVersion": app_version,
        "appBuildNumber": app_build_number,
        "masterCert": master_cert_blob,
        "revoked": False,
        "updatedAt": now_iso,
    }

    db = _get_firestore_client()
    doc_ref = db.collection(_get_registry_collection_name()).document(install_id)
    existing = doc_ref.get()

    if not existing.exists:
        record["createdAt"] = now_iso
    else:
        previous = existing.to_dict() or {}
        if bool(previous.get("revoked", False)):
            return _json_response(
                {
                    "ok": False,
                    "status": "REVOKED",
                    "installID": install_id,
                    "message": "This installID is revoked and cannot be re-registered.",
                },
                403,
            )

    doc_ref.set(record, merge=True)

    return _json_response(
        {
            "ok": True,
            "status": "ACTIVE",
            "installID": install_id,
            "masterCert": master_cert_blob,
            "cloudVerifyURL": _build_verify_url(request),
            "registeredAt": now_iso,
        },
        200,
    )


@functions_framework.http
def verify(request):
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())

    if request.method not in {"POST", "GET"}:
        return _json_response({"error": "Only GET or POST methods are supported."}, 405)

    auth = request.headers.get("Authorization", "")
    if not _auth_ok(auth):
        return _json_response({"error": "Unauthorized"}, 401)

    params = _read_verify_params(request)
    install_id = str(params.get("installID", "")).strip()
    provided_public_key = str(params.get("publicKey", "")).strip()

    if not install_id:
        return _json_response({"error": "installID is required"}, 400)

    db = _get_firestore_client()
    doc = db.collection(_get_registry_collection_name()).document(install_id).get()

    if not doc.exists:
        return _json_response(
            {
                "ok": True,
                "status": "NOT_FOUND",
                "installID": install_id,
                "registered": False,
                "revoked": False,
                "publicKeyMatch": None,
                "verifiedAt": _utc_now_iso(),
            },
            200,
        )

    payload = doc.to_dict() or {}
    stored_public_key = str(payload.get("publicKey", "")).strip()
    revoked = bool(payload.get("revoked", False))
    public_key_match = None
    if provided_public_key:
        public_key_match = hmac.compare_digest(stored_public_key, provided_public_key)

    return _json_response(
        {
            "ok": True,
            "status": "REVOKED" if revoked else "ACTIVE",
            "installID": install_id,
            "registered": True,
            "revoked": revoked,
            "publicKey": stored_public_key,
            "publicKeyMatch": public_key_match,
            "masterCert": str(payload.get("masterCert", "")),
            "updatedAt": str(payload.get("updatedAt", "")),
            "verifiedAt": _utc_now_iso(),
        },
        200,
    )