import os
from youtube_transcript_api import YouTubeTranscriptApi
from dotenv import load_dotenv

load_dotenv(override=True)

video_id = '5iTOphGnCtg'
try:
    transcript_list = YouTubeTranscriptApi().get_transcript(video_id)
    grouped_chunks = []
    current_chunk = []
    current_start = None

    for item in transcript_list:
        if current_start is None:
            current_start = item['start']
        current_chunk.append(item['text'])
        if item['start'] - current_start >= 60.0:
            mins = int(current_start // 60)
            secs = int(current_start % 60)
            grouped_chunks.append(f"[{mins:02d}:{secs:02d}] {' '.join(current_chunk)}")
            current_chunk = []
            current_start = None
    if current_chunk:
        mins = int(current_start // 60) if current_start is not None else 0
        secs = int(current_start % 60) if current_start is not None else 0
        grouped_chunks.append(f"[{mins:02d}:{secs:02d}] {' '.join(current_chunk)}")
    
    for chunk in grouped_chunks:
        print(chunk)

except Exception as e:
    print("Overall Error:", e)
