import urllib.request
import json

base_url = "http://127.0.0.1:8000/api/v1/connections"

data = {
    "host": "localhost",
    "port": 8081,
    "catalog": "postgres",
    "schema": "public",
    "username": "trino",
    "password": "",
    "ssl": False
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
