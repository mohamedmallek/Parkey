from app.yolo_detection import looks_damaged


def test_wide_person_box_is_not_a_damaged_sign():
    det = {
        "label": "person",
        "conf": 0.62,
        "bbox_norm": {"x1": 0.1, "y1": 0.4, "x2": 0.8, "y2": 0.95},
    }
    assert looks_damaged(det) is False


def test_damaged_sign_label_is_kept():
    det = {
        "label": "damaged_sign",
        "conf": 0.71,
        "bbox_norm": {"x1": 0.3, "y1": 0.2, "x2": 0.5, "y2": 0.55},
    }
    assert looks_damaged(det) is True
