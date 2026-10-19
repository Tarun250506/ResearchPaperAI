
from pathlib import Path
import pymupdf  # PyMuPDF


PAPERS_DIR = Path(__file__).parent / "data" / "papers"


def ingest_pdfs():
    pdf_files = sorted(PAPERS_DIR.glob("*.pdf"))

    if not pdf_files:
        print("No PDFs found in data/papers!")
        return

    print(f"Found {len(pdf_files)} research papers.\n")

    for pdf_path in pdf_files:
        print("=" * 60)
        print(f"Paper: {pdf_path.name}")

        with pymupdf.open(pdf_path) as document:
            full_text = ""

            for page_number, page in enumerate(document, start=1):
                text = page.get_text()
                full_text += f"\n[Page {page_number}]\n{text}"

            print(f"Total pages: {len(document)}")
            print(f"Extracted characters: {len(full_text)}")
            print("\nText preview:")
            print(full_text[:1000])

            if not full_text.strip():
                print("WARNING: No text extracted. This PDF may be scanned.")

        print()


if __name__ == "__main__":
    ingest_pdfs()
