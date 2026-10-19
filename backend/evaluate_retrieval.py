
from rag import retrieve_context

TEST_QUESTIONS = [
    "How does volatility affect asset returns?",
    "How does regime uncertainty differ from conventional volatility?",
    "What does the research say about inflation and stock returns?",
    "How does quantitative investing affect stock price crash risk?",
    "What is the role of the Ito correction in predicting returns?",
]


def evaluate_retrieval():
    print("\nRESEARCHPAPER AI — RETRIEVAL EVALUATION")
    print("=" * 75)

    for question in TEST_QUESTIONS:
        print(f"\nQUESTION: {question}")
        print("-" * 75)

        passages = retrieve_context(question)

        if not passages:
            print("No passages retrieved.")
            continue

        for rank, passage in enumerate(passages, start=1):
            print(
                f"{rank}. {passage['paper']} | "
                f"Page {passage['page']} | "
                f"Score: {passage['score']:.4f}"
            )

        distinct_papers = {
            passage["paper"] for passage in passages
        }

        print(
            f"\nRetrieved {len(passages)} passages "
            f"from {len(distinct_papers)} distinct papers."
        )


if __name__ == "__main__":
    evaluate_retrieval()
