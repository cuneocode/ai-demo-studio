"""
Supervisor Agent for Brahe Bank Application
"""

from security import ProtectedChatOpenAI as ChatOpenAI
from model_backend import model_settings
from langgraph_supervisor import create_supervisor
from langgraph.checkpoint.memory import InMemorySaver

from .credit_score_agent import create_credit_score_agent
from .credit_card_information_agent import create_credit_card_information_agent


def create_supervisor_agent():
    """
    Create a supervisor agent that manages all the agents in the Brahe Bank application.
    """
    bank_supervisor_agent = create_supervisor(
        model=ChatOpenAI(**model_settings(), name="Supervisor"),
        agents=[create_credit_card_information_agent(), create_credit_score_agent()],
        prompt=(
            """
            You are a supervisor managing the following agents:
            - a credit card information agent. Assign any tasks related to information about credit cards to this agent
            - a credit score agent. Always delegate credit score requests to this agent.
            For eligibility, consult BOTH agents: get the score, then retrieve product criteria.
            Scores and products are fictional demo data. Eligibility is illustrative, never approval.
            When reporting a score, preserve a brief '(demo data)' qualifier.
            Keep the answer concise; demo context is your responsibility, not the user's.
            Include document names in product answers. Never invent fees, benefits, rates or scores.
            Never claim to execute payments or applications.
            Otherwise, only respond with 'I don't know' or 'I cannot answer that question'.
            If you need to ask the user for more information, do so in a concise manner.
            """
        ),
        add_handoff_back_messages=True,
        output_mode="full_history",
        supervisor_name="brahe-bank-supervisor-agent",
    ).compile(checkpointer=InMemorySaver())
    bank_supervisor_agent.name = "brahe-bank-supervisor-agent"

    # Uncomment the following lines to print the compiled graph to the console in Mermaid format
    # print("Compiled Bank Supervisor Agent Graph:")
    # print(bank_supervisor_agent.get_graph().draw_mermaid())

    return bank_supervisor_agent
