import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dotenv import load_dotenv
load_dotenv()

import asyncio
from app.executors.starburst_executor import StarburstExecutor

async def main():
    executor = StarburstExecutor()
    print("\n--- SHOW CATALOGS ---")
    catalogs = await executor.execute('SHOW CATALOGS')
    print(catalogs)
    
    print("\n--- SELECT FROM AIRPORTS ---")
    try:
        airports = await executor.execute('SELECT * FROM postgres.public.airports LIMIT 5')
        print(airports)
    except Exception as e:
        print("Failed to query airports:", e)

if __name__ == "__main__":
    asyncio.run(main())
