
from sentence_transformers import SentenceTransformer
from chunking import chunk_pdfs, chunk_single_pdf

# Load the local embedding model
model = SentenceTransformer("all-MiniLM-L6-v2")


def embed_chunks(chunks):
    """Generate embeddings for a supplied list of chunks."""
    if not chunks:
        print("No chunks found.")
        return None

    texts = [chunk["text"] for chunk in chunks]

    embeddings = model.encode(
        texts,
        batch_size=32,
        show_progress_bar=True,
        normalize_embeddings=True,
    )

    print("\nEmbedding generation complete!")
    print(f"Total chunks: {len(chunks)}")
    print(f"Embedding shape: {embeddings.shape}")

    return chunks, embeddings


def generate_embeddings():
    """Generate embeddings for all existing papers."""
    chunks = chunk_pdfs()
    return embed_chunks(chunks)


def generate_embeddings_for_pdf(pdf_path, paper_name=None):
    """Generate embeddings for one uploaded PDF."""
    chunks = chunk_single_pdf(pdf_path, paper_name)
    return embed_chunks(chunks)


if __name__ == "__main__":
    generate_embeddings()
