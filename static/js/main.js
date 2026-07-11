document.addEventListener('DOMContentLoaded', () => {
    console.log("Mind Map App: main.js v13 (mobile)");

    // Initialize Mermaid
    if (window.mermaid) {
        mermaid.initialize({
            startOnLoad: false,
            theme: 'dark',
            securityLevel: 'loose'
        });
    }

    // --- Mobile Detection ---
    const isMobile = () => window.innerWidth <= 768;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // --- DOM Elements ---
    const loading = document.getElementById('loading');
    const notesCard = document.getElementById('notes-card');
    const nodeLabel = document.getElementById('node-label');
    const nodeType = document.getElementById('node-type');
    const noteContent = document.getElementById('note-content');
    const generateNoteBtn = document.getElementById('generate-note-btn');
    const closeNotesBtn = document.getElementById('close-notes-btn');
    const jumpToVideoBtn = document.getElementById('jump-to-video-btn');

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
    let currentYoutubeVideoId = null;
    let ytPlayer = null;
    let ytPlayerReady = false;

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

        // Add small grey clock badge for nodes that have timestamps
        const badgeEnter = nodeEnter.filter(d => d.data.timestamp !== undefined && d.data.timestamp !== null)
            .append('g')
            .attr('class', 'node-timestamp-badge')
            .style('opacity', 0);
            
        badgeEnter.append('circle')
            .attr('r', 7)
            .style('fill', '#27272a')
            .style('stroke', '#52525b')
            .style('stroke-width', 1);

        badgeEnter.append('path')
            .attr('d', 'M 0 -3.5 L 0 0 L 2 1')
            .style('fill', 'none')
            .style('stroke', '#d4d4d8')
            .style('stroke-width', 1.2)
            .style('stroke-linecap', 'round')
            .style('stroke-linejoin', 'round');

        const nodeUpdate = nodeEnter.merge(node);
        
        // Position timestamp badge before transition to prevent layout jumps
        nodeUpdate.select('.node-timestamp-badge')
            .attr('transform', d => `translate(${d.width / 2}, -20)`);

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

        nodeUpdate.select('.node-timestamp-badge')
            .transition().duration(duration)
            .style('opacity', 1);

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

        // Handle Jump to Video button
        if (jumpToVideoBtn) {
            if (data.timestamp !== undefined && data.timestamp !== null && currentYoutubeVideoId) {
                jumpToVideoBtn.classList.remove('hidden');
                const formatTime = (secs) => {
                    const h = Math.floor(secs / 3600);
                    const m = Math.floor((secs % 3600) / 60);
                    const s = secs % 60;
                    if (h > 0) {
                        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                    }
                    return `${m}:${s.toString().padStart(2, '0')}`;
                };
                jumpToVideoBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    Jump to Video [${formatTime(data.timestamp)}]
                `;
                jumpToVideoBtn.onclick = () => {
                    if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
                        ytPlayer.seekTo(data.timestamp, true);
                        ytPlayer.playVideo();
                    }
                };
            } else {
                jumpToVideoBtn.classList.add('hidden');
                jumpToVideoBtn.onclick = null;
            }
        }
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

    async function renderNote(markdown) {
        noteContent.innerHTML = marked.parse(markdown);
        
        // Parse and render mermaid diagrams
        const codeElements = noteContent.querySelectorAll('pre code.language-mermaid');
        if (codeElements.length > 0 && window.mermaid) {
            for (let index = 0; index < codeElements.length; index++) {
                const el = codeElements[index];
                const pre = el.parentElement;
                const code = el.textContent.trim();
                
                const div = document.createElement('div');
                div.className = 'mermaid';
                const id = `mermaid-render-${Date.now()}-${index}`;
                div.id = id;
                
                pre.replaceWith(div);
                
                try {
                    const { svg } = await mermaid.render(id + '-svg', code);
                    div.innerHTML = svg;
                } catch(e) {
                    console.error("Mermaid rendering error on diagram " + index + ":", e);
                    div.innerHTML = `<div style="color: #ef4444; font-size: 0.85rem; padding: 1rem; border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 8px; background: rgba(239, 68, 68, 0.05); text-align: left; width: 100%;">
                        <p style="font-weight: 600; margin-bottom: 0.25rem; display: flex; align-items: center; gap: 6px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            Diagram Syntax Error
                        </p>
                        <p style="opacity: 0.8; font-size: 0.8rem; line-height: 1.4;">The flowchart diagram structure could not be parsed by the browser.</p>
                    </div>`;
                }
            }
        }

        if (window.MathJax && MathJax.typesetPromise) {
            MathJax.typesetPromise([noteContent]).catch((err) => console.error('MathJax error:', err));
        }
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

            if (r.status === 503 || (res && res.code === "GEMINI_503_UNAVAILABLE")) {
                showUnavailableModal(res.error || "Gemini AI models are currently experiencing high demand. Please try again in a few moments.");
                noteContent.innerHTML = `<div class="notes-empty"><p style="color:#ef4444;">⚠️ Gemini API is temporarily unavailable (High Demand). Please try again shortly.</p></div>`;
                return;
            }

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

            if (r.status === 503 || (res && res.code === "GEMINI_503_UNAVAILABLE")) {
                thinkingEl.remove();
                showUnavailableModal(res.error || "Gemini AI models are currently experiencing high demand. Please try again in a few moments.");
                addChatBubble("⚠️ Gemini API is temporarily unavailable due to high demand. Please try again shortly.", 'ai');
                return;
            }

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
        } else {
            msg.textContent = content;
        }
        chatMessages.appendChild(msg);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Typeset after appending to DOM
        if (role === 'ai' && window.MathJax && MathJax.typesetPromise) {
            MathJax.typesetPromise([msg]).catch((err) => console.error('MathJax error:', err));
        }
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
    // YOUTUBE PLAYER INTEGRATION
    // ==============================================
    function initYoutubePlayer(videoId) {
        const container = document.getElementById('video-player-container');
        if (!container) return;

        currentYoutubeVideoId = videoId;

        if (videoId) {
            container.classList.remove('hidden');
            if (ytPlayer && typeof ytPlayer.cueVideoById === 'function') {
                try {
                    ytPlayer.cueVideoById(videoId);
                } catch(e) {
                    console.error("Error loading video in existing player:", e);
                }
            } else {
                const createPlayer = () => {
                    try {
                        ytPlayer = new YT.Player('yt-player', {
                            height: '100%',
                            width: '100%',
                            videoId: videoId,
                            playerVars: {
                                'playsinline': 1,
                                'rel': 0,
                                'modestbranding': 1
                            },
                            events: {
                                'onReady': () => {
                                    ytPlayerReady = true;
                                    console.log("YouTube Player is ready");
                                },
                                'onError': (e) => {
                                    console.error("YouTube Player Error:", e);
                                }
                            }
                        });
                    } catch (err) {
                        console.error("Failed to construct YT.Player:", err);
                    }
                };

                if (window.YT && window.YT.Player) {
                    createPlayer();
                } else {
                    const oldCallback = window.onYouTubeIframeAPIReady;
                    window.onYouTubeIframeAPIReady = () => {
                        if (oldCallback) oldCallback();
                        createPlayer();
                    };
                }
            }
        } else {
            container.classList.add('hidden');
            if (ytPlayer && typeof ytPlayer.stopVideo === 'function') {
                try {
                    ytPlayer.stopVideo();
                } catch (e) {}
            }
        }
    }

    // ==============================================
    // PROCESS DATA
    // ==============================================
    function processData(data) {
        initYoutubePlayer(data.youtube_video_id);

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
        // Narrower spacing on mobile for better fit
        const nodeSpacingX = isMobile() ? 60 : 80;
        const nodeSpacingY = isMobile() ? 280 : 400;
        tree = d3.tree().nodeSize([nodeSpacingX, nodeSpacingY]);
        root = rootNode;
        
        // Collapse everything down to the root initially
        collapse(root);
        update(root);
        
        // Trigger expand animation on initial load after initial render settles
        setTimeout(() => {
            expandStepByStep();
            initOnboarding(!!data.youtube_video_id);
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

    window.addEventListener('resize', () => {
        fitToView(false);
        // Update tree node spacing on orientation change
        if (root && tree) {
            const nodeSpacingX = isMobile() ? 60 : 80;
            const nodeSpacingY = isMobile() ? 280 : 400;
            tree = d3.tree().nodeSize([nodeSpacingX, nodeSpacingY]);
        }
    });

    // YouTube Player Minimize / Maximize toggle
    const playerContainer = document.getElementById('video-player-container');
    const minimizeBtn = document.getElementById('minimize-player-btn');
    if (minimizeBtn && playerContainer) {
        minimizeBtn.onclick = () => {
            const isMin = playerContainer.classList.toggle('minimized');
            const minIcon = minimizeBtn.querySelector('.min-icon');
            const maxIcon = minimizeBtn.querySelector('.max-icon');
            if (isMin) {
                minIcon.classList.add('hidden');
                maxIcon.classList.remove('hidden');
            } else {
                minIcon.classList.remove('hidden');
                maxIcon.classList.add('hidden');
            }
        };
    }

    // Draggable & Resizable YouTube Player
    const playerHeader = document.getElementById('video-player-header');
    const resizeHandle = document.getElementById('player-resize-handle');

    if (playerContainer && playerHeader) {
        // Dragging Logic (mouse + touch)
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        const disableIframePointerEvents = (disable) => {
            const iframe = playerContainer.querySelector('iframe');
            if (iframe) {
                iframe.style.pointerEvents = disable ? 'none' : 'auto';
            }
        };

        // Skip drag on mobile — player is full-width fixed
        const startDrag = (clientX, clientY) => {
            if (isMobile()) return;
            isDragging = true;
            playerHeader.style.cursor = 'grabbing';
            disableIframePointerEvents(true);
            startX = clientX;
            startY = clientY;
            const rect = playerContainer.getBoundingClientRect();
            const parentRect = playerContainer.parentElement.getBoundingClientRect();
            startLeft = rect.left - parentRect.left;
            startTop = rect.top - parentRect.top;
        };

        const moveDrag = (clientX, clientY) => {
            if (!isDragging) return;
            const dx = clientX - startX;
            const dy = clientY - startY;
            let newLeft = startLeft + dx;
            let newTop = startTop + dy;
            const parent = playerContainer.parentElement;
            if (parent) {
                const parentRect = parent.getBoundingClientRect();
                const containerRect = playerContainer.getBoundingClientRect();
                const maxLeft = parentRect.width - containerRect.width;
                const maxTop = parentRect.height - containerRect.height;
                newLeft = Math.max(0, Math.min(newLeft, maxLeft));
                newTop = Math.max(0, Math.min(newTop, maxTop));
            }
            playerContainer.style.left = `${newLeft}px`;
            playerContainer.style.top = `${newTop}px`;
            playerContainer.style.right = 'auto';
            playerContainer.style.bottom = 'auto';
        };

        const endDrag = () => {
            if (isDragging) {
                isDragging = false;
                playerHeader.style.cursor = isMobile() ? 'default' : 'grab';
                disableIframePointerEvents(false);
            }
        };

        playerHeader.style.cursor = isMobile() ? 'default' : 'grab';

        // Mouse events
        playerHeader.addEventListener('mousedown', (e) => {
            if (e.button !== 0 || e.target.closest('.player-ctrl-btn')) return;
            startDrag(e.clientX, e.clientY);
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
        document.addEventListener('mouseup', endDrag);

        // Touch events
        playerHeader.addEventListener('touchstart', (e) => {
            if (e.target.closest('.player-ctrl-btn')) return;
            const touch = e.touches[0];
            startDrag(touch.clientX, touch.clientY);
        }, { passive: true });
        document.addEventListener('touchmove', (e) => {
            if (isDragging) {
                const touch = e.touches[0];
                moveDrag(touch.clientX, touch.clientY);
            }
        }, { passive: true });
        document.addEventListener('touchend', endDrag);
    }

    if (playerContainer && resizeHandle) {
        // Resizing Logic (mouse + touch) — disabled on mobile
        let isResizing = false;
        let startWidth, startHeight, startMouseX, startMouseY;
        let startOriginX, startOriginY, startDistance;

        const disableIframePointerEventsResize = (disable) => {
            const iframe = playerContainer.querySelector('iframe');
            if (iframe) {
                iframe.style.pointerEvents = disable ? 'none' : 'auto';
            }
        };

        const startResize = (clientX, clientY) => {
            if (isMobile()) return;
            if (playerContainer.classList.contains('minimized')) return;
            isResizing = true;
            startWidth = playerContainer.clientWidth;
            startMouseX = clientX;
            startMouseY = clientY;
            const rect = playerContainer.getBoundingClientRect();
            startOriginX = rect.left;
            startOriginY = rect.top;
            startDistance = Math.sqrt(
                Math.pow(startMouseX - startOriginX, 2) +
                Math.pow(startMouseY - startOriginY, 2)
            );
            disableIframePointerEventsResize(true);
        };

        const moveResize = (clientX, clientY) => {
            if (!isResizing) return;
            const currentDistance = Math.sqrt(
                Math.pow(clientX - startOriginX, 2) +
                Math.pow(clientY - startOriginY, 2)
            );
            const scale = currentDistance / startDistance;
            const newWidth = Math.max(265, Math.min(600, startWidth * scale));
            playerContainer.style.width = `${newWidth}px`;
            const iframeWrapper = document.getElementById('player-iframe-wrapper');
            if (iframeWrapper) {
                iframeWrapper.style.paddingTop = '0';
                iframeWrapper.style.height = `${(newWidth * 9) / 16}px`;
            }
        };

        const endResize = () => {
            if (isResizing) {
                isResizing = false;
                disableIframePointerEventsResize(false);
            }
        };

        // Mouse events
        resizeHandle.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            startResize(e.clientX, e.clientY);
            e.preventDefault();
            e.stopPropagation();
        });
        document.addEventListener('mousemove', (e) => moveResize(e.clientX, e.clientY));
        document.addEventListener('mouseup', endResize);

        // Touch events
        resizeHandle.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            startResize(touch.clientX, touch.clientY);
            e.preventDefault();
            e.stopPropagation();
        }, { passive: false });
        document.addEventListener('touchmove', (e) => {
            if (isResizing) {
                const touch = e.touches[0];
                moveResize(touch.clientX, touch.clientY);
            }
        }, { passive: true });
        document.addEventListener('touchend', endResize);
    }

    // ==============================================
    // MOBILE: Notes Card Swipe-to-Close
    // ==============================================
    const notesSwipeHandle = document.getElementById('notes-swipe-handle');
    if (notesCard && notesSwipeHandle) {
        let swipeStartY = 0;
        let swipeCurrentY = 0;
        let isSwiping = false;

        const onSwipeStart = (e) => {
            if (!isMobile()) return;
            const touch = e.touches[0];
            swipeStartY = touch.clientY;
            swipeCurrentY = touch.clientY;
            isSwiping = true;
            notesCard.style.transition = 'none';
        };

        const onSwipeMove = (e) => {
            if (!isSwiping) return;
            const touch = e.touches[0];
            swipeCurrentY = touch.clientY;
            const dy = swipeCurrentY - swipeStartY;
            if (dy > 0) {
                // Only allow dragging down
                notesCard.style.transform = `translateY(${dy}px)`;
            }
        };

        const onSwipeEnd = () => {
            if (!isSwiping) return;
            isSwiping = false;
            notesCard.style.transition = '';
            const dy = swipeCurrentY - swipeStartY;
            if (dy > 100) {
                // Threshold met — close the card
                notesCard.classList.add('hidden-card');
            }
            notesCard.style.transform = '';
        };

        notesSwipeHandle.addEventListener('touchstart', onSwipeStart, { passive: true });
        notesSwipeHandle.addEventListener('touchmove', onSwipeMove, { passive: true });
        notesSwipeHandle.addEventListener('touchend', onSwipeEnd);

        // Also allow swiping from the header
        const notesHeader = notesCard.querySelector('.notes-card-header');
        if (notesHeader) {
            notesHeader.addEventListener('touchstart', onSwipeStart, { passive: true });
            notesHeader.addEventListener('touchmove', onSwipeMove, { passive: true });
            notesHeader.addEventListener('touchend', onSwipeEnd);
        }
    }

    // --- Onboarding Logic ---
    function initOnboarding(hasYoutube) {
        const guides = document.getElementById('onboarding-guides');
        if (!guides) return;

        // Clear existing guides and show the container
        guides.innerHTML = '';
        guides.style.display = 'block';

        const spawnConfetti = (x, y, colors = ['#ccff00', '#fff', '#333']) => {
            for(let i=0; i<12; i++) {
                const c = document.createElement('div');
                c.className = 'confetti';
                c.style.left = x + 'px';
                c.style.top = y + 'px';
                c.style.setProperty('--tx', (Math.random() - 0.5) * 120 + 'px');
                c.style.setProperty('--ty', (Math.random() - 0.5) * 120 + 'px');
                c.style.background = colors[Math.floor(Math.random()*colors.length)];
                c.style.animation = `confettiExplosion ${0.6 + Math.random()}s ease-out forwards`;
                document.body.appendChild(c);
                setTimeout(() => c.remove(), 2000);
            }
        };

        if (hasYoutube) {
            // Create YouTube guides
            const playerHint = document.createElement('div');
            playerHint.className = 'guide-hint player-hint';
            playerHint.innerHTML = `
                <div class="guide-dot red-dot"></div>
                <span>Use the video player to watch the companion video</span>
                <div class="guide-arrow-left"></div>
            `;

            const ytNodeHint = document.createElement('div');
            ytNodeHint.className = 'guide-hint yt-node-hint';
            ytNodeHint.innerHTML = `
                <div class="guide-dot red-dot"></div>
                <span>Click a node with a clock badge to jump to its video section</span>
            `;

            guides.appendChild(playerHint);
            guides.appendChild(ytNodeHint);

            // Pop effect for YT node hint with red-themed confetti
            setTimeout(() => {
                const rect = ytNodeHint.getBoundingClientRect();
                spawnConfetti(rect.left + rect.width/2, rect.top + rect.height/2, ['#ff0000', '#ffffff', '#18181b']);
            }, 400);

            // Auto-dismiss logic for YouTube guides
            const dismissAll = () => {
                playerHint.classList.add('guide-fade-out');
                ytNodeHint.classList.add('guide-fade-out');
                setTimeout(() => { 
                    guides.innerHTML = ''; 
                    guides.style.display = 'none'; 
                }, 1000);
            };

            setTimeout(dismissAll, 10000);
        } else {
            // Create standard guides
            const nodeHint = document.createElement('div');
            nodeHint.className = 'guide-hint node-hint';
            nodeHint.innerHTML = `
                <div class="guide-dot"></div>
                <span>Click a node to expand or generate notes</span>
            `;

            const aiHint = document.createElement('div');
            aiHint.className = 'guide-hint ai-hint';
            aiHint.innerHTML = `
                <span>Need help? Ask AI here!</span>
                <div class="guide-arrow"></div>
            `;

            guides.appendChild(nodeHint);
            guides.appendChild(aiHint);

            // Pop effect for node hint with standard colors
            setTimeout(() => {
                const rect = nodeHint.getBoundingClientRect();
                spawnConfetti(rect.left + rect.width/2, rect.top + rect.height/2, ['#ccff00', '#fff', '#333']);
            }, 400);

            // Auto-dismiss logic for standard guides
            const dismissAll = () => {
                nodeHint.classList.add('guide-fade-out');
                aiHint.classList.add('guide-fade-out');
                setTimeout(() => { 
                    guides.innerHTML = ''; 
                    guides.style.display = 'none'; 
                }, 1000);
            };

            // AI hint specific click dismissal
            if(chatToggle) {
                const onChatClick = () => {
                    if(aiHint && !aiHint.classList.contains('guide-fade-out')) {
                        aiHint.classList.add('guide-fade-out');
                    }
                };
                chatToggle.addEventListener('click', onChatClick, { once: true });
            }

            setTimeout(dismissAll, 8000);
        }
    }

    function showUnavailableModal(message) {
        let modal = document.getElementById('gemini-unavailable-modal');
        if (!modal) {
            const modalHTML = `
                <div id="gemini-unavailable-modal" class="modal-overlay active" style="z-index: 9999; display: flex; justify-content: center; align-items: center; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(10px); transition: opacity 0.3s;">
                    <div class="modal-box" style="background: #18181b; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 16px; padding: 2.25rem 2rem; width: 480px; max-width: 90%; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(239, 68, 68, 0.05); text-align: center; position: relative;">
                        <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem; color: #ef4444;">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                        </div>
                        <h3 style="font-size: 1.25rem; font-weight: 600; color: #ffffff; margin-bottom: 0.75rem; font-family: 'Inter', sans-serif;">Gemini Service Busy</h3>
                        <p id="gemini-unavailable-message" style="color: #a1a1aa; font-size: 0.9rem; line-height: 1.6; margin-bottom: 1.75rem; font-family: 'Inter', sans-serif;"></p>
                        <button onclick="document.getElementById('gemini-unavailable-modal').remove()" class="btn-primary" style="background: #ef4444; color: #ffffff; border: none; padding: 0.75rem 1.75rem; border-radius: 99px; font-weight: 600; font-size: 0.9rem; cursor: pointer; width: 100%; transition: opacity 0.2s; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);">Got it</button>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            modal = document.getElementById('gemini-unavailable-modal');
        }
        document.getElementById('gemini-unavailable-message').textContent = message || "Gemini AI models are currently experiencing high demand. Please try again in a few moments.";
        modal.style.display = 'flex';
        modal.style.opacity = '1';
        modal.style.pointerEvents = 'auto';
    }
});
