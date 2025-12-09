import os
import json
import google.generativeai as genai
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import dataclasses
import typing_extensions as typing

# Load environment variables
load_dotenv(override=True)

app = Flask(__name__)

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("Warning: GEMINI_API_KEY not found in environment variables.")

genai.configure(api_key=GEMINI_API_KEY)

# Define schemas for structured output
class MindMapNode(typing.TypedDict):
    id: str
    label: str
    parent: str
    type: str  # "main_topic", "sub_topic", "detail"

class MindMapData(typing.TypedDict):
    title: str
    nodes: list[MindMapNode]

# Model configuration
GENERATION_CONFIG = {
    "temperature": 0.7,
    "top_p": 0.95,
    "top_k": 40,
    "max_output_tokens": 8192,
    "response_mime_type": "application/json",
}

# Initialize model with fallback strategy
def get_model():
    models_to_try = ["gemini-2.5-flash-lite", "gemini-2.0-flash-exp", "gemini-1.5-flash"]
    
    for model_name in models_to_try:
        try:
            print(f"Attempting to initialize model: {model_name}")
            model = genai.GenerativeModel(
                model_name=model_name,
                generation_config=GENERATION_CONFIG
            )
            # Test the model with a dummy generation to ensure it works
            # Note: This might add a small delay startup, but ensures validity.
            # model.generate_content("test") 
            print(f"Successfully initialized: {model_name}")
            return model
        except Exception as e:
            print(f"Failed to initialize {model_name}: {e}")
            continue
    
    print("Error: Could not initialize any Gemini model.")
    return None

model = get_model()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/generate_mindmap', methods=['POST'])
def generate_mindmap():
    if not model:
        return jsonify({"error": "Model not initialized. Check API Key."}), 500

    data = request.get_json()
    syllabus_text = data.get('syllabus', '')

    if not syllabus_text:
        return jsonify({"error": "No syllabus text provided"}), 400

    prompt = f"""
    Analyze the following syllabus text and generate a hierarchical structure for a mind map.
    The output must be a JSON object strictly following this schema:
    {{
      "title": "Main Course/Topic Title",
      "nodes": [
        {{
          "id": "must be unique, e.g., node-1",
          "label": "Concise text for the node",
          "parent": "id of the parent node (or 'title' if it's a top-level module)",
          "type": "main_topic" (for modules) or "sub_topic" (for concepts) or "detail" (for specifics)
        }}
      ]
    }}
    
    Ensure the 'parent' field correctly links nodes to create a tree structure. 
    The root nodes should have 'parent' set to "title".
    
    Syllabus:
    {syllabus_text}
    """

    try:
        response = model.generate_content(prompt)
        # Parse the JSON response
        result = json.loads(response.text)
        return jsonify(result)
    except Exception as e:
        print(f"Error generating mind map: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/node_query', methods=['POST'])
def node_query():
    if not model:
        return jsonify({"error": "Model not initialized"}), 500

    data = request.get_json()
    node_label = data.get('node_label', '')
    context = data.get('context', '') # Optional: parent node or surrounding context
    user_query = data.get('query', '')

    if not node_label or not user_query:
        return jsonify({"error": "Missing node label or query"}), 400

    # For chat, we might use a different config or just plain text
    chat_model = genai.GenerativeModel("gemini-2.5-flash-lite") # Use standard model for text
    
    prompt = f"""
    Context: The user is exploring a mind map node labeled "{node_label}".
    Additional Context (if any): {context}
    
    User Query: {user_query}
    
    Provide a concise and helpful response (max 150 words) to the user's query regarding this topic.
    """

    try:
        response = chat_model.generate_content(prompt)
        return jsonify({"response": response.text})
    except Exception as e:
        print(f"Error querying node: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/generate_note', methods=['POST'])
def generate_note():
    data = request.json
    topic = data.get('topic', '')
    context = data.get('context', '')
    
    prompt = f"""
    Create a comprehensive study note for the topic: '{topic}'.
    Context from mind map: {context}
    
    The note should be in Markdown format and include:
    1.  **Overview**: A clear, concise introduction.
    2.  **Key Concepts**: Bullet points of main ideas.
    3.  **Detailed Explanation**: In-depth analysis.
    4.  **Tables**: Compare/Contrast or data tables if applicable.
    5.  **Equations/Math**: Use LaTeX formatting (e.g., $E=mc^2$) where relevant.
    
    Make it educational, structured, and easy to read.
    """
    
    try:
        model = genai.GenerativeModel("gemini-2.5-flash-lite") # Use flash for speed/docs
        response = model.generate_content(prompt)
        return jsonify({'note': response.text})
    except Exception as e:
        return jsonify({'note': f"Error generating note: {str(e)}"}), 500

if __name__ == '__main__':
    app.run("0.0.0.0",debug=True, port=5000)
