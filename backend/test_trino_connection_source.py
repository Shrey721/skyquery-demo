import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.core.config import Settings, settings
from app.services import connection_store


class TrinoConnectionSourceTests(unittest.TestCase):
    def setUp(self):
        self.saved_connection = SimpleNamespace(
            host="saved-host",
            port=8443,
            default_catalog="saved_catalog",
            default_schema="saved_schema",
            username="saved_user",
            encrypted_password="encrypted",
            ssl_enabled=True,
        )

    def test_auto_prefers_active_saved_connection(self):
        with patch.object(settings, "TRINO_CONNECTION_SOURCE", "auto"), patch.object(
            settings, "ALLOW_SAVED_CONNECTIONS", True
        ), patch.object(
            connection_store, "get_active_connection", return_value=self.saved_connection
        ), patch.object(
            connection_store, "decrypt_password", return_value="saved_password"
        ):
            conn_req, source = connection_store.resolve_trino_connection_request(db=object())

        self.assertEqual(source, "saved")
        self.assertEqual(conn_req.host, "saved-host")
        self.assertEqual(conn_req.password, "saved_password")

    def test_auto_falls_back_to_environment_without_saved_connection(self):
        with patch.object(settings, "TRINO_CONNECTION_SOURCE", "auto"), patch.object(
            settings, "ALLOW_SAVED_CONNECTIONS", True
        ), patch.object(
            settings, "TRINO_HOST", "env-host"
        ), patch.object(
            settings, "TRINO_PORT", 443
        ), patch.object(
            settings, "TRINO_USER", "env-user"
        ), patch.object(
            settings, "TRINO_HTTP_SCHEME", "https"
        ), patch.object(
            connection_store, "get_active_connection", return_value=None
        ):
            conn_req, source = connection_store.resolve_trino_connection_request(db=object())

        self.assertEqual(source, "env")
        self.assertEqual(conn_req.host, "env-host")
        self.assertTrue(conn_req.ssl_enabled)

    def test_env_never_reads_saved_connection(self):
        with patch.object(settings, "TRINO_CONNECTION_SOURCE", "env"), patch.object(
            settings, "ALLOW_SAVED_CONNECTIONS", True
        ), patch.object(
            settings, "TRINO_HOST", "env-only-host"
        ), patch.object(
            connection_store, "get_active_connection"
        ) as get_active_connection:
            conn_req, source = connection_store.resolve_trino_connection_request(db=object())

        self.assertEqual(source, "env")
        self.assertEqual(conn_req.host, "env-only-host")
        get_active_connection.assert_not_called()

    def test_auto_uses_environment_when_saved_connections_are_disabled(self):
        with patch.object(settings, "TRINO_CONNECTION_SOURCE", "auto"), patch.object(
            settings, "ALLOW_SAVED_CONNECTIONS", False
        ), patch.object(
            settings, "TRINO_HOST", "env-disabled-saved-host"
        ), patch.object(
            connection_store, "get_active_connection"
        ) as get_active_connection:
            conn_req, source = connection_store.resolve_trino_connection_request(db=object())

        self.assertEqual(source, "env")
        self.assertEqual(conn_req.host, "env-disabled-saved-host")
        get_active_connection.assert_not_called()

    def test_saved_requires_an_active_saved_connection(self):
        with patch.object(settings, "TRINO_CONNECTION_SOURCE", "saved"), patch.object(
            settings, "ALLOW_SAVED_CONNECTIONS", True
        ), patch.object(connection_store, "get_active_connection", return_value=None):
            with self.assertRaisesRegex(ValueError, "requires an active saved connection"):
                connection_store.resolve_trino_connection_request(db=object())

    def test_saved_policy_cannot_disable_saved_connections(self):
        with self.assertRaisesRegex(ValueError, "requires ALLOW_SAVED_CONNECTIONS=true"):
            Settings(
                _env_file=None,
                TRINO_CONNECTION_SOURCE="saved",
                ALLOW_SAVED_CONNECTIONS=False,
            )


if __name__ == "__main__":
    unittest.main()
