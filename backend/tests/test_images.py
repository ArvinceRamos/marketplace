"""Upload attack and privacy tests for the photo pipeline (SECURITY_PLAN T6, T7)."""

import io

import pytest
from PIL import Image

from app.services.images import (
    FULL_MAX,
    MAX_UPLOAD_BYTES,
    THUMB_MAX,
    ImageRejected,
    process_image,
)

GPS_IFD = 0x8825
ORIENTATION = 0x0112


def jpeg(size=(800, 600), *, gps=False, orientation=None, color=(200, 30, 30)) -> bytes:
    img = Image.new("RGB", size, color)
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"  # camera make
    if gps:
        exif[GPS_IFD] = {1: "N", 2: (14.0, 35.0, 0.0), 3: "E", 4: (121.0, 0.0, 0.0)}
    if orientation:
        exif[ORIENTATION] = orientation
    out = io.BytesIO()
    img.save(out, "JPEG", exif=exif.tobytes(), quality=90)
    return out.getvalue()


def open_webp(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    assert img.format == "WEBP"
    return img


def rejected(data: bytes) -> str:
    with pytest.raises(ImageRejected) as info:
        process_image(data)
    return info.value.code


def test_jpeg_becomes_webp_full_and_thumb():
    out = process_image(jpeg((3000, 2000)))
    full, thumb = open_webp(out.full), open_webp(out.thumb)
    assert full.size == (FULL_MAX, 1067) == (out.width, out.height)
    assert max(thumb.size) == THUMB_MAX
    assert len(out.full) < 2_000_000  # fits the bucket limit


def test_gps_and_all_exif_are_removed():
    source = jpeg(gps=True)
    assert Image.open(io.BytesIO(source)).getexif().get_ifd(GPS_IFD)  # the input has GPS
    out = process_image(source)
    for data in (out.full, out.thumb):
        img = open_webp(data)
        assert "exif" not in img.info
        assert len(img.getexif()) == 0
        assert b"PhoneMaker" not in data
        assert "xmp" not in img.info and "icc_profile" not in img.info


def test_phone_rotation_is_applied():
    # Orientation 6 = "rotate 90° clockwise to display"; stored 800x600 shows as 600x800.
    out = process_image(jpeg((800, 600), orientation=6))
    assert (out.width, out.height) == (600, 800)


def test_transparent_png_is_flattened_on_white():
    img = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    out = open_webp(process_image(buf.getvalue()).full)
    assert out.mode == "RGB"
    assert out.convert("RGB").getpixel((50, 50)) == (255, 255, 255)


def test_webp_input_is_accepted():
    buf = io.BytesIO()
    Image.new("RGB", (300, 300), (0, 120, 0)).save(buf, "WEBP")
    assert process_image(buf.getvalue()).width == 300


@pytest.mark.parametrize(
    "data",
    [
        b"<script>alert(1)</script>",  # a script renamed to .jpg
        b"%PDF-1.7 not an image",
        b"",
    ],
)
def test_non_images_are_rejected(data):
    assert rejected(data) == "unsupported_image"


def test_other_image_formats_are_rejected():
    buf = io.BytesIO()
    Image.new("RGB", (10, 10)).save(buf, "GIF")
    assert rejected(buf.getvalue()) == "unsupported_image"


def test_truncated_jpeg_is_rejected():
    data = jpeg((1200, 900))
    assert rejected(data[: len(data) // 3]) == "invalid_image"


def test_pixel_bomb_is_rejected_before_decoding():
    # 10000 x 6000 one-bit PNG: tiny file, 60 megapixels when decoded.
    buf = io.BytesIO()
    Image.new("1", (10000, 6000)).save(buf, "PNG", optimize=True)
    assert len(buf.getvalue()) < 200_000
    assert rejected(buf.getvalue()) == "image_too_large"


def test_oversized_file_is_rejected():
    assert rejected(b"\xff\xd8" + b"0" * MAX_UPLOAD_BYTES) == "file_too_large"
