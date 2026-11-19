# Hosting the Samyukta server on Hugging Face Spaces (free)

The Docker SDK is a paid option on Hugging Face, so this uses the free **Gradio** SDK. It runs any Python
program: `app.py` starts Aparna's server, unchanged, on port 7860.

1. Build the folder to upload:

       python deploy/huggingface/make_space.py

2. On huggingface.co create a new Space: SDK **Gradio**, template **Blank**, hardware **CPU basic**, visibility **Public**.
3. Open the Space's **Files** tab, then **Add file**, then **Upload files**, and drag in everything inside
   `deploy/huggingface/space/` (the contents, not the folder). The website handles the large model file itself.
4. Commit. Wait for the status to read **Running**, then open `https://<user>-<space>.hf.space/health`.
5. Set `NEXT_PUBLIC_SAMYUKTA_URL` to that address where the game app is hosted.

The Docker files in `deploy/samyukta/` and `render.yaml` are for hosts that run containers (Render, Cloud Run).
