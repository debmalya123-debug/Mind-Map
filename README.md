# Sankalp.AI - Intelligent Mind Map Generator

A powerful, AI-powered Mind Mapping tool that transforms syllabus text into interactive, hierarchical study visualisations. Built with **Flask**, **Google Gemini AI**, and **D3.js**.

## 🌟 Key Features

- **AI-Powered Visualization**: Instantly turns any text or syllabus into a structured mind map.
- **Liquid Glass UI**: A premium, modern, glassmorphism-inspired interface for a distraction-free study experience.
- **Static Tree Layout**: Clean, organized left-to-right tree structure (NotebookLM style) with zero overlap.
- **Interactive Nodes**:
  - **Expand/Collapse**: Progressive disclosure of topics.
  - **Drag & Drop**: Manually arrange nodes to customize your view.
  - **Zoom & Pan**: Infinite canvas navigation.
- **Ask AI**: Select any node and ask specific questions to get instant, context-aware answers.
- **Smart Study Notes**: Generate comprehensive, Markdown-formatted study notes with tables and equations for any node.
- **Mobile Optimized**: Fully responsive design that works seamlessly on touch devices.

## 🛠️ Tech Stack

- **Backend**: Python, Flask
- **AI Engine**: Google Gemini API (Primary: `gemini-2.5-flash-lite`)
- **Frontend**: HTML5, CSS3 (Custom Glassmorphism), D3.js (v7)
- **Rendering**: Marked.js (Markdown), MathJax (LaTeX Equations)

## 🚀 Setup & Installation

1.  **Clone the Repository**

    ```bash
    git clone <repository-url>
    cd Mind-Map
    ```

2.  **Install Dependencies**

    ```bash
    pip install -r requirements.txt
    ```

3.  **Environment Configuration**
    Create a `.env` file in the root directory and add your Google Gemini API key:

    ```env
    GEMINI_API_KEY=your_api_key_here
    ```

4.  **Run the Application**

    ```bash
    python app.py
    ```

5.  **Access the App**
    Open your browser and navigate to: `http://localhost:5000`

## 📖 Usage Guide

1.  **Generate Map**: Paste your syllabus or topic text into the input box on the left and click "Generate Mind Map".
2.  **Explore**: Click nodes to expand/collapse sub-topics. Drag nodes to rearrange them.
3.  **Ask Questions**: Click a node to select it. Use the "Ask AI" box in the left panel to ask clarifying questions about that specific topic.
4.  **Create Notes**: With a node selected, click "Generate Note" in the right sidebar (if closed, clicking a node opens it). The AI will auto-generate a detailed study guide for you.

## 🔧 Troubleshooting

- **"Generate Map" Button Not Working?**

  - Ensure you have a valid `.env` file with `GEMINI_API_KEY`.
  - Hard refresh your browser (`Ctrl+F5`) to clear old JavaScript cache.
  - Check the terminal for any Python errors.

- **"Error connecting to AI" in Notes?**
  - The app attempts to use `gemini-2.5-flash-lite` first. If it fails (e.g., overloaded), it falls back to `gemini-1.5-flash`.
  - Check your internet connection.

## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements.

---

_Built for the Future of Learning._
