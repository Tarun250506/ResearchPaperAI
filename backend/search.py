
import os
from dotenv import load_dotenv
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer

# Load API key
load_dotenv()
api_key = os.getenv("PINECONE_API_KEY")

# Connect to Pinecone
pc = Pinecone(api_key=api_key)
index = pc.Index("researchpaper-ai")

# Load the same embedding model used during ingestion
model = SentenceTransformer("all-MiniLM-L6-v2")


def search_papers(question, top_k=5):
    # Convert the question into a vector
    query_embedding = model.encode(
        question,
        normalize_embeddings=True
    ).tolist()

    # Search Pinecone for similar chunks
    results = index.query(
        vector=query_embedding,
        top_k=top_k,
        include_metadata=True
    )

    # Display results
    print(f"\nQuestion: {question}")
    print("=" * 70)

    if not results.matches:
        print("No relevant passages found.")
        return

    for rank, match in enumerate(results.matches, start=1):
        metadata = match.metadata or {}

        print(f"\nResult {rank}")
        print(f"Paper: {metadata.get('paper', 'Unknown')}")
        print(f"Page: {metadata.get('page', 'Unknown')}")
        print(f"Similarity score: {match.score:.4f}")
        print(f"Text:\n{metadata.get('text', 'No text available')}")
        print("-" * 70)


if __name__ == "__main__":
    question = input("Ask a question about your research papers: ").strip()

    if question:
        search_papers(question)
    else:
        print("Please enter a question.")
