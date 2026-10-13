"""Turn an uploaded photo into two clean WebP files (full + thumbnail).

The upload is never stored as-is. Pillow must recognise the real bytes as JPEG,
PNG, or WebP (the file name and Content-Type are ignored). The picture is then
rotated upright, flattened to RGB, resized, and re-encoded. Re-encoding drops
all metadata, including EXIF GPS, so a seller's home location cannot leak.
"""

import io
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 40_000_000  # about 7300 x 5500; larger pictures are rejected before decoding
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}

FULL_MAX = 1600  # long edge, px
THUMB_MAX = 600
# Stored files must fit the bucket's 2 MB limit; drop quality until they do.
STORED_MAX_BYTES = 1_900_000
QUALITIES = (80, 70, 60, 50)

# Pillow's own decompression-bomb guard, as a backstop to the explicit check.
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


class ImageRejected(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class ProcessedImage:
    full: bytes
    thumb: bytes
    width: int
    height: int


def _open(data: bytes) -> Image.Image:
    try:
        img = Image.open(io.BytesIO(data))
        if img.format not in ALLOWED_FORMATS:
            raise ImageRejected("unsupported_image", "Use a JPEG, PNG, or WebP photo.")
        if img.width * img.height > MAX_PIXELS:
            raise ImageRejected("image_too_large", "This photo has too many pixels.")
        # JPEG only: decode at a reduced scale when the photo is much larger
        # than we need. Saves memory on big phone photos.
        img.draft("RGB", (FULL_MAX, FULL_MAX))
        img.load()  # first frame only for animated files
        return img
    except ImageRejected:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise ImageRejected("unsupported_image", "Use a JPEG, PNG, or WebP photo.") from exc
    except (OSError, SyntaxError, ValueError) as exc:
        raise ImageRejected("invalid_image", "This photo is damaged or incomplete.") from exc


def _to_rgb(img: Image.Image) -> Image.Image:
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        background = Image.new("RGB", rgba.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.getchannel("A"))
        return background
    return img.convert("RGB")


def _webp(img: Image.Image, max_edge: int) -> tuple[bytes, int, int]:
    copy = img.copy()
    copy.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS, reducing_gap=3.0)
    for quality in QUALITIES:
        out = io.BytesIO()
        # Explicitly empty: no EXIF, XMP, or ICC data is written.
        copy.save(out, "WEBP", quality=quality, method=4, exif=b"", xmp=b"", icc_profile=None)
        if out.tell() <= STORED_MAX_BYTES:
            return out.getvalue(), copy.width, copy.height
    raise ImageRejected("image_too_large", "This photo could not be made small enough.")


def process_image(data: bytes) -> ProcessedImage:
    """CPU-bound; call from a worker thread."""
    if len(data) > MAX_UPLOAD_BYTES:
        raise ImageRejected("file_too_large", "Each photo must be 8 MB or smaller.")
    with _open(data) as original:
        upright = ImageOps.exif_transpose(original)  # phone photos store rotation in EXIF
        clean = _to_rgb(upright)
    clean.info.clear()
    full, width, height = _webp(clean, FULL_MAX)
    thumb, _, _ = _webp(clean, THUMB_MAX)
    return ProcessedImage(full=full, thumb=thumb, width=width, height=height)
