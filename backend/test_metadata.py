import urllib.request
import json
import urllib.error
from app.core.config import settings

base_url = f"{settings.BACKEND_PUBLIC_URL}{settings.API_V1_STR}/metadata"

# 1. Discover Metadata
print("Testing /discover...")
try:
    req = urllib.request.Request(f"{base_url}/discover", method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as res:
        data = res.read().decode("utf-8")
        print("Discover success!")
        # print first 200 chars
        print(data[:200])
except urllib.error.URLError as e:
    print(f"Error: {e.read().decode('utf-8') if hasattr(e, 'read') else e}")
except Exception as e:
    print(f"Exception: {e}")

# 2. Get Schema
print("\nTesting /schema...")
try:
    req = urllib.request.Request(f"{base_url}/schema", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as res:
        data = res.read().decode("utf-8")
        print("Schema GET success!")
        print(data[:200])
except urllib.error.URLError as e:
    print(f"Error: {e.read().decode('utf-8') if hasattr(e, 'read') else e}")
except Exception as e:
    print(f"Exception: {e}")
