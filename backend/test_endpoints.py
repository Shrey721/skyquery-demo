import urllib.request
import json
from app.core.config import settings

base_url = f"{settings.BACKEND_PUBLIC_URL}{settings.API_V1_STR}/connections"

data = {
    "host": settings.TRINO_HOST,
    "port": settings.TRINO_PORT,
    "catalog": settings.TRINO_DEFAULT_CATALOG,
    "schema": settings.TRINO_DEFAULT_SCHEMA,
    "username": settings.TRINO_USER,
    "password": settings.TRINO_PASSWORD,
    "ssl": settings.TRINO_HTTP_SCHEME == "https",
}

req_data = json.dumps(data).encode("utf-8")

# Test 1: /test-connection
print("Testing /test-connection...")
try:
    req = urllib.request.Request(f"{base_url}/test-connection", data=req_data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        print(res.read().decode("utf-8"))
except urllib.error.URLError as e:
    print(f"Error: {e.read().decode('utf-8') if hasattr(e, 'read') else e}")

# Test 2: /save-connection
print("\nTesting /save-connection...")
try:
    req = urllib.request.Request(f"{base_url}/save-connection", data=req_data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        print(res.read().decode("utf-8"))
except urllib.error.URLError as e:
    print(f"Error: {e.read().decode('utf-8') if hasattr(e, 'read') else e}")

# Test 3: /active-connection
print("\nTesting /active-connection...")
try:
    req = urllib.request.Request(f"{base_url}/active-connection", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        print(res.read().decode("utf-8"))
except urllib.error.URLError as e:
    print(f"Error: {e.read().decode('utf-8') if hasattr(e, 'read') else e}")
