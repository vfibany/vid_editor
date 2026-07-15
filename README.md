# 🎬 Local Video Editor & AI TTS Studio

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg?logo=python&logoColor=white)](https://www.python.org/)
[![React](https://img.shields.io/badge/React-18%2B-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![Docker](https://img.shields.io/badge/Docker-Supported-blue.svg?logo=docker&logoColor=white)](https://www.docker.com/)
[![Supabase](https://img.shields.io/badge/Database-Supabase-green.svg?logo=supabase&logoColor=white)](https://supabase.com/)
[![Local AI](https://img.shields.io/badge/AI_Engine-F5--TTS%20%2F%20Local-orange.svg?logo=huggingface&logoColor=white)](https://github.com/SWivid/F5-TTS)

**A fully local, private video editor and AI voice cloning studio. Edit video timelines and generate high-fidelity, zero-shot personal voice clone narration completely on your own hardware.**

[Key Features](#-key-features) • [Tech Stack](#-tech-stack) • [Quick Start](#-quick-start) • [Development](#-development) • [Project Structure](#-project-structure)

</div>

---

## ✨ Key Features

*   🎙️ **100% Local Voice Cloning** – Generate studio-grade TTS narrations using local zero-shot engines (F5-TTS/Fish Speech) with as little as a 10-second reference clip.
*   ✂️ **Timeline-Based Video Editing** – Seamlessly align your generated audio voiceovers with your video tracks on a multi-track editor.
*   🔒 **Privacy First** – Zero cloud APIs. Your voice data, videos, and scripts never leave your machine.
*   🗃️ **Local Asset Management** – Manage scripts, video projects, and voice profiles locally using Docker-hosted database configurations.

---

## 🛠️ Tech Stack

Our architecture is built for ultra-low latency, modularity, and easy local orchestration:

*   **Frontend:** React (TypeScript) + Tailwind CSS for a fluid, interactive timeline editor interface.
*   **Backend:** Python (FastAPI) to handle local media rendering, audio processing, and model inference.
*   **AI Engine:** F5-TTS / PyTorch (configured for NVIDIA CUDA and Apple Silicon MPS hardware acceleration).
*   **Database & Storage:** Supabase (Local Docker instance) for project state, script tracking, and asset metadata.
*   **Containerization:** Docker & Docker Compose for hassle-free environment setup.

---

## 🚀 Quick Start

### Prerequisites

*   [Docker & Docker Compose](https://www.docker.com/products/docker-desktop/)
*   [Python 3.10+](https://www.python.org/downloads/)
*   [Node.js 18+](https://nodejs.org/)
*   *For hardware acceleration:* NVIDIA GPU (CUDA toolkit installed) or Apple Silicon (M1/M2/M3).

### 1. Clone and Configure

```bash
git clone [https://github.com/yourusername/local-video-editor.git](https://github.com/yourusername/local-video-editor.git)
cd local-video-editor
