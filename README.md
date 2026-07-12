# MindMap.AI ✦ Intelligent Knowledge Synthesis

[![Python](https://img.shields.io/badge/Python-3.9+-blue.svg?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-2.0+-000000.svg?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![Gemini](https://img.shields.io/badge/Google_Gemini-AI-orange.svg?style=for-the-badge&logo=google-gemini&logoColor=white)](https://ai.google.dev/)
[![D3.js](https://img.shields.io/badge/D3.js-v7-F9A03C.svg?style=for-the-badge&logo=d3.js&logoColor=white)](https://d3js.org/)

**MindMap.AI** is a premium, AI-driven knowledge synthesis and visualization application. It is designed to transform dense academic syllabi, complex documentation, or lengthy text blocks into intuitive, hierarchical mind maps. Combining state-of-the-art Large Language Models (LLMs) with a high-performance interactive client canvas, MindMap.AI bridges the gap between raw data ingestion and structured visual learning.

---

## ✦ System Component Architecture

The system follows a modern decoupled architecture where the visual canvas is rendered on the client browser dynamically from JSON data streams compiled by the Flask backend server.

```mermaid
graph TB
    subgraph Client ["Client Layer (Frontend Browser)"]
        UI["HTML5 / CSS3 (Glassmorphism UI)"]
        D3["D3.js (Canvas & Interactive Tree)"]
        Math["MathJax (LaTeX Renderer)"]
        Marked["Marked.js (Markdown Parser)"]
        YTPlayer["YouTube IFrame Player API"]
    end

    subgraph Server ["Application Server (Flask Backend)"]
        Flask["Flask Web App (app.py)"]
        AuthMgr["Flask-Login / Authlib"]
        ORM["SQLAlchemy ORM"]
        YTTranscript["YouTubeTranscriptApi"]
        GeminiSDK["Google GenAI Client"]
    end

    database DB[("SQLite/PostgreSQL DB")]

    subgraph External ["External Services"]
        GoogleOAuth["Google OAuth 2.0 Server"]
        GeminiAPI["Google Gemini AI API"]
        YToembed["YouTube OEMbed Service"]
    end

    UI --> D3
    UI --> Marked
    UI --> Math
    UI --> YTPlayer

    UI <-->|HTTPS / AJAX / SSE| Flask
    Flask --> AuthMgr
    Flask --> ORM
    Flask --> YTTranscript
    Flask --> GeminiSDK

    ORM --> DB
    AuthMgr <--> GoogleOAuth
    GeminiSDK <--> GeminiAPI
    YTTranscript <--> YToembed
```

---

## ✦ Key Features & Technical Workflows

### 1. One-Click Cognitive Mapping (Syllabus/Text)
*   **Pipeline Flow**: Upon receiving syllabus text from [templates/dashboard.html](file:///d:/Mind-Map/templates/dashboard.html), the backend initiates a structured prompt mapping sequence.
*   **LLM Inference**: The prompt requests Google Gemini to categorize text content into **Main Topics** (modules), **Sub-Topics** (concepts), and **Granular Details** (specifics).
*   **Output Control**: It enforces a strict JSON schema where nodes correctly link to parent node identifiers, with root nodes referencing the main `"title"`.
*   **Model Fallback Strategy**: The server queries the primary model `gemini-3.1-flash-lite`. If it encounters a rate limit or service unavailability (HTTP 503), it seamlessly falls back to `gemini-2.5-flash-lite` to ensure high availability.

### 2. YouTube Video Ingestion & SSE Streaming Pipeline
*   **Extraction & Validation**: The backend extracts the YouTube Video ID from incoming URLs using regex pattern matching.
*   **Streaming Server-Sent Events (SSE)**: To support long-running ingestion operations, the endpoint `/generate_youtube_mindmap` yields real-time updates as chunked SSE EventStreams:
    1.  `validate`: Checks link formatting.
    2.  `transcript`: Starts downloading subtitle transcripts.
    3.  `ai_generation`: Starts prompt processing using LLM models.
    4.  `success`: Returns the fully structured mindmap JSON.
*   **Metadata Fallback**: If subtitles are disabled or unavailable, the backend queries the YouTube oEmbed API to fetch the video's title and creator name, then instructs Gemini to synthesize a theoretical structure based on that subject matter.
*   **Timestamp Synchronization**: For transcripts containing subtitles, Gemini identifies when specific sub-topics begin. It extracts those `[MM:SS]` time markers, calculates the total offset in seconds, and attaches them to the respective child node.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Frontend Browser (main.js)
    participant BE as Flask Server (app.py)
    participant YT as YouTube Transcript API / oEmbed
    participant AI as Google Gemini API
    participant DB as Database (SQLite/PostgreSQL)

    User->>FE: Enters YouTube URL & clicks 'Generate'
    FE->>BE: POST /generate_youtube_mindmap (payload: url)
    activate BE
    BE-->>FE: SSE status: "validate" (Success)
    BE-->>FE: SSE status: "transcript" (Pending)
    
    alt Fetch transcript from subtitles
        BE->>YT: fetch transcripts (video_id)
        YT-->>BE: captions list (texts + timestamps)
    else Subtitles unavailable (Fallback)
        BE->>YT: fetch oEmbed metadata (video_id)
        YT-->>BE: title & author
    end

    BE-->>FE: SSE status: "transcript" (Success)
    BE-->>FE: SSE status: "ai_generation" (Pending)
    
    BE->>AI: generate_content(prompt + transcript/metadata, schema)
    AI-->>BE: structured JSON mindmap
    
    BE-->>FE: SSE status: "ai_generation" (Success)
    BE-->>FE: SSE status: "success" (Data payload)
    deactivate BE
    
    FE->>FE: Renders interactive SVG D3 tree
    FE->>FE: Mounts YouTube Player with timestamps
    
    User->>FE: Clicks 'Save Mindmap'
    FE->>BE: POST /api/save_mindmap (JSON nodes + title)
    BE->>DB: Insert Mindmap & Node entities
    DB-->>BE: Commit OK
    BE-->>FE: Return mindmap_id
    FE->>User: Redirect to /app/<mindmap_id>
```

### 3. Interactive Canvas (D3.js v7 Rendering Engine)
Implemented in [static/js/main.js](file:///d:/Mind-Map/static/js/main.js), the canvas provides an advanced navigation interface:
*   **D3 Tree Layout**: Translates hierarchical structures into hierarchical nodes.
*   **NotebookLM-Style Collision Avoidance**: Integrates custom radial padding to eliminate label collisions.
*   **Interactive Controls**:
    *   **Expand/Collapse Transitions**: Clicking on a parent node toggles the visibility of its sub-branches, animated smoothly using SVG transitions.
    *   **Zoom & Pan bounds**: D3-zoom limits minimum/maximum zoom scale to prevent elements from escaping the viewport bounds.
    *   **Fit to View**: Rescales the camera projection to show the entire structure centered on the canvas.

### 4. Interactive Study Sidebar & Ask AI Chat Guardrails
When a node is selected, a context-bound workspace slides out to offer two modes:
*   **Detailed Study Notes**: Generates in-depth Markdown summaries. Users can customize options inside settings:
    *   `include_images`: Instructs the LLM to search for and inject topic-appropriate stock diagrams using Unsplash API placeholders.
    *   `include_mermaid`: Instructs the LLM to write syntax-correct flowchart diagrams using `mermaid.js` inside markdown blocks.
    *   The frontend renders these nodes using `Marked.js` for Markdown, `MathJax v3` for mathematical LaTeX expressions, and initiates a local Mermaid parser.
*   **Contextual Ask AI Chat**: A chat interface enables direct conversation with the topic node. To prevent abuse, the prompt sets strict **Guardrail Rules**:
    *   Answers must be relevant only to the active node topic and its parent context.
    *   If the user's query is off-topic, unrelated, or attempts to prompt-inject or override instructions, the model politely declines and prompts the user to focus back on the node.
    *   All messages are saved to the database.

```mermaid
stateDiagram-v2
    [*] --> Idle: User views mindmap canvas
    Idle --> NodeSelected: Click Node on canvas
    
    state NodeSelected {
        [*] --> FetchDetails
        FetchDetails --> RenderUI: Load notes & chat history from Database
        RenderUI --> ShowStudyPanel: Display sidebars & unlock controls
    }

    state ShowStudyPanel {
        [*] --> NotesAndChatUnlocked
        NotesAndChatUnlocked --> GenerateNotes: User clicks "Generate Notes"
        GenerateNotes --> GeminiAPI1: API call to /generate_note
        GeminiAPI1 --> DisplayNotes: Render Markdown/LaTeX (Marked.js / MathJax)
        DisplayNotes --> SaveNotesDB: Auto-save notes to /api/save_note

        NotesAndChatUnlocked --> AskAIChat: User submits chat query
        AskAIChat --> GuardrailCheck: POST /node_query
        state GuardrailCheck <<choice>>
        GuardrailCheck --> RejectQuery: Query is off-topic
        RejectQuery --> DisplayDeclined: Politely decline chat request
        GuardrailCheck --> ProcessQuery: Query is on-topic
        ProcessQuery --> GeminiAPI2: Send message with node context
        GeminiAPI2 --> DisplayResponse: Show answer in sidebar
        DisplayResponse --> SaveChatDB: Auto-save message to /api/save_chat
    }

    NodeSelected --> Idle: Click background / close panels
```

### 5. Multi-Auth & User Security Settings
*   **Local Accounts**: Secured with `Flask-Login` session management. Passwords are encrypted with SHA-256 using `werkzeug.security`'s `generate_password_hash` and `check_password_hash`.
*   **Google OAuth 2.0**: Implemented via `Authlib` to execute redirect Handshakes, exchanging Authorization Codes for Profile Tokens (`openid email profile` scopes).
*   **Session Persistence**: Flask sessions are marked permanent and scheduled with a lifetime of 30 days.

---

## ✦ Database Entity Relationship Diagram (ERD)

Database tables are managed using `SQLAlchemy` ORM. The relational models map user accounts, mindmap instances, hierarchical nodes, notes content, and node chat history.

```mermaid
erDiagram
    User {
        string id PK "UUID"
        string email UK "Unique, Not Null"
        string password_hash "Werkzeug Hash"
        datetime created_at
        boolean include_images
        boolean include_mermaid
    }
    Mindmap {
        string id PK "UUID"
        string user_id FK "References User.id"
        string title "Not Null"
        datetime created_at
        string youtube_video_id
        datetime last_opened_at
    }
    Node {
        string id PK "UUID"
        string mindmap_id FK "References Mindmap.id"
        string client_id "e.g. root, node-1"
        string parent_client_id
        string label
        string type "main_topic, sub_topic, detail"
        int timestamp "in seconds"
    }
    Note {
        string id PK "UUID"
        string node_id FK "References Node.id"
        string content "Markdown Text"
        datetime created_at
    }
    ChatMessage {
        string id PK "UUID"
        string node_id FK "References Node.id"
        string role "user or ai"
        string content
        int order_index
        datetime created_at
    }

    User ||--o{ Mindmap : owns
    Mindmap ||--o{ Node : contains
    Node ||--o{ Note : "has study note"
    Node ||--o{ ChatMessage : "contains chat history"
```

---

## ✦ Technical API Endpoints Reference

The backend app exposing routes inside [app.py](file:///d:/Mind-Map/app.py) handles auth, mindmap creation, note generations, and chats.

| Route | Method | Authentication | Payload Schema | Response / Description |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication & Profile** | | | | |
| `/` | `GET` | None | None | Renders landing page containing user register count. |
| `/api/signup` | `POST` | None | `{ "email": "...", "password": "..." }` | Standard credentials signup with validation checks. |
| `/api/login` | `POST` | None | `{ "email": "...", "password": "..." }` | Standard credentials login. Returns email on success. |
| `/api/logout` | `POST` | Required | None | Logs out current session. |
| `/login/google` | `GET` | None | None | Initiates redirection to Google OAuth server. |
| `/auth/google/callback` | `GET` | None | None | Callback handler for Google OAuth token exchange. |
| `/api/user` | `GET` | None | None | Checks current active user login state. |
| `/api/user/settings` | `GET` / `POST` | Required | `{ "include_images": bool, "include_mermaid": bool }` | Manages AI generated study note configurations. |
| **Mindmap Operations** | | | | |
| `/dashboard` | `GET` | Required | None | Renders dashboard workspace view. |
| `/app/<mindmap_id>` | `GET` | Required | None | Loads the main D3 interactive mindmap screen. |
| `/generate_mindmap` | `POST` | Required | `{ "syllabus": "..." }` | Analyzes syllabus text and returns structured JSON tree. |
| `/generate_youtube_mindmap` | `POST` | Required | `{ "url": "..." }` | Streaming SSE endpoint fetching transcript, prompting Gemini models. |
| `/api/save_mindmap` | `POST` | Required | `{ "title": "...", "nodes": [...], "youtube_video_id": "..." }` | Saves mindmap tree nodes. Returns `mindmap_id`. |
| `/api/get_mindmaps` | `GET` | Required | None | Returns a list of all mindmaps belonging to the user. |
| `/api/load_mindmap/<mindmap_id>` | `GET` | Required | None | Returns mindmap metadata and nodes from database. |
| `/api/rename_mindmap/<mindmap_id>`| `PUT` | Required | `{ "title": "..." }` | Renames the target mindmap document. |
| `/api/delete_mindmap/<mindmap_id>`| `DELETE`| Required | None | Deletes the mindmap and all dependent nodes, chats, notes. |
| **Notes & AI Chat** | | | | |
| `/generate_note` | `POST` | Required | `{ "topic": "...", "context": "..." }` | Queries Gemini AI to write markdown notes. |
| `/api/save_note` | `POST` | Required | `{ "mindmap_id": "...", "client_id": "...", "content": "..." }` | Persists user/AI custom notes text inside database. |
| `/api/get_note` | `POST` | Required | `{ "mindmap_id": "...", "client_id": "..." }` | Fetches the saved note content of the target node. |
| `/node_query` | `POST` | Required | `{ "node_label": "...", "context": "...", "query": "..." }` | Contextual Ask AI query with strict relevance guardrails. |
| `/api/save_chat` | `POST` | Required | `{ "mindmap_id": "...", "client_id": "...", "role": "user/ai", "content": "..." }` | Appends a chat message to the node database. |
| `/api/get_chat` | `POST` | Required | `{ "mindmap_id": "...", "client_id": "..." }` | Retrieves the sorted sequence chat history. |

---

## 🚀 Local Development Setup & Config

### Prerequisites
*   Python 3.9 or higher.
*   [Google Gemini API Key](https://aistudio.google.com/app/apikey).
*   Google Cloud Console Project configured with OAuth 2.0 Web Client credentials (for Google login integration).

### Environment Configuration
Create a `.env` file in the root directory:
```env
# Flask Settings
SECRET_KEY=super_secret_session_key_here
FLASK_DEBUG=True
FLASK_RUN_HOST=127.0.0.1

# AI Integrations
GEMINI_API_KEY=AIzaSyYourGeminiApiKeyHere

# Databases (SQLite for local development, Postgres/Neon for production)
DATABASE_URL=sqlite:///mindmap.db

# Google OAuth 2.0 Credentials
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your_google_client_secret
```

### Installation Steps

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/yourusername/Mind-Map.git
    cd Mind-Map
    ```

2.  **Install Dependencies**
    Using standard Python `pip`:
    ```bash
    pip install -r requirements.txt
    ```
    Or utilizing `uv` for faster installation:
    ```bash
    uv pip install -r requirements.txt
    ```

3.  **Database Initializations & Migrations**
    The database models will automatically set up SQLite schemas inside `mindmap.db` when the application starts. An integrated migration helper in [app.py](file:///d:/Mind-Map/app.py) checks if columns such as `youtube_video_id`, `timestamp`, or settings are present and runs `ALTER TABLE` statements dynamically if missing:
    ```bash
    python app.py
    ```



---

## 🤝 Contributing

We welcome contributions from the developer community! To contribute:
1.  Fork the repository and clone it locally.
2.  Create your development feature branch: `git checkout -b feature/AmazingFeature`.
3.  Commit your updates following standard semantic conventions: `git commit -m 'feat: Add some AmazingFeature'`.
4.  Push changes: `git push origin feature/AmazingFeature`.
5.  Submit a Pull Request for review.

---

<p align="center">
  Built with ❤️ by Debmalya
</p>
