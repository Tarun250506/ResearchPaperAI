import os
from dotenv import load_dotenv
from pinecone import Pinecone

load_dotenv()

api_key = os.getenv("PINECONE_API_KEY")

if not api_key:
    raise ValueError("PINECONE_API_KEY not found in .env")

pc = Pinecone(api_key=api_key)

index = pc.Index("researchpaper-ai")

print(index.describe_index_stats())