#!/bin/bash
# ==============================================================================
# ROAR BLISS REPRODUCTION SCRIPT
# ==============================================================================

# Exit immediately if a command exits with a non-zero status
set -e

# Clear terminal screen
clear

echo "=============================================================="
echo "          ROAR BLISS PERSONALIZATION REPRODUCTION"
echo "=============================================================="

# Define base paths
PROJECT_DIR="/Users/clarence/Desktop/Roar Bliss App"
POC_DIR="$PROJECT_DIR/poc"

# Move to the POC directory
echo "Step 1: Navigating to POC workspace..."
cd "$POC_DIR"

# Activate Python Virtual Environment
echo "Step 2: Activating Virtual Environment..."
if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "✗ Python virtual environment 'venv' not found. Please set it up first."
    exit 1
fi

# Clear Voice Cache to ensure clean high-fidelity synthesis
echo "Step 3: Flushing local TTS voice cache directory..."
rm -rf output/tts_cache/* || true
echo "✓ TTS cache flushed."

# Execute Pipeline Compilation
echo "Step 4: Compiling high-fidelity personalized motivation soundtrack..."
python3 poc_pipeline.py \
  "$PROJECT_DIR/The Targaryen Wolf (Original Soundtrack) Game of Thrones.mp3" \
  --name "Clarence" \
  --mode narrative \
  --output "output/final_output.mp3"

# Verify Final Outputs
echo "Step 5: Verifying timelines and testing duration drift..."
python3 verify_output.py

echo "=============================================================="
echo "✓ SUCCESS: PERSONALIZED MASTER TRACK COMPILED!"
echo "Master file: $POC_DIR/output/final_output.mp3"
echo "=============================================================="
