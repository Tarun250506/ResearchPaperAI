
from pydantic import BaseModel
from typing import List
from retrieval import retrieve_chunks
import requests
from pathlib import Path
from uuid import uuid4
import shutil
import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY not found in .env")

gemini_client = genai.Client(api_key=GEMINI_API_KEY)
GEMINI_MODEL = "gemini-3.5-flash"

import pymupdf
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from upload_single_pdf import upload_single_pdf


app = FastAPI(
    title="ResearchPaper AI API",
    description="Backend API for research paper uploads, "
                "question answering, paper comparison, "
                "and literature review generation",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "https://research-paper-3gdgmpn5i-vijantarun25-3851.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path(__file__).parent / "data" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "qwen2.5:1.5b"


# --------------------------------------------------
# HOME AND HEALTH
# --------------------------------------------------

@app.get("/")
def home():
    return {
        "message": "ResearchPaper AI API is running",
        "status": "online",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "ResearchPaper AI",
    }


# --------------------------------------------------
# SHARED LLM HELPER
# --------------------------------------------------


def generate_with_gemini(prompt: str) -> str:
    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        )

        answer = (response.text or "").strip()

        if not answer:
            raise HTTPException(
                status_code=502,
                detail="Gemini returned an empty response.",
            )

        return answer

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini generation failed: {str(exc)}",
        ) from exc



# --------------------------------------------------
# PDF UPLOAD
# --------------------------------------------------

@app.post("/upload")
async def upload_paper(file: UploadFile = File(...)):
    original_name = Path(file.filename or "").name

    if not original_name:
        raise HTTPException(
            status_code=400,
            detail="No filename was provided.",
        )

    if not original_name.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are allowed.",
        )

    document_id = str(uuid4())
    destination = UPLOAD_DIR / f"{document_id}.pdf"

    try:
        with destination.open("wb") as output:
            shutil.copyfileobj(file.file, output)

        try:
            with pymupdf.open(destination) as document:
                if len(document) == 0:
                    raise HTTPException(
                        status_code=422,
                        detail="The PDF contains no pages.",
                    )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail="The uploaded file is not a valid, readable PDF.",
            ) from exc

        vector_count = upload_single_pdf(
            destination,
            paper_name=original_name,
            document_id=document_id,
        )

        if not vector_count:
            raise HTTPException(
                status_code=422,
                detail=(
                    "No readable text was found in this PDF. "
                    "Scanned PDFs may require OCR."
                ),
            )

        return {
            "message": "PDF uploaded and indexed successfully.",
            "filename": original_name,
            "document_id": document_id,
            "vectors_uploaded": vector_count,
        }

    except HTTPException:
        destination.unlink(missing_ok=True)
        raise

    except Exception as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=500,
            detail=f"PDF processing failed: {str(exc)}",
        ) from exc

    finally:
        await file.close()


# --------------------------------------------------
# REQUEST MODELS
# --------------------------------------------------

class AskRequest(BaseModel):
    question: str


class CompareRequest(BaseModel):
    document_ids: List[str]


class LiteratureReviewRequest(BaseModel):
    document_ids: List[str]
    research_topic: str


# --------------------------------------------------
# SHARED PAPER RETRIEVAL HELPER
# --------------------------------------------------

def get_paper_context(
    document_ids: List[str],
    search_query: str,
    top_k_per_paper: int = 5,
):
    """
    Retrieve relevant chunks separately for each selected paper.
    This prevents selected-paper features from mixing in chunks
    belonging to other documents.
    """

    all_chunks = []
    seen = set()

    for document_id in document_ids:
        chunks = retrieve_chunks(
            search_query,
            top_k=top_k_per_paper,
            document_id=document_id,
        )

        for chunk in chunks:
            key = (
                chunk.get("document_id"),
                chunk.get("page"),
                chunk.get("text"),
            )

            if key not in seen:
                seen.add(key)
                all_chunks.append(chunk)

    return all_chunks


def format_context(chunks):
    sections = []

    for chunk in chunks:
        sections.append(
            f"Paper: {chunk.get('paper', 'Unknown paper')}\n"
            f"Page: {chunk.get('page', 'Unknown')}\n"
            f"Evidence:\n{chunk.get('text', '')}"
        )

    return "\n\n---\n\n".join(sections)


def format_sources(chunks):
    sources = []
    seen = set()

    for chunk in chunks:
        source = {
            "paper": chunk.get("paper", "Unknown paper"),
            "page": chunk.get("page", "Unknown"),
            "score": chunk.get("score"),
            "text": chunk.get("text", ""),
        }

        key = (source["paper"], source["page"], source["text"])

        if key not in seen:
            seen.add(key)
            sources.append(source)

    return sources


def validate_document_ids(document_ids, minimum=1, maximum=6):
    cleaned_ids = [
        document_id.strip()
        for document_id in document_ids
        if document_id and document_id.strip()
    ]

    if len(cleaned_ids) != len(document_ids):
        raise HTTPException(
            status_code=400,
            detail="Document IDs cannot be empty.",
        )

    if len(set(cleaned_ids)) != len(cleaned_ids):
        raise HTTPException(
            status_code=400,
            detail="Please select each paper only once.",
        )

    if not minimum <= len(cleaned_ids) <= maximum:
        raise HTTPException(
            status_code=400,
            detail=f"Select between {minimum} and {maximum} papers.",
        )

    return cleaned_ids


# --------------------------------------------------
# RESEARCH CHAT
# --------------------------------------------------

@app.post("/ask")
def ask_question(request: AskRequest):
    question = request.question.strip()

    if not question:
        raise HTTPException(
            status_code=400,
            detail="Please enter a question.",
        )

    chunks = retrieve_chunks(question, top_k=5)

    if not chunks:
        raise HTTPException(
            status_code=404,
            detail="No relevant passages were found in your papers.",
        )

    context = format_context(chunks)

    prompt = f"""
You are ResearchPaper AI, an academic research assistant.

Answer the question using only the supplied evidence.
Do not invent facts, results, or citations.
If the evidence is insufficient, clearly state that.
Cite sources using their paper names and page numbers.
Distinguish evidence from interpretation.

CONTEXT:
{context}

QUESTION:
{question}

ANSWER:
"""

    answer = generate_with_gemini(prompt)

    return {
        "question": question,
        "answer": answer,
        "sources": format_sources(chunks),
    }


# --------------------------------------------------
# COMPARE PAPERS
# --------------------------------------------------

@app.post("/compare")
def compare_papers(request: CompareRequest):
    document_ids = validate_document_ids(
        request.document_ids,
        minimum=2,
        maximum=6,
    )

    search_query = (
        "research objective research question methodology "
        "methods dataset experiments results findings "
        "contributions limitations assumptions conclusions"
    )

    chunks = get_paper_context(
        document_ids=document_ids,
        search_query=search_query,
        top_k_per_paper=6,
    )

    if not chunks:
        raise HTTPException(
            status_code=404,
            detail=(
                "No indexed passages were found for these papers. "
                "Make sure they were uploaded successfully."
            ),
        )

    context = format_context(chunks)

    prompt = f"""
You are ResearchPaper AI, an academic paper comparison assistant.

Compare the selected research papers using ONLY the evidence
provided below.

Organize your answer under these headings:

1. Overview of Each Paper
2. Research Objectives
3. Methodologies and Approaches
4. Datasets and Experimental Setup
5. Key Findings and Contributions
6. Similarities
7. Differences
8. Strengths and Limitations
9. Research Gaps and Opportunities
10. Overall Comparative Assessment

Instructions:
- Identify papers by their supplied names.
- Use a clear, structured, academic writing style.
- Cite evidence using the paper name and page number.
- Do not invent methodologies, datasets, metrics, or results.
- If information is unavailable, say it was not found in the
  retrieved evidence rather than assuming it does not exist.
- Distinguish explicit findings from your own comparison.
- Do not claim that one paper is better unless the evidence
  supports a specific comparison criterion.
- End with a concise summary of the most important differences.

PAPER EVIDENCE:
{context}

COMPARISON:
"""

    answer = generate_with_gemini(prompt)

    return {
        "message": "Paper comparison generated successfully.",
        "comparison": answer,
        "papers": sorted({
            chunk.get("paper", "Unknown paper")
            for chunk in chunks
        }),
        "sources": format_sources(chunks),
    }


# --------------------------------------------------
# LITERATURE REVIEW
# --------------------------------------------------

@app.post("/literature-review")
def generate_literature_review(
    request: LiteratureReviewRequest,
):
    document_ids = validate_document_ids(
        request.document_ids,
        minimum=1,
        maximum=6,
    )

    research_topic = request.research_topic.strip()

    if not research_topic:
        raise HTTPException(
            status_code=400,
            detail="Please provide a research topic.",
        )

    search_query = (
        f"{research_topic} research objectives background "
        "related work methodology findings results "
        "limitations conclusions research gaps future work"
    )

    chunks = get_paper_context(
        document_ids=document_ids,
        search_query=search_query,
        top_k_per_paper=8,
    )

    if not chunks:
        raise HTTPException(
            status_code=404,
            detail=(
                "No indexed passages were found for these papers. "
                "Make sure they were uploaded successfully."
            ),
        )

    context = format_context(chunks)

    prompt = f"""
You are ResearchPaper AI, an academic literature review assistant.

Write a structured literature review on this topic:

{research_topic}

Use ONLY the supplied evidence from the selected papers.

Organize the review under these headings:

1. Title
2. Introduction and Research Background
3. Thematic Review of Existing Literature
4. Comparison and Synthesis of Prior Research
5. Agreements and Contradictions in the Literature
6. Research Gaps
7. Future Research Directions
8. Conclusion
9. References to the Supplied Papers

Instructions:
- Synthesize findings across papers instead of merely
  summarizing one paper at a time.
- Explain how the studies relate to each other.
- Cite claims inline using the supplied paper names and page
  numbers, for example: (Paper Name, p. 4).
- Include only papers and claims supported by the evidence.
- Do not fabricate authors, publication years, titles, DOIs,
  statistics, or bibliographic information.
- If author or publication details are not supplied, use the
  paper filename/name and available page references.
- Clearly distinguish evidence from interpretation.
- Do not describe a topic as an established research gap unless
  the supplied evidence supports that conclusion. Qualify
  possible gaps as tentative when appropriate.
- If the retrieved evidence is insufficient for a section,
  acknowledge the limitation rather than inventing details.
- Use formal academic language and coherent paragraphs.
- Do not claim that this is an exhaustive review of all
  published literature. It covers only the selected papers
  and retrieved evidence.

SUPPLIED PAPER EVIDENCE:
{context}

LITERATURE REVIEW:
"""

    answer = generate_with_gemini(prompt)

    return {
        "message": "Literature review generated successfully.",
        "research_topic": research_topic,
        "literature_review": answer,
        "papers": sorted({
            chunk.get("paper", "Unknown paper")
            for chunk in chunks
        }),
        "sources": format_sources(chunks),
    }
