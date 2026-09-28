from __future__ import annotations

import json
import unittest

from app.coach_output import coerce_coach_output

INNER = {
    "presentation": {
        "suggestedQuestions": [
            "What are the most common pitfalls when using prefix sums?",
            "How do I implement a variable-length sliding window?",
        ]
    },
    "answer": "Here are some focused questions:\n\n1. **Prefix sums** - pitfalls?",
}


class CoachOutputTests(unittest.TestCase):
    def test_json_written_as_answer_text_is_unwrapped(self) -> None:
        output = coerce_coach_output({"answer": json.dumps(INNER, indent=2)})
        assert output is not None
        self.assertEqual(output.answer, INNER["answer"])
        assert output.presentation is not None
        self.assertEqual(
            output.presentation.suggestedQuestions,
            INNER["presentation"]["suggestedQuestions"],
        )

    def test_fenced_json_and_outer_presentation_are_merged(self) -> None:
        output = coerce_coach_output(
            {
                "answer": "```json\n" + json.dumps(INNER) + "\n```",
                "presentation": {"problemIds": ["leetcode:141"], "suggestedQuestions": []},
            }
        )
        assert output is not None and output.presentation is not None
        self.assertEqual(output.answer, INNER["answer"])
        self.assertEqual(output.presentation.problemIds, ["leetcode:141"])
        self.assertEqual(len(output.presentation.suggestedQuestions), 2)

    def test_prose_and_non_answer_json_are_left_alone(self) -> None:
        prose = "Use a {left, right} window and move right each step."
        self.assertEqual(coerce_coach_output({"answer": prose}).answer, prose)  # type: ignore[union-attr]
        code = '{"n": 3}'
        self.assertEqual(coerce_coach_output({"answer": code}).answer, code)  # type: ignore[union-attr]


if __name__ == "__main__":
    unittest.main()
