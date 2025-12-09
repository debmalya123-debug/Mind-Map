document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const syllabusInput = document.getElementById('syllabus-input');
    const generateBtn = document.getElementById('generate-btn');
    const loading = document.getElementById('loading');
    const nodeDetails = document.getElementById('node-details');
    const nodeLabel = document.getElementById('node-label');
    const nodeType = document.getElementById('node-type');
    const queryInput = document.getElementById('query-input');
    const queryBtn = document.getElementById('query-btn');
    const queryRes = document.getElementById('query-res');

    // D3 Variables
    let svg, g, tree, root;
    let width, height;
    let selectedData = null;
    let i = 0;
    const duration = 750;

    function initD3() {
        const container = document.getElementById('viz-container');
        width = container.clientWidth;
        height = container.clientHeight;

        d3.select("#viz-container").selectAll("*").remove();

        svg = d3.select("#viz-container")
            .append("svg")
            .attr("width", width)
            .attr("height", height)
            .call(d3.zoom().scaleExtent([0.1, 4]).on("zoom", (e) => {
                g.attr("transform", e.transform);
            }))
            .on("dblclick.zoom", null);

        g = svg.append("g")
            .attr("transform", `translate(${100},${height/2})`); 
            // Initial translation to the left-center
    }

    // Helper: Text Width
    function getTextWidth(text, font="13px Outfit") {
        const c = document.createElement("canvas");
        const ctx = c.getContext("2d");
        ctx.font = font;
        return ctx.measureText(text).width;
    }

    // Creates a simple straight line path from parent RIGHT to child LEFT
    function diagonal(s, d) {
        // Source X (Horizontal): y position + half width (Right Edge)
        const sWidth = s.width || 0;
        const dWidth = d.width || 0;

        const sx = s.y + sWidth / 2;
        const sy = s.x;
        
        // Target X (Horizontal): y position - half width (Left Edge)
        const tx = d.y - dWidth / 2;
        const ty = d.x;

        // Simple Straight Line
        return `M ${sx} ${sy} L ${tx} ${ty}`;
    }

    // --- Update Pattern ---
    function update(source) {
        // Assigns the x and y position for the nodes
        const treeData = tree(root);

        // Compute the new tree layout.
        const nodes = treeData.descendants();
        const links = treeData.links();

        // ** Dynamic Horizontal Spacing Logic **
        // 1. Calculate max width for each depth level
        const depthWidths = {};
        nodes.forEach(d => {
            const w = getTextWidth(d.data.label) + 60; // Text + Padding
            if (!depthWidths[d.depth] || w > depthWidths[d.depth]) {
                depthWidths[d.depth] = w;
            }
        });

        // 2. Accumulate widths to determine X position (Horizontal) per depth
        // Note: d.y is Horizontal in our logic, d.x is Vertical
        const depthPositions = {};
        let currentX = 0;
        // Find max depth
        const maxDepth = Math.max(...nodes.map(n => n.depth));
        
        for(let i = 0; i <= maxDepth; i++) {
            depthPositions[i] = currentX;
            // Add current level's max width + gap for next level
            currentX += (depthWidths[i] || 150) + 40; // 40px gap between columns
        }

        // 3. Assign calculated horizontal position
        nodes.forEach(d => { 
            // Only update y (horizontal) if not currently being dragged/fixed?
            // For now, force it to dynamic unless specifically overridden?
            // Let's just set it based on depth.
            // If we want drag to persist x/y changes, we need to check if d.x/d.y corresponds to layout
            // But this is a tree re-layout. Let's start with dynamic layout.
            // "y" in tree layout usually corresponds to depth.
            
            // If the node has manually set coordinates from a drag, we might honor them.
            // BUT, collapsing/expanding (update) usually resets trees.
            // Let's implement the dynamic width first.
            d.y = depthPositions[d.depth]; 
        });

        // ****************** Nodes Section ******************

        // Update the nodes...
        const node = g.selectAll('g.node')
            .data(nodes, d => d.id || (d.id = ++i));

        // Enter any new modes at the parent's previous position.
        const nodeEnter = node.enter().append('g')
            .attr('class', 'node')
            .attr("transform", d => `translate(${source.y0 || 0},${source.x0 || 0})`)
            .on('click', click)
            .call(d3.drag()
                .subject(function(event, d) { return {x: d.y, y: d.x}; }) // Match visual coordinates
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));

        // Add Rectangles
        nodeEnter.append('rect')
            .attr('class', 'node-rect')
            .attr('width', 1e-6)
            .attr('height', 1e-6)
            .attr("x", 0) 
            .attr("y", -20)
            .attr('rx', 12)
            .attr('ry', 12)
            .style("fill", d => d._children ? "#a55eea" : "#45aaf2") 
            .style("opacity", 0);

        // Add Text - Centered
        nodeEnter.append('text')
            .attr("dy", ".35em")
            .attr("text-anchor", "middle")
            .text(d => d.data.label)
            .style("fill-opacity", 0);

        // UPDATE
        const nodeUpdate = nodeEnter.merge(node);

        // Transition to the proper position for the node
        nodeUpdate.transition().duration(duration)
            .attr("transform", d => `translate(${d.y},${d.x})`);

        // Update the node attributes and style
        nodeUpdate.select('rect.node-rect')
            .attr('width', d => {
                d.width = getTextWidth(d.data.label) + 24; // Store for links
                return d.width;
            })
            .attr('height', 36)
            .attr('x', d => -d.width / 2) 
            .attr('y', -18) 
            .style("fill", d => {
                 if(d.data.type === 'root') return "#ff6b6b"; 
                 return d._children ? "#a55eea" : "#2d98da";
            })
            .style("opacity", 1)
            .attr('cursor', 'grab');

        nodeUpdate.select('text')
            .style("fill-opacity", 1);

        // Remove any exiting nodes
        const nodeExit = node.exit().transition().duration(duration)
            .attr("transform", d => `translate(${source.y},${source.x})`)
            .remove();

        nodeExit.select('rect')
            .attr('width', 1e-6)
            .attr('height', 1e-6);

        nodeExit.select('text')
            .style("fill-opacity", 1e-6);

        // ****************** Links Section ******************

        // Update the links...
        const link = g.selectAll('path.link')
            .data(links, d => d.target.id);

        // Enter any new links at the parent's previous position.
        const linkEnter = link.enter().insert('path', "g")
            .attr("class", "link")
            .attr('d', d => {
                const o = {x: source.x0 || 0, y: source.y0 || 0, width: 0};
                return diagonal(o, o);
            });

        // UPDATE
        const linkUpdate = linkEnter.merge(link);

        // Transition back to the parent element position
        linkUpdate.transition().duration(duration)
            .attr('d', d => diagonal(d.source, d.target));

        // Remove any exiting links
        const linkExit = link.exit().transition().duration(duration)
            .attr('d', d => {
                const o = {x: source.x, y: source.y, width: 0}; 
                return diagonal(o, o);
            })
            .remove();

        // Store the old positions for transition.
        nodes.forEach(d => {
            d.x0 = d.x;
            d.y0 = d.y;
        });
    }

    // Drag Functions
    function dragstarted(event, d) {
        d3.select(this).raise().attr("cursor", "grabbing");
    }

    function dragged(event, d) {
        d.x = event.y;
        d.y = event.x;
        // Update Node Position immediately
        d3.select(this).attr("transform", `translate(${d.y},${d.x})`);
        
        // Update Links connected to this node
        // We need to re-select links and update their 'd' attribute
        g.selectAll('path.link').attr('d', l => diagonal(l.source, l.target));
    }

    function dragended(event, d) {
        d3.select(this).attr("cursor", "grab");
    }

    // Toggle children on click.
    function click(event, d) {
        if (d.children) {
            d._children = d.children;
            d.children = null;
        } else {
            d.children = d._children;
            d._children = null;
        }
        update(d);
        
        // Also update selection panel
        selectNode(d.data);
        event.stopPropagation();
    }

    // Collapse All
    function collapse(d) {
        if(d.children) {
            d._children = d.children;
            d._children.forEach(collapse);
            d.children = null;
        }
    }

    // Expand All
    function expand(d) {
        if(d._children) {
            d.children = d._children;
            d._children = null;
        }
        if(d.children) d.children.forEach(expand);
    }

    function processData(data) {
        // Convert flat List to Hierarchy
        // Strategy: Link via ID/Parent, then d3.stratify
        
        // Ensure Root
        if(!data.nodes.find(n => n.id === 'root')) {
            data.nodes.push({id:'root', label: data.title, type:'root'});
        }
        
        // Validate Parents
        const ids = new Set(data.nodes.map(n => n.id));
        data.nodes.forEach(n => {
            if(n.id !== 'root') {
                 if(!n.parent || n.parent === 'title' || !ids.has(n.parent)) {
                     n.parent = 'root';
                 }
            } else {
                n.parent = ""; // Root has no parent (stratify requirement)
            }
        });

        // Stratify
        const rootNode = d3.stratify()
            .id(d => d.id)
            .parentId(d => d.parent)
            (data.nodes);

        rootNode.x0 = height / 2;
        rootNode.y0 = 0;

        // Tree Layout Size
        tree = d3.tree().nodeSize([60, 250]); 

        root = rootNode;
        
        // Start Collapsed
        if(root.children) {
            root.children.forEach(collapse);
        }

        update(root);
        
        // Initial Center
        centerNode(root);
    }

    function centerNode(source) {
        // Center the view on the node
        const t = d3.zoomTransform(svg.node());
        const scale = t.k;
        const x = -source.y0 * scale + 150; // Shift right a bit
        const y = -source.x0 * scale + height / 2;
        
        svg.transition().duration(750).call(d3.zoom().transform, d3.zoomIdentity.translate(x, y).scale(scale));
    }

    async function generate() {
        const text = syllabusInput.value.trim();
        if(!text) return alert("Text required.");
        
        loading.classList.remove('hidden');
        try {
            const r = await fetch('/generate_mindmap', {
                method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({syllabus:text})
            });
            if(!r.ok) throw new Error("API Error");
            const d = await r.json();
            initD3();
            processData(d);
        } catch(e) {
            console.error(e);
            alert("Error");
        } finally {
            loading.classList.add('hidden');
        }
    }

    // Note Cache
    const nodeNotes = {}; // { nodeId: "markdown content" }
    const noteSidebar = document.getElementById('note-sidebar');
    const noteContent = document.getElementById('note-content');
    const generateNoteBtn = document.getElementById('generate-note-btn');
    const closeNoteBtn = document.getElementById('close-note-btn');
    const noteControls = document.getElementById('note-controls');

    // ... (rest of resize handler)

    function selectNode(d) {
        selectedData = d;
        nodeLabel.textContent = d.label;
        nodeType.textContent = d.type;
        nodeDetails.classList.remove('hidden');
        queryRes.textContent = ""; queryInput.value = "";
        
        // Open Note Sidebar
        openNoteSidebar(d);
    }

    function openNoteSidebar(d) {
        noteSidebar.classList.remove('hidden');
        
        // Check Cache
        if(nodeNotes[d.id]) {
            renderNote(nodeNotes[d.id]);
            noteControls.classList.add('hidden'); // Hide generate button if exists
            // Optional: Add "Regenerate" button? For now simplest spec.
        } else {
            noteContent.innerHTML = "<p><em>No notes generated yet. Click below to create study notes.</em></p>";
            noteControls.classList.remove('hidden');
        }
    }

    function renderNote(markdown) {
        noteContent.innerHTML = marked.parse(markdown);
        // Re-render MathJax
        if(window.MathJax) {
            MathJax.typesetPromise([noteContent]);
        }
    }

    async function generateNote() {
        if(!selectedData) return;
        
        generateNoteBtn.disabled = true;
        generateNoteBtn.textContent = "Generating Notes...";
        noteContent.innerHTML = '<div class="spinner"></div><p>Researching topic...</p>';

        try {
            const r = await fetch('/generate_note', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                    topic: selectedData.label,
                    context: `Parent: ${selectedData.parent || 'Root'}`
                })
            });
            const res = await r.json();
            
            if(res.note) {
                nodeNotes[selectedData.id] = res.note;
                renderNote(res.note);
                noteControls.classList.add('hidden');
            } else {
                noteContent.innerHTML = "Error generating note.";
            }

        } catch(e) {
            console.error(e);
            noteContent.innerHTML = "Error connecting to AI.";
        } finally {
            generateNoteBtn.disabled = false;
            generateNoteBtn.textContent = "Generate Note";
        }
    }

    async function ask() {
        if(!selectedData) return;
        const q = queryInput.value.trim();
        if(!q) return;
        
        queryBtn.textContent = "...";
        try {
            const r = await fetch('/node_query', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                    node_label: selectedData.label,
                    query: q,
                    context: `Parent: ${selectedData.parent || 'root'}`
                })
            });
            const d = await r.json();
            // Render Answer with Markdown
            const md = d.response || "No response.";
            queryRes.innerHTML = marked.parse(md);
            // Optional: MathJax trigger if needed, though Ask AI is usually short text
            if(window.MathJax) MathJax.typesetPromise([queryRes]);
        } catch(e) {
            console.error(e);
            queryRes.textContent = "Error.";
        } finally {
            queryBtn.textContent = "Ask";
        }
    }

    // Bindings
    generateBtn.onclick = generate;
    queryBtn.onclick = ask;
    if(generateNoteBtn) generateNoteBtn.onclick = generateNote;
    if(closeNoteBtn) closeNoteBtn.onclick = () => noteSidebar.classList.add('hidden');
    
    document.getElementById('expand-all').onclick = () => {
        if(root) { expand(root); update(root); }
    };
    document.getElementById('collapse-all').onclick = () => {
        if(root && root.children) { root.children.forEach(collapse); update(root); }
    };
    document.getElementById('zoom-in').onclick = () => svg.transition().call(d3.zoom().scaleBy, 1.2);
    document.getElementById('zoom-out').onclick = () => svg.transition().call(d3.zoom().scaleBy, 0.8);
    document.getElementById('fit').onclick = () => {
        if(root) centerNode(root); // Simple reset to root
    };

    // Resize Handler
    window.addEventListener('resize', () => {
        const container = document.getElementById('viz-container');
        if(svg && container) {
            width = container.clientWidth;
            height = container.clientHeight;
            svg.attr("width", width).attr("height", height);
            
            if(root) {
                 root.x0 = height / 2;
                 centerNode(root); 
            }
        }
    });
});
