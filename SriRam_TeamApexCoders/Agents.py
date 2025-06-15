import os
import random
import re
import io
import contextlib
import json
import uuid # NEW: For generating session IDs
from datetime import datetime # NEW: For timestamps in summaries
from typing import Literal, List, Dict, Any, Optional
from pydantic import BaseModel, Field, ValidationError # NEW: Import ValidationError

# LangChain imports
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.document_loaders import PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from dotenv import load_dotenv

load_dotenv()
# --- Global Declarations ---
# Ensure API key is set in environment variables
# os.environ["GROQ_API_KEY"] = "YOUR_GROQ_API_KEY" # Uncomment and set if not in env

llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.7)
embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)

# Instantiate the RAGQuestionSelector globally
question_selector = None # Initialize as None, will be set up in run_dsa_coach

# NEW: Instantiate SessionDB globally
session_db = None

# --- Pydantic Models for State and Data Extraction ---

class UserProfile(BaseModel):
    """Represents the collected profile information of the user."""
    user_name: Optional[str] = Field(None, description="The name of the user.")
    skill_level: Optional[Literal["Beginner", "Intermediate", "Advanced"]] = Field(None, description="The coding skill level of the user.")
    user_goals: Optional[str] = Field(None, description="The learning goals of the user for DSA practice.")
    complete: bool = Field(False, description="True if all required profile information (name, skill_level, goals) is collected.")
    missing_info: List[str] = Field([], description="List of missing information fields, e.g., ['name', 'skill_level'].")

class CodingQuestion(BaseModel):
    """Structured representation of a coding interview question."""
    title: str = Field(description="Question title/name, e.g., 'Two Sum'.")
    description: str = Field(description="Complete problem description.")
    examples: str = Field(description="Input/output examples, clearly formatted.")
    difficulty: Literal["Easy", "Medium", "Hard"] = Field(description="Problem difficulty.")
    topics: List[str] = Field(description="Relevant topics/tags like arrays, strings, trees, graphs, etc.")
    constraints: Optional[str] = Field(description="Problem constraints if mentioned.")
    hints: List[str] = Field(default_factory=list, description="List of progressive hints for the problem.")
    test_cases: List[Dict[str, Any]] = Field(default_factory=list, description="List of structured test cases for the problem. Each dict should have 'input' and 'expected_output'.")

class QuestionBank(BaseModel):
    """A collection of extracted coding questions."""
    questions: List[CodingQuestion] = Field(description="List of extracted coding questions.")

class MentorAgentOutput(BaseModel):
    """Structured output for the Mentor Agent to guide state transitions."""
    response_for_user: str = Field(description="The message to be displayed to the user.")
    call_question_agent: bool = Field(False, description="Set to True if the Mentor Agent needs to request a question from the Question Making Agent.")
    pass_to_code_agent: bool = Field(False, description="Set to True if the user has provided code and it should be passed to the Code Agent.")
    continue_discussion: bool = Field(False, description="Set to True if the Mentor Agent should continue the discussion with the user (self-loop).")
    provide_hint: bool = Field(False, description="Set to True if the user explicitly asked for a hint.")
    mentor_query_for_question: Optional[Dict[str, Any]] = Field(None, description="Optional dict to pass specific requirements to Question Making Agent (e.g., {'topic': 'arrays', 'difficulty': 'medium'}).")
    next_action_internal: Optional[Literal["process_feedback", "present_question", "await_user_input", "end_session"]] = Field("await_user_input", description="Internal action to control flow without immediate user input: 'process_feedback', 'present_question', 'await_user_input', 'end_session'.")

class CodeExecutionResult(BaseModel):
    """Result of code execution, to be passed between Code, Debug, and Edge Cases Agents."""
    status: Literal["success", "error", "fail_test_cases", "fail_edge_cases", "analysis_needed"] = Field(description="Overall status of the code execution/analysis.")
    stdout: str = Field(default="", description="Standard output from code execution.")
    stderr: str = Field(default="", description="Standard error from code execution.")
    exception: Optional[str] = Field(None, description="Details of the exception if status is 'error'.")
    test_case_results: List[Dict[str, Any]] = Field(default_factory=list, description="List of results for individual test cases. Each dict: {'input': ..., 'expected': ..., 'actual': ..., 'passed': bool, 'error': ...}")
    analysis_feedback: Optional[str] = Field(None, description="Detailed feedback from Debug/Edge Cases Agents.")
    code: Optional[str] = Field(None, description="The code that was executed/analyzed.")

# NEW Pydantic Models for Session Summarization
class SessionSummary(BaseModel):
    """Summarizes a past coaching session."""
    session_id: str = Field(description="Unique identifier for the session.")
    user_id: str = Field(description="Identifier for the user (can be the user's name for now).")
    timestamp: str = Field(description="When the session ended (ISO format).")
    topics_covered: List[str] = Field(default_factory=list, description="List of DSA topics discussed.")
    problems_attempted_titles: List[str] = Field(default_factory=list, description="Titles of problems attempted in this session.")
    problems_solved_titles: List[str] = Field(default_factory=list, description="Titles of problems successfully solved.")
    user_performance_analysis: str = Field(description="An analysis of the user's performance, strengths, and areas for improvement during the session.")
    mentor_insights: str = Field(description="Key observations or personalized advice from the mentor's perspective.")
    raw_chat_history_excerpt: str = Field(description="A brief excerpt or summary of the full chat history for context.")

class UserSessionData(BaseModel):
    """Aggregates all session summaries for a particular user."""
    user_id: str = Field(description="Unique identifier for the user.")
    session_summaries: List[SessionSummary] = Field(default_factory=list, description="List of all past session summaries for this user.")


class DSACoachState(BaseModel):
    """Represents the entire state of the DSA Coach application."""
    messages: List[AIMessage | HumanMessage | SystemMessage] = Field(default_factory=list, description="List of chat messages in the conversation.")
    current_agent: Literal["Introduction Agent", "Mentor Agent", "Question Making Agent", "Code Agent", "Debug Agent", "Edge Cases Agent", "Evaluation Agent", "Summarization Agent"] = "Introduction Agent" # NEW: Added Summarization Agent
    step: int = 0
    waiting_for_input: bool = True # Flag to indicate if the system is waiting for user input
    user_name: Optional[str] = None
    skill_level: Optional[Literal["Beginner", "Intermediate", "Advanced"]] = None
    user_goals: Optional[str] = None
    profile_complete: bool = False
    current_question: Optional[CodingQuestion] = None
    code_input: Optional[str] = None # To store user's code attempt (read from file)
    code_file_path_requested: bool = False # New flag to indicate if we're waiting for a file path
    
    # NEW: Session Management and History
    session_id: str = Field(description="Unique ID for the current coaching session.")
    historical_session_summaries: List[SessionSummary] = Field(default_factory=list, description="Summaries of past sessions for the current user.")
    
    # Performance tracking for Evaluation Agent
    hints_used: int = 0
    attempts_made: int = 0 # Number of times user submitted code
    problems_attempted: int = 0
    problems_solved: int = 0
    
    problem_solved_current_session: bool = False # Flag for current problem
    
    evaluation_summary: Optional[Dict[str, Any]] = None # Now holds data from SessionSummary
    mentor_query_for_question: Optional[Dict[str, Any]] = None
    
    # Mentor Agent specific states
    mentor_state: Literal[
        "awaiting_question", "presenting_question", "discussing_approach",
        "awaiting_code", "providing_hints", "processing_code_feedback",
        "recommending_new_question", "problem_solved_discussion", "session_ending"
    ] = "awaiting_question"
    current_hint_index: int = 0 # To track which hint to provide next
    
    # Code Agent feedback
    last_code_execution_result: Optional[CodeExecutionResult] = None # Store the full execution result
    
    # Question history to avoid immediate repetition
    question_history: List[str] = Field(default_factory=list)


# NEW: Session Database Simulation
class SessionDB:
    def __init__(self, db_file="sessions.json"):
        self.db_file = db_file
        self.data: Dict[str, UserSessionData] = self._load_data()

    def _load_data(self) -> Dict[str, UserSessionData]:
        if not os.path.exists(self.db_file):
            print(f"Database file not found: {self.db_file}. Starting with empty data.")
            return {}
        try:
            with open(self.db_file, 'r') as f:
                raw_data = json.load(f)
                return {
                    user_id: UserSessionData(**user_data)
                    for user_id, user_data in raw_data.items()
                }
        except json.JSONDecodeError as e:
            print(f"Error decoding JSON from {self.db_file}: {e}. Starting with empty data.")
            return {}
        except Exception as e:
            print(f"An unexpected error occurred loading data from {self.db_file}: {e}. Starting with empty data.")
            return {}


    def _save_data(self):
        try:
            with open(self.db_file, 'w') as f:
                json.dump({
                    user_id: user_data.model_dump() # Use .model_dump() for Pydantic models
                    for user_id, user_data in self.data.items()
                }, f, indent=4)
            # print(f"Data saved to {self.db_file}") # Uncomment for debugging
        except Exception as e:
            print(f"Error saving data to {self.db_file}: {e}")

    def get_user_sessions(self, user_id: str) -> Optional[UserSessionData]:
        return self.data.get(user_id)

    def add_session_summary(self, summary: SessionSummary):
        user_id = summary.user_id
        if user_id not in self.data:
            self.data[user_id] = UserSessionData(user_id=user_id, session_summaries=[])
        self.data[user_id].session_summaries.append(summary)
        self._save_data()
        print(f"✅ Session {summary.session_id} for user '{user_id}' saved to DB.")


# --- Question Making Agent Classes ---

class RAGQuestionSelector:
    def __init__(self, pdf_path: str = "coding-interview.pdf"):
        self.pdf_path = pdf_path
        self.vectorstore: Optional[FAISS] = None
        self.question_bank: List[CodingQuestion] = []
        self.setup_rag()
    
    def setup_rag(self):
        """Setup RAG system with PDF"""
        try:
            print("📚 Loading PDF and setting up RAG...")
            if not os.path.exists(self.pdf_path):
                print(f"⚠️ PDF file not found at '{self.pdf_path}'. Skipping RAG setup.")
                # Fallback to hardcoded questions if PDF is missing
                self.question_bank = [
                    self.get_fallback_question("Beginner"),
                    self.get_fallback_question("Intermediate"),
                    self.get_fallback_question("Advanced")
                ]
                print(f"✅ Loaded {len(self.question_bank)} fallback questions.")
                return

            # Load PDF
            loader = PyPDFLoader(self.pdf_path)
            documents = loader.load()
            print(f"✅ Loaded {len(documents)} pages from PDF")
            
            # Split documents into chunks
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=1500,  # Larger chunks to capture complete questions
                chunk_overlap=200,
                separators=["\n\n", "\n", ". ", " "]
            )
            splits = text_splitter.split_documents(documents)
            print(f"✅ Created {len(splits)} document chunks")
            
            # Create vector store
            self.vectorstore = FAISS.from_documents(splits, embeddings)
            print("✅ Vector store created successfully")
            
            # Extract and index all questions
            self.extract_all_questions()
            
        except Exception as e:
            print(f"❌ Error setting up RAG: {e}")
            self.vectorstore = None
            # Fallback to hardcoded questions on RAG setup error
            self.question_bank = [
                self.get_fallback_question("Beginner"),
                self.get_fallback_question("Intermediate"),
                self.get_fallback_question("Advanced")
            ]
            print(f"✅ Loaded {len(self.question_bank)} fallback questions due to RAG error.")
    
    def extract_all_questions(self):
        """Extract all coding questions from the PDF and store them"""
        
        if not self.vectorstore:
            print("❌ Vector store not available for extraction.")
            return
        
        try:
            print("🔍 Attempting to extract all coding questions from PDF...")
            
            # Search for question-related content
            question_queries = [
                "coding problem algorithm data structure",
                "leetcode problem solution example",
                "programming interview question",
                "array string tree graph problem",
                "function def solution code example",
                "test cases input output"
            ]
            
            all_relevant_docs = []
            for query in question_queries:
                docs = self.vectorstore.similarity_search(query, k=15) # Increased k for more context
                all_relevant_docs.extend(docs)
            
            # Remove duplicates
            unique_docs = list({doc.page_content: doc for doc in all_relevant_docs}.values())
            print(f"📄 Found {len(unique_docs)} unique relevant document chunks for extraction.")
            
            if not unique_docs:
                print("No unique documents found for question extraction.")
                return

            # Combine all content for question extraction
            # Limit combined content to avoid token limits for LLM
            combined_content = "\n\n---\n\n".join([doc.page_content for doc in unique_docs])[:15000] # Cap at 15k chars
            
            # LLM prompt to extract questions
            extraction_prompt_template = ChatPromptTemplate.from_messages([
                ("system", """You are an expert at extracting coding interview questions from technical content.
                Your task is to parse the provided text and extract ALL distinct coding questions/problems you can find.
                For each question, meticulously identify its title, complete description, input/output examples, difficulty (Easy/Medium/Hard), relevant topics, and any constraints.
                IMPORTANT: Also, extract or infer 2-3 concise test cases (input and expected output) for each problem, even if not explicitly provided as distinct blocks in the text.
                Return the results using the `QuestionBank` Pydantic model. If any field for a question is not explicitly present, infer it reasonably or leave it as a general statement like 'Not specified' for constraints.
                """),
                ("human", "{content_to_analyze}")
            ])
            
            question_extractor_chain = extraction_prompt_template | llm.with_structured_output(QuestionBank)
            
            result = question_extractor_chain.invoke({"content_to_analyze": combined_content})  
            
            self.question_bank = result.questions
            print(f"✅ Extracted {len(self.question_bank)} coding questions in total.")
            
            # Print summary of extracted questions
            for i, q in enumerate(self.question_bank[:5]):  # Show first 5
                print(f"    {i+1}. {q.title} ({q.difficulty}) - Topics: {', '.join(q.topics[:3])}")
            
            if len(self.question_bank) > 5:
                print(f"    ... and {len(self.question_bank) - 5} more questions")
                
        except Exception as e:
            print(f"❌ Error extracting questions: {e}")
            self.question_bank = []
            # Fallback to hardcoded questions on extraction error
            self.question_bank = [
                self.get_fallback_question("Beginner"),
                self.get_fallback_question("Intermediate"),
                self.get_fallback_question("Advanced")
            ]
            print(f"✅ Loaded {len(self.question_bank)} fallback questions due to extraction error.")
    
    def get_question_by_criteria(self, skill_level: str, topic_preference: Optional[str] = None, 
                                 user_goals: str = "", question_history: List[str] = []) -> Optional[CodingQuestion]:
        """
        Selects a question from the question bank based on user criteria.
        Prioritizes difficulty and then topic, using LLM for final selection.
        Avoids recently asked questions.
        """
        
        if not self.question_bank:
            print("❌ No questions available in bank, returning fallback.")
            return self.get_fallback_question(skill_level)
        
        try:
            print(f"🎯 Selecting question for user: Skill Level='{skill_level}', Topic='{topic_preference or 'Any'}', Goals='{user_goals}'.")
            
            # Map skill levels to difficulty
            difficulty_mapping = {
                "Beginner": ["Easy"],
                "Intermediate": ["Easy", "Medium"], 
                "Advanced": ["Medium", "Hard"]
            }
            
            target_difficulties = difficulty_mapping.get(skill_level, ["Medium"])
            
            # Filter questions by difficulty and exclude recently asked
            suitable_questions = [
                q for q in self.question_bank 
                if q.difficulty in target_difficulties and q.title not in question_history[-3:] # Avoid last 3 questions
            ]
            
            print(f"📋 Found {len(suitable_questions)} questions matching difficulty and not recently asked.")
            
            # If topic preference specified, filter by topic
            if topic_preference:
                topic_filtered = []
                for q in suitable_questions:
                    if any(topic_preference.lower() in t.lower() for t in q.topics):
                        topic_filtered.append(q)
                
                if topic_filtered: # If topic filter yields results, use them
                    suitable_questions = topic_filtered
                    print(f"🎯 Filtered to {len(suitable_questions)} questions matching topic '{topic_preference}'.")
                else: # If topic filter yields no results, stick to difficulty-filtered questions
                    print(f"⚠️ No questions found for topic '{topic_preference}' with current difficulty. Expanding search.")
                    # If specific topic with difficulty fails, try broader difficulty for topic, or just general suitable questions
                    all_topic_questions = [
                        q for q in self.question_bank
                        if any(topic_preference.lower() in t.lower() for t in q.topics) and q.title not in question_history[-3:]
                    ]
                    if all_topic_questions:
                        suitable_questions = all_topic_questions
                        print(f"🎯 Found {len(suitable_questions)} questions for topic '{topic_preference}' across difficulties.")
                    
            if not suitable_questions:
                print("⚠️ No suitable questions found after filtering. Using a random question from the entire bank not recently asked.")
                # Fallback: any question not in recent history
                available_q_for_fallback = [q for q in self.question_bank if q.title not in question_history[-3:]]
                if available_q_for_fallback:
                    return random.choice(available_q_for_fallback)
                else:
                    return random.choice(self.question_bank) # Last resort, might repeat if all questions were recently asked
            
            # Use LLM to select the best question from the suitable ones
            # First, limit the number of questions sent to LLM to avoid token limits
            questions_for_llm_selection = suitable_questions[:5] if len(suitable_questions) > 5 else suitable_questions
            
            # Create a string representation for LLM to choose from
            questions_summary = "\n".join([
                f"- Title: {q.title}, Difficulty: {q.difficulty}, Topics: {', '.join(q.topics)}"
                for i, q in enumerate(questions_for_llm_selection)
            ])
            
            selection_prompt_template = ChatPromptTemplate.from_messages([
                ("system", """You are an intelligent assistant tasked with selecting the most appropriate coding question for a user based on their profile and a list of available questions.
                Your response should be *only* the title of the chosen question as it appears in the provided list.
                Do NOT add any other text, explanation, or markdown. Just the title.
                If no suitable question can be found among the filtered list, select the first one from the list.
                Prioritize questions that align with user goals and skill level, and try to pick a diverse range if possible.
                """),
                ("human", f"""
                Select the BEST coding question for this user:
                
                User Profile:
                - Skill Level: {skill_level}
                - Topic Interest: {topic_preference or "Any"}
                - Goals: {user_goals}
                
                Available Questions (choose one by title):
                {questions_summary}
                
                Please return ONLY the title of the selected question.
                """)
            ])
            
            # Invoke LLM to get the title of the selected question
            selected_title_response = llm.invoke(selection_prompt_template.format_messages(
                skill_level=skill_level,
                topic_preference=topic_preference,
                user_goals=user_goals,
                questions_summary=questions_summary
            )).content.strip()

            selected_question = next(
                (q for q in questions_for_llm_selection if q.title == selected_title_response),
                suitable_questions[0] if suitable_questions else self.get_fallback_question(skill_level) # Fallback if LLM's chosen title doesn't match
            )
            
            # Generate hints and test cases if missing (ensure robustness)
            if not selected_question.hints:
                selected_question.hints = self.generate_hints_for_question(selected_question, skill_level)
            if not selected_question.test_cases:
                selected_question.test_cases = self.generate_test_cases_for_question(selected_question)

            print(f"✅ Selected Question: {selected_question.title} (Difficulty: {selected_question.difficulty}, Topics: {', '.join(selected_question.topics)})")
            return selected_question
            
        except Exception as e:
            print(f"❌ Error in question selection: {e}")
            return self.get_fallback_question(skill_level)
    
    def generate_hints_for_question(self, question: CodingQuestion, skill_level: str) -> List[str]:
        """Generate appropriate progressive hints for the question based on skill level."""
        try:
            hint_prompt_template = ChatPromptTemplate.from_messages([
                ("system", """You are a helpful coding mentor. Generate 3 progressive hints for the given coding question.
                The hints should be tailored for a {skill_level} level programmer.
                
                Hint progression:
                1. First hint: High-level concept or general approach.
                2. Second hint: More specific technique, relevant data structure, or algorithm paradigm.
                3. Third hint: A subtle detail, potential pitfall, or optimization idea, without giving away the direct solution.
                
                Format your response as a numbered list of hints. Ensure each hint is on a new line and starts with a number (e.g., '1. Hint one.')."""),
                ("human", f"""
                Question Title: {question.title}
                Description: {question.description}
                Topics: {', '.join(question.topics)}
                
                Generate 3 hints for a {skill_level} level.
                """)
            ])
            
            response = llm.invoke(hint_prompt_template.format_messages(
                question=question.title,
                description=question.description,
                topics=question.topics,
                skill_level=skill_level
            )).content
            
            hints = [line.strip() for line in response.split('\n') if line.strip() and re.match(r"^\d+\.", line.strip())]
            return hints[:3] if hints else [
                "Think about the most straightforward approach first.",
                "Consider what data structures or algorithms might be applicable.",
                "Don't forget to consider edge cases and constraints."
            ]
            
        except Exception as e:
            print(f"❌ Error generating hints: {e}")
            return [
                "Break down the problem into smaller steps.",
                "Consider the time and space complexity.",
                "Test your solution with the given examples."
            ]

    def generate_test_cases_for_question(self, question: CodingQuestion) -> List[Dict[str, Any]]:
        """Generates 2-3 basic and 1-2 edge/complex test cases for a given question."""
        try:
            test_case_prompt_template = ChatPromptTemplate.from_messages([
                ("system", """You are an expert at generating comprehensive test cases for coding problems.
                Given a coding problem, generate 2-3 basic test cases and 1-2 edge/complex test cases.
                For each test case, provide the exact `input` and the `expected_output`.
                Ensure the input format matches what a user's Python function would receive (e.g., lists, integers, strings, or a dictionary if multiple arguments).
                Return the results as a JSON list of dictionaries, where each dictionary has 'input' and 'expected_output'.
                
                Example for `Two Sum` (function `two_sum(nums, target)`):
                ```json
                [
                    {"input": {"nums": [2, 7, 11, 15], "target": 9}, "expected_output": [0, 1]},
                    {"input": {"nums": [3, 2, 4], "target": 6}, "expected_output": [1, 2]}
                ]
                ```
                Example for `Valid Parentheses` (function `is_valid(s)`):
                ```json
                [
                    {"input": {"s": "()[]{}"}, "expected_output": true},
                    {"input": {"s": "([)]"}, "expected_output": false}
                ]
                ```
                For string inputs, represent them as Python strings. For array/list inputs, use Python lists.
                """),
                ("human", f"""
                Generate test cases for the following problem:
                Title: {question.title}
                Description: {question.description}
                Examples: {question.examples}
                Constraints: {question.constraints}
                Topics: {', '.join(question.topics)}
                
                Please generate 3-5 test cases (including basic and edge cases) in the specified JSON format.
                """)
            ])
            
            response = llm.invoke(test_case_prompt_template.format_messages(
                question=question.title,
                description=question.description,
                examples=question.examples,
                constraints=question.constraints,
                topics=question.topics
            )).content
            
            # Attempt to parse the JSON response
            json_str = response.strip()
            if json_str.startswith("```json") and json_str.endswith("```"):
                json_str = json_str[7:-3].strip()
            
            test_cases = json.loads(json_str)
            if not isinstance(test_cases, list):
                raise ValueError("Expected a list of test cases.")
            
            # Validate structure
            for tc in test_cases:
                if "input" not in tc or "expected_output" not in tc:
                    raise ValueError("Each test case must have 'input' and 'expected_output'.")
            
            return test_cases
            
        except (json.JSONDecodeError, ValueError) as e:
            print(f"❌ Error parsing/generating test cases: {e}")
            print(f"LLM Response (attempted parse): {response[:200]}...")
            # Fallback to a simple default if LLM fails or provides invalid format
            # This is critical for preventing Code Agent from crashing
            return [
                {"input": {}, "expected_output": "N/A - Failed to generate valid test cases"},
            ]
        except Exception as e:
            print(f"❌ Unexpected error generating test cases: {e}")
            return [
                {"input": {}, "expected_output": "N/A - Failed to generate valid test cases"}
            ]

    def get_fallback_question(self, skill_level: str) -> CodingQuestion:
        """Fallback questions if RAG fails or no suitable question is found."""
        
        fallback_data = {
            "Beginner": {
                "title": "Two Sum",
                "description": "Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to `target`. You may assume that each input would have exactly one solution, and you may not use the same element twice.",
                "examples": "Input: nums = [2,7,11,15], target = 9\nOutput: [0,1]\nExplanation: Because nums[0] + nums[1] == 9, we return [0, 1].",
                "difficulty": "Easy",
                "topics": ["arrays", "hash-table"],
                "constraints": "2 <= nums.length <= 10^4\n-10^9 <= nums[i] <= 10^9\n-10^9 <= target <= 10^9",
                "test_cases": [
                    {"input": {"nums": [2, 7, 11, 15], "target": 9}, "expected_output": [0, 1]},
                    {"input": {"nums": [3, 2, 4], "target": 6}, "expected_output": [1, 2]},
                    {"input": {"nums": [3, 3], "target": 6}, "expected_output": [0, 1]}
                ]
            },
            "Intermediate": {
                "title": "Valid Parentheses",
                "description": "Given a string `s` containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid. An input string is valid if: 1. Open brackets must be closed by the same type of brackets. 2. Open brackets must be closed in the correct order. 3. Every close bracket has a corresponding open bracket of the same type.",
                "examples": "Input: s = \"()[]{}\"\nOutput: true\nInput: s = \"([)]\"\nOutput: false",
                "difficulty": "Medium",
                "topics": ["stack", "string"],
                "constraints": "1 <= s.length <= 10^4\ns consists of parentheses only '()[]{}'.",
                "test_cases": [
                    {"input": {"s": "()"}, "expected_output": True},
                    {"input": {"s": "()[]{}"}, "expected_output": True},
                    {"input": {"s": "(]"}, "expected_output": False},
                    {"input": {"s": "([)]"}, "expected_output": False},
                    {"input": {"s": "{[]}"}, "expected_output": True}
                ]
            },
            "Advanced": {
                "title": "Merge k Sorted Lists",
                "description": "You are given an array of `k` linked-lists `lists`, each linked-list is sorted in ascending order. Merge all the linked-lists into one sorted linked-list and return it.",
                "examples": "Input: lists = [[1,4,5],[1,3,4],[2,6]]\nOutput: [1,1,2,3,4,4,5,6]\nExplanation: The linked lists are: 1->4->5, 1->3->4, 2->6. Merging them into one sorted list: 1->1->2->3->4->4->5->6.",
                "difficulty": "Hard",
                "topics": ["linked-list", "heap", "divide-and-conquer"],
                "test_cases": [] # Test cases for linked lists are complex to represent simply here. Will be generated if empty.
            }
        }
        
        # Get base fallback question
        fallback_q_data = fallback_data.get(skill_level, fallback_data["Intermediate"])
        # Ensure hints and test cases are generated/present
        fallback_question_obj = CodingQuestion(**fallback_q_data)
        if not fallback_question_obj.hints:
             fallback_question_obj.hints = self.generate_hints_for_question(fallback_question_obj, skill_level)
        if not fallback_question_obj.test_cases:
            # For complex types like linked lists, it might be hard to auto-generate
            # but for simple cases, QMA can infer.
            print("No hardcoded test cases for fallback, attempting to generate.")
            fallback_question_obj.test_cases = self.generate_test_cases_for_question(fallback_question_obj)

        return fallback_question_obj


# --- Agent Definitions ---

def introduction_agent(state: DSACoachState) -> DSACoachState:
    """
    Introduction agent responsible for collecting user's name, skill level, and goals.
    It uses LLM to extract information and asks follow-up questions until all data is collected.
    """
    print(f"\n--- Current Agent: {state.current_agent} ---")
    print(f"🔄 Introduction Agent - Step: {state.step}")

    # LLM Chain for profile extraction
    profile_extractor_template = ChatPromptTemplate.from_messages([
        ("system", """You are an AI assistant designed to extract user profile information.
        From the user's input, identify their:
        - name (string)
        - coding skill level (must be 'Beginner', 'Intermediate', or 'Advanced')
        - learning goals (string)

        If any piece of information is missing or unclear, note it as missing.
        Return the extracted information using the `UserProfile` Pydantic model.
        """),
        ("human", "{user_input}")
    ])
    profile_extractor_chain = profile_extractor_template | llm.with_structured_output(UserProfile)


    # Step 0: Initial greeting and prompt for information
    if state.step == 0:
        greeting = """👋 Welcome to your AI DSA Preparation Coach! I'm here to help you sharpen your coding skills.

To get started, could you tell me a little bit about yourself? I'd love to know:
1.  Your **name**
2.  Your current **coding skill level** (Are you a Beginner, Intermediate, or Advanced coder?)
3.  What are your **learning goals** for practicing Data Structures and Algorithms? (e.g., preparing for interviews, improving problem-solving logic, or learning specific data structures like trees or graphs)

For example, you could say: "Hi, I'm Alex. I'm an Intermediate coder aiming to get better at dynamic programming for job interviews."
"""
        # The `run_dsa_coach` loop will print this message first.
        # We just need to update the state to reflect we're waiting for input.
        return state.model_copy(update={
            "messages": state.messages + [AIMessage(content=greeting)],
            "step": state.step + 1,
            "waiting_for_input": True # Wait for user's initial input
        })

    # Step 1: Process user's initial input and extract profile
    elif state.step == 1:
        last_user_message_content = None
        if state.messages:
            for msg in reversed(state.messages):
                if isinstance(msg, HumanMessage):
                    last_user_message_content = msg.content
                    break

        if not last_user_message_content:
            # Should not happen if `waiting_for_input` was True, but for robustness
            response = "I didn't catch your introduction. Could you please tell me your name, skill level (Beginner, Intermediate, Advanced), and learning goals?"
            return state.model_copy(update={
                "messages": state.messages + [AIMessage(content=response)],
                "waiting_for_input": True,
                "step": state.step # Stay on this step until input is received
            })

        print(f"⚙️ Intro Agent: Processing user input for profile: '{last_user_message_content}'")
        try:
            extracted_profile: UserProfile = profile_extractor_chain.invoke({"user_input": last_user_message_content})
            print(f"⚙️ Intro Agent: Extracted Profile: {extracted_profile.model_dump_json(indent=2)}")
        except ValidationError as e:
            print(f"❌ Introduction Agent Pydantic Validation Error: {e}")
            response = "I had trouble understanding some of that. Could you please ensure you clearly state your name, skill level (Beginner, Intermediate, or Advanced), and learning goals?"
            return state.model_copy(update={
                "messages": state.messages + [AIMessage(content=response)],
                "waiting_for_input": True,
                "step": state.step # Stay on this step
            })
        except Exception as e:
            print(f"❌ Introduction Agent LLM Error: {e}")
            response = "I apologize, I'm having a little trouble processing your information right now. Could you please try stating your name, skill level, and goals again?"
            return state.model_copy(update={
                "messages": state.messages + [AIMessage(content=response)],
                "waiting_for_input": True,
                "step": state.step # Stay on this step
            })


        # Update state with extracted info
        updated_state = state.model_copy(update={
            "user_name": extracted_profile.user_name,
            "skill_level": extracted_profile.skill_level,
            "user_goals": extracted_profile.user_goals,
            "profile_complete": extracted_profile.complete,
            # If complete, we'll transition. If not, we'll ask again.
            "step": state.step + 1 if extracted_profile.complete else state.step
        })

        if not extracted_profile.complete:
            missing_info_str = []
            if "name" in extracted_profile.missing_info or extracted_profile.user_name is None:
                missing_info_str.append("your **name**")
            if "skill_level" in extracted_profile.missing_info or extracted_profile.skill_level is None:
                missing_info_str.append("your **coding skill level** (Beginner, Intermediate, or Advanced)")
            if "user_goals" in extracted_profile.missing_info or extracted_profile.user_goals is None:
                missing_info_str.append("your **learning goals**")

            response = f"Thanks! I still need to know {', '.join(missing_info_str)}. Could you please provide that?"
            return updated_state.model_copy(update={
                "messages": updated_state.messages + [AIMessage(content=response)],
                "waiting_for_input": True
            })
        else:
            # Profile complete, transition to Mentor Agent
            response = (f"Fantastic, **{updated_state.user_name}**! A **{updated_state.skill_level}** coder aiming to **{updated_state.user_goals}**. "
                        "I'm ready to help you on your DSA journey. Let's find a problem to get started!")
            print("\n--- FLOW: Introduction Agent -> Mentor Agent (Profile Complete) ---")
            return updated_state.model_copy(update={
                "messages": updated_state.messages + [AIMessage(content=response)],
                "current_agent": "Mentor Agent",
                "mentor_state": "awaiting_question", # Mentor will now pick a question
                "waiting_for_input": False, # Mentor agent will proceed immediately
                "step": 0 # Reset step for next agent
            })
    return state # Should not be reached if logic is complete

def mentor_agent(state: DSACoachState) -> DSACoachState:
    """
    Mentor agent orchestrates the user's DSA learning experience,
    handling question presentation, hint provision, and transitioning to other agents.
    It acts as the main conversational hub.
    """
    print(f"\n--- Current Agent: {state.current_agent} ---")
    print(f"✨ Mentor Agent - State: {state.mentor_state}, Step: {state.step}")

    # Prepare user input for LLM analysis
    user_input_for_llm = ""
    if state.messages:
        # Ensure we're only taking the last human message for direct processing
        for msg in reversed(state.messages):
            if isinstance(msg, HumanMessage):
                user_input_for_llm = msg.content
                break
    
    # Prepare chat history for LLM (last few messages)
    # Filter out SystemMessage for a cleaner chat history for the LLM's conversation context
    chat_history_for_llm = [msg.content for msg in state.messages if not isinstance(msg, SystemMessage)][-7:] # Last 7 messages for richer context
    
    # Prepare current question summary for LLM
    current_question_summary = "No current question."
    if state.current_question:
        current_question_summary = (f"Title: {state.current_question.title}\n"
                                    f"Difficulty: {state.current_question.difficulty}\n"
                                    f"Topics: {', '.join(state.current_question.topics)}\n"
                                    f"Description: {state.current_question.description[:300]}...") # Truncate description

    # Prepare past session insights for the LLM
    past_session_insights_str = "No prior session context available."
    if state.historical_session_summaries:
        recent_summaries = state.historical_session_summaries[-3:] # Consider last 3 for brevity
        summary_lines = ["\n**Insights from Past Sessions (for context):**"]
        for i, summary in enumerate(recent_summaries):
            summary_lines.append(f"--- Session {summary.session_id[:8]} ({summary.timestamp[:10]}) ---")
            summary_lines.append(f"  Topics Covered: {', '.join(summary.topics_covered)}")
            summary_lines.append(f"  Problems Solved: {', '.join(summary.problems_solved_titles)}")
            summary_lines.append(f"  User Performance: {summary.user_performance_analysis}")
            summary_lines.append(f"  Mentor Observations: {summary.mentor_insights}")
        past_session_insights_str = "\n".join(summary_lines)
        print(f"📚 Providing past session insights to Mentor LLM.")


    # LLM Chain for Mentor's decision making
    mentor_decision_template = ChatPromptTemplate.from_messages([
        ("system", """You are **Socrates**, an expert, encouraging, and highly intuitive coding interview mentor.
        Your primary role is to guide the user's thought process, leading them to discover solutions independently.
        **Do NOT give direct answers or full solutions.** Instead, ask probing questions, suggest areas to focus on, and provide progressive hints.

        You emulate the perfect guide: inspiring deep thinking, building confidence, and never spoon-feeding solutions.

        Your core responsibility is to **help the user become an independent problem solver** through dialogue and guidance — not direct answers. You operate like a master educator: reflective, Socratic, and empowering.

        ---

        **Key Principles for Your Interaction:**
        🔧 **Foundational Behavior Guidelines**:

        1. **🧠 Socratic Dialog Mastery**:
        - Never provide full solutions or direct answers.
        - Instead, use layered questioning to explore the user's understanding.
        - Push them toward realizations through:  
            - "Why do you think that might not work?"  
            - "How would that behave with X input?"  
            - "What assumptions are you making here?"

        2. **🤝 Human-Like & Empathetic**:
        - Speak warmly and supportively.
        - Normalize struggles: "That’s a common hurdle, you’re not alone."
        - Celebrate effort and insight even if the answer isn’t fully right.

        3. **🎯 Goal-Driven Personalization**:
        - Always align your guidance with `User Learning Goals`.
        - Adjust depth/direction based on `User Skill Level`.
        - Use `Past Session Insights` and `Recent Conversation History` to:
            - Reference previous problems or breakthroughs.
            - Detect recurring issues and build long-term strategies.
        ---
        🧪 **Code Feedback Strategy** (`processing_code_feedback` state):
        Last Code Execution Result:
        {last_code_execution_result}
        → Your task is to:
        - Diagnose the issue clearly.
        - Then *immediately shift into reflective mode*, e.g.:
        - "What specific input could be causing this behavior?"  
        - "Which part of the logic might fail for edge cases?"  
        - "Can you walk through your code on this input?"
        ---
        🔍 **When the User Is Stuck**:
        - Identify stuck points through reflection:  
        - "What’s the hardest part for you right now?"  
        - "Where do you feel uncertain about the logic?"
        - If the input is vague or low-effort, kindly prompt specificity:  
        - "Could you clarify what you’ve tried so far?"  
        - "What’s your current hypothesis about this problem?"
        ---
        🚀 **Optimization Nudging**:
        - Always explore improvements when applicable:
        - "Is this the most time-efficient approach?"  
        - "Can space complexity be reduced with another structure?"
        ---
        💡 **Cognitive Support Tactics**:
        - Encourage them to *draw diagrams*, *write pseudo-code*, or *debug aloud*.
        - Use meta-cognition:  
        - "What’s your mental model of this algorithm?"  
        - "If you had to teach this to someone, how would you explain it?"
        ---
        🧭 **Session Flow & Transitions**:
        - Keep the tone fluid and natural.
        - Move cleanly between stages: understanding → approach → code → test → optimize → reflect.
        - Use natural transitions like:  
        - "That makes sense. Now, how might we test this?"  
        - "Cool. If that works, can it scale?"
        ---
        📝 **Ending or Summarizing the Session**:
        - If the user signals an exit or transition:
        - Gracefully summarize the learning points.
        - Trigger the summarization agent.
        - Ask: "What’s your plan for reviewing or practicing this next?"
        ---
        Current Session Context:
        User Name: {user_name}
        User Skill Level: {skill_level}
        User Learning Goals: {user_goals}
        Current Problem: {current_question_summary}
        Current Mentor State: {current_mentor_state}
        
        Past session insights:
        {past_session_insights}
        
        Recent Conversation History:
        {chat_history}
        
        Based on the user's last input and the current state, decide what to do next.
        Formulate your `response_for_user` to be human-like and guiding.
        Return your decision strictly using the `MentorAgentOutput` Pydantic model.
        """),
        ("human", "User input: {user_input}")
    ])
    mentor_decision_chain = mentor_decision_template | llm.with_structured_output(MentorAgentOutput)

    # State: awaiting_question (Initial state or after problem solved/skipped)
    if state.mentor_state == "awaiting_question":
        print("⚙️ Mentor State: awaiting_question")
        # Automatically ask Question Making Agent for a new question
        print("--- FLOW: Mentor Agent -> Question Making Agent (Awaiting Question) ---")
        return state.model_copy(update={
            "messages": state.messages + [AIMessage(content="Let's find a suitable problem for you! Just a moment while I pick one out.")],
            "current_agent": "Question Making Agent",
            "waiting_for_input": False,
            "step": 0, # Reset step for Question Making Agent
            "mentor_query_for_question": {"skill_level": state.skill_level, "user_goals": state.user_goals}
        })

    # State: presenting_question (Question Making Agent has provided a question)
    elif state.mentor_state == "presenting_question":
        print("⚙️ Mentor State: presenting_question")
        if not state.current_question:
            # Fallback if question wasn't set somehow
            print("⚠️ No current question found in presenting_question state, requesting new one.")
            return state.model_copy(update={
                "messages": state.messages + [AIMessage(content="It seems I don't have a question ready. Let me fetch one for you.")],
                "current_agent": "Question Making Agent",
                "waiting_for_input": False,
                "step": 0,
                "mentor_query_for_question": {"skill_level": state.skill_level, "user_goals": state.user_goals}
            })
        
        question_display = (
            f"Alright, **{state.user_name}**, here's a **{state.current_question.difficulty}** problem on **{', '.join(state.current_question.topics)}** for you:\n\n"
            f"### {state.current_question.title}\n\n"
            f"**Problem Description:**\n{state.current_question.description}\n\n"
            f"**Examples:**\n{state.current_question.examples}\n\n"
            f"**Constraints:**\n{state.current_question.constraints}\n\n"
            f"Take your time to read it. Once you're ready, tell me: **How would you approach this problem? Let's discuss your high-level strategy first.**"
        )
        # Update problem attempted count
        state.problems_attempted += 1
        state.question_history.append(state.current_question.title) # Add to history

        return state.model_copy(update={
            "messages": state.messages + [AIMessage(content=question_display)],
            "mentor_state": "discussing_approach",
            "waiting_for_input": True, # Now wait for user's approach
            "step": 0, # Reset step for this sub-flow
            "problem_solved_current_session": False # Reset for new problem
        })

    # State: awaiting_code (The Mentor Agent tells the user to provide code)
    # This specifically handles the transition logic when MentorAgentOutput.pass_to_code_agent is True
    elif state.mentor_state == "awaiting_code" and state.code_file_path_requested:
        # This state is effectively the Mentor saying "Okay, please give me your code."
        # The Code Agent is then responsible for picking up the file path.
        response = "Great! Please provide the **path to your Python code file** (e.g., `solution.py`) for me to review and run."
        return state.model_copy(update={
            "messages": state.messages + [AIMessage(content=response)],
            "waiting_for_input": True,
            "current_agent": "Code Agent", # Transition to Code Agent
            "step": 1 # Code Agent will be on step 1, expecting the file path
        })


    # Special handling for providing hints
    elif state.mentor_state == "providing_hints" and state.current_question and state.current_question.hints:
        if state.current_hint_index < len(state.current_question.hints):
            hint_to_provide = state.current_question.hints[state.current_hint_index]
            response_content = f"Here's a hint for you, {state.user_name}:\n\n**{hint_to_provide}**\n\nDoes that spark any new ideas or help you clarify your approach?"
            new_hint_index = state.current_hint_index + 1
            new_mentor_state = "discussing_approach" # Go back to discussing after hint
            state.hints_used += 1 # Increment hint count

            return state.model_copy(update={
                "messages": state.messages + [AIMessage(content=response_content)],
                "mentor_state": new_mentor_state,
                "current_hint_index": new_hint_index,
                "waiting_for_input": True
            })
        else:
            response_content = "You've gone through all the hints I have for this problem, {state.user_name}. Would you like to try coding your current approach, or would you like to discuss other ways to think about the problem?"
            return state.model_copy(update={
                "messages": state.messages + [AIMessage(content=response_content)],
                "mentor_state": "discussing_approach", # Still in discussion, user might loop or try code
                "waiting_for_input": True
            })

    # Special handling for processing code feedback
    elif state.mentor_state == "processing_code_feedback" and state.last_code_execution_result:
        feedback_message = state.last_code_execution_result.analysis_feedback or "I've reviewed your code, but I don't have specific analysis feedback right now. Let's discuss."
        
        # Transition based on success/failure
        if state.last_code_execution_result.status == "success":
            response_content = f"Excellent, {state.user_name}! Your code passed all the test cases. {feedback_message} That's great work! Would you like to try another problem, or should we discuss optimizations or alternative solutions for this one?"
            state.problems_solved += 1 # Increment solved count
            state.problem_solved_current_session = True # Mark current problem as solved
            new_mentor_state = "problem_solved_discussion"
        elif state.last_code_execution_result.status == "analysis_needed":
             response_content = f"Your code needs further analysis for edge cases or optimization. {feedback_message} What are your thoughts on handling these scenarios, or how could you make it more efficient?"
             new_mentor_state = "discussing_approach" # Go back to discussion to address analysis
        else: # Error, fail_test_cases, fail_edge_cases
            response_content = f"Hmm, it looks like your code encountered some issues: {feedback_message} Take a closer look at the feedback. What do you think went wrong, and how might you approach fixing it?"
            new_mentor_state = "discussing_approach" # User needs to fix code and re-submit, but we'll guide them
        
        return state.model_copy(update={
            "messages": state.messages + [AIMessage(content=response_content)],
            "mentor_state": new_mentor_state,
            "waiting_for_input": True,
            "step": 0,
            "last_code_execution_result": None # Clear feedback after processing
        })
    
    # If mentor_state is 'session_ending'
    elif state.mentor_state == "session_ending":
        # This state is typically entered from Evaluation Agent or direct user request.
        # Mentor Agent's job here is just to await user's final decision
        # (start new problem or exit) after performance summary.
        
        # This path is hit after the evaluation agent presents the summary.
        # The user input determines next action.
        if "new problem" in user_input_for_llm.lower() or "another problem" in user_input_for_llm.lower() or "next problem" in user_input_for_llm.lower():
            print("--- FLOW: Mentor Agent -> Question Making Agent (New Problem Request) ---")
            return state.model_copy(update={
                "messages": state.messages + [AIMessage(content="Fantastic! Let's find another problem that aligns with your goals.")],
                "current_agent": "Question Making Agent",
                "waiting_for_input": False,
                "mentor_state": "awaiting_question",
                "current_question": None, # Clear current question
                "current_hint_index": 0, # Reset hints
                "problem_solved_current_session": False, # Reset problem solved flag
                "step": 0
            })
        elif "exit" in user_input_for_llm.lower() or "done" in user_input_for_llm.lower() or "bye" in user_input_for_llm.lower() or "conclude" in user_input_for_llm.lower():
            response_content = "It was a pleasure coaching you today, sriram! I hope you found our session valuable. Remember, consistency is key in DSA. Feel free to come back anytime! Goodbye for now!"
            print("--- FLOW: Mentor Agent -> END SESSION (User requested exit) ---")
            return state.model_copy(update={
                "messages": state.messages + [AIMessage(content=response_content)],
                "waiting_for_input": False, # End session
                "current_agent": "Evaluation Agent", # Final state, just to mark end
                "step": -1 # Indicate session end
            })
        else:
            # User provided ambiguous input after summary
            response_content = "I'm not quite sure what you'd like to do. Are you ready for a new problem, or would you like to conclude our session for today?"
            return state.model_copy(update={
                "messages": state.messages + [AIMessage(content=response_content)],
                "waiting_for_input": True,
                "mentor_state": "session_ending" # Stay in this state
            })

    # Default: Use LLM to decide based on user input and current conversation flow
    else: # This covers 'discussing_approach', 'problem_solved_discussion'
        print(f"⚙️ Mentor State: {state.mentor_state} - Processing user input or internal action.")

        try:
            # Pass last code execution result as a JSON string for the LLM
            last_code_exec_json = json.dumps(state.last_code_execution_result.model_dump()) if state.last_code_execution_result else "N/A"

            mentor_output: MentorAgentOutput = mentor_decision_chain.invoke({
                "user_name": state.user_name or "N/A",
                "skill_level": state.skill_level or "N/A",
                "user_goals": state.user_goals or "N/A",
                "current_question_summary": current_question_summary,
                "current_mentor_state": state.mentor_state,
                "past_session_insights": past_session_insights_str, # NEW
                "last_code_execution_result": last_code_exec_json,
                "chat_history": "\n".join(chat_history_for_llm),
                "user_input": user_input_for_llm
            })
            print(f"⚙️ Mentor Agent LLM Decision: {mentor_output.model_dump_json(indent=2)}")
            
            new_state_updates = {
                "messages": state.messages + [AIMessage(content=mentor_output.response_for_user)],
                "waiting_for_input": True, # Default to waiting for input after mentor response
                "mentor_state": "discussing_approach" # Default
            }

            if mentor_output.call_question_agent:
                print("--- FLOW: Mentor Agent -> Question Making Agent (LLM Requested New Question) ---")
                new_state_updates.update({
                    "current_agent": "Question Making Agent",
                    "waiting_for_input": False,
                    "mentor_state": "awaiting_question",
                    "mentor_query_for_question": mentor_output.mentor_query_for_question,
                    "current_question": None, # Clear current question
                    "current_hint_index": 0, # Reset hints
                    "problem_solved_current_session": False, # Reset problem solved flag
                    "step": 0
                })
            elif mentor_output.pass_to_code_agent:
                print("--- FLOW: Mentor Agent -> Code Agent (LLM Requested Code Submission) ---")
                new_state_updates.update({
                    "current_agent": "Code Agent",
                    "waiting_for_input": True, # Code Agent expects a file path (via its step 0 prompt)
                    "code_file_path_requested": True, # Signal that we need a file path
                    "mentor_state": "awaiting_code", # Set mentor state to awaiting code
                    "step": 0 # Code Agent's initial step
                })
            elif mentor_output.provide_hint:
                print("--- FLOW: Mentor Agent (Providing Hint) ---")
                new_state_updates.update({
                    "mentor_state": "providing_hints",
                    "waiting_for_input": False # Hint will be provided immediately
                })
            elif mentor_output.next_action_internal == "process_feedback":
                print("--- FLOW: Mentor Agent (Internal: Process Feedback) ---")
                new_state_updates.update({
                    "mentor_state": "processing_code_feedback",
                    "waiting_for_input": False
                })
            elif mentor_output.next_action_internal == "present_question":
                print("--- FLOW: Mentor Agent (Internal: Present Question) ---")
                new_state_updates.update({
                    "mentor_state": "presenting_question",
                    "waiting_for_input": False
                })
            elif mentor_output.next_action_internal == "end_session": # NEW logic for summarization agent
                print("--- FLOW: Mentor Agent -> Summarization Agent (LLM Requested Session End) ---")
                new_state_updates.update({
                    "current_agent": "Summarization Agent", # Transition to Summarization Agent
                    "waiting_for_input": False,
                    "mentor_state": "session_ending", # Keep mentor in session_ending state
                    "step": 0
                })
            elif mentor_output.continue_discussion:
                new_state_updates.update({
                    "mentor_state": "discussing_approach", # Stay in discussion
                    "waiting_for_input": True
                })
            else:
                # Default to continue discussion if no specific action is indicated by LLM
                new_state_updates.update({
                    "mentor_state": "discussing_approach",
                    "waiting_for_input": True
                })

            return state.model_copy(update=new_state_updates)

        except ValidationError as e:
            print(f"❌ Mentor Agent Pydantic Validation Error: {e}")
            response = "I'm having a little trouble formulating my thoughts. Could you rephrase that or ask your question again? I'm here to help you through this."
            return state.model_copy(update={
                "messages": state.messages + [AIMessage(content=response)],
                "waiting_for_input": True,
                "current_agent": "Mentor Agent",
                "mentor_state": "discussing_approach"
            })
        except Exception as e:
            print(f"❌ Mentor Agent LLM Error: {e}")
            response = "An unexpected error occurred in my thought process. Please bear with me. What were you thinking about the problem, or how can I assist you now?"
            return state.model_copy(update={
                "messages": state.messages + [AIMessage(content=response)],
                "waiting_for_input": True,
                "current_agent": "Mentor Agent",
                "mentor_state": "discussing_approach"
            })

# This function might not be strictly needed if MentorAgentOutput handles all transitions,
# but it's good for explicit routing from QMA to Mentor.
def question_making_agent(state: DSACoachState) -> DSACoachState:
    """
    Question Making Agent selects or generates a coding question based on user profile.
    It then transitions back to the Mentor Agent to present the question.
    """
    print(f"\n--- Current Agent: {state.current_agent} ---")
    print("🧠 Question Making Agent - Selecting question...")

    # Ensure question_selector is initialized
    global question_selector
    if question_selector is None:
        question_selector = RAGQuestionSelector()

    # Get question criteria from mentor agent or default
    query_criteria = state.mentor_query_for_question or {}
    skill_level = query_criteria.get("skill_level", state.skill_level or "Intermediate")
    topic_preference = query_criteria.get("topic", None)
    user_goals = query_criteria.get("user_goals", state.user_goals or "")
    
    selected_question = question_selector.get_question_by_criteria(
        skill_level=skill_level,
        topic_preference=topic_preference,
        user_goals=user_goals,
        question_history=state.question_history
    )

    if selected_question:
        print("✅ Question Making Agent: Question selected.")
        print("--- FLOW: Question Making Agent -> Mentor Agent (Presenting Question) ---")
        return state.model_copy(update={
            "current_agent": "Mentor Agent",
            "mentor_state": "presenting_question",
            "current_question": selected_question,
            "waiting_for_input": False, # Mentor agent will immediately present
            "mentor_query_for_question": None, # Clear query
            "step": 0
        })
    else:
        print("❌ Question Making Agent: Could not find a suitable question.")
        response = "I'm sorry, I couldn't find a suitable question right now. Sometimes that happens. Can you tell me if you have a specific topic or type of problem in mind, or should I try to find another random one for you?"
        print("--- FLOW: Question Making Agent -> Mentor Agent (Question Not Found) ---")
        return state.model_copy(update={
            "messages": state.messages + [AIMessage(content=response)],
            "current_agent": "Mentor Agent",
            "mentor_state": "awaiting_question", # Stay in awaiting_question to try again or user provides input
            "waiting_for_input": True,
            "mentor_query_for_question": None,
            "step": 0
        })


def run_python_code(code: str, test_cases: List[Dict[str, Any]]) -> CodeExecutionResult:
    """
    Safely executes the provided Python code against a list of test cases.
    Captures stdout, stderr, and exceptions.
    """
    results = []
    has_error = False
    overall_stdout = ""
    overall_stderr = ""
    exception_details = None

    # Dynamically create the environment for execution, including a placeholder ListNode if needed
    exec_globals = {}
    
    # Check if the code defines a ListNode class for linked list problems
    if "class ListNode" in code or "def LinkedList" in code:
        class ListNode:
            def __init__(self, val=0, next=None):
                self.val = val
                self.next = next
            def __repr__(self):
                return f"ListNode(val={self.val}, next={self.next.val if self.next else 'None'})"
            def to_list(self):
                # Helper to convert ListNode to list for comparison
                nodes = []
                current = self
                while current:
                    nodes.append(current.val)
                    current = current.next
                return nodes

        def list_to_linkedlist(lst):
            # Helper to convert list to ListNode
            if not lst:
                return None
            head = ListNode(lst[0])
            current = head
            for val in lst[1:]:
                current.next = ListNode(val)
                current = current.next
            return head

        exec_globals['ListNode'] = ListNode
        exec_globals['list_to_linkedlist'] = list_to_linkedlist
    
    # Regex to find function definition, example: def solution(nums, target):
    match = re.search(r"def\s+(\w+)\s*\(", code)
    if not match:
        return CodeExecutionResult(
            status="error",
            exception="Function definition not found. Please ensure your code contains a `def function_name(...):` statement.",
            stderr="Function definition not found."
        )
    function_name = match.group(1)

    for i, test_case in enumerate(test_cases):
        input_data = test_case.get('input', {})
        expected_output = test_case.get('expected_output')
        actual_output = None
        test_passed = False
        test_error = None

        # Capture stdout and stderr
        old_stdout = io.StringIO()
        old_stderr = io.StringIO()
        sys_stdout = sys.stdout
        sys_stderr = sys.stderr

        try:
            sys.stdout = old_stdout
            sys.stderr = old_stderr

            # Prepare the function call
            # If input_data contains linked list representations (e.g., list of lists for 'lists' param)
            # convert them to ListNode objects for the function call.
            processed_input_data = {}
            for k, v in input_data.items():
                if k == "lists" and all(isinstance(sublist, list) for sublist in v) and 'list_to_linkedlist' in exec_globals:
                    # Specific handling for Merge k Sorted Lists type problem
                    processed_input_data[k] = [exec_globals['list_to_linkedlist'](l) for l in v]
                elif k in ["head", "root"] and isinstance(v, list) and 'list_to_linkedlist' in exec_globals:
                    # Single linked list input
                    processed_input_data[k] = exec_globals['list_to_linkedlist'](v)
                else:
                    processed_input_data[k] = v

            # Execute the user's code
            # Use a fresh exec_globals for each test case to prevent state leakage
            local_exec_globals = exec_globals.copy()
            exec(code, local_exec_globals) # Run the code to define the function

            # Check if the function exists after exec
            if function_name not in local_exec_globals:
                raise NameError(f"Function '{function_name}' was not defined in the provided code.")

            func_to_call = local_exec_globals[function_name]

            # Call the user's function
            actual_output = func_to_call(**processed_input_data)
            
            # Convert actual output from ListNode to list for comparison if necessary
            if isinstance(actual_output, ListNode) and 'ListNode' in exec_globals:
                actual_output = actual_output.to_list()
            # Convert expected_output from boolean to Python bool for comparison
            if isinstance(expected_output, bool):
                expected_output = bool(expected_output) # JSON 'true'/'false' might be loaded as str
            
            test_passed = (actual_output == expected_output)

        except Exception as e:
            test_error = str(e)
            exception_details = type(e).__name__ + ": " + str(e)
            has_error = True
            test_passed = False
        finally:
            current_stdout = old_stdout.getvalue()
            current_stderr = old_stderr.getvalue()
            overall_stdout += f"\n--- Test Case {i+1} Output ---\n" + current_stdout
            overall_stderr += f"\n--- Test Case {i+1} Error ---\n" + current_stderr
            sys.stdout = sys_stdout # Restore stdout
            sys.stderr = sys_stderr # Restore stderr

        results.append({
            "input": input_data, # Store original input for display
            "expected_output": expected_output,
            "actual_output": actual_output,
            "passed": test_passed,
            "error": test_error
        })

        if not test_passed and not has_error:
            # If a test case failed due to incorrect logic, not an exception
            # We don't set has_error true unless it's an actual exception
            pass

    overall_status = "success"
    if has_error:
        overall_status = "error"
    elif any(not r['passed'] for r in results):
        overall_status = "fail_test_cases"
    
    # Print captured output and errors for debugging the execution environment itself
    if overall_stdout:
        print("Captured STDOUT:\n", overall_stdout)
    if overall_stderr:
        print("Captured STDERR:\n", overall_stderr)

    return CodeExecutionResult(
        status=overall_status,
        stdout=overall_stdout,
        stderr=overall_stderr,
        exception=exception_details,
        test_case_results=results,
        code=code # Store the code that was run
    )


def code_agent(state: DSACoachState) -> DSACoachState:
    """
    Code Agent handles receiving user's code, executing it against test cases,
    and routing the results to Debug or Edge Cases agents.
    """
    print(f"\n--- Current Agent: {state.current_agent} ---")
    print(f"💻 Code Agent - Step: {state.step}")

    if state.step == 0:
        # This step is reached when MentorAgent passes control.
        # The MentorAgent should have already set code_file_path_requested = True.
        # The prompt for the file path is given by Mentor Agent and handled by run_dsa_coach loop.
        # Now we proceed to step 1 to read the file.
        return state.model_copy(update={
            "step": state.step + 1 # Move to step 1, waiting for path
        })
    elif state.step == 1 and state.code_file_path_requested:
        # Read code from the provided file path
        last_user_message_content = None
        if state.messages:
            for msg in reversed(state.messages):
                if isinstance(msg, HumanMessage):
                    last_user_message_content = msg.content
                    break
        
        file_path = last_user_message_content.strip() if last_user_message_content else ""

        if not file_path:
            response = "It looks like I didn't receive a file path. Please provide the path to your Python code file (e.g., `solution.py`)."
            return state.model_copy(update={
                "messages": state.messages + [AIMessage(content=response)],
                "waiting_for_input": True,
                "step": state.step # Stay on this step
            })

        if not os.path.exists(file_path):
            response = f"Oops! I couldn't find a file at '{file_path}'. Please double-check the path and try again."
            return state.model_copy(update={
                "messages": state.messages + [AIMessage(content=response)],
                "waiting_for_input": True,
                "step": state.step # Stay on this step
            })
        
        try:
            with open(file_path, 'r') as f:
                user_code = f.read()
            print(f"✅ Code Agent: Successfully read code from '{file_path}'.")
            
            if not state.current_question or not state.current_question.test_cases:
                response = "I don't have a current question or test cases to run your code against right now. Let's get you set up with a problem first."
                print("⚠️ Code Agent: No current question or test cases to run.")
                # Transition back to mentor to request a problem
                return state.model_copy(update={
                    "messages": state.messages + [AIMessage(content=response)],
                    "current_agent": "Mentor Agent",
                    "mentor_state": "awaiting_question",
                    "waiting_for_input": False,
                    "code_file_path_requested": False,
                    "step": 0
                })

            # Execute code
            print("▶️ Code Agent: Executing user's code...")
            execution_result = run_python_code(user_code, state.current_question.test_cases)
            state.attempts_made += 1 # Increment attempt count
            
            print(f"📊 Code Agent: Execution Status: {execution_result.status}")

            new_state_updates = {
                "code_input": user_code, # Store the code that was run
                "last_code_execution_result": execution_result,
                "code_file_path_requested": False,
                "step": 0 # Reset step for next agent
            }

            if execution_result.status == "success":
                # If all tests pass, go to Edge Cases Agent for further analysis
                print("--- FLOW: Code Agent -> Edge Cases Agent (Passed Basic Tests) ---")
                return state.model_copy(update={
                    "current_agent": "Edge Cases Agent",
                    "waiting_for_input": False,
                    **new_state_updates
                })
            elif execution_result.status == "error" or execution_result.status == "fail_test_cases":
                # If there's an error or test case failures, go to Debug Agent
                print("--- FLOW: Code Agent -> Debug Agent (Code Error/Failed Tests) ---")
                return state.model_copy(update={
                    "current_agent": "Debug Agent",
                    "waiting_for_input": False,
                    **new_state_updates
                })
            else: # Other statuses, e.g., fail_edge_cases from prior run, or analysis_needed
                  # If this happens, it means it was routed from edge cases or debug to re-run
                  # and it hit this condition. Treat as needing debug.
                print("--- FLOW: Code Agent -> Debug Agent (Fallback for analysis needed/unexpected status) ---")
                return state.model_copy(update={
                    "current_agent": "Debug Agent",
                    "waiting_for_input": False,
                    **new_state_updates
                })

        except FileNotFoundError: # This is now handled by os.path.exists
            pass 
        except Exception as e:
            response = f"An unexpected error occurred while trying to read or process your code file: {e}. Please ensure it's a valid Python file and the path is correct."
            print(f"❌ Code Agent Error: {e}")
            return state.model_copy(update={
                "messages": state.messages + [AIMessage(content=response)],
                "waiting_for_input": True,
                "step": state.step # Stay on this step
            })
    return state # Should not be reached

def debug_agent(state: DSACoachState) -> DSACoachState:
    """
    Debug Agent provides guidance on fixing errors or failed test cases.
    It receives `CodeExecutionResult` and provides `analysis_feedback`.
    """
    print(f"\n--- Current Agent: {state.current_agent} ---")
    print("🐞 Debug Agent - Analyzing code issues...")

    if not state.last_code_execution_result:
        response = "I don't have code execution results to debug right now. Have you submitted your code yet?"
        print("⚠️ Debug Agent: No execution result to debug.")
        # Fallback to mentor
        return state.model_copy(update={
            "messages": state.messages + [AIMessage(content=response)],
            "current_agent": "Mentor Agent",
            "mentor_state": "awaiting_code", # Prompt user to submit code
            "waiting_for_input": True,
            "step": 0
        })
    
    if not state.current_question:
        response = "I need the problem context to debug effectively. Let's make sure we have a problem selected first."
        print("⚠️ Debug Agent: No current question for context.")
        return state.model_copy(update={
            "messages": state.messages + [AIMessage(content=response)],
            "current_agent": "Mentor Agent",
            "mentor_state": "awaiting_question",
            "waiting_for_input": False,
            "step": 0
        })

    feedback = state.last_code_execution_result

    # Prepare detailed test case results for LLM
    test_case_results_summary = "No detailed test case results provided."
    if feedback.test_case_results:
        summary_lines = ["\n**Detailed Test Case Results:**"]
        for i, tc in enumerate(feedback.test_case_results):
            status = "PASSED" if tc.get('passed', False) else "FAILED"
            summary_lines.append(f"  Test Case {i+1}: **{status}**")
            summary_lines.append(f"    Input: `{json.dumps(tc.get('input'))}`")
            summary_lines.append(f"    Expected: `{json.dumps(tc.get('expected_output'))}`")
            summary_lines.append(f"    Actual: `{json.dumps(tc.get('actual_output'))}`")
            if tc.get('error'):
                summary_lines.append(f"    Error: `{tc['error']}`")
            elif not tc.get('passed'):
                 summary_lines.append(f"    Discrepancy: Actual output does not match expected output.")
        test_case_results_summary = "\n".join(summary_lines)

    debug_prompt_template = ChatPromptTemplate.from_messages([
        ("system", """You are an experienced AI debugging assistant. Your task is to analyze the user's Python code and its execution results to identify errors and provide guiding feedback.
        **Do NOT fix the code directly.** Instead, explain the problem concisely and ask a question that guides the user to the solution.
        Focus on the most critical error or the first failing test case.

        Your mission is to analyze the user's code and its execution results to identify and explain the **most critical issue** clearly, then guide the user to solve it — without giving a direct fix.
        ---

        🎯 **Your Objectives**:
        1. **Detect Core Issue**  
        - Focus on the **first critical error** or the **first failing test case**.
        - Identify whether it's:
            - A syntax error
            - A runtime exception
            - A failed assertion/test case
            - A logic bug (incorrect output)
        - Ignore cosmetic or non-breaking issues unless explicitly asked later.

        2. **Explain Clearly, Guide Reflectively**  
        - **Do NOT rewrite or fix the code.**
        - Offer a concise explanation of the problem: what it is, why it likely happened, and what part of the code may be responsible.
        - End with a **probing question** that nudges the user to think, investigate, or try a change.

        3. **Tune Guidance Based on Skill Level**  
        - Adapt your language and depth based on the user's `skill_level`:
            - For Beginners: use analogies, define terms, give scaffolding questions.
            - For Intermediate: focus on code behavior, assumptions, and debugging strategy.
            - For Advanced: dive into edge cases, design flaws, or complexity.

        4. **Use Encouraging Tone**  
        - Acknowledge effort: "You're close...", "Great attempt so far..."
        - Normalize bugs: "This is a common mistake...", "Many devs trip on this."
        - Keep responses short, smart, and confidence-building.

        ---

        Context:
        Problem Title: {problem_title}
        Problem Description: {problem_description}
        User's Skill Level: {skill_level}
        
        User's Code:
        ```python
        {user_code}
        ```
        
        Execution Status: {execution_status}
        Exception (if any): {exception}
        Standard Error (if any): {stderr}
        Standard Output (if any): {stdout}
        
        {test_case_results_summary}

        Based on this, what is the core issue and how can you guide the user to fix it?
        Your response should be encouraging, clear, and end with a direct question prompting the user's next step.
        """),
        ("human", "Provide debugging guidance for the user's code.")
    ])

    try:
        debug_chain = debug_prompt_template | llm.with_structured_output(MentorAgentOutput)
        
        debug_output: MentorAgentOutput = debug_chain.invoke({
            "problem_title": state.current_question.title,
            "problem_description": state.current_question.description,
            "skill_level": state.skill_level,
            "user_code": state.code_input,
            "execution_status": feedback.status,
            "exception": feedback.exception or "None",
            "stderr": feedback.stderr or "None",
            "stdout": feedback.stdout or "None",
            "test_case_results_summary": test_case_results_summary
        })

        # Update the analysis feedback in the last_code_execution_result
        # This will be picked up by the Mentor Agent
        updated_last_code_result = state.last_code_execution_result.model_copy(update={
            "analysis_feedback": debug_output.response_for_user
        })

        print("--- FLOW: Debug Agent -> Mentor Agent (Processing Code Feedback) ---")
        return state.model_copy(update={
            "current_agent": "Mentor Agent",
            "mentor_state": "processing_code_feedback",
            "last_code_execution_result": updated_last_code_result,
            "waiting_for_input": False, # Mentor agent will immediately process feedback
            "step": 0
        })

    except ValidationError as e:
        print(f"❌ Debug Agent Pydantic Validation Error: {e}")
        response = "I had a conceptual error trying to analyze your code. Let's try again. Can you describe the issue you're seeing in your own words, or tell me which test case is confusing you?"
        return state.model_copy(update={
            "messages": state.messages + [AIMessage(content=response)],
            "current_agent": "Mentor Agent",
            "mentor_state": "discussing_approach", # Fallback to general discussion
            "waiting_for_input": True,
            "step": 0
        })
    except Exception as e:
        print(f"❌ Debug Agent LLM Error: {e}")
        response = "I encountered an unexpected issue while debugging. Sometimes these things happen! Can you tell me what specific error you're seeing or what isn't working as expected when you run your code?"
        return state.model_copy(update={
            "messages": state.messages + [AIMessage(content=response)],
            "current_agent": "Mentor Agent",
            "mentor_state": "discussing_approach",
            "waiting_for_input": True,
            "step": 0
        })

def edge_cases_agent(state: DSACoachState) -> DSACoachState:
    """
    Edge Cases Agent analyzes user's code for edge cases and optimization opportunities.
    It receives `CodeExecutionResult` (which should be 'success') and provides `analysis_feedback`.
    """
    print(f"\n--- Current Agent: {state.current_agent} ---")
    print("🧩 Edge Cases Agent - Checking for edge cases and optimizations...")

    if not state.last_code_execution_result or state.last_code_execution_result.status != "success":
        response = "I need a successfully running code to check for edge cases and optimizations. Please ensure your code passes all basic tests first."
        print("⚠️ Edge Cases Agent: Code not successful, cannot analyze edge cases.")
        # Fallback to mentor, who might route to debug if needed
        return state.model_copy(update={
            "messages": state.messages + [AIMessage(content=response)],
            "current_agent": "Mentor Agent",
            "mentor_state": "awaiting_code", # Or awaiting_question if no code was given
            "waiting_for_input": True,
            "step": 0
        })

    if not state.current_question:
        response = "I need the problem context to analyze edge cases effectively. Let's make sure we have a problem selected first."
        print("⚠️ Edge Cases Agent: No current question for context.")
        return state.model_copy(update={
            "messages": state.messages + [AIMessage(content=response)],
            "current_agent": "Mentor Agent",
            "mentor_state": "awaiting_question",
            "waiting_for_input": False,
            "step": 0
        })

    edge_case_prompt_template = ChatPromptTemplate.from_messages([
        ("system", """You are an expert AI for identifying edge cases and optimization opportunities in Python coding solutions.
        The user's code has passed all provided basic test cases. Your task is to challenge their solution further by:
        🎯 **Your Mission**:

        The user believes their code is correct, but hidden challenges may still exist. You must:

        1. **Find 1–2 Non-Trivial Edge Cases**  
        - Consider unusual inputs, boundary values, large data volumes, or input shapes that might stress the logic.  
        - Focus on realistic but untested scenarios the code might fail or underperform on.

        2. **Identify Optimization Opportunities (if any)**  
        - Examine time and space complexity.  
        - Suggest improvements like avoiding redundant computation, reducing nested loops, or better data structures — *but do not rewrite the code*.

        3. **Explain + Guide**  
        - For each issue or opportunity:
            - Provide a concise explanation of what might go wrong or could be improved.
            - End with a **thought-provoking, open-ended question** that encourages the user to reason and explore — without giving the answer.

        4. **Tailor Depth to User’s Skill**  
        - If `skill_level` is **Beginner**: Keep feedback accessible and educational.  
        - If **Intermediate**: Be technical and encourage algorithmic thinking.  
        - If **Advanced**: Push with performance, edge-theory, or adversarial cases.
        ---
        Do NOT provide the direct solution or improved code.

        Context:
        Problem Title: {problem_title}
        Problem Description: {problem_description}
        Problem Constraints: {problem_constraints}
        User's Skill Level: {skill_level}
        
        User's Successfully Running Code:
        ```python
        {user_code}
        ```
        
        Analyze the code and propose a follow-up challenge or optimization. Your response should be encouraging, insightful, and end with a question that guides the user's next steps.
        """),
        ("human", "Analyze the user's code for edge cases and optimization. Provide concise feedback and a guiding question.")
    ])

    try:
        edge_case_chain = edge_case_prompt_template | llm.with_structured_output(MentorAgentOutput)
        
        edge_output: MentorAgentOutput = edge_case_chain.invoke({
            "problem_title": state.current_question.title,
            "problem_description": state.current_question.description,
            "problem_constraints": state.current_question.constraints,
            "skill_level": state.skill_level,
            "user_code": state.code_input
        })

        updated_last_code_result = state.last_code_execution_result.model_copy(update={
            "status": "analysis_needed", # Indicate that further analysis is needed
            "analysis_feedback": edge_output.response_for_user
        })

        print("--- FLOW: Edge Cases Agent -> Mentor Agent (Analysis Needed) ---")
        return state.model_copy(update={
            "current_agent": "Mentor Agent",
            "mentor_state": "processing_code_feedback", # Mentor will process this analysis
            "last_code_execution_result": updated_last_code_result,
            "waiting_for_input": False, # Mentor will immediately provide feedback
            "step": 0
        })

    except ValidationError as e:
        print(f"❌ Edge Cases Agent Pydantic Validation Error: {e}")
        response = "I had a conceptual error trying to analyze your code for edge cases. Let's discuss your solution directly. What are your thoughts on its efficiency or how it handles tricky inputs?"
        return state.model_copy(update={
            "messages": state.messages + [AIMessage(content=response)],
            "current_agent": "Mentor Agent",
            "mentor_state": "discussing_approach",
            "waiting_for_input": True,
            "step": 0
        })
    except Exception as e:
        print(f"❌ Edge Cases Agent LLM Error: {e}")
        response = "I encountered an unexpected issue while trying to find edge cases for your code. Sometimes this happens! Would you like to discuss potential optimizations or move on to a new problem?"
        return state.model_copy(update={
            "messages": state.messages + [AIMessage(content=response)],
            "current_agent": "Mentor Agent",
            "mentor_state": "problem_solved_discussion", # Assume problem solved, discuss next steps
            "waiting_for_input": True,
            "step": 0
        })

# NEW Agent: Summarization Agent
def summarization_agent(state: DSACoachState) -> DSACoachState:
    """
    Summarization agent tasked with condensing the session's chat history,
    problems, and user performance into a concise summary for storage.
    """
    print(f"\n--- Current Agent: {state.current_agent} ---")
    print("📝 Summarization Agent - Generating session summary...")

    # Prepare context for the summarization LLM
    full_chat_history_str = "\n".join([
        f"{'User' if isinstance(msg, HumanMessage) else 'Coach'}: {msg.content}"
        for msg in state.messages
    ])
    
    # Extract topics covered (from current problem topics and past problems)
    # This is a simplification; ideally, you'd track topics more robustly across problems.
    # For now, LLM will infer from chat history primarily.
    current_problem_topics = state.current_question.topics if state.current_question else []
    
    problems_attempted_titles = list(set(state.question_history)) # Ensure unique titles
    
    problems_solved_titles = []
    if state.problem_solved_current_session and state.current_question:
        problems_solved_titles.append(state.current_question.title)
    # Add logic here if you store titles of ALL solved problems across sessions/state.

    summarization_prompt_template = ChatPromptTemplate.from_messages([
        ("system", """You are an AI assistant specialized in summarizing coding interview coaching sessions.
        Your goal is to create a concise, informative summary of a session, focusing on:
        1.  **Topics Covered**: Key DSA topics discussed or problems related to. Infer from chat and problem context.
        2.  **Problems Attempted/Solved**: Which problems were worked on and which were successfully solved.
        3.  **User Performance Analysis**: Insights into the user's thought process, strengths (e.g., strong conceptual understanding, good debugging skills), and areas for improvement (e.g., struggles with edge cases, needs to optimize time complexity, difficulty with specific data structures). Be constructive and objective.
        4.  **Mentor Insights**: Key observations or personalized advice from the mentor's perspective, based on the user's interaction patterns.
        5.  **A brief summary of the chat history** for quick context.

        The summary should be actionable and help a future mentor understand the user's progress and needs quickly.
        Return the summary using the `SessionSummary` Pydantic model.

        ---
        **Context for Summarization:**
        User Name: {user_name}
        Skill Level: {skill_level}
        Learning Goals: {user_goals}
        Problems Attempted in this session (titles): {problems_attempted_titles}
        Problems Solved in this session (titles): {problems_solved_titles}
        Topics explicitly associated with current problem: {current_problem_topics}
        
        Last Code Execution Result (if any): {last_code_result_summary}

        ---
        **Full Chat History for Analysis:**
        {chat_history}
        """),
        ("human", "Please summarize the coaching session based on the provided context and chat history. Focus on key takeaways for future sessions.")
    ])

    # Summarize last code execution result for LLM
    last_code_result_summary = "N/A"
    if state.last_code_execution_result:
        last_code_result_summary = f"Status: {state.last_code_execution_result.status}\n" \
                                   f"Exception: {state.last_code_execution_result.exception or 'None'}\n" \
                                   f"Analysis: {state.last_code_execution_result.analysis_feedback or 'None'}"
        if state.last_code_execution_result.test_case_results:
            failed_tests = [tc for tc in state.last_code_execution_result.test_case_results if not tc.get('passed')]
            if failed_tests:
                last_code_result_summary += f"\nFailed Tests: {len(failed_tests)} out of {len(state.last_code_execution_result.test_case_results)}"


    try:
        summary_chain = summarization_prompt_template | llm.with_structured_output(SessionSummary)
        
        # Prepare an excerpt of the chat history (e.g., last 1000 characters)
        chat_excerpt = full_chat_history_str[-1000:] if len(full_chat_history_str) > 1000 else full_chat_history_str

        summary_result: SessionSummary = summary_chain.invoke({
            "user_name": state.user_name or "N/A",
            "skill_level": state.skill_level or "N/A",
            "user_goals": state.user_goals or "N/A",
            "problems_attempted_titles": problems_attempted_titles,
            "problems_solved_titles": problems_solved_titles,
            "current_problem_topics": current_problem_topics,
            "last_code_result_summary": last_code_result_summary,
            "chat_history": full_chat_history_str # Provide full history for best analysis
        })

        # Ensure the summary has required fields before saving
        summary_result.session_id = state.session_id
        summary_result.user_id = state.user_name or "UnknownUser" # Use user_name as user_id for simplicity
        summary_result.timestamp = datetime.now().isoformat()
        summary_result.raw_chat_history_excerpt = chat_excerpt # Store the excerpt

        # Save to DB
        global session_db # Access the global instance
        session_db.add_session_summary(summary_result)

        # Update state and transition to Evaluation Agent to give performance summary
        print("--- FLOW: Summarization Agent -> Evaluation Agent ---")
        return state.model_copy(update={
            "messages": state.messages + [AIMessage(content="📝 Session summary generated and saved.")],
            "current_agent": "Evaluation Agent", # Evaluation agent will now display general summary
            "waiting_for_input": False,
            "evaluation_summary": summary_result.model_dump(), # Pass the generated summary to Evaluation Agent
            "step": 0 # Reset step for next agent
        })

    except ValidationError as e:
        print(f"❌ Summarization Agent Pydantic Validation Error: {e}")
        error_message = f"I had trouble creating a structured summary due to a formatting issue. Details: {e}"
        # Fallback to direct evaluation agent if summarization fails
        return state.model_copy(update={
            "messages": state.messages + [AIMessage(content=error_message)],
            "current_agent": "Evaluation Agent",
            "waiting_for_input": False,
            "step": 0
        })
    except Exception as e:
        print(f"❌ Error in Summarization Agent: {e}")
        # Fallback to direct evaluation agent if summarization fails
        return state.model_copy(update={
            "messages": state.messages + [AIMessage(content="Oops! I tried to summarize our session, but something went wrong. We can still get your performance summary.")],
            "current_agent": "Evaluation Agent",
            "waiting_for_input": False,
            "step": 0
        })


def evaluation_agent(state: DSACoachState) -> DSACoachState:
    """
    Evaluation agent provides a comprehensive summary of the user's performance.
    It now consumes the summary generated by the Summarization Agent.
    """
    print(f"\n--- Current Agent: {state.current_agent} ---")
    print("📊 Evaluation Agent - Preparing performance summary...")

    # The summary should be passed from the summarization_agent
    if not state.evaluation_summary:
        # Fallback if summarization agent failed or was skipped
        summary_display = (
            f"Here's a quick overview of our session, {state.user_name or 'there'}!\n\n"
            f"- Problems attempted: {state.problems_attempted}\n"
            f"- Problems solved: {state.problems_solved}\n"
            f"- Hints used: {state.hints_used}\n"
            f"- Code submission attempts: {state.attempts_made}\n\n"
            f"You've shown great dedication! Keep practicing, and you'll continue to improve. "
            f"Would you like to start a new session or are we done for today?"
        )
    else:
        # Use the summary generated by the Summarization Agent
        summary_data = SessionSummary(**state.evaluation_summary) # Convert dict back to Pydantic model
        summary_display = f"""--- Session Summary for **{summary_data.user_id}** ---
**Session ID:** `{summary_data.session_id}`
**Date:** {datetime.fromisoformat(summary_data.timestamp).strftime('%Y-%m-%d %H:%M:%S')}

**Topics Covered:** {', '.join(summary_data.topics_covered) if summary_data.topics_covered else 'N/A'}
**Problems Attempted:** {', '.join(summary_data.problems_attempted_titles) if summary_data.problems_attempted_titles else 'N/A'}
**Problems Solved:** {', '.join(summary_data.problems_solved_titles) if summary_data.problems_solved_titles else 'N/A'}

**User Performance Analysis:**
{summary_data.user_performance_analysis}

**Mentor Insights:**
{summary_data.mentor_insights}
---
It was a productive session, **{state.user_name or 'there'}**! I hope you found it helpful.
What would you like to do next? (e.g., 'start a new problem', 'exit')
"""

    print("--- FLOW: Evaluation Agent -> Mentor Agent (Session Ending / Await User Decision) ---")
    return state.model_copy(update={
        "messages": state.messages + [AIMessage(content=summary_display)],
        "waiting_for_input": True, # Wait for user's next action (new session or exit)
        "current_agent": "Mentor Agent", # Transition back to mentor to handle "new session" or "exit"
        "mentor_state": "session_ending" # Keep mentor in session_ending state
    })


# --- Main Application Loop ---
import sys # Import sys for `run_python_code`

# Mapping of agent names to their functions
agents = {
    "Introduction Agent": introduction_agent,
    "Mentor Agent": mentor_agent,
    "Question Making Agent": question_making_agent,
    "Code Agent": code_agent,
    "Debug Agent": debug_agent,
    "Edge Cases Agent": edge_cases_agent,
    "Evaluation Agent": evaluation_agent,
    "Summarization Agent": summarization_agent # NEW
}

def run_dsa_coach():
    global question_selector, session_db
    
    # Initialize RAGQuestionSelector and SessionDB if not already
    if question_selector is None:
        question_selector = RAGQuestionSelector()
    if session_db is None:
        session_db = SessionDB()

    # Generate a unique session ID for this new session
    session_id = str(uuid.uuid4())
    print(f"Starting new session with ID: {session_id}")

    current_state = DSACoachState(
        messages=[],
        current_agent="Introduction Agent",
        session_id=session_id, # Assign new session ID
        waiting_for_input=True # Initial state, waiting for user intro
    )

    # --- Initial Greeting by Introduction Agent (printed once at start) ---
    initial_intro_state = introduction_agent(current_state)
    for msg in initial_intro_state.messages:
        if isinstance(msg, AIMessage):
            print(f"\nAI Coach: {msg.content}")
            break # Print only the first AI message (the greeting)
    current_state = initial_intro_state.model_copy(update={"messages": []}) # Clear messages after printing initial greeting to avoid duplication
                                                                            # The agent will re-add messages as needed.

    # --- Main Loop ---
    while True:
        # 1. Determine which agent to run
        current_agent_func = agents.get(current_state.current_agent)
        if not current_agent_func:
            print(f"Error: Agent '{current_state.current_agent}' not found.")
            break

        # 2. Handle user input if waiting for it
        if current_state.waiting_for_input:
            user_input = input("\nYou: ")
            current_state.messages.append(HumanMessage(content=user_input))
            current_state.waiting_for_input = False # Signal that input has been received

        # 3. Run the current agent
        new_state = current_agent_func(current_state)

        # Update the state based on the agent's output
        current_state = new_state

        # 4. Print any new AI messages generated by the agent
        # We need to find the *last* AIMessage that wasn't already there from the previous turn
        new_ai_messages = [msg for msg in current_state.messages if isinstance(msg, AIMessage) and msg not in current_state.messages[:-1]]
        if new_ai_messages:
            print(f"\nAI Coach: {new_ai_messages[-1].content}") # Print the latest AI response

            # If the Code Agent just asked for a file path, explicitly tell the user
            if current_state.current_agent == "Code Agent" and current_state.code_file_path_requested and current_state.step == 1:
                print("\n**Please provide the path to your Python code file now.** (e.g., `solution.py`)")
                current_state.waiting_for_input = True # Ensure we wait for input after prompting for file path

        # If the session is explicitly ended
        if current_state.current_agent == "Evaluation Agent" and current_state.step == -1:
            print("\nSession ended. Goodbye!")
            break
        
        # NEW: After introduction, if profile is complete, load historical data
        # This needs to happen once the user_name is available and only once per session
        if current_state.profile_complete and not current_state.historical_session_summaries and current_state.user_name:
            user_data = session_db.get_user_sessions(current_state.user_name)
            if user_data:
                print(f"📚 Loaded {len(user_data.session_summaries)} past session summaries for {current_state.user_name}.")
                current_state = current_state.model_copy(update={
                    "historical_session_summaries": user_data.session_summaries
                })
            else:
                print(f"📚 No past session summaries found for {current_state.user_name}.")

# Entry point
if __name__ == "__main__":
    run_dsa_coach()