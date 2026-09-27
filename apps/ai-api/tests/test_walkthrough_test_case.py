from app.mentor_service import _test_case_text


def test_keeps_line_breaks_and_drops_trailing_spaces() -> None:
    assert _test_case_text("\n2 3  \n1 2 3\n\n") == "2 3\n1 2 3"


def test_drops_empty_or_oversized_test_cases() -> None:
    assert _test_case_text(None) is None
    assert _test_case_text("  \n ") is None
    assert _test_case_text("1 " * 600) is None
