import os
import json
import re
import requests
from youtube_transcript_api import YouTubeTranscriptApi
from google import genai
from google.genai import types
from flask import Flask, render_template, request, jsonify, redirect, url_for, session, Response, stream_with_context
from dotenv import load_dotenv
from authlib.integrations.flask_client import OAuth
import dataclasses
import typing
import traceback
import uuid
from datetime import datetime, timedelta
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash

# Load environment variables
load_dotenv(override=True)
if not os.getenv('VERCEL'):
    os.environ['AUTHLIB_INSECURE_TRANSPORT'] = '1'

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv("SECRET_KEY", "fallback_secret")
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv("DATABASE_URL")
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    "pool_pre_ping": True,
    "pool_recycle": 300,
}

db = SQLAlchemy(app)
oauth = OAuth(app)

oauth.register(
    name='google',
    client_id=os.getenv('GOOGLE_CLIENT_ID'),
    client_secret=os.getenv('GOOGLE_CLIENT_SECRET'),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={
        'scope': 'openid email profile'
    }
)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'landing'

@login_manager.unauthorized_handler
def unauthorized():
    if request.path.startswith('/api/') or request.path == '/generate_mindmap':
        return jsonify({"error": "Unauthorized. Please log in."}), 401
    return app.response_class(
        response=f'<meta http-equiv="refresh" content="0;url=/?next={request.path}">',
        status=401,
        mimetype='text/html'
    )

# --- Database Models ---
class User(UserMixin, db.Model):
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Mindmap(db.Model):
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String, db.ForeignKey('user.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    nodes = db.relationship('Node', backref='mindmap', lazy=True, cascade='all, delete-orphan')

class Node(db.Model):
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    mindmap_id = db.Column(db.String, db.ForeignKey('mindmap.id'), nullable=False)
    client_id = db.Column(db.String, nullable=False) # 'root', 'node-1'
    parent_client_id = db.Column(db.String, nullable=True)
    label = db.Column(db.String(500), nullable=False)
    type = db.Column(db.String(50), nullable=False)
    notes = db.relationship('Note', backref='node', lazy=True, cascade='all, delete-orphan')

class Note(db.Model):
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    node_id = db.Column(db.String, db.ForeignKey('node.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class ChatMessage(db.Model):
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    node_id = db.Column(db.String, db.ForeignKey('node.id'), nullable=False)
    role = db.Column(db.String(10), nullable=False)  # 'user' or 'ai'
    content = db.Column(db.Text, nullable=False)
    order_index = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, user_id)

with app.app_context():
    db.create_all()

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("Warning: GEMINI_API_KEY not found in environment variables.")

# Initialize Client
try:
    client = genai.Client(api_key=GEMINI_API_KEY)
    print("Successfully initialized Google GenAI Client.")
except Exception as e:
    print(f"Failed to initialize Client: {e}")
    client = None

# Define schemas for structured output (referenced only, not strictly used with new SDK Pydantic yet unless we opt-in)
# For now, we stick to JSON schema in prompt for maximum compatibility with Lite models.
class MindMapNode(typing.TypedDict):
    id: str
    label: str
    parent: str
    type: str  # "main_topic", "sub_topic", "detail"

class MindMapData(typing.TypedDict):
    title: str
    nodes: list[MindMapNode]

@app.route('/')
def landing():
    return render_template('landing.html')

@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html')

@app.route('/app/<mindmap_id>')
@login_required
def index(mindmap_id):
    # Ensure mindmap belongs to user
    mm = Mindmap.query.filter_by(id=mindmap_id, user_id=current_user.id).first()
    if not mm:
        return "Mindmap not found or unauthorized.", 404
    return render_template('index.html', mindmap_id=mindmap_id, mindmap_title=mm.title)

def extract_youtube_id(url):
    """
    Extract the YouTube video ID from a URL.
    Returns None if the URL is invalid or ID could not be extracted.
    """
    pattern = r'(?:https?://)?(?:www\.)?(?:youtube\.com/(?:watch\?v=|embed/|shorts/)|youtu\.be/)([a-zA-Z0-9_-]{11})'
    match = re.search(pattern, url)
    if match:
        return match.group(1)
    return None

def fetch_youtube_metadata(video_id):
    try:
        url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        res = requests.get(url, timeout=5)
        if res.status_code == 200:
            data = res.json()
            return {
                "title": data.get("title", ""),
                "author": data.get("author_name", "")
            }
    except Exception as e:
        print(f"Failed to fetch YouTube metadata: {e}")
    return None

@app.route('/generate_youtube_mindmap', methods=['POST'])
@login_required
def generate_youtube_mindmap():
    if not client:
        return jsonify({"error": "Gemini Client not initialized. Check API Key."}), 500

    data = request.get_json()
    url = data.get('url', '').strip()

    if not url:
        return jsonify({"error": "No YouTube URL provided"}), 400

    video_id = extract_youtube_id(url)
    if not video_id:
        return jsonify({"error": "Invalid YouTube URL format."}), 400

    def generate():
        # Step 1: Validate URL and start fetching metadata
        yield "data: " + json.dumps({"step": "validate", "status": "success", "message": "YouTube URL validated successfully."}) + "\n\n"
        
        has_transcript = True
        transcript_text = ""
        video_meta = None
        
        # Step 2: Fetch transcript / metadata
        yield "data: " + json.dumps({"step": "transcript", "status": "pending", "message": "Retrieving subtitles/captions from YouTube..."}) + "\n\n"
        try:
            transcript_list = YouTubeTranscriptApi().fetch(video_id)
            transcript_text = " ".join([t.text for t in transcript_list])
        except Exception as e:
            print(f"Failed to fetch transcript: {e}")
            has_transcript = False

        if not has_transcript or not transcript_text.strip():
            # Fallback to metadata
            try:
                video_meta = fetch_youtube_metadata(video_id)
            except Exception as e:
                print(f"Failed to fetch metadata: {e}")
                
            if not video_meta or not video_meta.get("title"):
                yield "data: " + json.dumps({"step": "error", "message": "Could not retrieve transcript or video information. Please ensure the video exists and has captions enabled."}) + "\n\n"
                return

        yield "data: " + json.dumps({"step": "transcript", "status": "success", "message": "Subtitles retrieved successfully."}) + "\n\n"

        # Step 3: Analyze content with Gemini AI
        yield "data: " + json.dumps({"step": "ai_generation", "status": "pending", "message": "Analyzing video content with Gemini AI..."}) + "\n\n"

        if has_transcript:
            prompt = f"""
            Analyze the following video transcript text and generate a hierarchical structure for a mind map.
            The output must be a JSON object strictly following this schema:
            {{
              "title": "Main Topic/Subject of the Video",
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
            
            Video Transcript:
            {transcript_text}
            """
        else:
            prompt = f"""
            The YouTube video "{video_meta['title']}" by "{video_meta['author']}" does not have subtitles/captions enabled.
            Generate a detailed hierarchical structure for a mind map explaining the topic of this video based on its title and subject matter.
            The output must be a JSON object strictly following this schema:
            {{
              "title": "{video_meta['title']}",
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
            """

        models_to_try = ["gemini-2.5-flash-lite", "gemini-1.5-flash", "gemini-2.0-flash-exp"]
        mindmap_result = None
        is_unavailable = False

        for model_name in models_to_try:
            try:
                print(f"Attempting YouTube mindmap generation with: {model_name}")
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.7,
                        top_p=0.95,
                        top_k=40,
                        max_output_tokens=8192,
                        response_mime_type="application/json"
                    )
                )
                
                raw_text = response.text
                print(f"Raw AI Output: {raw_text[:200]}...") 

                clean_text = raw_text.strip()
                if clean_text.startswith("```json"):
                    clean_text = clean_text[7:]
                if clean_text.endswith("```"):
                    clean_text = clean_text[:-3]
                
                mindmap_result = json.loads(clean_text)
                break
            except Exception as e:
                err_str = str(e)
                print(f"Model {model_name} failed: {err_str}")
                if "503" in err_str or "UNAVAILABLE" in err_str or "high demand" in err_str:
                    is_unavailable = True
                continue

        if not mindmap_result:
            if is_unavailable:
                yield "data: " + json.dumps({
                    "step": "error",
                    "code": "GEMINI_503_UNAVAILABLE",
                    "message": "Gemini AI models are currently experiencing high demand. Please try again in a few moments."
                }) + "\n\n"
            else:
                yield "data: " + json.dumps({
                    "step": "error",
                    "message": "All AI models failed to generate a mind map from the transcript."
                }) + "\n\n"
            return

        yield "data: " + json.dumps({"step": "ai_generation", "status": "success", "message": "Mindmap structure synthesized by Gemini AI."}) + "\n\n"

        # Step 4: Finalizing & Saving
        yield "data: " + json.dumps({"step": "success", "data": mindmap_result}) + "\n\n"

    return Response(stream_with_context(generate()), mimetype='text/event-stream')

@app.route('/generate_mindmap', methods=['POST'])
def generate_mindmap():
    if not client:
        return jsonify({"error": "Client not initialized. Check API Key."}), 500

    data = request.get_json()
    syllabus_text = data.get('syllabus', '')
    print(f"Received Syllabus: {syllabus_text[:50]}...") # Debug

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

    # Model Fallback Strategy
    models_to_try = ["gemini-2.5-flash-lite", "gemini-1.5-flash", "gemini-2.0-flash-exp"]
    is_unavailable = False
    
    for model_name in models_to_try:
        try:
            print(f"Attempting generation with: {model_name}")
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.7,
                    top_p=0.95,
                    top_k=40,
                    max_output_tokens=8192,
                    response_mime_type="application/json"
                )
            )
            
            raw_text = response.text
            print(f"Raw AI Output: {raw_text[:200]}...") 

            # Robust JSON cleaning
            clean_text = raw_text.strip()
            if clean_text.startswith("```json"):
                clean_text = clean_text[7:]
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]
            
            result = json.loads(clean_text)
            return jsonify(result)

        except Exception as e:
            err_str = str(e)
            print(f"Model {model_name} failed: {err_str}")
            if "503" in err_str or "UNAVAILABLE" in err_str or "high demand" in err_str:
                is_unavailable = True
            continue

    if is_unavailable:
        return jsonify({
            "error": "Gemini AI models are currently experiencing high demand. Please try again in a few moments.",
            "code": "GEMINI_503_UNAVAILABLE"
        }), 503
    return jsonify({"error": "All models failed to generate mind map."}), 500

@app.route('/node_query', methods=['POST'])
def node_query():
    if not client:
        return jsonify({"error": "Client not initialized"}), 500

    data = request.get_json()
    node_label = data.get('node_label', '')
    context = data.get('context', '')
    user_query = data.get('query', '')

    if not node_label or not user_query:
        return jsonify({"error": "Missing node label or query"}), 400

    prompt = f"""
    Context: The user is exploring a mind map node labeled "{node_label}".
    Additional Context (if any): {context}
    
    User Query: {user_query}
    
    Provide a concise and helpful response (max 150 words) to the user's query regarding this topic.
    """

    models_to_try = ["gemini-2.5-flash-lite", "gemini-1.5-flash", "gemini-2.0-flash-exp"]
    is_unavailable = False
    
    for model_name in models_to_try:
        try:
            print(f"Attempting node query with: {model_name}")
            response = client.models.generate_content(
                model=model_name,
                contents=prompt
            )
            return jsonify({"response": response.text})
        except Exception as e:
            err_str = str(e)
            print(f"Model {model_name} failed in query: {err_str}")
            if "503" in err_str or "UNAVAILABLE" in err_str or "high demand" in err_str:
                is_unavailable = True
            continue

    if is_unavailable:
        return jsonify({
            "error": "Gemini AI models are currently experiencing high demand. Please try again in a few moments.",
            "code": "GEMINI_503_UNAVAILABLE"
        }), 503
    return jsonify({"error": "All models failed to generate response."}), 500

@app.route('/generate_note', methods=['POST', 'GET']) # Allow GET for easier debug in browser if needed, but primarily POST
def generate_note():
    if request.method == 'GET':
        return jsonify({"status": "Generate Note Endpoint Active"})

    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'note': "Error: Invalid JSON data received."}), 400
            
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
        
        print(f"\n[DEBUG] Sending Prompt to Gemini:\n{prompt}\n[DEBUG] End Prompt\n")

        models = ["gemini-2.5-flash-lite", "gemini-1.5-flash", "gemini-2.0-flash-exp"]
        is_unavailable = False
        
        for m in models:
            try:
                print(f"Attempting note generation with: {m}")
                response = client.models.generate_content(
                    model=m,
                    contents=prompt
                )
                return jsonify({'note': response.text})
            except Exception as inner_e:
                err_str = str(inner_e)
                print(f"Model {m} failed: {err_str}")
                if "503" in err_str or "UNAVAILABLE" in err_str or "high demand" in err_str:
                    is_unavailable = True
                continue

        if is_unavailable:
            return jsonify({
                "note": "Gemini AI models are currently experiencing high demand. Please try again in a few moments.",
                "error": "Gemini AI models are currently experiencing high demand. Please try again in a few moments.",
                "code": "GEMINI_503_UNAVAILABLE"
            }), 503
        return jsonify({"note": "All models failed to generate study note.", "error": "All models failed to generate study note."}), 500
    except Exception as e:
        print(f"Error generating note: {e}")
        traceback.print_exc()
        return jsonify({'note': f"Error generating note: {str(e)}"}), 500

# --- Auth Routes ---
@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already exists"}), 400
    user = User(email=email, password_hash=generate_password_hash(password))
    db.session.add(user)
    db.session.commit()
    login_user(user, remember=True)
    return jsonify({"success": True, "email": user.email})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    user = User.query.filter_by(email=email).first()
    if user and check_password_hash(user.password_hash, password):
        login_user(user, remember=True)
        return jsonify({"success": True, "email": user.email})
    return jsonify({"error": "Invalid email or password"}), 401

@app.route('/api/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({"success": True})

@app.route('/login/google')
def login_google():
    redirect_uri = url_for('auth_google_callback', _external=True)
    return oauth.google.authorize_redirect(redirect_uri)

@app.route('/auth/google/callback')
def auth_google_callback():
    try:
        token = oauth.google.authorize_access_token()
        user_info = token.get('userinfo')
        if not user_info:
            return redirect(url_for('landing'))
            
        email = user_info.get('email')
        if not email:
            return redirect(url_for('landing'))
            
        user = User.query.filter_by(email=email).first()
        if not user:
            # Create user with an empty string as password_hash to avoid NOT NULL constraints
            user = User(email=email, password_hash="")
            db.session.add(user)
            db.session.commit()
            
        login_user(user, remember=True)
        return redirect(url_for('dashboard'))
    except Exception as e:
        print(f"OAuth error: {e}")
        return redirect(url_for('landing'))

@app.route('/api/user', methods=['GET'])
def get_user():
    if current_user.is_authenticated:
        return jsonify({"email": current_user.email})
    return jsonify({"email": None})

# --- Database Routes ---
@app.route('/api/save_mindmap', methods=['POST'])
@login_required
def save_mindmap():
    data = request.get_json()
    title = data.get('title')
    nodes_data = data.get('nodes', [])
    
    mm = Mindmap(user_id=current_user.id, title=title)
    db.session.add(mm)
    db.session.commit()
    
    for n in nodes_data:
        node = Node(
            mindmap_id=mm.id,
            client_id=n.get('id'),
            parent_client_id=n.get('parent'),
            label=n.get('label'),
            type=n.get('type')
        )
        db.session.add(node)
    
    db.session.commit()
    return jsonify({"success": True, "mindmap_id": mm.id})

@app.route('/api/get_mindmaps', methods=['GET'])
@login_required
def get_mindmaps():
    maps = Mindmap.query.filter_by(user_id=current_user.id).order_by(Mindmap.created_at.desc()).all()
    res = [{"id": m.id, "title": m.title, "created_at": m.created_at.isoformat()} for m in maps]
    return jsonify(res)

@app.route('/api/delete_mindmap/<mindmap_id>', methods=['DELETE'])
@login_required
def delete_mindmap(mindmap_id):
    mm = Mindmap.query.filter_by(id=mindmap_id, user_id=current_user.id).first()
    if not mm: return jsonify({"error": "Not found or unauthorized"}), 404
    db.session.delete(mm)
    db.session.commit()
    return jsonify({"success": True})

@app.route('/api/rename_mindmap/<mindmap_id>', methods=['PUT'])
@login_required
def rename_mindmap(mindmap_id):
    data = request.get_json()
    new_title = data.get('title')
    if not new_title or not new_title.strip():
        return jsonify({"error": "Title is required"}), 400
    mm = Mindmap.query.filter_by(id=mindmap_id, user_id=current_user.id).first()
    if not mm: return jsonify({"error": "Not found or unauthorized"}), 404
    mm.title = new_title.strip()
    db.session.commit()
    return jsonify({"success": True})


@app.route('/api/load_mindmap/<mindmap_id>', methods=['GET'])
@login_required
def load_mindmap(mindmap_id):
    mm = Mindmap.query.filter_by(id=mindmap_id, user_id=current_user.id).first()
    if not mm: return jsonify({"error": "Not found"}), 404
    nodes = Node.query.filter_by(mindmap_id=mm.id).all()
    node_list = [{
        "id": n.client_id,
        "parent": n.parent_client_id,
        "label": n.label,
        "type": n.type
    } for n in nodes]
    return jsonify({"title": mm.title, "nodes": node_list})

@app.route('/api/save_note', methods=['POST'])
@login_required
def save_note():
    data = request.get_json()
    mindmap_id = data.get('mindmap_id')
    client_id = data.get('client_id')
    content = data.get('content')
    
    node = Node.query.filter_by(mindmap_id=mindmap_id, client_id=client_id).first()
    if not node: return jsonify({"error": "Node not found"}), 404
    
    note = Note.query.filter_by(node_id=node.id).first()
    if note:
        note.content = content
    else:
        note = Note(node_id=node.id, content=content)
        db.session.add(note)
    
    db.session.commit()
    return jsonify({"success": True})

@app.route('/api/get_note', methods=['POST'])
@login_required
def get_note_db():
    data = request.get_json()
    mindmap_id = data.get('mindmap_id')
    client_id = data.get('client_id')
    
    node = Node.query.filter_by(mindmap_id=mindmap_id, client_id=client_id).first()
    if not node: return jsonify({"note": None})
    
    note = Note.query.filter_by(node_id=node.id).first()
    if not note: return jsonify({"note": None})
    return jsonify({"note": note.content})

# --- Chat History Routes ---
@app.route('/api/save_chat', methods=['POST'])
@login_required
def save_chat():
    data = request.get_json()
    mindmap_id = data.get('mindmap_id')
    client_id = data.get('client_id')
    role = data.get('role')  # 'user' or 'ai'
    content = data.get('content')
    
    node = Node.query.filter_by(mindmap_id=mindmap_id, client_id=client_id).first()
    if not node: return jsonify({"error": "Node not found"}), 404
    
    # Get next order index
    last_msg = ChatMessage.query.filter_by(node_id=node.id).order_by(ChatMessage.order_index.desc()).first()
    next_index = (last_msg.order_index + 1) if last_msg else 0
    
    msg = ChatMessage(node_id=node.id, role=role, content=content, order_index=next_index)
    db.session.add(msg)
    db.session.commit()
    return jsonify({"success": True, "order_index": next_index})

@app.route('/api/get_chat', methods=['POST'])
@login_required
def get_chat():
    data = request.get_json()
    mindmap_id = data.get('mindmap_id')
    client_id = data.get('client_id')
    
    node = Node.query.filter_by(mindmap_id=mindmap_id, client_id=client_id).first()
    if not node: return jsonify({"messages": []})
    
    messages = ChatMessage.query.filter_by(node_id=node.id).order_by(ChatMessage.order_index.asc()).all()
    result = [{"role": m.role, "content": m.content} for m in messages]
    return jsonify({"messages": result})

if __name__ == '__main__':
    app.run("0.0.0.0", debug=True, port=5000)
