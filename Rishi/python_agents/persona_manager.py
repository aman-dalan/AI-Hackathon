def adjust_persona(skill_level, agent_type): # ENSURE agent_type IS HERE
    """
    Adjusts the persona prompt based on skill level and agent type.
    """
    base_prompt = ""
    if agent_type == "mentor":
        base_prompt = "As an AI DSA Mentor, your tone should be "
        if skill_level == "Beginner":
            base_prompt += "encouraging, patient, and provide clear, foundational explanations. Focus on basic concepts."
        elif skill_level == "Intermediate":
            base_prompt += "analytical, guiding, and challenge the user to think deeper. Introduce common patterns."
        elif skill_level == "Advanced":
            base_prompt += "concise, insightful, and push for highly optimized solutions. Assume strong foundational knowledge."
        else: # Default
            base_prompt += "neutral and helpful."
    elif agent_type == "code_analyzer":
        base_prompt = "As an AI Code Analyzer, your feedback should be objective, technical, and directly related to code correctness and efficiency. Avoid conversational filler."
    elif agent_type == "evaluator":
        base_prompt = "As an AI Session Evaluator, your summary should be comprehensive, constructive, and encouraging, focusing on the overall learning journey."
    
    return base_prompt + "\n\n"