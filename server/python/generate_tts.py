import sys
import os

script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)

import json
import torch
import torchaudio as ta

device = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")

# MODIFIED: Swapping class hooks from ChatterboxTurboTTS over to ChatterboxTTS base engine
try:
    try:
        from chatterbox import ChatterboxTTS
    except ImportError:
        from chatterbox.tts import ChatterboxTTS
        
    model = ChatterboxTTS.from_pretrained(device=device)
except ImportError as e:
    print(f"LOG_ERROR: Local chatterbox base import failed layout checks: {str(e)}", flush=True)
    class MockModel:
        sr = 24000
        def generate(self, text, audio_prompt_path=None, **kwargs): 
            return torch.zeros(1, 24000 * 3)
    model = MockModel()

# ... [Keep your previous import layout and try/except blocks here] ...

def main():
    input_data = sys.stdin.read()
    if not input_data:
        return
        
    tasks = json.loads(input_data)
    total_tasks = len(tasks)
    sr = getattr(model, 'sr', 24000)

    for index, task in enumerate(tasks):
        text = task['text']
        ref_path = task.get('ref_path')
        out_path = task['out_path']

        os.makedirs(os.path.dirname(out_path), exist_ok=True)

        try:
            req_exaggeration = task.get('exaggeration_scale', 1.0)
            req_cfg = task.get('cfg_weight', 0.3)
            
            # --- NEW: Extract loudness scaling attribute sent down by node backend ---
            req_loudness = task.get('loudness_scale', 2.4)

            expressive_kwargs = {
                "exaggeration": float(req_exaggeration),
                "cfg_weight": float(req_cfg)
            }

            if ref_path and os.path.exists(ref_path):
                wav = model.generate(text, audio_prompt_path=ref_path, **expressive_kwargs)
            else:
                wav = model.generate(text, **expressive_kwargs)

            # Ensure data structure complies with standard audio save matrices [Channels, Time]
            if isinstance(wav, torch.Tensor):
                if wav.ndim == 1:
                    wav = wav.unsqueeze(0)
                elif wav.ndim == 3:
                    wav = wav.squeeze(0)
            else:
                wav = torch.tensor(wav)
                if wav.ndim == 1:
                    wav = wav.unsqueeze(0)

            # MODIFIED: Multiply using your fluid frontend scale parameter instead of a hardcoded 2.4 constant
            wav = torch.clamp(wav * float(req_loudness), min=-1.0, max=1.0)

            ta.save(out_path, wav.cpu(), sr)

            total_samples = wav.shape[-1]
            duration_ms = int((total_samples / sr) * 1000)
            print(f"PROGRESS:{index + 1}/{total_tasks}|DURATION:{duration_ms}", flush=True)

        except Exception as file_err:
            print(f"LOG_ERROR: Failed processing task element index {index}: {str(file_err)}", flush=True)
            fallback_wav = torch.zeros(1, sr * 2)
            ta.save(out_path, fallback_wav, sr)
            print(f"PROGRESS:{index + 1}/{total_tasks}|DURATION:2000", flush=True)


if __name__ == "__main__":
    main()