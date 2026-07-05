"""Face recognition service — ArcFace (ONNX) engine.

Uses:
- SCRFD face detector (ONNX) for face detection + landmarks
- ArcFace recognition model (ONNX) for 512-d embedding extraction
- Both run via onnxruntime (CPU) — no GPU required

Models are auto-downloaded on first use to ./models/ directory.
"""
from __future__ import annotations

import base64
import io
import logging
import math
import os
import re
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional, Tuple

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFilter, ImageStat

from app.config import settings

logger = logging.getLogger(__name__)

MODEL_VERSION = "arcface-w600k-r50-v1"
EMBEDDING_DIM = 512  # ArcFace 512-d embedding

# Model directory
MODELS_DIR = Path(__file__).parent.parent.parent / "models"

# Model URLs (from InsightFace model zoo hosted on HuggingFace)
DETECTOR_URL = "https://huggingface.co/deepghs/insightface/resolve/main/buffalo_l/det_10g.onnx"
RECOGNIZER_URL = "https://huggingface.co/deepghs/insightface/resolve/main/buffalo_l/w600k_r50.onnx"

DETECTOR_FILE = "det_10g.onnx"
RECOGNIZER_FILE = "w600k_r50.onnx"


# --- Model Management -------------------------------------------------------

_model_lock = threading.Lock()
_detector_session: Optional[ort.InferenceSession] = None
_recognizer_session: Optional[ort.InferenceSession] = None


def _download_model(url: str, filepath: Path) -> None:
    """Download model file if not present."""
    if filepath.exists():
        return
    filepath.parent.mkdir(parents=True, exist_ok=True)
    logger.info(f"Downloading model: {url} -> {filepath}")
    import urllib.request
    urllib.request.urlretrieve(url, str(filepath))
    logger.info(f"Model downloaded: {filepath.name}")


def _get_detector() -> ort.InferenceSession:
    """Get or load the SCRFD face detector."""
    global _detector_session
    if _detector_session is None:
        with _model_lock:
            if _detector_session is None:
                model_path = MODELS_DIR / DETECTOR_FILE
                _download_model(DETECTOR_URL, model_path)
                opts = ort.SessionOptions()
                opts.intra_op_num_threads = 2
                opts.inter_op_num_threads = 1
                opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
                opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
                _detector_session = ort.InferenceSession(
                    str(model_path),
                    sess_options=opts,
                    providers=["CPUExecutionProvider"],
                )
                logger.info("SCRFD face detector loaded")
    return _detector_session


def _get_recognizer() -> ort.InferenceSession:
    """Get or load the ArcFace recognizer."""
    global _recognizer_session
    if _recognizer_session is None:
        with _model_lock:
            if _recognizer_session is None:
                model_path = MODELS_DIR / RECOGNIZER_FILE
                _download_model(RECOGNIZER_URL, model_path)
                opts = ort.SessionOptions()
                opts.intra_op_num_threads = 2
                opts.inter_op_num_threads = 1
                opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
                opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
                _recognizer_session = ort.InferenceSession(
                    str(model_path),
                    sess_options=opts,
                    providers=["CPUExecutionProvider"],
                )
                logger.info("ArcFace recognizer loaded")
    return _recognizer_session


# --- Utilities --------------------------------------------------------------

_DATA_URL_RE = re.compile(r"^data:image/[a-zA-Z]+;base64,")


def decode_image(image_data: str | bytes) -> Image.Image:
    """Decode a base64 data URL or raw bytes into a PIL Image (RGB)."""
    if isinstance(image_data, str):
        cleaned = _DATA_URL_RE.sub("", image_data).strip()
        try:
            raw = base64.b64decode(cleaned, validate=False)
        except Exception as e:
            raise ValueError(f"Invalid base64 image: {e}")
    else:
        raw = image_data
    try:
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as e:
        raise ValueError(f"Cannot decode image: {e}")

    # Resize besar ke max 640px untuk percepat inferensi di CPU
    max_size = 640
    w, h = img.size
    if w > max_size or h > max_size:
        ratio = min(max_size / w, max_size / h)
        new_w, new_h = int(w * ratio), int(h * ratio)
        img = img.resize((new_w, new_h), Image.LANCZOS)

    return img


def _pil_to_bgr(img: Image.Image) -> np.ndarray:
    """Convert PIL Image (RGB) to BGR numpy array."""
    arr = np.asarray(img, dtype=np.uint8)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def _laplacian_variance(img: Image.Image) -> float:
    """Approximate blur metric: variance of Laplacian-filtered grayscale."""
    gray = img.convert("L").filter(ImageFilter.FIND_EDGES)
    arr = np.asarray(gray, dtype=np.float32)
    return float(arr.var())


def _setting_value(
    sensitivity: Optional[Mapping[str, Any]],
    key: str,
    default: float,
) -> float:
    if not sensitivity:
        return default
    value = sensitivity.get(key, default)
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


# --- SCRFD Face Detection ---------------------------------------------------


def _scrfd_detect(img_bgr: np.ndarray, score_thresh: float = 0.5) -> list[dict]:
    """Detect faces using SCRFD (det_10g) model.

    Returns list of dicts with keys: bbox, score, landmarks (5-point).
    """
    session = _get_detector()
    input_name = session.get_inputs()[0].name

    # Use 640x640 as input size
    input_h, input_w = 640, 640

    h, w = img_bgr.shape[:2]
    scale = min(input_w / w, input_h / h)
    new_w = int(w * scale)
    new_h = int(h * scale)

    resized = cv2.resize(img_bgr, (new_w, new_h))

    # Pad to input size
    padded = np.zeros((input_h, input_w, 3), dtype=np.uint8)
    padded[:new_h, :new_w, :] = resized

    # Normalize: (img - 127.5) / 128.0
    blob = (padded.astype(np.float32) - 127.5) / 128.0
    blob = blob.transpose(2, 0, 1)[np.newaxis, ...]  # NCHW

    outputs = session.run(None, {input_name: blob})

    # det_10g outputs 9 tensors:
    # [0]: scores stride 8  (12800, 1)
    # [1]: scores stride 16 (3200, 1)
    # [2]: scores stride 32 (800, 1)
    # [3]: bboxes stride 8  (12800, 4)
    # [4]: bboxes stride 16 (3200, 4)
    # [5]: bboxes stride 32 (800, 4)
    # [6]: landmarks stride 8  (12800, 10)
    # [7]: landmarks stride 16 (3200, 10)
    # [8]: landmarks stride 32 (800, 10)
    faces = []
    strides = [8, 16, 32]
    num_anchors_per_loc = 2

    for idx in range(3):
        scores = outputs[idx].flatten()          # (N,)
        bboxes = outputs[idx + 3]                # (N, 4)
        landmarks = outputs[idx + 6]             # (N, 10)

        stride = strides[idx]
        feat_h = input_h // stride
        feat_w = input_w // stride

        # Generate anchor centers
        anchor_centers = np.stack(
            np.mgrid[:feat_h, :feat_w][::-1], axis=-1
        ).astype(np.float32).reshape(-1, 2)
        # Repeat for num_anchors_per_loc
        anchor_centers = np.repeat(anchor_centers, num_anchors_per_loc, axis=0)
        anchor_centers = anchor_centers * stride

        # Filter by score
        mask = scores > score_thresh
        if not mask.any():
            continue

        filtered_scores = scores[mask]
        filtered_bboxes = bboxes[mask]
        filtered_landmarks = landmarks[mask]
        filtered_anchors = anchor_centers[mask]

        # Decode bboxes (distance from anchor center)
        x1 = (filtered_anchors[:, 0] - filtered_bboxes[:, 0] * stride) / scale
        y1 = (filtered_anchors[:, 1] - filtered_bboxes[:, 1] * stride) / scale
        x2 = (filtered_anchors[:, 0] + filtered_bboxes[:, 2] * stride) / scale
        y2 = (filtered_anchors[:, 1] + filtered_bboxes[:, 3] * stride) / scale

        # Decode landmarks (5 points x 2 coords = 10 values)
        lms = filtered_landmarks.reshape(-1, 5, 2)
        lms[:, :, 0] = (lms[:, :, 0] * stride + filtered_anchors[:, 0:1]) / scale
        lms[:, :, 1] = (lms[:, :, 1] * stride + filtered_anchors[:, 1:2]) / scale

        for i in range(len(filtered_scores)):
            faces.append({
                "bbox": [float(x1[i]), float(y1[i]), float(x2[i]), float(y2[i])],
                "score": float(filtered_scores[i]),
                "landmarks": lms[i].tolist(),
            })

    # NMS
    if faces:
        faces = _nms(faces, iou_thresh=0.4)

    return faces


def _nms(faces: list[dict], iou_thresh: float = 0.4) -> list[dict]:
    """Non-maximum suppression."""
    if not faces:
        return []
    faces = sorted(faces, key=lambda f: f["score"], reverse=True)
    keep = []
    for face in faces:
        discard = False
        for kept in keep:
            if _iou(face["bbox"], kept["bbox"]) > iou_thresh:
                discard = True
                break
        if not discard:
            keep.append(face)
    return keep


def _iou(box1: list, box2: list) -> float:
    """Intersection over Union."""
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    union = area1 + area2 - inter
    return inter / union if union > 0 else 0


# --- Face Alignment ---------------------------------------------------------

# Standard ArcFace alignment reference points (for 112x112 crop)
ARCFACE_REF = np.array([
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041],
], dtype=np.float32)


def _align_face(img_bgr: np.ndarray, landmarks: list) -> np.ndarray:
    """Align face to 112x112 using 5-point landmarks and similarity transform."""
    src_pts = np.array(landmarks, dtype=np.float32)
    dst_pts = ARCFACE_REF

    # Estimate similarity transform (no skew)
    tform = _estimate_similarity_transform(src_pts, dst_pts)
    aligned = cv2.warpAffine(img_bgr, tform, (112, 112), borderValue=0)
    return aligned


def _estimate_similarity_transform(src: np.ndarray, dst: np.ndarray) -> np.ndarray:
    """Estimate 2D similarity transform matrix (2x3)."""
    num = src.shape[0]
    dim = src.shape[1]

    src_mean = src.mean(axis=0)
    dst_mean = dst.mean(axis=0)

    src_demean = src - src_mean
    dst_demean = dst - dst_mean

    A = np.zeros((num * dim, 2 * dim))
    b = np.zeros(num * dim)

    for i in range(num):
        A[2 * i, 0] = src_demean[i, 0]
        A[2 * i, 1] = -src_demean[i, 1]
        A[2 * i + 1, 0] = src_demean[i, 1]
        A[2 * i + 1, 1] = src_demean[i, 0]
        b[2 * i] = dst_demean[i, 0]
        b[2 * i + 1] = dst_demean[i, 1]

    # Solve least squares
    result, _, _, _ = np.linalg.lstsq(A, b, rcond=None)
    scale_cos = result[0]
    scale_sin = result[1]

    M = np.array([
        [scale_cos, -scale_sin, dst_mean[0] - scale_cos * src_mean[0] + scale_sin * src_mean[1]],
        [scale_sin, scale_cos, dst_mean[1] - scale_sin * src_mean[0] - scale_cos * src_mean[1]],
    ], dtype=np.float64)

    return M


# --- ArcFace Embedding Extraction -------------------------------------------


def _arcface_embedding(aligned_face: np.ndarray) -> np.ndarray:
    """Extract 512-d embedding from aligned 112x112 face image."""
    session = _get_recognizer()
    input_name = session.get_inputs()[0].name

    # Preprocess: normalize to [-1, 1], transpose to NCHW
    img = aligned_face.astype(np.float32)
    img = (img - 127.5) / 127.5
    img = img.transpose(2, 0, 1)[np.newaxis, ...]  # [1, 3, 112, 112]

    outputs = session.run(None, {input_name: img})
    embedding = outputs[0][0]  # [512]

    # L2 normalize
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm

    return embedding.astype(np.float32)


# --- Quality validation (FACE-04) -------------------------------------------


@dataclass
class QualityReport:
    score: float
    blur: float
    brightness: float
    has_face_signal: bool
    face_detected: bool
    face_count: int
    reasons: list[str]
    min_quality: float = settings.FACE_MIN_QUALITY

    @property
    def passed(self) -> bool:
        return self.score >= self.min_quality and not self.reasons


def validate_quality(
    img: Image.Image,
    sensitivity: Optional[Mapping[str, Any]] = None,
) -> QualityReport:
    """Quality check using SCRFD face detection + image heuristics."""
    reasons: list[str] = []
    min_quality = _setting_value(sensitivity, "min_quality", settings.FACE_MIN_QUALITY)
    blur_threshold = _setting_value(sensitivity, "blur_threshold", 30.0)
    min_brightness = _setting_value(sensitivity, "min_brightness", 0.15)
    max_brightness = _setting_value(sensitivity, "max_brightness", 0.95)

    # Resolution check
    if img.width < 160 or img.height < 160:
        reasons.append("Resolusi terlalu rendah (min 160x160)")

    # Blur check
    blur = _laplacian_variance(img)
    if blur < blur_threshold:
        reasons.append("Foto terlalu blur")

    # Brightness check
    stat = ImageStat.Stat(img.convert("L"))
    brightness = stat.mean[0] / 255.0
    if brightness < min_brightness:
        reasons.append("Foto terlalu gelap")
    elif brightness > max_brightness:
        reasons.append("Foto terlalu terang")

    # Face detection using SCRFD
    img_bgr = _pil_to_bgr(img)
    faces = _scrfd_detect(img_bgr, score_thresh=0.4)
    face_count = len(faces)
    face_detected = face_count > 0

    if not face_detected:
        reasons.append("Tidak terdeteksi wajah")
    elif face_count > 1:
        reasons.append(f"Terdeteksi {face_count} wajah, hanya boleh 1")

    # Check face detection confidence
    face_conf = 0.0
    if face_detected:
        face_conf = faces[0]["score"]
        if face_conf < 0.5:
            reasons.append("Wajah terdeteksi tapi confidence rendah, coba posisi lebih jelas")

    # Quality score
    blur_norm = min(blur / 500.0, 1.0)
    bright_norm = 1.0 - abs(brightness - 0.5) * 2
    score = max(0.0, min(1.0, 0.3 * blur_norm + 0.2 * bright_norm + 0.5 * face_conf))

    return QualityReport(
        score=score,
        blur=blur,
        brightness=brightness,
        has_face_signal=face_detected,
        face_detected=face_detected,
        face_count=face_count,
        reasons=reasons,
        min_quality=min_quality,
    )


# --- Anti-spoofing (FACE-05) ------------------------------------------------


def liveness_check(
    frames: list[Image.Image],
    *,
    enabled: bool = True,
    min_delta: float = 0.6,
) -> Tuple[bool, str]:
    """Liveness via cross-frame variance."""
    if not enabled:
        return True, "disabled"

    if len(frames) < 2:
        return True, "single-frame"

    arrs = [np.asarray(f.convert("L"), dtype=np.float32) for f in frames]
    base = arrs[0]
    deltas = [float(np.abs(a - base).mean()) for a in arrs[1:]]
    avg_delta = sum(deltas) / len(deltas)

    if avg_delta < min_delta:
        return False, "Frames terlalu identik (kemungkinan foto statis)"
    return True, "ok"


# --- Embedding (ArcFace) ----------------------------------------------------


def _extract_embedding(img: Image.Image) -> np.ndarray:
    """Extract 512-d ArcFace embedding from image.

    Detects face, aligns it, then extracts embedding.
    Raises ValueError if no face is detected.
    """
    img_bgr = _pil_to_bgr(img)
    faces = _scrfd_detect(img_bgr, score_thresh=0.4)

    if not faces:
        raise ValueError("Tidak terdeteksi wajah dalam foto")

    # Pick the face with highest score
    best_face = max(faces, key=lambda f: f["score"])

    # Align face using landmarks
    aligned = _align_face(img_bgr, best_face["landmarks"])

    # Extract embedding
    embedding = _arcface_embedding(aligned)
    return embedding


def extract_embedding(
    img: Image.Image,
    sensitivity: Optional[Mapping[str, Any]] = None,
) -> Tuple[np.ndarray, float]:
    """Validate quality + return (embedding, quality_score)."""
    report = validate_quality(img, sensitivity)
    if not report.passed:
        raise ValueError("; ".join(report.reasons) or "Kualitas foto tidak memadai")
    emb = _extract_embedding(img)
    return emb, report.score


def average_embeddings(embs: Iterable[np.ndarray]) -> np.ndarray:
    """Average a list of embeddings into a single template."""
    arrs = list(embs)
    if not arrs:
        raise ValueError("No embeddings provided")
    avg = np.mean(np.stack(arrs), axis=0)
    n = np.linalg.norm(avg)
    if n > 0:
        avg = avg / n
    return avg.astype(np.float32)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two normalized embeddings."""
    return float(np.dot(a, b))


# --- Encrypted serialization ------------------------------------------------
#
# Format v2 (AES-256-GCM):
#   [0]      = magic byte 0x02 (versi)
#   [1..13]  = nonce 12 byte
#   [13..29] = tag 16 byte
#   [29..]   = ciphertext (sama panjang dengan plaintext)
#
# Format v1 (legacy XOR) tetap di-support untuk decrypt agar embedding
# lama tidak harus di-rebuild. Embedding baru selalu pakai v2.

import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


_MAGIC_V2 = 0x02
_NONCE_LEN = 12
_TAG_LEN = 16


def _aes_key() -> bytes:
    """Derive 32-byte key dari config (pakai SHA-256 supaya konsisten)."""
    raw = settings.EMBEDDING_ENCRYPTION_KEY.encode("utf-8")
    return hashlib.sha256(raw).digest()


def _xor_key() -> bytes:
    """Legacy obfuscation key (untuk decrypt blob v1 lama)."""
    k = settings.EMBEDDING_ENCRYPTION_KEY.encode("utf-8")
    return (k * (32 // len(k) + 1))[:32]


def serialize_embedding(emb: np.ndarray) -> bytes:
    """Serialize + AES-256-GCM encrypt embedding."""
    raw = emb.astype(np.float32).tobytes()
    nonce = os.urandom(_NONCE_LEN)
    aes = AESGCM(_aes_key())
    # encrypt() returns ciphertext || tag (16 byte tag at end)
    ct_with_tag = aes.encrypt(nonce, raw, associated_data=b"face-embedding-v2")
    ciphertext = ct_with_tag[:-_TAG_LEN]
    tag = ct_with_tag[-_TAG_LEN:]
    return bytes([_MAGIC_V2]) + nonce + tag + ciphertext


def deserialize_embedding(blob: bytes) -> np.ndarray:
    """Decrypt embedding. Auto-detect v1 (XOR) vs v2 (AES-GCM)."""
    if not blob:
        raise ValueError("Empty embedding blob")

    # v2: prefix byte == _MAGIC_V2
    if blob[0] == _MAGIC_V2 and len(blob) >= 1 + _NONCE_LEN + _TAG_LEN:
        nonce = blob[1:1 + _NONCE_LEN]
        tag = blob[1 + _NONCE_LEN:1 + _NONCE_LEN + _TAG_LEN]
        ciphertext = blob[1 + _NONCE_LEN + _TAG_LEN:]
        aes = AESGCM(_aes_key())
        raw = aes.decrypt(nonce, ciphertext + tag, associated_data=b"face-embedding-v2")
        return np.frombuffer(raw, dtype=np.float32).copy()

    # Fallback v1 legacy XOR (embedding lama belum di-migrate)
    key = _xor_key()
    raw = bytes(b ^ key[i % len(key)] for i, b in enumerate(blob))
    return np.frombuffer(raw, dtype=np.float32).copy()


# --- Match against gallery --------------------------------------------------


@dataclass
class MatchResult:
    user_id: Optional[int]
    confidence: float
    matched: bool
    score: float


def find_best_match(
    probe: np.ndarray,
    gallery: list[tuple[int, np.ndarray]],
    threshold: Optional[float] = None,
) -> MatchResult:
    """Return best match or non-match if below threshold.

    ArcFace cosine similarity ranges:
    - > 0.45: very likely same person
    - 0.30-0.45: possible match
    - < 0.30: different person
    """
    th = threshold if threshold is not None else settings.FACE_MATCH_THRESHOLD
    best_id: Optional[int] = None
    best_score = -math.inf

    for uid, emb in gallery:
        score = cosine_similarity(probe, emb)
        if score > best_score:
            best_score = score
            best_id = uid

    # Confidence mapped from cosine similarity
    confidence = max(0.0, min(1.0, best_score)) if best_score > -math.inf else 0.0

    return MatchResult(
        user_id=best_id if best_score >= th else None,
        confidence=confidence,
        matched=best_score >= th,
        score=best_score if best_score > -math.inf else 0.0,
    )
