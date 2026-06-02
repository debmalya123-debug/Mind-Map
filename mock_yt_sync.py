import os
from app import app, db, Mindmap, Node

with app.app_context():
    # Fetch the most recent mindmap
    latest_map = Mindmap.query.order_by(Mindmap.created_at.desc()).first()
    if not latest_map:
        print("No mindmaps found in the database. Please create one first!")
        exit(1)
        
    print(f"Found latest mindmap: '{latest_map.title}' (ID: {latest_map.id})")
    
    # Update with a test YouTube video ID (Rick Astley - Never Gonna Give You Up)
    latest_map.youtube_video_id = "dQw4w9WgXcQ"
    db.session.add(latest_map)
    
    # Assign sequential timestamps to all nodes (excluding the root node)
    nodes = Node.query.filter_by(mindmap_id=latest_map.id).all()
    timestamp_val = 10
    updated_count = 0
    for node in nodes:
        if node.client_id == 'root':
            node.timestamp = None
            continue
        node.timestamp = timestamp_val
        timestamp_val += 30 # increment by 30 seconds for each node
        db.session.add(node)
        updated_count += 1
        
    db.session.commit()
    print(f"Successfully updated mindmap with YouTube Video ID: 'dQw4w9WgXcQ'")
    print(f"Assigned mock timestamps to {updated_count} nodes.")
    print("Refresh your browser and open this mindmap to test the player and sync!")
