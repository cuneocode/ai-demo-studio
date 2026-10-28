"""
A tool for retrieving information from the Pinecone vector database.
"""

from typing_extensions import override
import os
import re
from pathlib import Path

from langchain.tools import BaseTool
from langchain_pinecone import PineconeVectorStore
from langchain_openai import OpenAIEmbeddings
from pydantic import BaseModel, Field


class RetrievalInput(BaseModel):
    """
    RetrievalInput is a Pydantic model representing the input schema for a document retrieval operation.
    Attributes:
        query (str): The search query used to find relevant documents.
        k (int, optional): The number of documents to retrieve. Defaults to 3.
    """

    query: str = Field(description="The search query to find relevant documents")
    k: int = Field(default=5, ge=1, le=8, description="Number of documents to retrieve")


class PineconeRetrievalTool(BaseTool):
    """
    PineconeRetrievalTool is a tool for retrieving relevant information from a financial services knowledge base using Pinecone as a vector store.
    """

    name: str = "pinecone_retrieval"
    description: str = "Retrieve relevant information from the financial services knowledge base"
    args_schema: type[BaseModel] = RetrievalInput  # type: ignore

    def __init__(self, index_name: str):
        super().__init__()
        self._embeddings = OpenAIEmbeddings() if os.getenv("PINECONE_API_KEY") else None
        self._index_name = index_name
        self._vector_store = PineconeVectorStore(index_name=self._index_name, embedding=self._embeddings) if self._embeddings else None

    @override
    def _run(self, query: str, k: int = 5) -> str:
        """Execute the retrieval"""
        try:
            if self._vector_store is None:
                # Explicit local lexical retrieval: no vector/GPU claim. The source
                # docs are the upstream fictional bank's product terms.
                from langchain_core.documents import Document
                words = set(re.findall(r"[a-z0-9]+", query.lower()))
                root = Path(__file__).resolve().parents[3] / "source-docs" / "credit-cards"
                docs = [Document(page_content=p.read_text(), metadata={"source": p.name}) for p in sorted(root.glob("*.md"))]
                results = sorted(docs, key=lambda d: sum(min(d.page_content.lower().count(w), 4) for w in words), reverse=True)[:k]
            else:
                results = self._vector_store.similarity_search(query, k=k)
            # Perform similarity search

            if not results:
                return "No relevant information found in the knowledge base."

            # Format the results
            formatted_results = []
            for i, doc in enumerate(results, 1):
                source = str(doc.metadata.get('source', 'Bank product documentation')).split('/')[-1]
                formatted_results.append(f"Document {i} — {source}:\n{doc.page_content}\n")

            return "\n".join(formatted_results)

        except Exception:
            raise RuntimeError("Product retrieval is unavailable. Try again shortly.") from None
