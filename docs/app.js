document.addEventListener('DOMContentLoaded', () => {
    // Navigation Logic
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.content-section');

    function switchSection(targetId) {
        navLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === `#${targetId}`);
        });

        sections.forEach(section => {
            section.classList.toggle('active', section.id === targetId);
        });

        // Track state in URL
        window.history.pushState(null, '', `#${targetId}`);
        window.scrollTo(0, 0);

        // Load content if not already loaded
        const container = document.getElementById(targetId);
        if (container && (container.innerHTML === '' || container.querySelector('.loading'))) {
            loadMarkdown(`${targetId}.md`, targetId);
        }
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            switchSection(targetId);
        });
    });

    // Markdown Rendering Setup
    const renderer = new marked.Renderer();
    renderer.heading = (arg1, arg2) => {
        const text = typeof arg1 === 'object' ? arg1.text : arg1;
        const level = typeof arg1 === 'object' ? arg1.depth : arg2;
        const escapedText = text.toLowerCase().replace(/[^\w]+/g, '-');
        return `<h${level} id="${escapedText}">${text}</h${level}>`;
    };

    marked.setOptions({
        renderer: renderer,
        highlight: function(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
        langPrefix: 'hljs language-',
        gfm: true,
        breaks: false,
        smartLists: true,
        smartypants: false
    });

    // Lazy load Markdown content
    async function loadMarkdown(file, containerId) {
        const container = document.getElementById(containerId);
        try {
            const response = await fetch(file);
            if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load ${file}`);
            const text = await response.text();
            
            container.innerHTML = `
                <div class="markdown-body">
                    ${marked.parse(text)}
                </div>
            `;
            
            // Re-highlight code blocks
            container.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        } catch (error) {
            console.error(error);
            container.innerHTML = `
                <div class="error" style="padding: 2rem; background: rgba(239, 68, 68, 0.1); border-radius: 12px; border: 1px solid rgba(239, 68, 68, 0.2);">
                    <h3 style="color: #ef4444; margin-bottom: 0.5rem;">Failed to load documentation</h3>
                    <p style="color: #991b1b;">${error.message}</p>
                    <p style="font-size: 0.9rem; margin-top: 1rem;">Make sure you are serving this folder via <code>npm run docs</code>.</p>
                </div>
            `;
        }
    }

    // Handle initial load from hash
    const initialHash = window.location.hash.substring(1) || 'intro';
    if (document.getElementById(initialHash)) {
        switchSection(initialHash);
    } else {
        switchSection('intro');
    }
});
