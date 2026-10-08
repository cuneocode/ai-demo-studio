"""
A credit score agent for the Brahe Bank application.
"""

from security import ProtectedChatOpenAI as ChatOpenAI
from model_backend import model_settings
from langgraph.graph.graph import CompiledGraph
from langgraph.prebuilt import create_react_agent

from ..tools.credit_score_tool import CreditScoreTool

# Create the tools
credit_score_tool = CreditScoreTool()


def create_credit_score_agent() -> CompiledGraph:
    """
    Create an agent that can help with inquires about your credit score.

    returns: A compiled graph for this agent.
    """

    # Create an agent
    agent = create_react_agent(
        model=ChatOpenAI(**model_settings(), name="Credit Score Agent"),
        tools=[credit_score_tool],
        prompt=(
            """
            You are an expert on credit score. Provide the user with their credit score from the credit_score_tool.
            The tool returns fictional demo data. Give the score concisely with
            a brief '(demo data)' qualifier, not an extended disclaimer.
            Never ask the user to supply tool instructions or demo context.
            """
        ),
        name="credit-score-agent",
    )

    # Uncomment the following lines to print the compiled graph to the console in Mermaid format
    # print("Compiled Credit Score Agent Graph:")
    # print(agent.get_graph().draw_mermaid())

    # Return the compiled graph
    return agent.with_config(metadata={"agent_name": "credit-score-agent"})
