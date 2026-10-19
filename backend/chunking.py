
from pathlib import Path
import pymupdf

PAPERS_DIR = Path(__file__).parent / "data" / "papers"

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200


def split_text(text, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    """Split text into overlapping character-based chunks."""
    chunks = []
    start = 0

    while start < len(text):
        end = min(start + chunk_size, len(text))

        # Prefer ending at a word boundary
        if end < len(text):
            boundary = text.rfind(" ", start, end)
            if boundary > start:
                end = boundary

        chunk = text[start:end].strip()

        if chunk:
            chunks.append(chunk)

        if end == len(text):
            break

        start = max(end - overlap, start + 1)

    return chunks


def chunk_single_pdf(pdf_path, paper_name=None):
    """Extract and chunk one PDF, returning its page metadata."""
    pdf_path = Path(pdf_path)
    paper_name = paper_name or pdf_path.name
    all_chunks = []

    with pymupdf.open(pdf_path) as document:
        for page_number, page in enumerate(document, start=1):
            text = page.get_text().strip()

            if not text:
                continue

            page_chunks = split_text(text)

            for chunk_number, chunk_text in enumerate(
                page_chunks, start=1
            ):
                all_chunks.append({
                    "paper": paper_name,
                    "page": page_number,
                    "chunk_id": (
                        f"{pdf_path.stem}_p{page_number}_c{chunk_number}"
                    ),
                    "text": chunk_text,
                })

    return all_chunks


def chunk_pdfs():
    """Chunk all PDFs in the existing papers directory."""
    pdf_files = sorted(PAPERS_DIR.glob("*.pdf"))
    all_chunks = []

    for pdf_path in pdf_files:
        all_chunks.extend(chunk_single_pdf(pdf_path))

    return all_chunks


if __name__ == "__main__":
    chunks = chunk_pdfs()

    print(f"Total chunks created: {len(chunks)}")

    for chunk in chunks[:5]:
        print("\n" + "=" * 60)
        print(f"Paper: {chunk['paper']}")
        print(f"Page: {chunk['page']}")
        print(f"Chunk ID: {chunk['chunk_id']}")
        print(f"Text: {chunk['text'][:300]}")
