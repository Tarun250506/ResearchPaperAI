
import os
from dotenv import load_dotenv
from pinecone import Pinecone
from embeddings import generate_embeddings

# Load API key from .env
load_dotenv()
api_key = os.getenv("PINECONE_API_KEY")

if not api_key:
    raise ValueError("PINECONE_API_KEY not found in .env")

# Connect to Pinecone
pc = Pinecone(api_key=api_key)
index = pc.Index("researchpaper-ai")


def upload_vectors():
    print("Generating embeddings...")
    result = generate_embeddings()

    if result is None:
        print("No embeddings generated.")
        return

    chunks, embeddings = result

    # Prepare vectors for Pinecone
    vectors = []

    for chunk, embedding in zip(chunks, embeddings):
        vectors.append({
            "id": chunk["chunk_id"],
            "values": embedding.tolist(),
            "metadata": {
                "paper": chunk["paper"],
                "page": chunk["page"],
                "chunk_id": chunk["chunk_id"],
                "text": chunk["text"],
            },
        })

    # Upload in batches of 100
    batch_size = 100

    for start in range(0, len(vectors), batch_size):
        batch = vectors[start:start + batch_size]
        index.upsert(vectors=batch)

        uploaded = min(start + batch_size, len(vectors))
        print(f"Uploaded {uploaded}/{len(vectors)} vectors")

    print("\nUpload complete!")
    print(index.describe_index_stats())


if __name__ == "__main__":
    upload_vectors()
    