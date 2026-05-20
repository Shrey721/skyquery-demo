import sys
sys.path.insert(0, r'd:\csasdsa\.vscode\skyquery\backend')

from app.db.database import SessionLocal
from app.services.metadata_service import discover_and_cache_metadata, get_cached_metadata
from app.services.entity_resolution_service import extract_entities
from app.services.relationship_inference_service import infer_relationships
from app.services.table_selector import select_tables
import asyncio

async def test_all():
    db = SessionLocal()
    try:
        print("Discovering and caching metadata (including sampling)...")
        metadata = discover_and_cache_metadata(db)
        print("Metadata discovered successfully.")
        
        cached = get_cached_metadata()
        print("\n--- SAMPLE VALUES DISCOVERED ---")
        for table in cached.tables:
            print(f"Table: {table.table_name}")
            for col in table.columns:
                if col.sample_values:
                    print(f"  Column: {col.name} ({col.data_type}) -> Samples: {col.sample_values}")
                    
        # Test Entity Resolution
        question = "How many delayed flights from Delhi?"
        print(f"\n--- TESTING ENTITY RESOLUTION WITH QUESTION: '{question}' ---")
        entities = extract_entities(question, cached)
        print("Matched Entities:", entities)
        
        # Test Relationship Inference
        print("\n--- TESTING RELATIONSHIP INFERENCE ---")
        relations = infer_relationships(cached)
        print("Inferred Relationships:")
        for r in relations:
            print(f"  {r['source_table']}.{r['source_column']} <-> {r['target_table']}.{r['target_column']} ({r['reason']})")
            
        # Test Table Selection
        import json
        schema_dict = json.loads(cached.model_dump_json())
        print("\n--- TESTING TABLE SELECTOR ---")
        selected = await select_tables(question, schema_dict, matched_entities=entities)
        print("Selected Tables:", selected)
        
        # Test full NLtoSQLPipeline
        import redis
        from app.pipeline.nl_sql_pipeline import NLtoSQLPipeline
        r = redis.Redis.from_url('redis://localhost:6379/0', decode_responses=True)
        # Find active token key
        token_keys = r.keys('copilot_token:*')
        if token_keys:
            token_key = token_keys[0]
            token = r.get(token_key)
            print(f"\n--- TESTING NLtoSQLPipeline WITH TOKEN {token_key} ---")
            pipeline = NLtoSQLPipeline()
            res = await pipeline.process(question, session_id="test_session", copilot_token=token)
            print("\nRESULT SQL:")
            print(res.get("sql"))
            print("\nRESULT SUMMARY:")
            print(res.get("summary"))
            print("\nRESULT ROWS:")
            print(res.get("execution", {}).get("rows"))
        else:
            print("No Copilot Token found in Redis. Skipping full pipeline test.")
        
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(test_all())
