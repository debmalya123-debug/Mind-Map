# MindMap.AI — System Architecture & Flows Diagrams

This document contains multiple PlantUML diagrams representing the architecture, database models, core workflows, and system state behaviors of the **MindMap.AI** application. 

You can copy and paste the PlantUML syntax below into any PlantUML editor/viewer (such as [PlantText](https://www.planttext.com/) or the VS Code PlantUML extension) to render the visual diagrams.

---

## 1. System Component Architecture
This component diagram shows the overall modular structure of MindMap.AI, illustrating how the frontend UI and visual engines communicate with the Flask backend, SQLite database, and external Google APIs.

```plantuml
@startuml MindMap_System_Components
skinparam backgroundColor #1e1e24
skinparam Handwritten false
skinparam DefaultFontName "Inter"
skinparam DefaultFontSize 12
skinparam DefaultFontColor #ffffff

skinparam component {
  BackgroundColor #27272a
  BorderColor #3f3f46
  FontColor #ffffff
  ArrowColor #a1a1aa
}
skinparam database {
  BackgroundColor #18181b
  BorderColor #3f3f46
  FontColor #ffffff
}
skinparam interface {
  LinkColor #ffffff
  FontColor #ffffff
}

package "Client Layer (Frontend Browser)" {
    [HTML5 / CSS3 (Glassmorphism UI)] as ui
    [D3.js (Canvas & Interactive Tree)] as d3_engine
    [MathJax (LaTeX Formula Renderer)] as mathjax
    [Marked.js (Markdown Parser)] as markedjs
    [YouTube IFrame Player API] as yt_player
}

package "Application Server (Flask Backend)" {
    [Flask Web App (app.py)] as flask_app
    [Flask-Login / Authlib (Session & Google OAuth)] as auth_mgr
    [SQLAlchemy (ORM Data Access)] as orm
    [YouTubeTranscriptApi (Subtitles Fetcher)] as yt_transcript
    [Google GenAI Client (Gemini SDK Wrapper)] as gemini_sdk
}

database "SQLite Database\n(mindmap.db)" as db

cloud "External Services" {
    [Google OAuth 2.0 Server] as google_oauth
    [Google Gemini AI API] as gemini_api
    [YouTube OEMbed Service] as yt_oembed
}

' Client & Server Connections
ui --> d3_engine : "Sends Mindmap Hierarchical Nodes"
ui --> markedjs : "Parses Study Notes to HTML"
ui --> mathjax : "Renders Mathematical LaTeX"
ui --> yt_player : "Controls Timestamp Video Synchronization"

ui <..> flask_app : "HTTPS / AJAX API / EventStream (SSE)"

' Backend components
flask_app --> auth_mgr : "Manages Session Credentials"
flask_app --> orm : "Performs DB CRUD Queries"
flask_app --> yt_transcript : "Fetches Subtitles from Video URL"
flask_app --> gemini_sdk : "Orchestrates AI Prompts"

orm --> db : "Persists User & Mindmap data"

' External services interactions
auth_mgr <--> google_oauth : "Google Login Redirect / Token Exchange"
gemini_sdk <--> gemini_api : "Sends Prompts & Receives Structured JSON"
yt_transcript <--> yt_oembed : "Fallback to Video Title & Author Metadata"

@enduml
```

---

## 2. Database Entity Relationship Diagram (ERD)
This diagram models the backend database entities managed through SQLAlchemy ORM, including relationships, tables, fields, and constraints.

```plantuml
@startuml MindMap_ER_Diagram
skinparam backgroundColor #1e1e24
skinparam DefaultFontName "Inter"
skinparam DefaultFontColor #ffffff
skinparam RoundCorner 8
skinparam class {
  BackgroundColor #27272a
  BorderColor #3f3f46
  FontColor #ffffff
  HeaderBackgroundColor #3f3f46
  AttributeFontColor #a1a1aa
}
skinparam ArrowColor #a1a1aa

entity "User" as user {
  * id : VARCHAR [PK] (UUID)
  --
  * email : VARCHAR(120) [Unique, Not Null]
  * password_hash : VARCHAR(256)
  * created_at : DATETIME
}

entity "Mindmap" as mindmap {
  * id : VARCHAR [PK] (UUID)
  --
  * user_id : VARCHAR [FK -> User.id]
  * title : VARCHAR(200) [Not Null]
  * created_at : DATETIME
  youtube_video_id : VARCHAR(50)
  last_opened_at : DATETIME
}

entity "Node" as node {
  * id : VARCHAR [PK] (UUID)
  --
  * mindmap_id : VARCHAR [FK -> Mindmap.id]
  * client_id : VARCHAR [Not Null] (e.g. 'root', 'node-1')
  parent_client_id : VARCHAR
  * label : VARCHAR(500) [Not Null]
  * type : VARCHAR(50) [Not Null]
  timestamp : INTEGER (in seconds)
}

entity "Note" as note {
  * id : VARCHAR [PK] (UUID)
  --
  * node_id : VARCHAR [FK -> Node.id]
  * content : TEXT [Not Null]
  * created_at : DATETIME
}

entity "ChatMessage" as chat {
  * id : VARCHAR [PK] (UUID)
  --
  * node_id : VARCHAR [FK -> Node.id]
  * role : VARCHAR(10) [Not Null] ('user' or 'ai')
  * content : TEXT [Not Null]
  * order_index : INTEGER [Not Null] (ordering of conversation)
  * created_at : DATETIME
}

user ||--o{ mindmap : "owns"
mindmap ||--o{ node : "contains"
node ||--o{ note : "has study note"
node ||--o{ chat : "contains chat history"

@enduml
```

---

## 3. YouTube Mindmap Generation Flow (Sequence Diagram)
This sequence diagram demonstrates the streaming pipeline when a user submits a YouTube video link to generate a mindmap. It visualizes the step-by-step Server-Sent Events (SSE) updates pushed to the client browser during transcription and Gemini analysis.

```plantuml
@startuml YouTube_Mindmap_Generation_Flow
skinparam backgroundColor #1e1e24
skinparam DefaultFontName "Inter"
skinparam DefaultFontColor #ffffff
skinparam sequence {
  ActorBackgroundColor #27272a
  ActorBorderColor #3f3f46
  ActorFontColor #ffffff
  ParticipantBackgroundColor #27272a
  ParticipantBorderColor #3f3f46
  ParticipantFontColor #ffffff
  LifeLineBackgroundColor #3f3f46
  LifeLineBorderColor #3f3f46
  ArrowColor #a1a1aa
}

actor User as u
participant "Frontend Browser (main.js)" as fe
participant "Flask Server (app.py)" as be
participant "YouTube Transcript API" as yt_api
participant "Google Gemini API" as gemini
database "SQLite DB" as db

u -> fe : Enters YouTube URL & clicks 'Generate'
fe -> be : POST /generate_youtube_mindmap (payload: url)
activate be

be -> fe : Stream (SSE): status = pending ("validate")
note right of be: Extract video_id from URL

be -> fe : Stream (SSE): status = pending ("transcript")
alt Retrieve Video Transcript
    be -> yt_api : fetch(video_id)
    yt_api --> be : Return captions with starts/texts
else Transcript Unavailable (Fallback to Metadata)
    be -> be : fetch_youtube_metadata(video_id)
    note right of be: Fetch via YouTube OEMbed API
end

be -> fe : Stream (SSE): status = success ("transcript retrieved")

be -> fe : Stream (SSE): status = pending ("ai_generation")
be -> gemini : Send prompt + transcript context (Response Schema: MindMapData)
activate gemini
gemini --> be : Return structured JSON with hierarchical nodes & timestamps
deactivate gemini

be -> fe : Stream (SSE): status = success ("ai_generation complete")
be -> fe : Stream (SSE): status = success (Data + video_id)
deactivate be

fe -> fe : Parse JSON to D3 tree structure
fe -> fe : Render interactive SVG Node Tree
fe -> fe : Embed floating YouTube IFrame player (with video_id)

u -> fe : Clicks 'Save Mindmap'
fe -> be : POST /api/save_mindmap (JSON nodes + title)
activate be
be -> db : Save Mindmap, Nodes records
db --> be : OK
be --> fe : JSON response (success: true, mindmap_id)
deactivate be
fe -> u : Redirects / updates URL to /app/<mindmap_id>

@enduml
```

---

## 4. Interactive Node Detail Panel & Study Assistant Flow (State / Activity)
This diagram illustrates the state transitions when a user interacts with nodes on the canvas. It details how the contextual study assistant enforces prompt guardrails to prevent off-topic questions, and how study notes are generated and stored.

```plantuml
@startuml Node_Study_Chat_Flow
skinparam backgroundColor #1e1e24
skinparam DefaultFontName "Inter"
skinparam DefaultFontColor #ffffff
skinparam state {
  BackgroundColor #27272a
  BorderColor #3f3f46
  FontColor #ffffff
  StartColor #ffffff
  EndColor #ffffff
  ArrowColor #a1a1aa
}

[*] --> Idle : User views interactive mindmap canvas

state Idle {
}

Idle --> NodeSelected : User clicks on a node

state NodeSelected {
  [*] --> FetchDetails
  FetchDetails --> RenderUI : Fetch saved notes & chat messages from SQLite
  RenderUI --> ShowStudyPanel : Display node info panel
  RenderUI --> EnableChatInput : Unlock AI Chat sidebar (bind node context)
}

state ShowStudyPanel {
  state "User clicks 'Generate Study Notes'" as NotesClicked
  state "API request to Flask backend" as NotesAPICall
  state "Invoke Gemini model with prompt" as GeminiNoteCall
  state "Render notes using Marked & MathJax" as RenderNotes
  state "Save notes to SQLite DB" as SaveNotes
  
  NotesClicked --> NotesAPICall : Clicks Generate Button
  NotesAPICall --> GeminiNoteCall : POST /generate_note (topic, context)
  GeminiNoteCall --> RenderNotes : Returns Markdown study notes
  RenderNotes --> SaveNotes : POST /api/save_note
  SaveNotes --> ShowStudyPanel : Display generated guide in panel
}

state EnableChatInput {
  state "User submits a chat message" as ChatSubmitted
  state "Flask Server receives query" as ServerReceivesChat
  state "Guardrail check in prompt" as PromptChecks
  state "Invoke Gemini model" as GeminiChatCall
  state "Display AI Response" as DisplayResponse
  state "Save chat history to SQLite DB" as SaveChat
  
  ChatSubmitted --> ServerReceivesChat : POST /node_query (node_label, context, query)
  ServerReceivesChat --> PromptChecks : Evaluate query context
  PromptChecks --> GeminiChatCall : Query is relevant to selected node
  PromptChecks --> DisplayResponse : Query is off-topic (politely declines)
  GeminiChatCall --> DisplayResponse : Returns answer
  DisplayResponse --> SaveChat : POST /api/save_chat (role, content)
  SaveChat --> EnableChatInput : Awaiting next prompt
}

NodeSelected --> Idle : User clicks background or closes panels

@enduml
```
