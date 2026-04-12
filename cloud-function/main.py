"""
Google Cloud Function (Gen 2) - Image Protection Service

HTTP-triggered function that accepts an image upload and returns the
adversarially-protected image.

Deploy with:
  gcloud functions deploy protect-image \
    --gen2 \
    --runtime python312 \
    --region asia-south1 \
    --trigger-http \
    --allow-unauthenticated \
    --memory 1Gi \
    --timeout 120 \
    --source ./cloud-function

Environment variables (set via --set-env-vars or .env):
  None required
"""

import json
import base64
import functions_framework
from image_protect import protect_image


@functions_framework.http
def protect_image_endpoint(request):
    """HTTP endpoint for image protection.

    Accepts:
      POST with multipart/form-data:
        - image: image file (JPEG/PNG/WebP, max 20MB)
        - strength: float 0.01-0.1 (optional, default 0.05)
        - uuid: string (optional tracking ID)

    Returns:
      JSON with base64-encoded protected image and metadata
    """
    if request.method != 'POST':
        return (json.dumps({'error': 'Only POST method is supported'}), 405, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        })

    # Handle CORS preflight
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600',
        }
        return ('', 204, headers)

    # Get the image file
    if 'image' not in request.files:
        # Fallback: try base64-encoded image in JSON body
        content_type = request.content_type or ''
        if 'application/json' in content_type:
            data = request.get_json(silent=True) or {}
            if 'image' not in data:
                return (json.dumps({'error': 'No image provided'}), 400, {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                })
            try:
                image_bytes = base64.b64decode(data['image'])
            except Exception:
                return (json.dumps({'error': 'Invalid base64 image data'}), 400, {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                })
            strength = float(data.get('strength', 0.05))
            uuid = data.get('uuid')
        else:
            return (json.dumps({'error': 'No image file provided. Send as multipart/form-data with "image" field or as JSON with base64 "image" field'}), 400, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            })
    else:
        file = request.files['image']
        image_bytes = file.read()

        # Validate file size (20MB max)
        if len(image_bytes) > 20 * 1024 * 1024:
            return (json.dumps({'error': 'Image too large. Max 20MB.'}), 413, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            })

        # Validate file type
        allowed_types = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp']
        if file.content_type not in allowed_types:
            # Also check by magic bytes
            if not (image_bytes[:2] == b'\xff\xd8' or  # JPEG
                    image_bytes[:8] == b'\x89PNG\r\n\x1a\n' or  # PNG
                    image_bytes[:4] == b'RIFF'):  # WebP
                return (json.dumps({'error': 'Invalid file type. Only JPEG, PNG, and WebP allowed.'}), 400, {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                })

        strength = float(request.form.get('strength', '0.05'))
        uuid = request.form.get('uuid', None)

    # Clamp strength
    strength = max(0.01, min(0.1, strength))

    # Run protection
    result = protect_image(image_bytes, strength, uuid)

    if not result['success']:
        return (json.dumps({'error': result.get('error', 'Protection failed')}), 500, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        })

    # Encode protected image as base64
    image_b64 = base64.b64encode(result['image_bytes']).decode('utf-8')

    response_data = {
        'success': True,
        'image': f'data:image/jpeg;base64,{image_b64}',
        'protectionId': result['protection_id'],
        'protectionsApplied': result['protections_applied'],
        'strength': result['strength'],
        'message': result['message'],
    }

    return (json.dumps(response_data), 200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    })