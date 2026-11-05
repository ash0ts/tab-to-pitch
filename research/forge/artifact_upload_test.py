"""Publication guards, without SDK calls or network access."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock

import artifact_upload as publish


class PublicationGuards(unittest.TestCase):
    def test_changed_bundle_fails_before_network(self):
        with TemporaryDirectory() as directory:
            source = Path(directory)
            for name in publish.EXPECTED:
                (source / name).write_text("{}")
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                publish.validate_bundle(source)

    def test_private_gate_has_bounded_request_and_no_redirect(self):
        session = Mock()
        session.post.return_value.json.return_value = {
            "data": {
                "project": {"name": publish.PROJECT, "access": "PRIVATE", "run": None}
            }
        }
        result = publish.private_project(session, "test-only", "upload-run")
        self.assertEqual(result["access"], "PRIVATE")
        self.assertIsNone(result["existingRun"])
        self.assertEqual(session.post.call_args.kwargs["timeout"], (5, 8))
        self.assertFalse(session.post.call_args.kwargs["allow_redirects"])
        self.assertNotIn("test-only", str(result))

    def test_public_project_rejected(self):
        session = Mock()
        session.post.return_value.json.return_value = {
            "data": {
                "project": {"name": publish.PROJECT, "access": "PUBLIC", "run": None}
            }
        }
        with self.assertRaisesRegex(ValueError, "Private project"):
            publish.private_project(session, "test-only", "upload-run")


if __name__ == "__main__":
    unittest.main()
