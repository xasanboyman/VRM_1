#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "=== GitHub Chunk Separator and Repository Creator ==="

# 1. Verify GitHub CLI installation
if [ -f "$PWD/gh" ]; then
    GH_BIN="$PWD/gh"
elif command -v gh &> /dev/null; then
    GH_BIN="gh"
else
    echo "⚠️  GitHub CLI ('gh') is not installed or not in PATH."
    echo "Please install it (e.g., 'sudo apt install gh' or 'pacman -S github-cli') and run 'gh auth login' first."
    exit 1
fi

# 2. Check auth status
if ! "$GH_BIN" auth status &> /dev/null; then
    echo "⚠️  GitHub CLI is not authenticated."
    echo "Please run '$GH_BIN auth login' to authenticate with GitHub first, then run this script again."
    exit 1
fi

# 3. Retrieve GitHub Username
USER_NAME=$("$GH_BIN" api user -q .login)
echo "✅ Authenticated as GitHub user: $USER_NAME"

# List of chunks and descriptions
declare -A CHUNKS
CHUNKS["vrm-rendering"]="Three.js WebGL rendering, OrbitControls, and IndexedDB VRM model loader for avatar systems."
CHUNKS["animation-handling"]="Humanoid VRM animation player, emotion-blendshape mapper, auto-blinker, and micro-expressions."
CHUNKS["lip-sync"]="Web Audio Context linear PCM player with real-time time-domain voice amplitude lip sync driving."
CHUNKS["vision-tools"]="User camera stream, screen sharing streams, snapshot captures, and WebM video recorder tools."
CHUNKS["ai-integration"]="Google Gemini Live WebSocket client and microphone audio worklet stream integrator."
CHUNKS["telegram-relay"]="Log, snapshot, and video clip webhook forwarder relay built for Telegram bot APIs."

TEMP_DIR="./temp_split_workspace"
mkdir -p "$TEMP_DIR"

# Clean up function
cleanup() {
    echo "🧹 Cleaning up temporary workspace..."
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# 4. Push local changes in the main repo first
echo "=== Step 1: Pushing main VRM_1 repository updates ==="
if [ -d .git ]; then
    git add chunks/ split_and_push.sh
    if ! git diff-index --quiet HEAD; then
        git commit -m "feat: add modular open-source chunks and setup script"
    fi
    echo "Pushing main repository changes to origin/main..."
    git push origin main || echo "⚠️ Could not push main repository. You might need to push manually."
else
    echo "No .git folder found in root directory."
fi

# 5. Process each chunk
echo "=== Step 2: Splitting chunks into separate repositories ==="
for chunk in "${!CHUNKS[@]}"; do
    description="${CHUNKS[$chunk]}"
    echo "--------------------------------------------------"
    echo "📦 Processing chunk: $chunk"
    echo "📄 Description: $description"
    echo "--------------------------------------------------"
    
    CHUNK_SRC="./chunks/$chunk"
    CHUNK_DEST="$TEMP_DIR/$chunk"
    
    if [ ! -d "$CHUNK_SRC" ]; then
        echo "❌ Source folder $CHUNK_SRC not found. Skipping."
        continue
    fi
    
    # Copy files to temp location to keep main repo clean from nested git tracking
    mkdir -p "$CHUNK_DEST"
    cp -r "$CHUNK_SRC"/* "$CHUNK_DEST"/
    
    # Initialize Git inside the temp folder
    pushd "$CHUNK_DEST" > /dev/null
    git init -b main
    git config user.name "$USER_NAME"
    git config user.email "${USER_NAME}@users.noreply.github.com"
    git add .
    git commit -m "Initial commit of $chunk open-source module"
    
    # Check if repository already exists on GitHub
    REPO_EXISTS=false
    if "$GH_BIN" repo view "${USER_NAME}/${chunk}" &> /dev/null; then
        REPO_EXISTS=true
        echo "⚠️ Repository ${USER_NAME}/${chunk} already exists on GitHub."
    fi
    
    if [ "$REPO_EXISTS" = false ]; then
        echo "🚀 Creating repository on GitHub: ${USER_NAME}/${chunk}..."
        "$GH_BIN" repo create "${USER_NAME}/${chunk}" --public --description "$description" --source=. --push
        echo "✅ Repository created and pushed!"
    else
        echo "🔄 Updating existing repository..."
        # Add remote and push to existing
        git remote add origin "https://github.com/${USER_NAME}/${chunk}.git"
        git push -u origin main --force
        echo "✅ Existing repository updated!"
    fi
    
    popd > /dev/null
done

echo "=================================================="
echo "🎉 Split and push completed successfully!"
echo "All chunks are separate open-source repositories under https://github.com/$USER_NAME"
echo "=================================================="
