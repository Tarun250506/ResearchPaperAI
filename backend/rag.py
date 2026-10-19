
import os
from dotenv import load_dotenv
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer
import ollama

# ==================================================
# 1. CONFIGURATION
# ==================================================

load_dotenv()

api_key = os.getenv("PINECONE_API_KEY")

if not api_key:
    raise ValueError(
        "PINECONE_API_KEY not found. Check your .env file."
    )

INDEX_NAME = "researchpaper-ai"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
LLM_MODEL = "qwen2.5:1.5b"

# Retrieval settings
TOP_K = 5
CANDIDATE_COUNT = 30
MAX_PER_PAPER = 2
MIN_SIMILARITY = 0.30

# ==================================================
# 2. CONNECT TO PINECONE
# ==================================================

print("Connecting to Pinecone...")

pc = Pinecone(api_key=api_key)
index = pc.Index(INDEX_NAME)

# ==================================================
# 3. LOAD EMBEDDING MODEL
# ==================================================

print("Loading embedding model...")

embedding_model = SentenceTransformer(EMBEDDING_MODEL)

# ==================================================
# 4. RETRIEVE RELEVANT PASSAGES
# ==================================================

def retrieve_context(question, top_k=TOP_K):
    """Retrieve relevant passages with less redundancy."""

    question_embedding = embedding_model.encode(
        question,
        normalize_embeddings=True
    ).tolist()

    results = index.query(
        vector=question_embedding,
        top_k=CANDIDATE_COUNT,
        include_metadata=True
    )

    passages = []
    papers_seen = {}
    pages_seen = set()

    for match in results.matches:
        metadata = match.metadata or {}

        text = metadata.get("text", "")
        paper = metadata.get("paper", "Unknown paper")
        page = metadata.get("page", "Unknown page")
        score = match.score

        if not text:
            continue

        # Skip passages below the configured score threshold
        if score is None or score < MIN_SIMILARITY:
            continue

        # Limit the number of passages from each paper
        if papers_seen.get(paper, 0) >= MAX_PER_PAPER:
            continue

        # Avoid selecting multiple chunks from the same page
        page_key = (paper, page)

        if page_key in pages_seen:
            continue

        passages.append({
            "text": text,
            "paper": paper,
            "page": page,
            "score": score
        })

        papers_seen[paper] = papers_seen.get(paper, 0) + 1
        pages_seen.add(page_key)

        if len(passages) >= top_k:
            break

    return passages


# ==================================================
# 5. GENERATE AN ANSWER USING QWEN
# ==================================================

def generate_answer(question):
    """Generate an answer grounded in retrieved passages."""

    print("\nSearching research papers...")

    passages = retrieve_context(question)

    if not passages:
        print(
            "\nNo sufficiently similar passages were found. "
            "Try rephrasing your question."
        )
        return

    # Build context with source labels
    context_parts = []

    for i, passage in enumerate(passages, start=1):
        context_parts.append(
            f"[Source {i}]\n"
            f"Paper: {passage['paper']}\n"
            f"Page: {passage['page']}\n"
            f"Similarity: {passage['score']:.4f}\n"
            f"Passage:\n{passage['text']}\n"
        )

    context = "\n".join(context_parts)

    prompt = f"""
You are ResearchPaper AI, an assistant for academic research
and quantitative finance.

Answer the user's question using the supplied research passages.

IMPORTANT RULES:
1. Base factual claims about these papers only on the passages.
2. Do not invent research findings, quotations, or citations.
3. Cite supporting claims using the exact paper filename and
   page number provided in the sources.
4. Distinguish a paper's reported findings from general theory.
5. If sources disagree, explain the disagreement.
6. Do not claim that correlation proves causation.
7. Do not generalize one paper's result to all financial markets.
8. If the evidence is insufficient, say so explicitly.
9. Write a clear, structured answer.
10. Do not cite a source unless it supports the claim.

RETRIEVED RESEARCH PASSAGES:

{context}

USER QUESTION:
{question}

Provide your answer with appropriate paper and page citations.
"""

    print("Generating answer with Qwen...\n")

    response = ollama.chat(
        model=LLM_MODEL,
        messages=[
            {
                "role": "user",
                "content": prompt
            }
        ],
        options={
            "temperature": 0.2,
            "num_ctx": 4096
        }
    )

    print("=" * 70)
    print("RESEARCHPAPER AI — ANSWER")
    print("=" * 70)
    print(response["message"]["content"])

    # Display the actual retrieved evidence
    print("\n" + "=" * 70)
    print("RETRIEVED SOURCES")
    print("=" * 70)

    for i, passage in enumerate(passages, start=1):
        print(f"\nResult {i}")
        print(f"Paper: {passage['paper']}")
        print(f"Page: {passage['page']}")
        print(f"Similarity: {passage['score']:.4f}")
        print("-" * 50)
        print(passage["text"][:500])

    print("\n" + "=" * 70)


# ==================================================
# 6. MAIN PROGRAM
# ==================================================

if __name__ == "__main__":
    try:
        question = input(
            "\nAsk ResearchPaper AI a question: "
        ).strip()

        if question:
            generate_answer(question)
        else:
            print("Please enter a question.")

    except KeyboardInterrupt:
        print("\nResearchPaper AI stopped.")
