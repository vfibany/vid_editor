Objective
We are creating a video editor with the help of remotion with some tweeks. We maintain a local express server with an api to serve files and run python.

overall simple layout. on the top left we have the video preview. The bottom has the timeline. the right side is assets

the top line of the timeline should have a dropdown to select which project we are working on we should store our current project local storage and just open that. At the bottom of the input there should be a create new project which spawns a pop up asking for the title and the script. a play button with time in the video should be in the center of the timeline. We will also have a render button

in the editor. I input the dialouge line separated and style [who is speaking] this is saved under scripts for later reference

scripts/example.md
```
[adi_soft] who is there.
[adi_norm] Oh, no one.
[narrator] I am here.
```

chatterbox takes seed files to generate each line with a nice progress showing while it is working

this is then saved as the title of the .md file with the line number like example_1.wav

if no [] then default to narrator

We also generate a .json file under a config/ folder similar to

```json
{
  "captions": [
    {
      "id": "audio_2r32e3kt_ld2mn7",
      "text": "I can’t remember what I was working on. I think remember there was a Deadline looming",
      "speaker": "narrator",
      "start_ms": 0,
      "audio_asset": "public/audio/memento_scene_1.wav",
      "audio_duration_ms": 3920,
      "show_captions": false
    },
    {
      "id": "audio_4r3pe3kt_ld2mnx",
      "text": "We are going to build a veed.io clone for local lightweight video editing",
      "speaker": "narrator",
      "start_ms": 3920,
      "audio_asset": "public/audio/memento_scene_2.wav",
      "audio_duration_ms": 3480,
      "show_captions": false
    },
    {
      "id": "audio_r3p2e3kt_ld5mnx",
      "text": "Use Remotion",
      "speaker": "narrator",
      "start_ms": 7400,
      "audio_asset": "public/audio/memento_scene_3.wav",
      "audio_duration_ms": 1360,
      "show_captions": false
    }
  ],
  "visuals": [
    {
      "id": "visual_mr3peqkt_ld2mnx",
      "asset": "public/video/Screen Recording 2026-06-26 at 10.19.33 PM.mov",
      "start_ms": 0,
      "duration_ms": 5333
    }
  ],
  "audio_tracks": [
    {
      "id": "sfx_mr3pf6az_nkt8mf",
      "asset": "public/audio/chubert-liszt-serenade-gameboy.wav",
      "type": "sfx",
      "start_ms": 200,
      "duration_ms": 11667,
      "volume": 1,
      "duck_when_narration": false,
      "duck_amount": 0.5
    }
  ],
  "total_ms": 8760,
  "fps": 30
}
```



Assets should have a drag and drop area with a click to upload
I should be able to delete certain events on the timeline with a right click
I can drag and drop assets onto the timeline
There should be a nice click to frame when moving tracks
I should be able to add at the timeline cursor
we should have voice ducking between the audio and the background music
It should also be easy for me to rename the assets by right clicking them (which would rename the files as well)
renaming an asset via right-click needs to update the file on disk and every reference to it in config.json — that's a small refactor operation, not just a rename call.

my goal is to have different clips of myself speaking in different tones to make the tts to sound less robotic. the robot would take these seed voices to generate the audio to sound like me



I also want to make it easy for me to edit the audio and visuals to be able to crop visually and timeline from the input file to only render the parts I want.



I should also be able to set the dimensions of the rendering


project-root/
  server/                    # Express API
    index.js
    routes/
      projects.js            # CRUD, list/create/load project
      scripts.js             # parse/save scripts/*.md
      tts.js                 # chatterbox generation + progress (SSE/WS)
      config.js              # read/write config/*.json
      assets.js              # upload, list, delete
      render.js              # kick off Remotion render, progress
  projects/
    <project-name>/
      scripts/<name>.md
      config/<name>.json
      public/audio/
      public/video/
      public/images/
  remotion/                  # Remotion composition(s) that read config.json
  client/                    # React editor UI
    src/
      components/
        PreviewPanel/
        Timeline/            # tracks, cursor, drag/drop, click-to-frame snapping
        AssetsPanel/         # drag/drop + click upload
        ProjectSelector/     # dropdown + "new project" modal
        RenderButton/
      state/                 # timeline/project state (zustand or similar)



1. Multi-tone voice seeds (the big one for reducing robotic sound)
Add a voices/ folder per project holding your reference clips, organized by speaker and tone:
projects/<project-name>/
  voices/
    adi_soft/
      neutral.wav
      happy.wav
      sad.wav
      whisper.wav
    adi_norm/
      neutral.wav
      annoyed.wav
Extend the script syntax to optionally tag a tone: [speaker:tone], falling back to neutral if omitted:
[adi_soft:whisper] who is there.
[adi_norm] Oh, no one.
[narrator:tense] I am here.

The TTS route picks the seed file at voices/<speaker>/<tone>.wav and feeds it to Chatterbox as the reference. This also means the assets panel or a dedicated "Voices" panel needs its own upload/record UI, separate from timeline assets, so you can manage seed clips per speaker/tone.
2. Trim + visual crop on source clips
Two different things worth separating:

Trim (in/out points) — which portion of the source file plays. Add trim_start_ms / trim_end_ms to each visuals[] entry, measured against the source file, independent of where it sits on the timeline (start_ms/duration_ms stay as timeline placement).
Visual crop (framing) — a crop rectangle so you can punch in on part of the frame. Add a crop: { x, y, width, height } (normalized 0–1 or pixel values against source resolution) per visual entry, which Remotion applies via a cropped/scaled <Video> wrapper.

json{
  "id": "visual_mr3peqkt_ld2mnx",
  "asset": "public/video/screen_recording.mov",
  "start_ms": 0,
  "duration_ms": 5333,
  "trim_start_ms": 12000,
  "trim_end_ms": 17333,
  "crop": { "x": 0.1, "y": 0, "width": 0.8, "height": 1 }
}
In the UI this means the timeline clip needs draggable trim handles (adjust in/out without moving other clips), and the preview panel needs a crop overlay tool (drag a rectangle, live-updates the composition).
3

. Configurable render dimensions
Add a top-level render block to config.json:
json"render": {
  "width": 1080,
  "height": 1920,
  "fps": 30
}
surfaced as a settings dropdown (or custom W×H input) near the Render button, with common presets (1080×1920 vertical, 1920×1080 horizontal, plus custom.
default to horizontal


I want to integrate a Python script (comic_skin_fx.py) that applies a cartoon/halftone effect and whitens skin to anonymize the speaker in a video clip. I want this to be a non-destructive workflow.

1. File Placement:

    Place comic_skin_fx.py in a new directory: server/python/. Ensure it is executable.

2. Backend (Express API - server/routes/assets.js or effects.js):

    Create a new POST endpoint /api/assets/apply-comic-fx.

    The endpoint should accept a projectId and an assetPath (the source video).

    Use Node's child_process.spawn to execute python3 server/python/comic_skin_fx.py <input> <output>.

    The <output> file should be named <original-filename>_comic.mp4 and saved in the same public/video/ directory.

    Read the stdout of the Python script to parse the progress string (Processing: X/Y (Z%)).

    Send this progress back to the client using Server-Sent Events (SSE) or our existing WebSocket setup, just like we do for the Chatterbox TTS generation.

    3. Configuration (server/routes/config.js):

    Once the Python script completes successfully, automatically append the newly generated ..._comic.mp4 file to the project's internal asset list (or config.json if we store raw assets there) so it immediately appears in the UI.

4. Frontend (React UI - AssetsPanel & Timeline):

    In the AssetsPanel, add a Right-Click context menu option (or a magic wand button) on video assets labeled "Generate Comic Anonymity Clip".

    When clicked, trigger the backend endpoint and show a loading bar/progress indicator on the asset card based on the SSE progress data.

    Once finished, the new _comic.mp4 asset should appear in the Assets Panel, ready to be dragged onto the timeline just like any other clip.

Constraints:

    Do not overwrite the original video file; always create a new one.

    Keep the React state synchronized with the backend.

    Please write the necessary backend route, the frontend API call, and update the UI components accordingly.