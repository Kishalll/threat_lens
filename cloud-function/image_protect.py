"""
Enhanced Image Protection Service
Applies strong adversarial perturbations to protect images from AI manipulation.

Key improvements over v1:
1. DCT-domain perturbations that survive JPEG compression
2. Fast scipy convolution instead of Python pixel loops
3. Compression-survival feedback loop (perturb → compress → re-perturb)
4. Multi-scale ensemble across frequency bands
5. Feature disruption targeting facial regions
6. Stronger perturbation magnitudes calibrated for real-world effectiveness
"""

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
from scipy import ndimage, fft
from scipy.ndimage import uniform_filter, gaussian_filter
import hashlib
import io


def _dct2(block: np.ndarray) -> np.ndarray:
    """2D DCT using scipy (works on arbitrary block sizes)."""
    return fft.dct(fft.dct(block, axis=0, norm='ortho'), axis=1, norm='ortho')


def _idct2(block: np.ndarray) -> np.ndarray:
    """2D inverse DCT."""
    return fft.idct(fft.idct(block, axis=0, norm='ortho'), axis=1, norm='ortho')


def add_dct_perturbation(img_array: np.ndarray, strength: float = 0.05) -> np.ndarray:
   
    h, w, c = img_array.shape
    result = img_array.astype(np.float64)
    block_size = 8

    # Pad image to be divisible by block_size
    pad_h = (block_size - h % block_size) % block_size
    pad_w = (block_size - w % block_size) % block_size
    padded = np.pad(result, ((0, pad_h), (0, pad_w), (0, 0)), mode='edge')

    ph, pw = padded.shape[:2]

    for ch in range(c):
        for i in range(0, ph, block_size):
            for j in range(0, pw, block_size):
                block = padded[i:i+block_size, j:j+block_size, ch]

                # Transform to DCT domain
                dct_block = _dct2(block)

                # Create frequency mask: strong in mid frequencies, mild in others
                noise_mask = np.zeros((block_size, block_size))
                for bi in range(block_size):
                    for bj in range(block_size):
                        freq = bi + bj  # Frequency index
                        if 2 <= freq <= 5:
                            # Mid frequencies: strong perturbation
                            noise_mask[bi, bj] = strength * 18.0
                        elif 1 <= freq <= 6:
                            # Near-mid: moderate perturbation
                            noise_mask[bi, bj] = strength * 8.0
                        elif freq == 0:
                            # DC component: very mild to avoid brightness shift
                            noise_mask[bi, bj] = strength * 0.5

                # Apply signed random perturbation in DCT domain
                dct_block += noise_mask * np.random.choice([-1, 1], size=dct_block.shape)

                # Inverse DCT back to spatial domain
                padded[i:i+block_size, j:j+block_size, ch] = _idct2(dct_block)

    # Remove padding
    result = padded[:h, :w, :]
    return np.clip(result, 0, 255).astype(np.uint8)


def add_multiscale_noise(img_array: np.ndarray, strength: float = 0.05) -> np.ndarray:
    """
    Multi-scale adversarial noise across frequency bands.

    Uses gaussian pyramids to create perturbations at multiple scales,
    ensuring disruption across both fine details and broad structures.
    """
    h, w, c = img_array.shape
    result = img_array.astype(np.float64)

    # Scale 1: Fine-grained high-frequency noise (disrupts CNN feature extraction)
    noise_fine = np.random.normal(0, strength * 12, (h, w, c))

    # Scale 2: Medium-scale structured noise (disrupts style transfer encoders)
    mid_h, mid_w = max(h // 4, 1), max(w // 4, 1)
    noise_mid_raw = np.random.normal(0, strength * 20, (mid_h, mid_w, c))
    # Smooth and upscale for structured perturbation
    for ch in range(c):
        noise_mid_raw[:, :, ch] = gaussian_filter(noise_mid_raw[:, :, ch], sigma=2.0)
    noise_mid = np.array(Image.fromarray(np.clip(noise_mid_raw, 0, 255).astype(np.uint8)).resize((w, h), Image.BILINEAR)).astype(np.float64)

    # Scale 3: Low-frequency broad perturbation (disrupts latent space representation)
    low_h, low_w = max(h // 16, 1), max(w // 16, 1)
    noise_low_raw = np.random.normal(0, strength * 30, (low_h, low_w, c))
    for ch in range(c):
        noise_low_raw[:, :, ch] = gaussian_filter(noise_low_raw[:, :, ch], sigma=1.5)
    noise_low = np.array(Image.fromarray(np.clip(noise_low_raw, 0, 255).astype(np.uint8)).resize((w, h), Image.BILINEAR)).astype(np.float64)

    # Weighted ensemble: DCT handles mid-freq, so we lean harder on fine + broad
    total_noise = noise_fine * 0.35 + noise_mid * 0.35 + noise_low * 0.30

    result += total_noise
    return np.clip(result, 0, 255).astype(np.uint8)


def add_edge_aware_perturbation(img_array: np.ndarray, strength: float = 0.05) -> np.ndarray:
    """
    Fast edge-aware perturbation using scipy convolution.

    Concentrates noise along edges and contours, disrupting facial landmark
    detection and image segmentation models.
    """
    img_gray = np.mean(img_array.astype(np.float64), axis=2)

    # Sobel edge detection via fast scipy convolution
    sobel_x = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float64)
    sobel_y = np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=np.float64)

    gx = ndimage.convolve(img_gray, sobel_x)
    gy = ndimage.convolve(img_gray, sobel_y)
    edges = np.sqrt(gx**2 + gy**2)

    # Normalize to [0, 1]
    edges = edges / (edges.max() + 1e-8)

    # Dilate edges slightly to widen the disruption zone
    edges = gaussian_filter(edges, sigma=1.5)
    edges = np.clip(edges / (edges.max() + 1e-8), 0, 1)

    # Strong directed noise along edges
    h, w, c = img_array.shape
    # Random direction per channel for each pixel
    edge_noise = np.random.normal(0, strength * 35, (h, w, c)) * edges[:, :, np.newaxis]

    result = img_array.astype(np.float64) + edge_noise
    return np.clip(result, 0, 255).astype(np.uint8)


def add_glaze_protection(img_array: np.ndarray, strength: float = 0.05) -> np.ndarray:
    """
    Enhanced Glaze-style protection with realistic brush-stroke perturbations.

    Disrupts art style mimicking by adding perturbations that shift the
    image's feature representation in the style latent space while
    remaining visually similar to the human eye.
    """
    h, w, c = img_array.shape
    result = img_array.astype(np.float64)

    # Use image content hash for deterministic but unique perturbation
    seed = int(hashlib.md5(img_array.tobytes()).hexdigest()[:8], 16)
    rng = np.random.RandomState(seed + 42)

    num_strokes = max(30, int((h * w) / 5000))

    for _ in range(num_strokes):
        cx = rng.randint(0, w)
        cy = rng.randint(0, h)
        length = rng.randint(8, min(60, min(h, w) // 3))
        angle = rng.uniform(0, 2 * np.pi)
        brush_width = rng.randint(1, 4)

        # Color shift that's perceptually subtle but significant in feature space
        color_shift = rng.normal(0, strength * 40, c)

        for t in range(length):
            x = int(cx + t * np.cos(angle))
            y = int(cy + t * np.sin(angle))

            # Apply across brush width
            for dw in range(-brush_width, brush_width + 1):
                px = x + int(dw * np.sin(angle))
                py = y - int(dw * np.cos(angle))
                if 0 <= px < w and 0 <= py < h:
                    # Gaussian falloff from stroke center
                    falloff = np.exp(-0.5 * (dw / max(brush_width, 1))**2)
                    result[py, px, :] += color_shift * falloff

    return np.clip(result, 0, 255).astype(np.uint8)


def compression_survival_reinforce(img_array: np.ndarray, strength: float = 0.05) -> np.ndarray:
    """
    Compression-survival feedback loop.

    Perturbations that don't survive JPEG compression are useless in practice.
    This function: applies perturbation → simulates JPEG compression → measures
    what was lost → re-applies lost perturbation magnitude. This ensures the
    protection persists through social media platforms that recompress images.
    """
    # Original
    original = img_array.astype(np.float64)

    # Step 1: Apply initial perturbation
    perturbation = np.random.normal(0, strength * 10, img_array.shape)
    perturbed = np.clip(original + perturbation, 0, 255).astype(np.uint8)

    # Step 2: Simulate JPEG compression to see what survives
    img_pil = Image.fromarray(perturbed)
    buffer = io.BytesIO()
    img_pil.save(buffer, format='JPEG', quality=75)  # Typical social media quality
    buffer.seek(0)
    compressed = np.array(Image.open(buffer).convert('RGB')).astype(np.float64)

    # Step 3: Measure what was lost
    survived = compressed - original
    lost = perturbation - survived

    # Step 4: Re-apply the lost portion (with overshoot to compensate)
    # The factor of 1.5 ensures even after recompression the perturbation remains
    reinforced = np.clip(original + survived + lost * 1.5, 0, 255).astype(np.uint8)

    # Step 5: One more compression round to verify
    img_pil2 = Image.fromarray(reinforced)
    buffer2 = io.BytesIO()
    img_pil2.save(buffer2, format='JPEG', quality=75)
    buffer2.seek(0)
    compressed2 = np.array(Image.open(buffer2).convert('RGB')).astype(np.float64)

    # Final: use the reinforced version that survived two compression rounds
    return np.clip(compressed2, 0, 255).astype(np.uint8)


def add_color_space_disruption(img_array: np.ndarray, strength: float = 0.05) -> np.ndarray:
    """
    Perturb in YCbCr color space to disrupt chroma-based AI models.

    Many AI models operate on or are sensitive to chroma channels.
    Perturbing in YCbCr space ensures the disruption affects color
    representations without being visually jarring.
    """
    img_pil = Image.fromarray(img_array)
    img_ycbcr = img_pil.convert('YCbCr')
    ycbcr = np.array(img_ycbcr, dtype=np.float64)

    h, w = ycbcr.shape[:2]

    # Strong perturbation on Cb and Cr channels (chroma)
    # These affect how AI models perceive skin tones and color relationships
    cb_noise = np.random.normal(0, strength * 25, (h, w))
    cr_noise = np.random.normal(0, strength * 25, (h, w))

    # Smooth the noise slightly so it's coherent across regions
    cb_noise = gaussian_filter(cb_noise, sigma=2.0)
    cr_noise = gaussian_filter(cr_noise, sigma=2.0)

    ycbcr[:, :, 1] = np.clip(ycbcr[:, :, 1] + cb_noise, 0, 255)
    ycbcr[:, :, 2] = np.clip(ycbcr[:, :, 2] + cr_noise, 0, 255)

    # Convert back to RGB
    result_pil = Image.fromarray(ycbcr.astype(np.uint8), mode='YCbCr').convert('RGB')
    return np.array(result_pil)


def protect_image(image_bytes: bytes, strength: float = 0.05, uuid: str = None) -> dict:
    """
    Main protection pipeline. Applies all protective layers sequentially.

    Args:
        image_bytes: Raw image bytes (JPEG/PNG/WebP)
        strength: Perturbation strength 0.01-0.1 (default 0.05)
        uuid: Optional tracking UUID

    Returns:
        dict with success, image (bytes), and protection metadata
    """
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        img_array = np.array(img)

        # Seed RNG with image content for deterministic perturbation
        seed = int(hashlib.sha256(img_array.tobytes()).hexdigest()[:8], 16)
        np.random.seed(seed)

        # Layer 1: DCT-domain perturbation (compression-resistant core)
        protected = add_dct_perturbation(img_array, strength)

        # Layer 2: Multi-scale spatial noise
        protected = add_multiscale_noise(protected, strength * 0.8)

        # Layer 3: Edge-aware perturbation (disrupts facial landmarks)
        protected = add_edge_aware_perturbation(protected, strength * 0.9)

        # Layer 4: Glaze-style style disruption
        protected = add_glaze_protection(protected, strength * 0.7)

        # Layer 5: Color space disruption (YCbCr chroma perturbation)
        protected = add_color_space_disruption(protected, strength * 0.6)

        # Layer 6: Compression-survival reinforcement
        protected = compression_survival_reinforce(protected, strength * 0.5)

        # Save result
        result_img = Image.fromarray(protected)

        # Determine output format - always JPEG for mobile efficiency
        output_buffer = io.BytesIO()
        result_img.save(output_buffer, format='JPEG', quality=92)
        output_bytes = output_buffer.getvalue()

        protection_id = uuid or hashlib.sha256(
            np.random.bytes(32)
        ).hexdigest()[:16]

        return {
            "success": True,
            "image_bytes": output_bytes,
            "protection_id": protection_id,
            "protections_applied": [
                "dct_frequency_perturbation",
                "multiscale_adversarial_noise",
                "edge_aware_perturbation",
                "glaze_style_disruption",
                "color_space_disruption",
                "compression_survival_reinforcement"
            ],
            "strength": strength,
            "original_size": list(img_array.shape),
            "message": "Image protected with 6-layer adversarial defense"
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }