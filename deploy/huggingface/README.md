# Hosting the Samyukta server on Hugging Face Spaces

1. Build the folder to push:

       python deploy/huggingface/make_space.py

2. On huggingface.co, create a new Space: SDK **Docker**, hardware **CPU basic**, visibility Public.
3. Push the folder `deploy/huggingface/space/` to the Space's git repo. `model.pt` is larger than
   10 MB, so install Git LFS first (`git lfs install`). The folder already marks `*.pt` for LFS.
4. Wait for the build. When it is running, `https://<user>-<space>.hf.space/health` should answer.
5. Set `NEXT_PUBLIC_SAMYUKTA_URL` to that address where the game app is hosted.

Check Hugging Face's current free-tier rules first. Some accounts report that free CPU Spaces need a paid plan.
