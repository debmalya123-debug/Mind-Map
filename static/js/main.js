document.addEventListener('DOMContentLoaded', () => {
    console.log("Mind Map App: main.js v12");

    // --- DOM Elements ---
    const loading = document.getElementById('loading');
    const notesCard = document.getElementById('notes-card');
    const nodeLabel = document.getElementById('node-label');
    const nodeType = document.getElementById('node-type');
    const noteContent = document.getElementById('note-content');
    const generateNoteBtn = document.getElementById('generate-note-btn');
    const closeNotesBtn = document.getElementById('close-notes-btn');

    // Chat Widget
    const chatWidget = document.getElementById('ai-chat-widget');
    const chatToggle = document.getElementById('chat-toggle');
    const chatPanel = document.getElementById('chat-panel');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('query-input');
    const chatSendBtn = document.getElementById('query-btn');
    const chatNodeName = document.getElementById('chat-node-name');
    const indicatorDot = document.querySelector('.indicator-dot');

    // --- D3 Variables ---
    let svg, g, tree, root, zoom;
    let width, height;
    let selectedData = null;
    let i = 0;
    const duration = 600;

    // --- App State ---
    let isLoggedIn = false;
    let currentMindmapId = null;
    const nodeNotes = {};
    const chatCache = {}; // { client_id: [{role, content}] }
    let currentChatNodeId = null;

    // --- Auth ---
    async function checkAuth() {
        try {
            const res = await fetch('/api/user');
            const data = await res.json();
            isLoggedIn = !!data.email;
        } catch(e) { console.error(e); }
    }

    // --- Load Mindmap ---
    async function loadMindmap(id) {
        loading.classList.remove('hidden');
        try {
            const r = await fetch(`/api/load_mindmap/${id}`);
            if(!r.ok) throw new Error("API Error");
            const d = await r.json();
            currentMindmapId = id;
            initD3();
            processData(d);
        } catch(e) {
            console.error(e);
            alert("Error loading mindmap");
        } finally {
            loading.classList.add('hidden');
        }
    }

    checkAuth().then(() => {
        if(window.INITIAL_MINDMAP_ID) {
            loadMindmap(window.INITIAL_MINDMAP_ID);
        }
    });

    // ==============================================
    // D3 SETUP
    // ==============================================
    function initD3() {
        const container = document.getElementById('viz-container');
        width = container.clientWidth;
        height = container.clientHeight;

        d3.select("#viz-container").selectAll("*").remove();

        zoom = d3.zoom()
            .scaleExtent([0.2, 2.5])
            .on("zoom", (event) => g.attr("transform", event.transform));

        svg = d3.select("#viz-container")
            .append("svg")
            .attr("width", width)
            .attr("height", height)
            .call(zoom)
            .on("dblclick.zoom", null);

        g = svg.append("g");
    }

    function getTextWidth(text, font="500 14px Inter") {
        const c = document.createElement("canvas");
        const ctx = c.getContext("2d");
        ctx.font = font;
        return ctx.measureText(text).width;
    }

    function diagonal(s, d) {
        const sWidth = s.width || 0;
        const dWidth = d.width || 0;
        const sx = s.y + sWidth / 2;
        const sy = s.x;
        const tx = d.y - dWidth / 2;
        const ty = d.x;
        const midX = (sx + tx) / 2;
        return `M ${sx},${sy} C ${midX},${sy} ${midX},${ty} ${tx},${ty}`;
    }

    // ==============================================
    // FIT TO VIEW (Target-based Bounds)
    // ==============================================
    function fitToView(animated = true) {
        if(!root || !svg || !zoom) return;
        const container = document.getElementById('viz-container');
        const fullWidth = container.clientWidth;
        const fullHeight = container.clientHeight;
        svg.attr("width", fullWidth).attr("height", fullHeight);

        // Calculate exact bounds mathematically based on visible nodes
        const nodes = tree(root).descendants();
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        
        nodes.forEach(d => {
            const w = d.width || (getTextWidth(d.data.label) + 32);
            // x/y are swapped in D3 tree (d.y is horizontal, d.x is vertical)
            if (d.y - w/2 < minX) minX = d.y - w/2;
            if (d.y + w/2 > maxX) maxX = d.y + w/2;
            if (d.x - 20 < minY) minY = d.x - 20;
            if (d.x + 20 > maxY) maxY = d.x + 20;
        });

        if (minX === Infinity) return;

        const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        const padding = 80;
        const scaleX = (fullWidth - padding * 2) / bounds.width;
        const scaleY = (fullHeight - padding * 2) / bounds.height;
        const scale = Math.min(scaleX, scaleY, 1.5);

        const tx = fullWidth / 2 - scale * (bounds.x + bounds.width / 2);
        const ty = fullHeight / 2 - scale * (bounds.y + bounds.height / 2);
        const newTransform = d3.zoomIdentity.translate(tx, ty).scale(scale);

        if(animated) {
            svg.transition().duration(duration).call(zoom.transform, newTransform);
        } else {
            svg.call(zoom.transform, newTransform);
        }
    }

    // ==============================================
    // UPDATE TREE
    // ==============================================
    function update(source) {
        const treeData = tree(root);
        const nodes = treeData.descendants();
        const links = treeData.links();

        const node = g.selectAll('g.node')
            .data(nodes, d => d.id || (d.id = ++i));

        const nodeEnter = node.enter().append('g')
            .attr('class', 'node')
            .attr("transform", d => {
                const p = d.parent || source || root;
                return `translate(${p.y0 || p.y || 0},${p.x0 || p.x || 0}) scale(0.001)`;
            })
            .style("cursor", "pointer")
            .on('click', function(event, d) {
                event.stopPropagation();
                handleNodeClick(d);
            });

        nodeEnter.append('rect')
            .attr('class', 'node-rect')
            .attr('height', 40).attr('rx', 20).attr('ry', 20)
            .style("fill", "#18181b").style("opacity", 0);

        nodeEnter.append('text')
            .attr("dy", ".35em").attr("text-anchor", "middle")
            .text(d => d.data.label)
            .style("fill-opacity", 0)
            .style("fill", d => d.data.type === 'root' ? "#000" : "#fff");

        const nodeUpdate = nodeEnter.merge(node);
        nodeUpdate.transition().duration(duration)
            .ease(d3.easeBackOut)
            .attr("transform", d => `translate(${d.y},${d.x}) scale(1)`);

        nodeUpdate.select('rect.node-rect')
            .attr('width', d => { d.width = getTextWidth(d.data.label) + 32; return d.width; })
            .attr('height', 40)
            .attr('x', d => -d.width / 2).attr('y', -20)
            .style("fill", d => d.data.type === 'root' ? "#ccff00" : "#18181b")
            .style("stroke", d => d.data.type === 'root' ? "none" : (d._children ? "#ccff00" : "#3f3f46"))
            .style("stroke-width", d => d.data.type === 'root' ? 0 : (d._children ? 2 : 1))
            .style("opacity", 1);

        nodeUpdate.select('text').style("fill-opacity", 1);

        node.exit().transition().duration(duration)
            .ease(d3.easeCubicOut)
            .attr("transform", d => { 
                const p = d.parent || source || root; 
                return `translate(${p.y},${p.x}) scale(0.5)`; 
            })
            .remove()
            .select('rect').style('opacity', 0);

        // Links
        const link = g.selectAll('path.link').data(links, d => d.target.id);
        const linkEnter = link.enter().insert('path', "g")
            .attr("class", "link").style("opacity", 0)
            .attr('d', d => { 
                const o = d.source || source || root; 
                const p = {x: o.x0 || o.x || 0, y: o.y0 || o.y || 0, width: 0}; 
                return diagonal(p, p); 
            });

        linkEnter.merge(link).transition().duration(duration)
            .ease(d3.easeBackOut).style("opacity", 1)
            .attr('d', d => diagonal(d.source, d.target));

        link.exit().transition().duration(duration)
            .ease(d3.easeCubicOut).style("opacity", 0)
            .attr('d', d => { 
                const o = d.source || source || root; 
                const p = {x: o.x, y: o.y, width: 0}; 
                return diagonal(p, p); 
            })
            .remove();

        nodes.forEach(d => { d.x0 = d.x; d.y0 = d.y; });
        
        // Sync camera transition with node transition for a perfectly smooth effect
        fitToView(true);
    }

    // ==============================================
    // CLICK HANDLER
    // ==============================================
    function handleNodeClick(d) {
        console.log('NODE CLICKED:', d.data.label);
        if (d.children) { d._children = d.children; d.children = null; }
        else if (d._children) { d.children = d._children; d._children = null; }
        update(d);

        selectedData = d;
        const data = d.data;
        nodeLabel.textContent = data.label;
        nodeType.textContent = data.type;
        openNotesCard(data);
        updateChatForNode(data);
    }

    // ==============================================
    // NOTES CARD
    // ==============================================
    async function openNotesCard(data) {
        notesCard.classList.remove('hidden-card');

        if(nodeNotes[data.id]) {
            renderNote(nodeNotes[data.id]);
            generateNoteBtn.style.display = 'none';
        } else if (isLoggedIn && currentMindmapId) {
            noteContent.innerHTML = "<div class='spinner' style='width:24px;height:24px;margin:40px auto;'></div>";
            generateNoteBtn.style.display = 'none';
            try {
                const res = await fetch('/api/get_note', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ mindmap_id: currentMindmapId, client_id: data.id })
                });
                const noteData = await res.json();
                if(noteData.note) {
                    nodeNotes[data.id] = noteData.note;
                    renderNote(noteData.note);
                    generateNoteBtn.style.display = 'none';
                } else { showNotesEmpty(); generateNoteBtn.style.display = ''; }
            } catch(e) { showNotesEmpty(); generateNoteBtn.style.display = ''; }
        } else {
            showNotesEmpty();
            generateNoteBtn.style.display = '';
        }
    }

    function showNotesEmpty() {
        noteContent.innerHTML = `
            <div class="notes-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
                <p>Click <strong>"Generate"</strong> to create<br>detailed study notes for this topic.</p>
            </div>`;
    }

    function renderNote(markdown) {
        noteContent.innerHTML = marked.parse(markdown);
        if(window.MathJax) MathJax.typesetPromise([noteContent]);
    }

    async function generateNote() {
        if(!selectedData) return;
        const d = selectedData;
        const data = d.data;
        const parentLabel = d.parent ? d.parent.data.label : "None";
        const rootLabel = d.ancestors ? d.ancestors().pop().data.label : "Root";

        generateNoteBtn.disabled = true;
        generateNoteBtn.innerHTML = `<div class="spinner" style="width:16px;height:16px;margin:0;border-width:2px;"></div> Generating...`;
        noteContent.innerHTML = `<div class="notes-empty"><div class="spinner"></div><p>AI is researching this topic...</p></div>`;

        try {
            const r = await fetch('/generate_note', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({ topic: data.label, context: `Parent: ${parentLabel}. Subject: ${rootLabel}.` })
            });
            const text = await r.text();
            let res;
            try { res = JSON.parse(text); } catch(e) { throw new Error("Server Error"); }

            if(res.note) {
                nodeNotes[data.id] = res.note;
                renderNote(res.note);
                generateNoteBtn.style.display = 'none';
                if(isLoggedIn && currentMindmapId) {
                    fetch('/api/save_note', { method:'POST', headers:{'Content-Type':'application/json'},
                        body: JSON.stringify({ mindmap_id: currentMindmapId, client_id: data.id, content: res.note })
                    });
                }
            } else {
                noteContent.innerHTML = '<div class="notes-empty"><p>Error generating notes.</p></div>';
            }
        } catch(e) {
            console.error(e);
            noteContent.innerHTML = `<div class="notes-empty"><p>Error: ${e.message}</p></div>`;
        } finally {
            generateNoteBtn.disabled = false;
            generateNoteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg> Generate Study Notes`;
        }
    }

    // ==============================================
    // AI CHAT with DB Persistence
    // ==============================================
    let chatOpen = false;

    function toggleChat() {
        chatOpen = !chatOpen;
        chatWidget.classList.toggle('open', chatOpen);
        chatPanel.classList.toggle('hidden-chat', !chatOpen);
        if(chatOpen && selectedData) {
            chatInput.disabled = false;
            chatSendBtn.disabled = false;
        }
    }

    // When a node is clicked, update chat context
    async function updateChatForNode(data) {
        currentChatNodeId = data.id;
        chatNodeName.textContent = data.label;
        indicatorDot.classList.add('active');
        chatInput.disabled = false;
        chatSendBtn.disabled = false;
        chatInput.placeholder = `Ask about "${data.label}"...`;

        // Load chat history from cache or DB
        if(chatCache[data.id]) {
            renderChatHistory(chatCache[data.id]);
        } else if(isLoggedIn && currentMindmapId) {
            // Load from DB
            try {
                const res = await fetch('/api/get_chat', {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ mindmap_id: currentMindmapId, client_id: data.id })
                });
                const chatData = await res.json();
                if(chatData.messages && chatData.messages.length > 0) {
                    chatCache[data.id] = chatData.messages;
                    renderChatHistory(chatData.messages);
                } else {
                    chatCache[data.id] = [];
                    showChatWelcome();
                }
            } catch(e) {
                chatCache[data.id] = [];
                showChatWelcome();
            }
        } else {
            if(!chatCache[data.id]) chatCache[data.id] = [];
            renderChatHistory(chatCache[data.id]);
        }
    }

    function renderChatHistory(messages) {
        chatMessages.innerHTML = '';
        if(messages.length === 0) {
            showChatWelcome();
            return;
        }
        messages.forEach(msg => {
            const el = document.createElement('div');
            el.className = `chat-msg ${msg.role}`;
            if(msg.role === 'ai') {
                el.innerHTML = marked.parse(msg.content);
            } else {
                el.textContent = msg.content;
            }
            chatMessages.appendChild(el);
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function showChatWelcome() {
        chatMessages.innerHTML = `<div class="chat-welcome"><p>👋 Ask me anything about <strong>${chatNodeName.textContent}</strong>. Your conversation is saved.</p></div>`;
    }

    async function sendChatMessage() {
        if(!selectedData || !currentChatNodeId) return;
        const q = chatInput.value.trim();
        if(!q) return;

        const d = selectedData;
        const data = d.data;
        const parentLabel = d.parent ? d.parent.data.label : "None";
        const rootLabel = d.ancestors ? d.ancestors().pop().data.label : "Root";

        // Remove welcome if present
        const welcome = chatMessages.querySelector('.chat-welcome');
        if(welcome) welcome.remove();

        // Add user bubble
        addChatBubble(q, 'user');
        if(!chatCache[data.id]) chatCache[data.id] = [];
        chatCache[data.id].push({ role: 'user', content: q });

        chatInput.value = '';
        chatSendBtn.disabled = true;

        // Save user message to DB
        if(isLoggedIn && currentMindmapId) {
            fetch('/api/save_chat', { method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ mindmap_id: currentMindmapId, client_id: data.id, role: 'user', content: q })
            });
        }

        // Show thinking
        const thinkingEl = document.createElement('div');
        thinkingEl.className = 'chat-msg ai';
        thinkingEl.innerHTML = '<div class="spinner" style="width:16px;height:16px;margin:0;border-width:2px;"></div>';
        chatMessages.appendChild(thinkingEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        try {
            const r = await fetch('/node_query', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                    node_label: data.label, query: q,
                    context: `Parent: ${parentLabel}. Subject: ${rootLabel}.`
                })
            });
            const res = await r.json();
            const md = res.response || "Sorry, I couldn't generate a response.";
            thinkingEl.remove();
            addChatBubble(md, 'ai');
            chatCache[data.id].push({ role: 'ai', content: md });

            // Save AI response to DB
            if(isLoggedIn && currentMindmapId) {
                fetch('/api/save_chat', { method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ mindmap_id: currentMindmapId, client_id: data.id, role: 'ai', content: md })
                });
            }
        } catch(e) {
            console.error(e);
            thinkingEl.remove();
            addChatBubble("Error connecting to AI.", 'ai');
        } finally {
            chatSendBtn.disabled = false;
            chatInput.focus();
        }
    }

    function addChatBubble(content, role) {
        const msg = document.createElement('div');
        msg.className = `chat-msg ${role}`;
        if(role === 'ai') {
            msg.innerHTML = marked.parse(content);
            if(window.MathJax) MathJax.typesetPromise([msg]);
        } else {
            msg.textContent = content;
        }
        chatMessages.appendChild(msg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // ==============================================
    // COLLAPSE / EXPAND
    // ==============================================
    function collapse(d) {
        if(d.children) { d._children = d.children; d._children.forEach(collapse); d.children = null; }
    }
    function expand(d) {
        if(d._children) { d.children = d._children; d._children = null; }
        if(d.children) d.children.forEach(expand);
    }

    let isAnimating = false;
    async function expandStepByStep() {
        if(isAnimating || !root) return;
        isAnimating = true;
        let currentLevel = [root];
        
        while(currentLevel.length > 0) {
            let nextLevel = [];
            let expandedAny = false;
            
            for(let n of currentLevel) {
                if(n._children) { 
                    n.children = n._children; 
                    n._children = null; 
                    expandedAny = true; 
                }
                if(n.children) {
                    nextLevel.push(...n.children);
                }
            }
            
            if(expandedAny) { 
                update(root); 
                await new Promise(r => setTimeout(r, duration + 100)); 
            }
            currentLevel = nextLevel;
        }
        isAnimating = false;
    }

    async function collapseStepByStep() {
        if(isAnimating || !root) return;
        isAnimating = true;
        
        while(true) {
            let maxDepth = -1;
            const visible = root.descendants();
            visible.forEach(n => { if(n.children && n.depth > maxDepth) maxDepth = n.depth; });
            
            if(maxDepth < 0) break; // Completely collapse all the way to root
            
            let collapsedAny = false;
            visible.forEach(n => { 
                if(n.children && n.depth === maxDepth) { 
                    n._children = n.children; 
                    n.children = null; 
                    collapsedAny = true; 
                } 
            });
            
            if(collapsedAny) { 
                update(root); 
                await new Promise(r => setTimeout(r, duration + 100)); 
            } else {
                break;
            }
        }
        isAnimating = false;
    }

    // ==============================================
    // PROCESS DATA
    // ==============================================
    function processData(data) {
        if(!data.nodes.find(n => n.id === 'root')) {
            data.nodes.push({id:'root', label: data.title, type:'root'});
        }
        const ids = new Set(data.nodes.map(n => n.id));
        data.nodes.forEach(n => {
            if(n.id !== 'root') {
                if(!n.parent || n.parent === 'title' || !ids.has(n.parent)) n.parent = 'root';
            } else { n.parent = ""; }
        });
        const rootNode = d3.stratify().id(d => d.id).parentId(d => d.parent)(data.nodes);
        rootNode.x0 = height / 2;
        rootNode.y0 = 0;
        tree = d3.tree().nodeSize([80, 400]);
        root = rootNode;
        
        // Collapse everything down to the root initially
        collapse(root);
        update(root);
        
        // Trigger expand animation on initial load after initial render settles
        setTimeout(() => {
            expandStepByStep();
        }, 800);
    }

    // ==============================================
    // EVENT BINDINGS
    // ==============================================
    if(generateNoteBtn) generateNoteBtn.onclick = generateNote;
    if(closeNotesBtn) closeNotesBtn.onclick = () => notesCard.classList.add('hidden-card');

    chatToggle.onclick = toggleChat;
    chatSendBtn.onclick = sendChatMessage;
    chatInput.addEventListener('keydown', (e) => {
        if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });

    document.getElementById('expand-all').onclick = () => expandStepByStep();
    document.getElementById('collapse-all').onclick = () => collapseStepByStep();
    document.getElementById('zoom-in').onclick = () => svg.transition().duration(300).call(zoom.scaleBy, 1.3);
    document.getElementById('zoom-out').onclick = () => svg.transition().duration(300).call(zoom.scaleBy, 0.7);
    const fitBtn = document.getElementById('fit');
    if(fitBtn) fitBtn.onclick = () => fitToView(true);

    window.addEventListener('resize', () => fitToView(false));
});
