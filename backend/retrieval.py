
import os

from dotenv import load_dotenv
from pinecone import Pinecone
from embeddings import model

load_dotenv()

PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")

if not PINECONE_API_KEY:
    raise ValueError("PINECONE_API_KEY not found in .env")

pc = Pinecone(api_key=PINECONE_API_KEY)
index = pc.Index("researchpaper-ai")


def retrieve_chunks(question, top_k=5, document_id=None):
    """
    Retrieve the most relevant paper chunks for a question.

    If document_id is supplied, only retrieve chunks belonging
    to that document.
    """
    question_embedding = model.encode(
        question,
        normalize_embeddings=True,
    ).tolist()

    query_options = {
        "vector": question_embedding,
        "top_k": top_k,
        "include_metadata": True,
    }

    if document_id:
        query_options["filter"] = {
            "document_id": {"$eq": document_id}
        }

    results = index.query(**query_options)

    retrieved_chunks = []

    for match in results.matches:
        metadata = match.metadata or {}

        retrieved_chunks.append({
            "text": metadata.get("text", ""),
            "paper": metadata.get("paper", "Unknown paper"),
            "page": metadata.get("page", "Unknown"),
            "document_id": metadata.get("document_id"),
            "score": match.score,
        })

    return retrieved_chunks


if __name__ == "__main__":
    question = input("Ask a question about your research papers: ")

    chunks = retrieve_chunks(question)

    for i, chunk in enumerate(chunks, start=1):
        print(f"\n--- Result {i} ---")
        print(f"Paper: {chunk['paper']}")
        print(f"Page: {chunk['page']}")
        print(f"Score: {chunk['score']}")
        print(chunk["text"])
