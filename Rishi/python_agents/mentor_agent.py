import google.generativeai as genai
import os

from agents.persona_manager import adjust_persona

def get_mentor_response(user_input, skill_level, chat_history):
    model = genai.GenerativeModel("gemini-1.5-flash")
    chat = model.start_chat(history=[])

    full_prompt = f"""You are an AI DSA Coach. Your goal is to guide the user to solve a Data Structures and Algorithms problem.
    Current skill level of the user: {skill_level}.
    Current phase: The user is discussing their approach.

    Chat history (most recent last):
    """
    for msg in chat_history:
        full_prompt += f"{msg['role'].capitalize()}: {msg['content']}\n"
    
    full_prompt += f"User: {user_input}\n"

    persona_prompt = adjust_persona(skill_level, "mentor")
    full_prompt = persona_prompt + "\n\n" + full_prompt

    full_prompt += """
    Based on the user's input, provide guidance. Do NOT give the direct solution.
    If the user's approach is reasonable, encourage them to start coding by responding with "Looks good, you can start coding now!" and then *only* outputting the action "unlock_editor".
    If the user asks for a hint, provide a hint and then *only* output the action "hint".
    Otherwise, provide feedback on their approach and encourage them to refine it.
    
    Example Output (for unlocking editor):
    Looks good, you can start coding now!
    ACTION: unlock_editor

    Example Output (for a hint):
    Consider how you might use a hash map to quickly look up elements.
    ACTION: hint

    Example Output (for feedback):
    Your current approach seems to have a time complexity issue. How might you optimize for O(N) or O(N log N)?
    ACTION: feedback
    """

    try:
        response = chat.send_message(full_prompt)
        mentor_response_text = response.text.strip()

        action = "feedback"

        if "ACTION: unlock_editor" in mentor_response_text:
            action = "unlock_editor"
            mentor_response_text = mentor_response_text.replace("ACTION: unlock_editor", "").strip()
        elif "ACTION: hint" in mentor_response_text:
            action = "hint"
            mentor_response_text = mentor_response_text.replace("ACTION: hint", "").strip()
        elif "ACTION: feedback" in mentor_response_text:
            mentor_response_text = mentor_response_text.replace("ACTION: feedback", "").strip()

        return mentor_response_text, action

    except Exception as e:
        print(f"Error in mentor_agent.get_mentor_response: {e}")
        return "I'm having trouble processing your request right now. Please try again.", "no_action"


def provide_hint(user_approach, user_code, skill_level):
    model = genai.GenerativeModel("gemini-1.5-flash")

    code_placeholder = user_code if user_code else 'No code written yet.'
    
    hint_prompt = f"""You are an AI DSA Coach providing a hint.
    User's skill level: {skill_level}.
    User's current approach: {user_approach if user_approach else 'Not provided yet.'}
    User's current code (if any):
    ```
    {code_placeholder}
    ```
    Based on the above, provide a single, concise hint to help the user progress.
    Do NOT give the direct solution or too much information. Keep it subtle.
    """
    try:
        response = model.generate_content(hint_prompt)
        return response.text.strip()
    except Exception as e:
        print(f"Error in mentor_agent.provide_hint: {e}")
        return "Couldn't generate a hint at this moment. Please try asking again."