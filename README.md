# MindMap.AI ✦ Intelligent Knowledge Synthesis

[![Python](https://img.shields.io/badge/Python-3.9+-blue.svg?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-2.0+-000000.svg?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![Gemini](https://img.shields.io/badge/Google_Gemini-AI-orange.svg?style=for-the-badge&logo=google-gemini&logoColor=white)](https://ai.google.dev/)
[![D3.js](https://img.shields.io/badge/D3.js-v7-F9A03C.svg?style=for-the-badge&logo=d3.js&logoColor=white)](https://d3js.org/)


**MindMap.AI** is a premium, AI-driven visualization tool designed to transform dense academic syllabi, complex documentation, or lengthy text blocks into intuitive, hierarchical mind maps. Built for students, researchers, and lifelong learners, it combines cutting-edge LLMs with a high-performance visual engine to streamline the path from information to insight.

---

## ✦ Key Features

### 🧠 One-Click Cognitive Mapping
Instantly convert any text into a structured tree of knowledge. Our AI engine (powered by Google Gemini) intelligently categorizes content into **Main Topics**, **Sub-Topics**, and **Granular Details**, creating a logical flow for study.

### 🌐 Dynamic Interactive Canvas
- **Fluid Animations**: Experience smooth, sequential expand/collapse transitions that maintain spatial context.
- **Precision Navigation**: Infinite zoom, panning, and a "Fit to View" system built with D3.js v7.
- **Auto-Layout**: NotebookLM-style tree architecture that ensures zero node overlap and maximum readability.

### 📝 Automated Study Intelligence
- **Deep-Dive Notes**: Select any node to generate comprehensive, Markdown-formatted study guides.
- **LaTeX Support**: Native rendering of complex mathematical equations and scientific formulas using MathJax.
- **Contextual Ask AI**: A persistent sidebar chat that understands your current focus. Ask clarifying questions about specific nodes and get instant, context-aware answers.

### 🗃️ Persistent Knowledge Library
- **Cloud Saving**: Your mind maps, generated notes, and even AI chat histories are securely persisted in a dedicated database.
- **Multi-Auth**: Secure access via traditional email/password or seamless **Google OAuth 2.0** integration.
- **Liquid Glass UI**: A state-of-the-art interface featuring modern glassmorphism, ambient glow effects, and a distraction-free dark theme.

---

## 🛠️ Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Backend** | Python, Flask, SQLAlchemy (PostgreSQL/SQLite) |
| **AI Engine** | Google GenAI SDK (Gemini 2.5 Flash Lite, 1.5 Flash) |
| **Frontend** | Vanilla JS (ES6+), D3.js v7, CSS3 (Glassmorphism) |
| **Auth** | Authlib, Google OAuth 2.0, Flask-Login |
| **Parsing** | Marked.js (Markdown), MathJax (LaTeX) |

---

## 🚀 Getting Started

### Prerequisites
- Python 3.9+
- [Google Gemini API Key](https://aistudio.google.com/app/apikey)
- (Optional) [uv](https://github.com/astral-sh/uv) for lightning-fast environment management.

### Installation & Setup

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/yourusername/Mind-Map.git
    cd Mind-Map
    ```

2.  **Environment Configuration**
    Create a `.env` file in the root directory:
    ```env
    SECRET_KEY=your_secret_key_here
    GEMINI_API_KEY=your_google_gemini_api_key
    DATABASE_URL=sqlite:///mindmap.db
    GOOGLE_CLIENT_ID=your_google_client_id
    GOOGLE_CLIENT_SECRET=your_google_client_secret
    ```

3.  **Install Dependencies**
    Using `pip`:
    ```bash
    pip install -r requirements.txt
    ```
    Or using `uv` (recommended):
    ```bash
    uv pip install -r requirements.txt
    ```

4.  **Initialize & Run**
    ```bash
    python app.py
    ```
    Access the application at `http://localhost:5000`.

---

## 📖 Usage Guide

1.  **Landing**: Click "Launch App" and sign in (or use Google).
2.  **Dashboard**: Click the **"+"** card to create a new map. Paste your material (e.g., "Physics Quantum Mechanics Syllabus") and hit **Generate**.
3.  **Interact**:
    - **Click Nodes**: Select to open the study sidebar.
    - **Generate Note**: Inside the sidebar, click the magic wand icon to create a detailed study guide.
    - **Ask AI**: Use the floating chat bubble on the bottom right to ask questions specific to your selected topic.
4.  **Management**: Your maps are automatically saved and accessible from the dashboard at any time.

---

## 🤝 Contributing

We welcome contributions! Whether it's a bug fix, a new feature, or a design improvement:
1. Fork the project.
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

<p align="center">
  Built with ❤️ by the Debmalya
</p>
