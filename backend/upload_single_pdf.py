
import os
from dotenv import load_dotenv
from pinecone import Pinecone
from embeddings import generate_embeddings_for_pdf

load_dotenv()

api_key = os.getenv("PINECONE_API_KEY")

if not api_key:
    raise ValueError("PINECONE_API_KEY not found in .env")

pc = Pinecone(api_key=api_key)
index = pc.Index("researchpaper-ai")


def upload_single_pdf(pdf_path, paper_name=None, document_id=None):
    """Embed one PDF and upload uniquely identified vectors to Pinecone."""
    result = generate_embeddings_for_pdf(pdf_path, paper_name)

    if result is None:
        print("No embeddings generated.")
        return 0

    chunks, embeddings = result
    vectors = []

    for chunk, embedding in zip(chunks, embeddings):
        # Keep existing chunk IDs when no document ID is supplied.
        if document_id:
            vector_id = f"{document_id}_{chunk['chunk_id']}"
        else:
            vector_id = chunk["chunk_id"]

        vectors.append({
            "id": vector_id,
            "values": embedding.tolist(),
            "metadata": {
                "paper": chunk["paper"],
                "page": chunk["page"],
                "chunk_id": chunk["chunk_id"],
                "document_id": document_id or "legacy",
                "text": chunk["text"],
            },
        })

    batch_size = 100

    for start in range(0, len(vectors), batch_size):
        batch = vectors[start:start + batch_size]
        index.upsert(vectors=batch)

    print(
        f"Uploaded {len(vectors)} vectors for "
        f"{paper_name or os.path.basename(pdf_path)}"
    )

    return len(vectors)
