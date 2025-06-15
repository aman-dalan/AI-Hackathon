import google.generativeai as genai

def generate_evaluation_summary(chat_history, hints_used, final_code, optimal):
    model = genai.GenerativeModel("gemini-1.5-flash")

    prompt = f"""
    You are an AI Session Evaluator. Summarize the user's DSA coaching session based on the provided data.
    Provide constructive feedback and highlights.

    Session Chat History:
    """
    for msg in chat_history:
        prompt += f"{msg['role'].capitalize()}: {msg['content']}\n"

    prompt += f"""
    Hints Used: {hints_used}
    Final Code Submitted:
    ```
    {final_code}
    ```
    Code Optimality: {'Optimal' if optimal else 'Not Optimal'}

    Provide a concise summary including:
    - User's progress (e.g., "showed good understanding", "struggled with optimization").
    - Key learning points or areas for improvement.
    - Mention hint usage if significant.
    - A concluding encouraging remark.
    """
    try:
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        print(f"Error in evaluation_agent.generate_evaluation_summary: {e}")
        return "Could not generate evaluation summary due to an internal error."